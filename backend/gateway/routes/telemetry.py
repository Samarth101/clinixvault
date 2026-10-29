"""
Frontend Telemetry Ingestion Router.
Receives user interface interactions, button clicks, modal triggers,
and page navigation from the React client, recording Prometheus dimensional metrics
and streaming structured events into Grafana Loki.
"""

from fastapi import APIRouter, status
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from backend.gateway.metrics import record_frontend_event
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.frontend_telemetry")
router = APIRouter(prefix="/api/v1/telemetry", tags=["Telemetry"])


class TelemetryEvent(BaseModel):
    event_type: str = Field(..., description="Type of event: button_click, page_view, modal_open, action")
    component: str = Field(..., description="React component name")
    button_id: Optional[str] = Field(None, description="Identifier of the button or control clicked")
    page: Optional[str] = Field(None, description="Active page ID or route")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional context")


class TelemetryBatchRequest(BaseModel):
    events: List[TelemetryEvent]


@router.post("/event", status_code=status.HTTP_200_OK)
async def ingest_telemetry_event(event: TelemetryEvent):
    """
    Ingests a single frontend user interaction event into Prometheus and Loki.
    """
    record_frontend_event(
        event_type=event.event_type,
        component=event.component,
        button_id=event.button_id,
        page=event.page,
    )
    logger.info(
        f"Frontend Telemetry: {event.event_type} on {event.component} (page={event.page}, button={event.button_id})",
        extra={
            "service": "frontend_ui",
            "event_type": event.event_type,
            "component": event.component,
            "button_id": event.button_id or "",
            "page": event.page or "",
            "client_event": True,
        },
    )
    return {"status": "recorded"}


@router.post("/batch", status_code=status.HTTP_200_OK)
async def ingest_telemetry_batch(batch: TelemetryBatchRequest):
    """
    Ingests batched frontend telemetry events to reduce network overhead.
    """
    for event in batch.events:
        record_frontend_event(
            event_type=event.event_type,
            component=event.component,
            button_id=event.button_id,
            page=event.page,
        )
    logger.info(
        f"Ingested {len(batch.events)} frontend telemetry events in batch.",
        extra={"service": "frontend_ui", "batch_size": len(batch.events)},
    )
    return {"status": "batch_recorded", "count": len(batch.events)}
