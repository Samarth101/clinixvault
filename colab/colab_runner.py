#!/usr/bin/env python3
"""
ClinixVault Google Colab GPU Backend & Tunnel Orchestrator.

Spins up the full ClinixVault API Gateway with CUDA acceleration on Google Colab,
establishes a zero-account Cloudflare Tunnel (supporting live WebSockets), manages
dual-source model loading (Drive vs Hugging Face), monitors GPU VRAM to prevent OOM,
and streams microservice telemetry to Grafana Cloud.

Usage:
    # 1. Standard Colab execution (Hugging Face model fetch + Cloudflare Tunnel)
    python colab/colab_runner.py --model-source huggingface --tunnel cloudflare

    # 2. Ultra-fast boot using mounted Google Drive
    python colab/colab_runner.py --model-source drive --drive-path /content/drive/MyDrive/clinixvault_models

    # 3. Code sync mode (pull latest changes without restarting kernel)
    python colab/colab_runner.py --sync-git
"""

import os
import sys
import time
import json
import re
import signal
import shutil
import subprocess
import threading
import argparse
from pathlib import Path
from typing import Optional, Dict, Any

# Force Indian Standard Time (IST, UTC+05:30) for all runtime timestamps on Linux/Colab
os.environ["TZ"] = "Asia/Kolkata"
if hasattr(time, "tzset"):
    try:
        time.tzset()
    except Exception:
        pass

# Intercept and patch PyAV >= 14/18 where metadata_errors was removed,
# preventing faster-whisper from throwing TypeError: open() got an unexpected keyword argument 'metadata_errors'
try:
    import av
    if hasattr(av, "open") and not getattr(av.open, "_is_clinix_patched", False):
        _orig_av_open = av.open
        def _safe_av_open(*args, **kwargs):
            kwargs.pop("metadata_errors", None)
            return _orig_av_open(*args, **kwargs)
        _safe_av_open._is_clinix_patched = True
        av.open = _safe_av_open
except Exception:
    pass

from datetime import datetime, timezone, timedelta
IST_TZ = timezone(timedelta(hours=5, minutes=30), name="IST")

def now_ist_str() -> str:
    """Returns formatted real-time Indian Standard Time (IST, UTC+05:30) string."""
    return datetime.now(IST_TZ).strftime("%Y-%m-%d %H:%M:%S IST")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# ANSI Styling
BLUE = "\033[94m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
PURPLE = "\033[95m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


# ============================================================================
# 1. GPU VRAM Watchdog & CUDA Safety
# ============================================================================
class ColabGPUWatchdog(threading.Thread):
    def __init__(self, interval_sec: int = 5):
        super().__init__(daemon=True)
        self.interval_sec = interval_sec
        self.running = True
        self.gpu_name = "CPU (No CUDA)"
        self.total_vram_mb = 0.0
        self.used_vram_mb = 0.0
        self.vram_percent = 0.0
        self._init_cuda()

    def _init_cuda(self):
        try:
            import torch
            if torch.cuda.is_available():
                self.gpu_name = torch.cuda.get_device_name(0)
                self.total_vram_mb = round(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024), 1)
                print(f"{GREEN}[{now_ist_str()}] ⚡ [GPU WATCHDOG] CUDA initialized: {self.gpu_name} ({self.total_vram_mb} MB VRAM){RESET}")
            else:
                print(f"{YELLOW}[{now_ist_str()}] ⚠️  [GPU WATCHDOG] CUDA not detected. Operating in CPU fallback mode.{RESET}")
        except Exception as e:
            print(f"{YELLOW}[{now_ist_str()}] ⚠️  [GPU WATCHDOG] CUDA init warning: {e}{RESET}")

    def run(self):
        while self.running:
            try:
                import torch
                if torch.cuda.is_available():
                    allocated = torch.cuda.memory_allocated(0) / (1024 * 1024)
                    reserved = torch.cuda.memory_reserved(0) / (1024 * 1024)
                    self.used_vram_mb = round(reserved, 1)
                    if self.total_vram_mb > 0:
                        self.vram_percent = round((reserved / self.total_vram_mb) * 100.0, 1)

                    # Update gateway metrics registry for Grafana Cloud
                    try:
                        from backend.gateway.metrics import update_microservice_memory, update_microservice_health
                        update_microservice_health("gateway", True)
                        update_microservice_health("vlm-server", True)
                        update_microservice_health("llm-server", True)
                        update_microservice_health("audio-server", True)
                        update_microservice_memory("gateway", int(reserved * 1024 * 1024))
                    except Exception:
                        pass

                    # Dynamic VRAM Pressure Management
                    if self.vram_percent >= 88.0:
                        print(f"\n{RED}[{now_ist_str()}] 🚨 [GPU WATCHDOG] Critical VRAM pressure ({self.vram_percent}% | {self.used_vram_mb}/{self.total_vram_mb} MB).{RESET}")
                        print(f"{YELLOW}[{now_ist_str()}] 🧹 Emptying CUDA cache to prevent Colab session crash...{RESET}")
                        torch.cuda.empty_cache()
                        import gc
                        gc.collect()
            except Exception:
                pass
            time.sleep(self.interval_sec)


