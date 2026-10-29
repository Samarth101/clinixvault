"""
ClinixVault VLM Microservice (Port 8001).
Provides high-performance edge radiology report generation for chest X-rays.
Integrates MM-RAG visual exemplar retrieval, GraphRAG clinical history injection,
and Two-Stage Hierarchical report synthesis with NegEx negation auditing.
"""

import os
import sys
import io
import re
import time
import base64
from typing import List, Tuple
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from PIL import Image

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from inference.shared.config import settings
from inference.shared.logger import get_logger
from inference.shared.health import create_health_router
from inference.shared.metrics import setup_microservice_metrics, record_inference_metrics
from inference.vlm_server.schemas import (
    RadiologyReportRequest,
    RadiologyReportResponse,
    FindingDetection,
)
from inference.vlm_server.model_loader import get_vlm_runner

logger = get_logger("clinixvault.vlm_server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing VLM Server and warming up vision model...")
    _ = get_vlm_runner()
    logger.info("VLM Server readiness check complete.")
    yield
    logger.info("VLM Server shutting down.")


app = FastAPI(
    title="ClinixVault VLM Radiology Service",
    version="1.1.0",
    description="Air-gapped edge microservice for multi-modal radiology report generation with MM-RAG & GraphRAG",
    lifespan=lifespan,
)

# Attach shared health router & OpenMetrics /metrics endpoint
app.include_router(create_health_router("vlm-service"))
setup_microservice_metrics(app, "vlm-server")


def decode_image(req: RadiologyReportRequest) -> Image.Image:
    """Decodes image from base64 string or loads from local file path."""
    if req.image_base64:
        try:
            image_bytes = base64.b64decode(req.image_base64)
            return Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid base64 encoded image data: {str(e)}",
            )
    elif req.image_path:
        if not os.path.exists(req.image_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Image file not found at path: {req.image_path}",
            )
        try:
            return Image.open(req.image_path).convert("RGB")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not open image file: {str(e)}",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either 'image_base64' or 'image_path' must be provided.",
        )


PRE_NEGATION_CUES = [
    r'\bno\b', r'\bnot\b', r'\bwithout\b', r'\bfree of\b', r'\bnegative for\b',
    r'\bclear of\b', r'\bdenies\b', r'\brules? out\b', r'\bunremarkable\b',
    r'\babsent\b', r'\bno evidence of\b', r'\bno acute\b', r'\bno definite\b',
    r'\bno focal\b', r'\bnormal\b', r'\bunlikely\b'
]
POST_NEGATION_CUES = [
    r'\bis absent\b', r'\babsent\b', r'\bwas not (?:seen|identified|detected)\b',
    r'\bnot (?:seen|identified|detected|observed)\b', r'\brules? out\b', r'\bruled out\b',
    r'\bunremarkable\b', r'\bnegative\b', r'\bis normal\b', r'\bwithin normal limits\b',
    r'\bresolved\b', r'\bunlikely\b', r'\bnone\b'
]
PRE_NEG_PATTERN = re.compile(r'(' + '|'.join(PRE_NEGATION_CUES) + r')', re.IGNORECASE)
POST_NEG_PATTERN = re.compile(r'(' + '|'.join(POST_NEGATION_CUES) + r')', re.IGNORECASE)


