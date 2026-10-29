"""
Reusable Health Check Endpoint Mixin and Router for ClinixVault Microservices.
Reports process uptime, memory usage, CPU load, and dynamic Apple Silicon / CUDA telemetry.
"""

import time
import psutil
from typing import Dict, Any, Optional
from fastapi import APIRouter
from pydantic import BaseModel

from inference.shared.hardware import get_hardware_specs

_START_TIME = time.time()


class SystemStats(BaseModel):
    cpu_percent: float
    memory_used_mb: float
    memory_percent: float
    disk_usage_percent: float
    gpu_available: bool
    gpu_device_name: str
    gpu_allocated_vram_mb: float
    platform: Optional[str] = None
    memory_type: Optional[str] = None
    accelerator: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    service_name: str
    uptime_seconds: float
    telemetry: SystemStats


def get_system_telemetry() -> SystemStats:
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    specs = get_hardware_specs()

    gpu_available = specs["is_apple_silicon"] or "NVIDIA" in specs["accelerator"]
    gpu_name = specs["gpu_name"]
    gpu_vram = 0.0

    if specs["is_apple_silicon"]:
        # In Unified Memory architecture, dynamic GPU memory is shared with host memory
        gpu_vram = round(specs["used_memory_gb"] * 1024, 1)
    else:
        try:
            import torch
            if torch.cuda.is_available():
                gpu_vram = round(torch.cuda.memory_allocated(0) / (1024 * 1024), 2)
        except Exception:
            pass

    return SystemStats(
        cpu_percent=round(specs["cpu_percent"], 1),
        memory_used_mb=round(mem.used / (1024 * 1024), 2),
        memory_percent=mem.percent,
        disk_usage_percent=disk.percent,
        gpu_available=gpu_available,
        gpu_device_name=gpu_name,
        gpu_allocated_vram_mb=gpu_vram,
        platform=specs["platform"],
        memory_type=specs["memory_type"],
        accelerator=specs["accelerator"],
    )


def create_health_router(service_name: str) -> APIRouter:
    router = APIRouter(tags=["Health"])

    @router.get("/health", response_model=HealthResponse)
    async def health_check():
        return HealthResponse(
            status="healthy",
            service_name=service_name,
            uptime_seconds=round(time.time() - _START_TIME, 2),
            telemetry=get_system_telemetry(),
        )

    return router