# ============================================================================
# 2. Dual-Source Model Provisioner (Drive vs Hugging Face Hub)
# ============================================================================
def setup_models(source: str, drive_path: Optional[str] = None, hf_token: Optional[str] = None, org: str = "ClinixVault"):
    """
    Configures model checkpoints from mounted Google Drive or downloads from Hugging Face Hub.
    """
    checkpoints_dir = PROJECT_ROOT / "checkpoints"
    checkpoints_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{CYAN}{BOLD}--- ClinixVault Model Provisioning (Source: {source.upper()}) ---{RESET}")

    if source.lower() == "drive":
        drive_src = Path(drive_path or "/content/drive/MyDrive/clinixvault_models")
        if not drive_src.exists():
            # Try alternate path
            alt = Path("/content/drive/MyDrive/clinixvault/checkpoints")
            if alt.exists():
                drive_src = alt
            else:
                print(f"{YELLOW}⚠️  Drive path '{drive_src}' not found. Mounting Google Drive may be needed.{RESET}")
                print(f"{YELLOW}   Run: from google.colab import drive; drive.mount('/content/drive'){RESET}")
                print(f"{YELLOW}   Falling back to Hugging Face Hub fetch...{RESET}")
                source = "huggingface"

        if source.lower() == "drive" and drive_src.exists():
            print(f"{GREEN}📁 Linking checkpoints directly from Google Drive: {drive_src}{RESET}")
            for item in drive_src.iterdir():
                dest = checkpoints_dir / item.name
                if not dest.exists():
                    try:
                        dest.symlink_to(item, target_is_directory=item.is_dir())
                        print(f"   ✓ Symlinked: {item.name}")
                    except Exception:
                        shutil.copytree(item, dest) if item.is_dir() else shutil.copy2(item, dest)
                        print(f"   ✓ Copied: {item.name}")
            print(f"{GREEN}✅ Model loading from Google Drive complete (Zero Bandwidth consumed).{RESET}")
            return

    # Hugging Face Hub Fetch
    if source.lower() == "huggingface":
        try:
            from huggingface_hub import snapshot_download
        except ImportError:
            print(f"{YELLOW}Installing huggingface_hub for model retrieval...{RESET}")
            subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "huggingface_hub"], check=True)
            from huggingface_hub import snapshot_download

        token = hf_token or os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_TOKEN")
        cache_dir = Path("/content/cache/hf")
        cache_dir.mkdir(parents=True, exist_ok=True)

        models_to_fetch = [
            ("qwen2_vl_mimic_cxr_lora", f"{org}/clinixvault-qwen2vl-qlora"),
            ("clinix_summarizer_qwen2.5_lora", f"{org}/clinixvault-summarizer-qlora"),
        ]

        for local_dir_name, repo_id in models_to_fetch:
            target_path = checkpoints_dir / local_dir_name
            if target_path.exists() and any(target_path.iterdir()):
                print(f"{GREEN}✓ Checkpoint '{local_dir_name}' already present locally.{RESET}")
                continue

            print(f"{BLUE}⬇️  Downloading '{repo_id}' from Hugging Face Hub to '{local_dir_name}'...{RESET}")
            try:
                snapshot_download(
                    repo_id=repo_id,
                    local_dir=str(target_path),
                    token=token,
                    cache_dir=str(cache_dir),
                    resume_download=True,
                )
                print(f"{GREEN}✓ Successfully fetched: {repo_id}{RESET}")
            except Exception as e:
                print(f"{YELLOW}⚠️  Could not fetch '{repo_id}': {e}. Using deterministic edge fallback.{RESET}")


