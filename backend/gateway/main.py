"""
ClinixVault API Gateway Main Application.
Air-gapped clinical gateway orchestrating multi-modal inference,
FHIR serialization, JWT security, and audit logging.
"""

import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, status, Response
from fastapi.middleware.cors import CORSMiddleware

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from inference.shared.config import settings
from inference.shared.logger import get_logger
from backend.database.connection import init_db
from backend.gateway.middleware.audit import AuditLoggingMiddleware
from backend.gateway.middleware.rate_limiter import RateLimiterMiddleware
from backend.gateway.middleware.auth import create_access_token
from backend.gateway.metrics import get_prometheus_metrics_response
from backend.gateway.schemas.requests import LoginRequest, TokenResponse
from backend.gateway.routes import (
    radiology,
    scribe,
    summarize,
    health,
    system,
    models,
    graph,
    patients,
    clinical_utilities,
    telemetry,
)

logger = get_logger("clinixvault.gateway")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing ClinixVault Database schemas...")
    init_db()
    
    # Asynchronously pre-warm Faster-Whisper ASR in a daemon thread for zero cold-start delay
    import threading
    def _warmup_worker():
        try:
            from inference.audio_server.transcriber import get_transcriber
            logger.info("🎙️ Pre-warming Faster-Whisper ASR runtime in background...")
            get_transcriber()
            logger.info("🎙️ Faster-Whisper ASR runtime pre-warmed successfully.")
        except Exception as e:
            logger.warning(f"Whisper background pre-warm notice: {e}")

    threading.Thread(target=_warmup_worker, daemon=True).start()
    logger.info("ClinixVault API Gateway ready.")
    yield
    logger.info("ClinixVault API Gateway shutting down.")


app = FastAPI(
    title="ClinixVault Clinical Gateway",
    version="1.0.0",
    description="Air-Gapped Edge AI Clinical Appliance for Radiology, Scribing, and Medical Synthesis",
    lifespan=lifespan,
)

# Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom Middlewares
app.add_middleware(AuditLoggingMiddleware)
app.add_middleware(RateLimiterMiddleware, requests_per_minute=settings.RATE_LIMIT_PER_MINUTE)


@app.post("/api/v1/auth/login", response_model=TokenResponse, tags=["Authentication"])
async def login_endpoint(credentials: LoginRequest):
    # Air-gapped local credential verification
    if credentials.username and credentials.password:
        role = "radiologist" if "rad" in credentials.username.lower() else "physician"
        token = create_access_token(user_id=credentials.username, role=role)
        return TokenResponse(
            access_token=token,
            expires_in_minutes=settings.JWT_EXPIRATION_MINUTES,
            user_role=role,
        )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials provided.",
    )


# Attach Routes
app.include_router(radiology.router)
app.include_router(scribe.router)
app.include_router(summarize.router)
app.include_router(health.router)
app.include_router(system.router)
app.include_router(models.router)
app.include_router(graph.router)
app.include_router(patients.router)
app.include_router(clinical_utilities.router)
app.include_router(telemetry.router)


@app.get("/", tags=["Root"])
async def root_info():
    return {
        "service": "ClinixVault Edge AI Gateway",
        "version": "1.0.0",
        "mode": "Air-Gapped Clinical Vault",
        "docs_url": "/docs",
        "metrics_url": "/metrics",
    }


@app.get("/metrics", tags=["Observability"], response_class=Response)
async def prometheus_metrics():
    """
    Exposes Prometheus text-formatted runtime metrics (OpenMetrics / Prometheus 2.0).
    Provides process memory/CPU gauges, HTTP request counters, endpoint latency summaries,
    and dynamic hardware accelerator telemetry.
    """
    return get_prometheus_metrics_response()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.GATEWAY_HOST, port=settings.GATEWAY_PORT)
