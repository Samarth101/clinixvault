"""
Model Management Routes for ClinixVault Edge Appliance.
Enables listing installed Ollama & local models, curated pretrained catalog browsing,
asynchronous model pulling with progress tracking, and active pipeline selection.
"""

from fastapi import APIRouter, HTTPException, status
import os
import subprocess
import time
import sys
import httpx
from backend.gateway.schemas.requests import ModelPullRequest, ModelActiveRequest, OllamaRunRequest
from backend.gateway.metrics import record_ollama_inference, update_microservice_health
from inference.shared.model_manager import get_model_manager

router = APIRouter(prefix="/api/v1/models", tags=["Models"])


@router.get("/list")
async def list_models():
    """
    Returns downloaded local models from Ollama and models/ directory,
    along with curated library of pretrained medical models and connection state.
    """
    manager = get_model_manager()
    return manager.get_model_catalog()


@router.post("/pull")
async def pull_model(request: ModelPullRequest):
    """
    Triggers asynchronous download of a model via local Ollama runner.
    """
    if not request.model or not request.model.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Model name is required for download.",
        )
    manager = get_model_manager()
    return manager.trigger_model_pull(request.model.strip())


@router.get("/status")
async def get_download_status():
    """
    Returns real-time download and layer verification progress.
    """
    manager = get_model_manager()
    return manager.get_pull_status()


@router.post("/active")
async def set_active_model(request: ModelActiveRequest):
    """
    Configures the active inference model for radiology and/or clinical summarization.
    """
    manager = get_model_manager()
    if request.radiology_model:
        manager.set_active_model("radiology", request.radiology_model)
    if request.summarize_model:
        manager.set_active_model("summarize", request.summarize_model)
    if request.task and request.model:
        manager.set_active_model(request.task, request.model)

    return {
        "status": "success",
        "active_radiology_model": manager.active_radiology_model,
        "active_summarize_model": manager.active_summarize_model,
    }


