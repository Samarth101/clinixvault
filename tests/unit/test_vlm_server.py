"""
Unit tests for ClinixVault VLM Edge Microservice (server.py, schemas, and model_loader).
Tests NegEx bi-directional negation detection, GraphHallucinationFilter,
and FastAPI endpoints (/generate, /generate_hierarchical, /generate_mm_rag).
"""

import io
import base64
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from inference.vlm_server.server import app, analyze_pathology_signatures
from inference.vlm_server.schemas import RadiologyReportRequest, RadiologyReportResponse
from backend.graph_rag import GraphHallucinationFilter


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def test_image_b64():
    """Generates a small valid base64 encoded PNG for testing."""
    img = Image.new("RGB", (64, 64), color=(128, 128, 128))
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def test_analyze_pathology_signatures_pre_and_post_negation():
    """Verify bi-directional NegEx handles both pre-negation cues and post-negation cues."""
    # Pre-negation test
    pre_neg_text = "The lungs are clear. No pneumothorax, focal consolidation, or pleural effusion is identified."
    detections_pre = analyze_pathology_signatures(pre_neg_text)
    det_map_pre = {d.pathology: d.negated for d in detections_pre}
    assert "pneumothorax" in det_map_pre
    assert det_map_pre["pneumothorax"] is True
    assert "consolidation" in det_map_pre
    assert det_map_pre["consolidation"] is True
    assert "pleural effusion" in det_map_pre
    assert det_map_pre["pleural effusion"] is True

    # Post-negation test (e.g. "pneumothorax is absent", "pleural effusion is ruled out")
    post_neg_text = "Cardiac silhouette is normal. Pneumothorax is absent. Pleural effusion is ruled out."
    detections_post = analyze_pathology_signatures(post_neg_text)
    det_map_post = {d.pathology: d.negated for d in detections_post}
    assert "pneumothorax" in det_map_post
    assert det_map_post["pneumothorax"] is True
    assert "pleural effusion" in det_map_post
    assert det_map_post["pleural effusion"] is True

    # Positive detection test
    pos_text = "Focal consolidation in the right lower lobe consistent with acute pneumonia. Cardiomegaly is moderate."
    detections_pos = analyze_pathology_signatures(pos_text)
    det_map_pos = {d.pathology: d.negated for d in detections_pos}
    assert "consolidation" in det_map_pos
    assert det_map_pos["consolidation"] is False
    assert "pneumonia" in det_map_pos
    assert det_map_pos["pneumonia"] is False
    assert "cardiomegaly" in det_map_pos
    assert det_map_pos["cardiomegaly"] is False


def test_graph_hallucination_filter():
    """Verify GraphHallucinationFilter prevents verified surgical hardware from being called foreign bodies."""
    verified_devices = ["dual-chamber pacemaker", "sternotomy wires"]
    dirty_report = "Suspicious radiopaque foreign body identified in the right hemithorax. Questionable retained hardware."

    cleaned_report, corrections = GraphHallucinationFilter.verify_and_clean_report(dirty_report, verified_devices)
    assert len(corrections) > 0
    assert "foreign body" not in cleaned_report.lower()
    assert "verified" in cleaned_report.lower() or "pacemaker" in cleaned_report.lower()


def test_vlm_server_health(client):
    """Verify health endpoint responds with healthy status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["healthy", "ok"]


def test_vlm_server_generate_endpoint(client, test_image_b64):
    """Verify /generate endpoint processes base64 radiograph and returns valid schema."""
    payload = {
        "image_base64": test_image_b64,
        "clinical_history": "History of mild dyspnea and cough.",
        "projection_view": "PA",
        "enable_graph_rag": True,
        "hierarchical_mode": True,
        "max_tokens": 100,
    }
    response = client.post("/generate", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "findings" in data and len(data["findings"]) > 0
    assert "impression" in data and len(data["impression"]) > 0
    assert "full_report" in data
    assert "generation_latency_ms" in data
    assert data["generation_latency_ms"] >= 0
    assert isinstance(data["detected_pathologies"], list)
    assert "consistency_verified" in data


def test_vlm_server_hierarchical_endpoint(client, test_image_b64):
    """Verify /generate_hierarchical route alias forces hierarchical mode and returns stage 1 findings."""
    payload = {
        "image_base64": test_image_b64,
        "clinical_history": "Pre-operative evaluation. Dual-chamber pacemaker present.",
        "projection_view": "PA",
        "hierarchical_mode": True,
        "max_tokens": 120,
    }
    response = client.post("/generate_hierarchical", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["stage1_findings"] is not None
    assert "FINDINGS:" in data["full_report"]
    assert "IMPRESSION:" in data["full_report"]
    assert data["consistency_verified"] is True


def test_vlm_server_mm_rag_endpoint(client, test_image_b64):
    """Verify /generate_mm_rag route alias activates MM-RAG visual exemplar retrieval."""
    payload = {
        "image_base64": test_image_b64,
        "clinical_history": "Annual chest checkup.",
        "enable_mm_rag": True,
        "num_exemplars": 2,
        "max_tokens": 100,
    }
    response = client.post("/generate_mm_rag", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "findings" in data
    assert "impression" in data
    assert isinstance(data["retrieved_exemplars_count"], int)


def test_vlm_server_invalid_payload(client):
    """Verify missing both image_base64 and image_path yields 400 Bad Request."""
    payload = {
        "clinical_history": "No image attached.",
    }
    response = client.post("/generate", json=payload)
    assert response.status_code == 400
    assert "Either 'image_base64' or 'image_path' must be provided" in response.json()["detail"]
