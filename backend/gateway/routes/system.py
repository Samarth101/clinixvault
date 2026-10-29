"""
System Hardware Telemetry and Edge Specification Routes.
Exposes auto-detected hardware architecture, Apple Silicon Unified Memory metrics,
and accelerator diagnostics.
"""

from fastapi import APIRouter
from inference.shared.hardware import get_hardware_specs

router = APIRouter(prefix="/api/v1/system", tags=["System"])


@router.get("/hardware")
async def get_system_hardware():
    """
    Returns auto-detected host hardware specifications, Apple Silicon / MPS telemetry,
    and memory utilization metrics.
    """
    return get_hardware_specs()
