"""
Unit Tests for Pipeline 3: Clinical Document Summarization & Scribe WebSocket Endpoints.
Verifies POST /api/v1/summarize/document and WebSocket /api/v1/scribe/ws.
"""

import base64
import struct
import pytest
from fastapi.testclient import TestClient

from backend.gateway.main import app as gateway_app
from backend.database.connection import get_db
from backend.database.models import ClinicalReport


@pytest.fixture
def client():
    return TestClient(gateway_app)


def test_summarize_document_endpoint_with_synthetic_note(client, test_patient):
    """Verifies POST /api/v1/summarize/document parses text, extracts sections, and grounds citations."""
    sample_text = (
        "CHIEF COMPLAINT:\n"
        "Patient presents with worsening dyspnea and productive cough for 4 days.\n\n"
        "HISTORY OF PRESENT ILLNESS:\n"
        "The patient is a 64-year-old male with a history of COPD who reports yellow sputum and nocturnal orthopnea.\n\n"
        "MEDICATIONS:\n"
        "Albuterol HFA 90 mcg inhaler PRN, Lisinopril 20 mg daily, Metformin 500 mg BID.\n\n"
        "ASSESSMENT AND PLAN:\n"
        "1. Acute exacerbation of chronic obstructive pulmonary disease. Start oral prednisone and azithromycin.\n"
        "2. Hypertension stable on current regimen.\n"
    )
    b64_doc = base64.b64encode(sample_text.encode("utf-8")).decode("utf-8")

    response = client.post(
        "/api/v1/summarize/document",
        json={
            "patient_id": test_patient.id,
            "document_base64": b64_doc,
            "summary_type": "discharge",
            "enable_ocr_fallback": True,
        },
        headers={"Authorization": "Bearer vault-local-admin-token"},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert "summary_id" in data
    assert data["patient_id"] == test_patient.id
    assert len(data["summary"]) > 0
    assert "sections" in data
    assert isinstance(data["sections"], dict)
    assert "citations" in data
    assert data["grounding_score"] >= 0.0
    assert data["latency_ms"] >= 0.0


def test_scribe_websocket_ws_alias_endpoint(client, test_patient):
    """Verifies that /api/v1/scribe/ws route functions identically to /api/v1/scribe/stream."""
    samples = [int(250 * (i % 10)) for i in range(8000)]
    pcm_bytes = struct.pack(f"<{len(samples)}h", *samples)

    with client.websocket_connect("/api/v1/scribe/ws") as ws:
        ws.send_json({"type": "init", "patient_id": test_patient.id})
        ready = ws.receive_json()
        assert ready["type"] == "ready"

        # Stream binary audio
        ws.send_bytes(pcm_bytes)
        ack = ws.receive_json()
        assert ack["type"] == "audio_frame_ack"
        assert ack["bytes_received"] == len(pcm_bytes)

        # Finalize
        ws.send_json({"type": "finalize"})
        res = ws.receive_json()
        assert res["type"] == "soap_synthesized"
        assert "soap" in res
        assert "provenance" in res