def analyze_pathology_signatures(text: str) -> List[FindingDetection]:
    """
    Scans generated findings and impression for clinical pathologies with NegEx negation awareness.
    Explicitly distinguishes asserted positive findings from ruled-out / negated findings.
    Supports both pre-negation (e.g. 'no pneumothorax') and post-negation (e.g. 'pneumothorax is absent').
    """
    known_pathologies = {
        "cardiomegaly": "Enlarged cardiac silhouette exceeding 50% cardiothoracic ratio.",
        "pneumothorax": "Pleural line separation and lack of peripheral lung markings.",
        "pleural effusion": "Blunting of the costophrenic angles or meniscus sign.",
        "atelectasis": "Volume loss and discoid opacities.",
        "consolidation": "Air space opacification with possible air bronchograms.",
        "pulmonary edema": "Kerley B lines and peribronchial cuffing.",
        "pneumonia": "Focal dense parenchymal infiltration.",
    }

    detections = []
    sentences = re.split(r'[.;\n]', text.lower())

    for sent in sentences:
        sent_str = sent.strip()
        if not sent_str:
            continue
        for pathology, desc in known_pathologies.items():
            match = re.search(r'\b' + re.escape(pathology) + r'\b', sent_str)
            if match:
                pre_text = sent_str[:match.start()]
                post_text = sent_str[match.end():]
                # If an adversative conjunction occurs before the pathology, reset negation scope
                if re.search(r'\b(?:but|however|except)\b', pre_text):
                    effective_pre = re.split(r'\b(?:but|however|except)\b', pre_text)[-1]
                else:
                    effective_pre = pre_text

                is_negated = bool(
                    PRE_NEG_PATTERN.search(effective_pre)
                    or POST_NEG_PATTERN.search(post_text)
                    or "clear" in effective_pre
                    or "normal" in effective_pre
                )
                confidence = 0.94 if not is_negated else 0.98
                detections.append(
                    FindingDetection(
                        pathology=pathology,
                        confidence=confidence,
                        evidence=desc if not is_negated else f"Ruled out / Absent: {desc}",
                        negated=is_negated,
                    )
                )

    return detections


@app.post("/generate", response_model=RadiologyReportResponse)
async def generate_radiology_report(request: RadiologyReportRequest):
    """
    Unified multi-modal endpoint for chest radiograph interpretation.
    Supports GraphRAG prior injection, MM-RAG visual exemplars, and Hierarchical reporting.
    """
    start_time = time.time()
    image = decode_image(request)
    runner = get_vlm_runner()

    findings, impression, full_report, metadata = runner.generate_report(
        image=image,
        clinical_history=request.clinical_history or "",
        projection=request.projection_view or "PA",
        patient_id=request.patient_id,
        enable_graph_rag=request.enable_graph_rag,
        enable_mm_rag=request.enable_mm_rag,
        hierarchical_mode=request.hierarchical_mode,
        num_exemplars=request.num_exemplars,
        max_tokens=request.max_tokens,
        temperature=request.temperature,
        return_metadata=True,
    )

    duration_ms = round((time.time() - start_time) * 1000, 2)
    pathologies = analyze_pathology_signatures(findings + " " + impression)
    token_est = len((findings + " " + impression).split())
    record_inference_metrics(
        service="vlm-server",
        model=runner.model_path or "qwen2-vl",
        task="radiology_report",
        duration_seconds=duration_ms / 1000.0,
        token_count=token_est,
        status="success",
    )

    return RadiologyReportResponse(
        findings=findings,
        impression=impression,
        full_report=full_report,
        detected_pathologies=pathologies,
        generation_latency_ms=duration_ms,
        model_version=runner.model_path,
        graph_context_used=metadata.get("graph_context_used"),
        retrieved_exemplars_count=metadata.get("retrieved_exemplars_count", 0),
        stage1_findings=metadata.get("stage1_findings"),
        consistency_verified=metadata.get("consistency_verified", True),
        anatomical_breakdown=metadata.get("anatomical_breakdown"),
        critic_audit=metadata.get("critic_audit"),
    )


@app.post("/generate_hierarchical", response_model=RadiologyReportResponse)
async def generate_hierarchical_report(request: RadiologyReportRequest):
    """Explicit endpoint forcing two-stage hierarchical report generation."""
    request.hierarchical_mode = True
    return await generate_radiology_report(request)


@app.post("/generate_mm_rag", response_model=RadiologyReportResponse)
async def generate_mm_rag_report(request: RadiologyReportRequest):
    """Explicit endpoint activating MM-RAG visual exemplar retrieval."""
    request.enable_mm_rag = True
    return await generate_radiology_report(request)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.VLM_HOST, port=settings.VLM_PORT)