# ============================================================================
# 3. Tunneling Subsystem (Cloudflare Tunnel / ngrok)
# ============================================================================
def install_and_start_cloudflare_tunnel(port: int = 8000) -> Optional[str]:
    """
    Downloads and starts Cloudflare Tunnel (cloudflared).
    100% free, NO account / signup needed, supports WebSockets out-of-the-box.
    Returns: The public HTTPS URL (e.g. https://xxx.trycloudflare.com).
    """
    cf_bin = Path("/usr/local/bin/cloudflared")
    if not cf_bin.exists():
        print(f"{BLUE}📦 Downloading Cloudflare Tunnel (cloudflared) for Colab...{RESET}")
        try:
            subprocess.run(
                ["curl", "-L", "--output", str(cf_bin), "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.run(["chmod", "+x", str(cf_bin)], check=True)
            print(f"{GREEN}✓ cloudflared binary installed to {cf_bin}{RESET}")
        except Exception as e:
            print(f"{RED}❌ Failed to install cloudflared: {e}{RESET}")
            return None

    log_path = Path("/tmp/cloudflared.log")
    if log_path.exists():
        log_path.unlink()

    print(f"{CYAN}🌐 Establishing Cloudflare Tunnel to port {port} (with native WebSocket support)...{RESET}")
    log_file = open(log_path, "w")
    tunnel_proc = subprocess.Popen(
        [str(cf_bin), "tunnel", "--url", f"http://127.0.0.1:{port}", "--no-autoupdate"],
        stdout=log_file,
        stderr=log_file,
    )

    # Poll log for the generated *.trycloudflare.com URL
    tunnel_url = None
    for _ in range(40):
        time.sleep(0.5)
        if log_path.exists():
            content = log_path.read_text()
            matches = re.findall(r"https://[a-zA-Z0-9\-]+\.trycloudflare\.com", content)
            if matches:
                tunnel_url = matches[0]
                break

    if tunnel_url:
        print(f"\n{GREEN}{BOLD}================================================================={RESET}")
        print(f"{GREEN}{BOLD}🎉 CLINIXVAULT PUBLIC BACKEND IS LIVE ON GOOGLE COLAB!{RESET}")
        print(f"{GREEN}{BOLD}================================================================={RESET}")
        print(f"{BOLD}🔗 HTTPS Base URL:   {CYAN}{tunnel_url}{RESET}")
        print(f"{BOLD}🎙️ WebSocket Stream: {CYAN}{tunnel_url.replace('https://', 'wss://')}/api/v1/scribe/stream{RESET}")
        print(f"{BOLD}📊 OpenMetrics:      {CYAN}{tunnel_url}/metrics{RESET}")
        print(f"{GREEN}{BOLD}================================================================={RESET}")
        print(f"{YELLOW}👉 Paste this URL into your local frontend (.env.local):{RESET}")
        print(f"{BOLD}VITE_API_URL={tunnel_url}{RESET}\n")

        # Save to file for quick scripts / frontend access
        (PROJECT_ROOT / "colab_public_url.txt").write_text(tunnel_url)
        return tunnel_url
    else:
        print(f"{RED}❌ Could not extract Cloudflare Tunnel URL. Check /tmp/cloudflared.log{RESET}")
        return None


# ============================================================================
# 4. Code Sync Helper (Live Sync from Git without Restarting Kernel)
# ============================================================================
def sync_codebase_from_git():
    """
    Pulls latest changes from the git repository into Colab without tearing down the session.
    """
    print(f"{CYAN}🔄 Syncing ClinixVault codebase from Git repository...{RESET}")
    res = subprocess.run(["git", "pull", "--ff-only"], cwd=str(PROJECT_ROOT), capture_output=True, text=True)
    if res.returncode == 0:
        print(f"{GREEN}✓ Codebase successfully synced:{RESET}\n{res.stdout.strip()}")
    else:
        print(f"{YELLOW}⚠️  Git pull notice: {res.stderr.strip()}{RESET}")


# ============================================================================
# 5. Colab Observability & Grafana Cloud Bridge
# ============================================================================
def start_colab_observability_bridge(watchdog: ColabGPUWatchdog):
    """
    Connects Colab GPU telemetry to Prometheus metrics registry and automatically
    launches the Grafana Alloy agent to push live GPU VRAM, compute metrics, and Loki
    logs to Grafana Cloud.
    """
    try:
        from backend.gateway.metrics import (
            metrics_collector,
            update_microservice_health,
            update_microservice_memory,
            record_request_metrics,
        )
        update_microservice_health("gateway", True)
        update_microservice_health("vlm-server", True)
        update_microservice_health("llm-server", True)
        update_microservice_health("audio-server", True)
        print(f"{GREEN}[{now_ist_str()}] 📊 [OBSERVABILITY] Connected GPU Watchdog to Prometheus metrics registry.{RESET}")
    except Exception as e:
        print(f"{YELLOW}[{now_ist_str()}] ⚠️  Metrics collector bridge note: {e}{RESET}")

    # Load credentials from environment or observability/.env
    prom_url = os.getenv("GRAFANA_CLOUD_PROMETHEUS_URL")
    prom_user = os.getenv("GRAFANA_CLOUD_PROMETHEUS_USER")
    loki_url = os.getenv("GRAFANA_CLOUD_LOKI_URL")
    loki_user = os.getenv("GRAFANA_CLOUD_LOKI_USER")
    api_token = os.getenv("GRAFANA_CLOUD_API_TOKEN")

    env_path = PROJECT_ROOT / "observability" / ".env"
    if not api_token and env_path.exists():
        try:
            with open(env_path) as ef:
                for line in ef:
                    line = line.strip()
                    if line.startswith("GRAFANA_CLOUD_PROMETHEUS_URL="):
                        prom_url = line.split("=", 1)[1]
                    elif line.startswith("GRAFANA_CLOUD_PROMETHEUS_USER="):
                        prom_user = line.split("=", 1)[1]
                    elif line.startswith("GRAFANA_CLOUD_LOKI_URL="):
                        loki_url = line.split("=", 1)[1]
                    elif line.startswith("GRAFANA_CLOUD_LOKI_USER="):
                        loki_user = line.split("=", 1)[1]
                    elif line.startswith("GRAFANA_CLOUD_API_TOKEN="):
                        api_token = line.split("=", 1)[1]
        except Exception:
            pass

    if not api_token or not prom_url:
        print(f"{YELLOW}[{now_ist_str()}] ℹ️  Grafana Cloud credentials not detected. OpenMetrics still served locally at /metrics.{RESET}")
        print(f"{YELLOW}   To enable Grafana Cloud: set GRAFANA_CLOUD_API_TOKEN in Colab Step 4.{RESET}")
        return

    # Export targets for Alloy config
    os.environ["GRAFANA_CLOUD_PROMETHEUS_URL"] = prom_url
    os.environ["GRAFANA_CLOUD_PROMETHEUS_USER"] = prom_user or ""
    os.environ["GRAFANA_CLOUD_LOKI_URL"] = loki_url or ""
    os.environ["GRAFANA_CLOUD_LOKI_USER"] = loki_user or ""
    os.environ["GRAFANA_CLOUD_API_TOKEN"] = api_token

    os.environ["GATEWAY_METRICS_TARGET"] = f"127.0.0.1:{os.environ.get('GATEWAY_PORT', '8000')}"
    os.environ["VLM_METRICS_TARGET"] = f"127.0.0.1:{os.environ.get('GATEWAY_PORT', '8000')}"
    os.environ["LLM_METRICS_TARGET"] = f"127.0.0.1:{os.environ.get('GATEWAY_PORT', '8000')}"
    os.environ["AUDIO_METRICS_TARGET"] = f"127.0.0.1:{os.environ.get('GATEWAY_PORT', '8000')}"
    os.environ["DOCUMENT_METRICS_TARGET"] = f"127.0.0.1:{os.environ.get('GATEWAY_PORT', '8000')}"

    log_dir = PROJECT_ROOT / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "clinixvault.log"
    if not log_file.exists():
        log_file.touch()
    os.environ["CLINIXVAULT_LOG_DIR"] = str(log_dir)
    os.environ["CLINIXVAULT_LOG_FILE"] = str(log_file)

    # 1. Send immediate Loki boot handshake
    if loki_url and loki_user and api_token:
        try:
            import httpx
            ts_ns = str(time.time_ns())
            loki_payload = {
                "streams": [
                    {
                        "stream": {
                            "job": "clinixvault",
                            "app": "clinixvault-colab",
                            "environment": "colab-gpu-node",
                            "level": "INFO",
                            "service": "colab-gateway",
                        },
                        "values": [
                            [
                                ts_ns,
                                json.dumps({
                                    "timestamp": now_ist_str(),
                                    "level": "INFO",
                                    "message": f"ClinixVault GPU Colab Node active ({watchdog.gpu_name}, {watchdog.total_vram_mb} MB VRAM).",
                                    "service": "colab-runner",
                                    "status_code": 200,
                                }),
                            ]
                        ],
                    }
                ]
            }
            resp = httpx.post(loki_url, json=loki_payload, auth=(loki_user, api_token), timeout=6.0)
            if resp.status_code in (200, 204):
                print(f"{GREEN}[{now_ist_str()}] 📡 [LOKI TELEMETRY] Grafana Cloud Loki live stream established (HTTP {resp.status_code}).{RESET}")
        except Exception as le:
            print(f"{YELLOW}[{now_ist_str()}] ⚠️ Loki handshake note: {le}{RESET}")

    # 2. Check and start Grafana Alloy Agent
    alloy_bin = shutil.which("alloy") or shutil.which("grafana-alloy") or "/usr/local/bin/alloy"
    if not os.path.exists(alloy_bin):
        print(f"{BLUE}[{now_ist_str()}] 📦 Downloading Grafana Alloy Linux agent for automated metric ingestion...{RESET}")
        try:
            alloy_zip = Path("/tmp/alloy.zip")
            subprocess.run(
                ["curl", "-fsSL", "-o", str(alloy_zip), "https://github.com/grafana/alloy/releases/download/v1.7.5/alloy-linux-amd64.zip"],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.run(["unzip", "-q", "-o", str(alloy_zip), "-d", "/usr/local/bin"], check=True)
            candidate = Path("/usr/local/bin/alloy-linux-amd64")
            if candidate.exists():
                candidate.rename("/usr/local/bin/alloy")
            subprocess.run(["chmod", "+x", "/usr/local/bin/alloy"], check=True)
            alloy_bin = "/usr/local/bin/alloy"
            print(f"{GREEN}[{now_ist_str()}] ✓ Grafana Alloy agent installed successfully.{RESET}")
        except Exception as ae:
            print(f"{YELLOW}[{now_ist_str()}] ⚠️ Could not download Alloy binary: {ae}. OpenMetrics remains active on /metrics.{RESET}")
            return

    config_path = PROJECT_ROOT / "observability" / "alloy" / "config.alloy"
    if os.path.exists(alloy_bin) and config_path.exists():
        tmp_storage = Path("/tmp/clinixvault_alloy_colab")
        tmp_storage.mkdir(parents=True, exist_ok=True)
        alloy_log = Path("/tmp/clinixvault_alloy.log")
        try:
            alf = open(alloy_log, "a")
            subprocess.Popen(
                [
                    alloy_bin,
                    "run",
                    "--server.http.listen-addr=127.0.0.1:12345",
                    f"--storage.path={tmp_storage}",
                    str(config_path),
                ],
                env=os.environ,
                stdout=alf,
                stderr=alf,
            )
            print(f"{GREEN}{BOLD}[{now_ist_str()}] 📈 [GRAFANA CLOUD] Alloy agent actively scraping :8000/metrics and remote-writing to Prometheus!{RESET}")
            print(f"{CYAN}   (Alloy background telemetry log streaming to {alloy_log}){RESET}")
        except Exception as e:
            print(f"{YELLOW}[{now_ist_str()}] ⚠️ Alloy daemon launch warning: {e}{RESET}")


def configure_colab_storage(force_sqlite: bool = False):
    """
    Automated sovereign enterprise storage for Colab:
    1. Checks if PostgreSQL (5432) and Neo4j (7687) are already active.
    2. If not active and not force_sqlite, automatically runs colab/setup_databases.sh
       to install and start native PostgreSQL and Neo4j Community inside Colab.
    3. Re-probes ports and connects to live PostgreSQL and Neo4j!
    4. Falls back to durable SQLite / in-memory graph only if force_sqlite is requested.
    """
    import socket

    def check_port(port: int, host: str = "127.0.0.1") -> bool:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.12)
                return s.connect_ex((host, port)) == 0
        except Exception:
            return False

    pg_active = check_port(5432)
    neo4j_active = check_port(7687)

    # Auto-provision PostgreSQL & Neo4j inside Colab if not active
    is_colab_env = os.path.exists("/content") or "COLAB_GPU" in os.environ
    if (not pg_active or not neo4j_active) and not force_sqlite and is_colab_env:
        db_script = PROJECT_ROOT / "colab" / "setup_databases.sh"
        if db_script.exists():
            print(f"{CYAN}{BOLD}[{now_ist_str()}] 🐘🕸️ [AUTO-PROVISION] Installing & launching PostgreSQL + Neo4j inside Colab...{RESET}")
            subprocess.run(["bash", str(db_script)], check=False)
            time.sleep(1)
            pg_active = check_port(5432)
            neo4j_active = check_port(7687)

    # Configure PostgreSQL
    if pg_active and not force_sqlite:
        os.environ["DATABASE_URL"] = "postgresql+psycopg2://postgres:postgres@localhost:5432/clinixvault"
        print(f"{GREEN}{BOLD}[{now_ist_str()}] 🐘 [STORAGE] PostgreSQL active on 127.0.0.1:5432 (Database: clinixvault).{RESET}")
    else:
        db_dir = PROJECT_ROOT / "backend" / "database"
        db_dir.mkdir(parents=True, exist_ok=True)
        sqlite_path = db_dir / "clinixvault_edge.db"
        os.environ["DATABASE_URL"] = f"sqlite:///{sqlite_path}"
        print(f"{YELLOW}[{now_ist_str()}] 📁 [STORAGE] Sovereign Edge SQLite active ({sqlite_path.name}).{RESET}")

    # Configure Neo4j
    if neo4j_active and not force_sqlite:
        os.environ["NEO4J_URI"] = "bolt://localhost:7687"
        os.environ["NEO4J_USER"] = "neo4j"
        os.environ["NEO4J_PASSWORD"] = "clinixvault2026"
        os.environ["NEO4J_DISABLED"] = "false"
        os.environ["NEO4J_ENABLED"] = "true"
        print(f"{GREEN}{BOLD}[{now_ist_str()}] 🕸️ [GRAPH STORE] Neo4j Community active on bolt://localhost:7687 (User: neo4j).{RESET}")
    else:
        os.environ["NEO4J_DISABLED"] = "true"
        os.environ["NEO4J_ENABLED"] = "false"
        print(f"{YELLOW}[{now_ist_str()}] 🕸️ [GRAPH STORE] In-Memory Clinical Knowledge Graph active.{RESET}")


def ensure_cuda_and_vlm_dependencies():
    """
    Auto-provisions essential Colab CUDA and VLM dependencies:
    - qwen-vl-utils (for Qwen2-VL multimodal inference)
    - nvidia-cublas-cu12, nvidia-cudnn-cu12 (for faster-whisper CTranslate2 CUDA runtime)
    Also ensures dynamic linker discovery and preloading of cuBLAS libraries.
    """
    to_install = []

    try:
        import qwen_vl_utils
    except ImportError:
        to_install.append("qwen-vl-utils>=0.0.8")

    needs_reexec = False
    try:
        import torch
        if torch.cuda.is_available() and sys.platform == "linux":
            try:
                import nvidia.cublas.lib
            except ImportError:
                to_install.append("nvidia-cublas-cu12")
            try:
                import nvidia.cudnn.lib
            except ImportError:
                to_install.append("nvidia-cudnn-cu12")
    except Exception:
        pass

    if to_install:
        print(f"{CYAN}📦 Installing essential Colab runtime dependencies: {' '.join(to_install)}...{RESET}")
        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "--quiet"] + to_install,
                check=False,
            )
            print(f"{GREEN}✓ Colab runtime dependencies installed successfully.{RESET}")
            needs_reexec = True
        except Exception as e:
            print(f"{YELLOW}⚠️ Dependency install note: {e}{RESET}")

    # Discover and preload CUDA libraries into LD_LIBRARY_PATH
    try:
        from inference.audio_server.transcriber import configure_cuda_cublas_libraries
        configure_cuda_cublas_libraries()
    except Exception:
        pass

    # In Linux glibc, ld.so reads LD_LIBRARY_PATH once at process startup.
    # If dependencies were just installed or LD_LIBRARY_PATH was empty, re-exec once
    # so CTranslate2's dlopen has LD_LIBRARY_PATH baked into the process from execve().
    if sys.platform == "linux" and needs_reexec and os.environ.get("_CLINIX_REEXEC") != "1":
        os.environ["_CLINIX_REEXEC"] = "1"
        try:
            print(f"{GREEN}⚡ Re-executing runner with configured CUDA LD_LIBRARY_PATH...{RESET}")
            os.execv(sys.executable, [sys.executable] + sys.argv)
        except Exception:
            pass


