"""
Hardware Auto-Detection Engine for ClinixVault Edge Appliance.
Provides unified hardware diagnostics across Apple Silicon (MPS / Unified Memory),
NVIDIA CUDA architectures, and air-gapped CPU nodes.
"""

import os
import platform
import subprocess
import psutil
from typing import Dict, Any


def get_hardware_specs() -> Dict[str, Any]:
    """
    Auto-detects host system architecture, processor chip, accelerator,
    and unified memory / VRAM statistics.
    """
    plat = platform.system().lower()
    mem = psutil.virtual_memory()
    total_gb = round(mem.total / (1024**3), 2)
    free_gb = round(mem.available / (1024**3), 2)
    used_gb = round(mem.used / (1024**3), 2)
    mem_pct = round(mem.percent, 1)

    is_apple_silicon = False
    chip_name = platform.processor() or "Unknown CPU"
    accelerator = "CPU (x86_64 / ARM)"
    gpu_name = chip_name
    memory_type = "System RAM"

    # Check for Docker container running on macOS / Apple Silicon host
    is_docker_mac = False
    try:
        release_str = os.uname().release.lower() if hasattr(os, "uname") else ""
        if "linuxkit" in release_str or os.getenv("HOST_OS") == "Darwin" or "host.docker.internal" in os.getenv("OLLAMA_HOST", ""):
            if platform.machine() in ("aarch64", "arm64") or os.getenv("HOST_CHIP"):
                is_docker_mac = True
    except Exception:
        pass

    # 1. macOS / Darwin Auto-Detection (Host or Docker on Mac)
    if plat == "darwin" or is_docker_mac:
        if plat == "darwin":
            try:
                brand = subprocess.check_output(
                    ["sysctl", "-n", "machdep.cpu.brand_string"],
                    stderr=subprocess.DEVNULL,
                ).decode().strip()
                if brand:
                    chip_name = brand
            except Exception:
                pass
        else:
            chip_name = os.getenv("HOST_CHIP") or "Apple Silicon (M-Series)"

        is_apple_silicon = "Apple" in chip_name or platform.machine() in ("arm64", "aarch64")
        if is_apple_silicon:
            memory_type = "Unified Memory"
            gpu_name = f"{chip_name} (Metal Unified)"
            accelerator = os.getenv("HOST_ACCELERATOR") or "Apple Metal (MPS) / Ollama"
            try:
                import torch
                if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                    accelerator = "Apple Metal (MPS)"
                else:
                    accelerator = "Apple Metal (MPS) / Ollama"
            except Exception:
                accelerator = "Apple Metal (MPS) / Ollama"
        else:
            accelerator = "macOS CPU"
            gpu_name = f"{chip_name}"

    # 2. Linux / Windows NVIDIA Auto-Detection
    elif plat in ("linux", "windows"):
        cuda_found = False
        try:
            import torch
            if torch.cuda.is_available():
                cuda_found = True
                gpu_name = torch.cuda.get_device_name(0)
                accelerator = f"NVIDIA CUDA ({gpu_name})"
                memory_type = "Dedicated VRAM + System RAM"
        except Exception:
            pass

        if not cuda_found:
            # Check nvidia-smi if torch without cuda
            try:
                nvidia_info = subprocess.check_output(
                    ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                    stderr=subprocess.DEVNULL,
                ).decode().strip()
                if nvidia_info:
                    parts = nvidia_info.split(",")
                    gpu_name = parts[0].strip()
                    accelerator = f"NVIDIA ({gpu_name})"
                    memory_type = "Dedicated VRAM + System RAM"
            except Exception:
                pass

    cpu_physical = psutil.cpu_count(logical=False) or 1
    cpu_logical = psutil.cpu_count(logical=True) or 1
    cpu_usage = psutil.cpu_percent(interval=0.05)

    return {
        "platform": plat,
        "chip": chip_name,
        "raw_brand": chip_name,
        "memory_type": memory_type,
        "total_memory_gb": total_gb,
        "free_memory_gb": free_gb,
        "used_memory_gb": used_gb,
        "memory_percent": mem_pct,
        "accelerator": accelerator,
        "is_apple_silicon": is_apple_silicon,
        "gpu_name": gpu_name,
        "cpu_cores_physical": cpu_physical,
        "cpu_cores_logical": cpu_logical,
        "cpu_percent": cpu_usage,
    }