@router.post("/ollama/start")
async def start_ollama_daemon():
    """
    Checks if Ollama runner is active; if not, launches 'ollama serve' in background.
    """
    # 1. Quick probe if already running
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.get("http://127.0.0.1:11434/api/version")
            if resp.status_code == 200:
                ver = resp.json().get("version", "unknown")
                update_microservice_health("ollama", True)
                return {
                    "status": "already_running",
                    "message": f"Ollama daemon is already running (v{ver}).",
                    "connected": True,
                    "version": ver,
                }
    except Exception:
        pass

    # 2. Spawn Ollama application (macOS menu bar app if present, or CLI daemon)
    try:
        is_mac = sys.platform == "darwin"
        has_mac_app = is_mac and os.path.exists("/Applications/Ollama.app")

        if has_mac_app:
            # Launch macOS menu bar application so clinician sees the top menu icon
            proc = subprocess.Popen(
                ["open", "-a", "Ollama"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            launch_mode = "mac_app"
        else:
            # Headless CLI fallback
            proc = subprocess.Popen(
                ["ollama", "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            launch_mode = "cli_daemon"
        # Give it a moment to initialize
        time.sleep(1.0)
        for _ in range(6):
            try:
                async with httpx.AsyncClient(timeout=1.0) as client:
                    resp = await client.get("http://127.0.0.1:11434/api/version")
                    if resp.status_code == 200:
                        ver = resp.json().get("version", "unknown")
                        update_microservice_health("ollama", True)
                        return {
                            "status": "started",
                            "message": f"Ollama {'macOS menu bar app' if launch_mode == 'mac_app' else 'daemon'} launched successfully (v{ver}).",
                            "connected": True,
                            "version": ver,
                            "pid": proc.pid,
                            "mode": launch_mode,
                        }
            except Exception:
                time.sleep(0.5)

        return {
            "status": "starting",
            "message": f"Ollama {'macOS menu bar app' if launch_mode == 'mac_app' else 'daemon'} spawned. Initialization in progress.",
            "connected": False,
            "pid": proc.pid,
            "mode": launch_mode,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to launch Ollama daemon: {str(e)}",
        )


@router.post("/ollama/stop")
async def stop_ollama_daemon():
    """
    Cross-platform termination of local Ollama server/application.
    On macOS: cleanly dismisses top menu bar icon via AppleScript and kills background daemons.
    On Linux/Windows: stops systemd services / terminates runner processes.
    """
    is_mac = sys.platform == "darwin"
    is_win = sys.platform == "win32"
    details = []

    if is_mac:
        # 1. Gracefully close macOS Menu Bar App so top bar icon is removed
        try:
            subprocess.run(["osascript", "-e", 'quit app "Ollama"'], capture_output=True, timeout=2.5)
            details.append("macOS Ollama menu bar app quit signal sent.")
        except Exception as e:
            details.append(f"AppleScript notice: {e}")

        # 2. Terminate any residual Ollama runner daemons
        try:
            subprocess.run(["killall", "Ollama"], capture_output=True, timeout=2.0)
            details.append("killall Ollama executed.")
        except Exception:
            pass
        try:
            subprocess.run(["pkill", "-f", "ollama serve"], capture_output=True, timeout=2.0)
            subprocess.run(["pkill", "-f", "ollama"], capture_output=True, timeout=2.0)
            details.append("pkill ollama executed.")
        except Exception:
            pass

    elif is_win:
        try:
            subprocess.run(["taskkill", "/F", "/IM", "ollama.exe"], capture_output=True, timeout=3.0)
            subprocess.run(["taskkill", "/F", "/IM", "ollama app.exe"], capture_output=True, timeout=3.0)
            details.append("Windows taskkill executed.")
        except Exception as e:
            details.append(f"Taskkill notice: {e}")
    else:
        # Linux / Unix
        try:
            subprocess.run(["systemctl", "stop", "ollama"], capture_output=True, timeout=3.0)
            details.append("systemctl stop ollama executed.")
        except Exception:
            pass
        try:
            subprocess.run(["pkill", "-f", "ollama serve"], capture_output=True, timeout=2.0)
            subprocess.run(["pkill", "-f", "ollama"], capture_output=True, timeout=2.0)
            details.append("pkill ollama executed.")
        except Exception:
            pass

    # Verify if service is still responding
    still_running = False
    try:
        async with httpx.AsyncClient(timeout=1.0) as client:
            resp = await client.get("http://127.0.0.1:11434/api/version")
            if resp.status_code == 200:
                still_running = True
    except Exception:
        still_running = False

    update_microservice_health("ollama", still_running)

    return {
        "status": "stopped" if not still_running else "stopping",
        "message": "Ollama runner stopped successfully." if not still_running else "Stop command dispatched to Ollama.",
        "connected": still_running,
        "details": details,
    }


@router.post("/ollama/run")
async def run_ollama_model(request: OllamaRunRequest):
    """
    Preloads a user-selected model into Ollama active VRAM/RAM with a 10-minute keep-alive.
    """
    model_name = request.model_name.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Model name is required to run/preload.",
        )

    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(
                "http://127.0.0.1:11434/api/generate",
                json={"model": model_name, "keep_alive": "10m"},
            )
            elapsed = time.time() - t0
            is_ok = resp.status_code == 200
            record_ollama_inference(model=model_name, duration_seconds=elapsed, token_count=1, status="success" if is_ok else "error")
            update_microservice_health("ollama", is_ok)
            if is_ok:
                return {
                    "status": "success",
                    "model": model_name,
                    "message": f"Model '{model_name}' successfully preloaded into active edge memory (keep-alive: 10m).",
                }
            else:
                return {
                    "status": "warning",
                    "model": model_name,
                    "message": f"Ollama responded with HTTP {resp.status_code}: {resp.text}",
                }
    except Exception as e:
        record_ollama_inference(model=model_name, duration_seconds=time.time() - t0, token_count=0, status="error")
        update_microservice_health("ollama", False)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error communicating with local Ollama runner: {str(e)}",
        )


@router.get("/ollama/status")
async def get_ollama_status():
    """
    Returns real-time status of the local Ollama daemon and installed models.
    """
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            v_resp = await client.get("http://127.0.0.1:11434/api/version")
            running = v_resp.status_code == 200
            version = v_resp.json().get("version") if running else None
            update_microservice_health("ollama", running)

            models = []
            if running:
                t_resp = await client.get("http://127.0.0.1:11434/api/tags")
                if t_resp.status_code == 200:
                    models = t_resp.json().get("models", [])

            return {
                "running": running,
                "version": version,
                "models": models,
                "host": "http://127.0.0.1:11434",
            }
    except Exception:
        update_microservice_health("ollama", False)
        return {
            "running": False,
            "version": None,
            "models": [],
            "host": "http://127.0.0.1:11434",
        }