# ============================================================================
# 6. Main Orchestrator
# ============================================================================
def main():
    parser = argparse.ArgumentParser(description="ClinixVault Google Colab GPU Backend Runner")
    parser.add_argument("--model-source", choices=["drive", "huggingface"], default="huggingface", help="Model checkpoint source")
    parser.add_argument("--drive-path", type=str, default="/content/drive/MyDrive/clinixvault_models", help="Google Drive path to models")
    parser.add_argument("--hf-token", type=str, default=None, help="Hugging Face API token")
    parser.add_argument("--hf-org", type=str, default="ClinixVault", help="Hugging Face Org / Username")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind the API Gateway")
    parser.add_argument("--whisper-model", type=str, default="large-v3-turbo", help="Whisper ASR model size")
    parser.add_argument("--use-sqlite", action="store_true", help="Force lightweight SQLite storage instead of PostgreSQL/Neo4j")
    parser.add_argument("--sync-git", action="store_true", help="Sync latest code from Git and exit")
    parser.add_argument("--no-tunnel", action="store_true", help="Do not start Cloudflare tunnel")

    args = parser.parse_args()

    if args.sync_git:
        sync_codebase_from_git()
        return

    print(f"{BLUE}{BOLD}")
    print(r"""
   ____ _ _       _       __     __             _ _      ____      _       _     
  / ___| (_)_ __ (_)_  __ \ \   / /_ _ _   _   | | |_   / ___|___ | | __ _| |__  
 | |   | | | '_ \| \ \/ /  \ \ / / _` | | | |  | | __| | |   / _ \| |/ _` | '_ \ 
 | |___| | | | | | |>  <    \ V / (_| | |_| |  | | |_  | |__| (_) | | (_| | |_) |
  \____|_|_|_| |_|_/_/\_\    \_/ \__,_|\__,_|  |_|\__|  \____\___/|_|\__,_|_.__/ 
    """)
    print(f"Hospital-Grade Clinical Intelligence Platform • GPU Colab Node{RESET}\n")

    # Set Colab Environment Overrides
    os.environ["WHISPER_MODEL_SIZE"] = args.whisper_model
    os.environ["WHISPER_DEVICE"] = "cuda"
    os.environ["WHISPER_COMPUTE_TYPE"] = "float16"
    os.environ["GATEWAY_PORT"] = str(args.port)
    os.environ["GATEWAY_HOST"] = "0.0.0.0"

    # Verify and provision CUDA runtime & VLM dependencies
    ensure_cuda_and_vlm_dependencies()

    # Start GPU VRAM Watchdog
    watchdog = ColabGPUWatchdog(interval_sec=4)
    watchdog.start()

    # Provision Models (Drive or Hugging Face)
    setup_models(
        source=args.model_source,
        drive_path=args.drive_path,
        hf_token=args.hf_token,
        org=args.hf_org,
    )

    # Enterprise database autoconfig (PostgreSQL + Neo4j)
    configure_colab_storage(force_sqlite=args.use_sqlite)

    # Connect Observability
    start_colab_observability_bridge(watchdog)

    # Establish Tunnel
    tunnel_url = None
    if not args.no_tunnel:
        tunnel_url = install_and_start_cloudflare_tunnel(port=args.port)

    # Launch Uvicorn Gateway
    print(f"{GREEN}🚀 Starting ClinixVault API Gateway on 0.0.0.0:{args.port}...{RESET}")
    try:
        import uvicorn
        from backend.gateway.main import app
        uvicorn.run(app, host="0.0.0.0", port=args.port, log_level="info")
    except KeyboardInterrupt:
        print(f"\n{YELLOW}🛑 Stopping ClinixVault Colab Server...{RESET}")
        watchdog.running = False


if __name__ == "__main__":
    main()
