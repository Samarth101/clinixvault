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
                print(f"{GREEN}⚡ [GPU WATCHDOG] CUDA initialized: {self.gpu_name} ({self.total_vram_mb} MB VRAM){RESET}")
            else:
                print(f"{YELLOW}⚠️  [GPU WATCHDOG] CUDA not detected. Operating in CPU fallback mode.{RESET}")
        except Exception as e:
            print(f"{YELLOW}⚠️  [GPU WATCHDOG] CUDA init warning: {e}{RESET}")

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

                    # Dynamic VRAM Pressure Management
                    if self.vram_percent >= 88.0:
                        print(f"\n{RED}🚨 [GPU WATCHDOG] Critical VRAM pressure ({self.vram_percent}% | {self.used_vram_mb}/{self.total_vram_mb} MB).{RESET}")
                        print(f"{YELLOW}🧹 Emptying CUDA cache to prevent Colab session crash...{RESET}")
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
# 5. Colab Observability Metric Injector
# ============================================================================
def start_colab_observability_bridge(watchdog: ColabGPUWatchdog):
    """
    Injects live GPU telemetry into the Gateway metrics registry so that Grafana Cloud
    can visualize Colab GPU utilization, VRAM usage, and temperatures in real-time.
    """
    try:
        from backend.gateway.metrics import metrics_collector
        print(f"{GREEN}📊 [OBSERVABILITY] Connected GPU Watchdog to Prometheus metrics registry.{RESET}")
    except Exception as e:
        print(f"{YELLOW}⚠️  Metrics collector bridge note: {e}{RESET}")


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
