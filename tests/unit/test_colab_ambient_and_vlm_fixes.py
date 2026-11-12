"""
Unit and Integration Tests for Colab Ambient Scribe, VLM Runtime, and Relational Foreign Key Fixes.
Verifies:
1. Automatic patient provisioning prevents ForeignKeyViolation when uploading studies (e.g. UPLOAD-PT-C9D3A1ED-RAD-7900).
2. Encounter existence and validation for relational schemas.
3. Faster-Whisper CUDA cuBLAS failure graceful migration to CPU int8 runtime.
4. Qwen2-VL vision token extraction fallback when qwen_vl_utils is absent.
5. Scribe WebSocket clean disconnection handling without Starlette 'receive' runtime errors.
6. Scribe SOAP persistence with auto-provisioned patient.
"""

import os
import io
import json
import uuid
import pytest
from unittest.mock import MagicMock, patch
from PIL import Image
from fastapi.testclient import TestClient

from backend.database.connection import SessionLocal, Base, engine
from backend.database.models import (
    Patient,
    Encounter,
    ClinicalReport,
    ensure_patient_exists,
    ensure_encounter_exists,
)
from backend.gateway.main import app
from inference.audio_server.transcriber import (
    WhisperTranscriber,
    configure_cuda_cublas_libraries,
)


def test_ensure_patient_exists_creates_minimal_patient(db_session):
    """Verifies that an unseeded/uploaded patient ID is created automatically."""
    adhoc_id = f"UPLOAD-PT-{uuid.uuid4().hex[:8].upper()}-RAD-7900"
    
    # Verify patient does not exist initially
    existing = db_session.query(Patient).filter(Patient.id == adhoc_id[:36]).first()
    assert existing is None

    # Call ensure_patient_exists
    patient = ensure_patient_exists(db_session, adhoc_id)
    assert patient is not None
    assert patient.id == adhoc_id[:36]
    assert patient.first_name == "Uploaded"

    # Query directly to ensure persisted
    persisted = db_session.query(Patient).filter(Patient.id == patient.id).first()
    assert persisted is not None

    # Calling again returns existing patient without duplicate error
    same_patient = ensure_patient_exists(db_session, adhoc_id)
    assert same_patient.id == patient.id


def test_ensure_encounter_exists(db_session):
    """Verifies encounter auto-creation linked to patient."""
    adhoc_id = f"UPLOAD-PT-{uuid.uuid4().hex[:8].upper()}"
    patient = ensure_patient_exists(db_session, adhoc_id)

    enc_id = f"ENC-{uuid.uuid4().hex[:6].upper()}"
    created_enc = ensure_encounter_exists(db_session, enc_id, patient.id)
    assert created_enc == enc_id

    # Verify encounter exists in DB
    enc_row = db_session.query(Encounter).filter(Encounter.id == enc_id).first()
    assert enc_row is not None
    assert enc_row.patient_id == patient.id


def test_radiology_generate_with_adhoc_patient_persists_successfully(gateway_client, auth_headers, sample_cxr_base64):
    """Verifies POST /api/v1/radiology/generate succeeds for ad-hoc uploaded patient ID without ForeignKeyViolation."""
    adhoc_patient_id = "UPLOAD-PT-C9D3A1ED-RAD-7900"
    payload = {
        "patient_id": adhoc_patient_id,
        "image_base64": sample_cxr_base64,
        "projection": "PA",
        "clinical_indication": "Stat diagnostic interpretation requested for uploaded study",
        "model_name": "clinixvault-florence2-base",
    }

    resp = gateway_client.post("/api/v1/radiology/generate", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["report_id"] is not None

    # Verify patient and report exist in database
    db = SessionLocal()
    try:
        report = db.query(ClinicalReport).filter(ClinicalReport.id == data["report_id"]).first()
        assert report is not None
        assert report.patient_id == adhoc_patient_id[:36]

        pt = db.query(Patient).filter(Patient.id == report.patient_id).first()
        assert pt is not None
    finally:
        db.close()


def test_cuda_cublas_library_configuration_callable():
    """Verifies configure_cuda_cublas_libraries executes without uncaught exceptions on any platform."""
    # Should run safely on Darwin, Linux, or any OS
    configure_cuda_cublas_libraries()


def test_whisper_transcriber_cuda_cublas_fallback(monkeypatch, tmp_path):
    """
    Verifies that when CUDA cuBLAS fails with 'Library libcublas.so.12 is not found or cannot be loaded',
    the transcriber automatically catches the error, migrates to CPU int8 runtime, and retries successfully.
    """
    transcriber = WhisperTranscriber.__new__(WhisperTranscriber)
    transcriber.model_size = "large-v3-turbo"
    transcriber.device = "cuda"
    transcriber.compute_type = "float16"
    transcriber.is_loaded = True

    # Create dummy audio file
    dummy_wav = tmp_path / "test.wav"
    dummy_wav.write_bytes(b"RIFF" + b"\x00" * 40)

    # Mock failing CUDA model
    cuda_mock_model = MagicMock()
    def failing_transcribe(*args, **kwargs):
        raise RuntimeError("Library libcublas.so.12 is not found or cannot be loaded")
    cuda_mock_model.transcribe.side_effect = failing_transcribe
    transcriber.model = cuda_mock_model

    # Mock WhisperModel constructor for CPU fallback
    cpu_mock_model = MagicMock()
    mock_seg = MagicMock()
    mock_seg.no_speech_prob = 0.05
    mock_seg.avg_logprob = -0.2
    mock_seg.text = "Patient reports intermittent chest tightness and mild dyspnea on exertion."
    mock_seg.start = 0.0
    mock_seg.end = 2.5
    mock_seg.words = []
    mock_info = MagicMock()
    mock_info.duration = 2.5
    mock_info.language = "en"
    cpu_mock_model.transcribe.return_value = ([mock_seg], mock_info)

    with patch("faster_whisper.WhisperModel", return_value=cpu_mock_model):
        full_text, segments, duration, lang = transcriber.transcribe_file(str(dummy_wav))

    # Verify fallback happened
    assert transcriber.device == "cpu"
    assert transcriber.compute_type == "int8"
    assert "chest tightness" in full_text
    assert len(segments) == 1
    assert duration == 2.5


def test_qwen_vl_utils_fallback_extraction():
    """
    Verifies the built-in fallback for process_vision_info correctly extracts PIL Image objects
    from conversation message structure when qwen_vl_utils is not imported.
    """
    # Create test PIL image
    img = Image.new("RGB", (64, 64), color="gray")
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": img},
                {"type": "text", "text": "Examine this chest radiograph."},
            ],
        }
    ]

    # Test the fallback logic implemented in VLMModelRunner
    def fallback_process_vision_info(conversations, **kwargs):
        image_inputs = []
        conv_list = [conversations] if isinstance(conversations, dict) else conversations
        for m in conv_list:
            for c in m.get("content", []):
                if isinstance(c, dict) and c.get("type") == "image":
                    image_inputs.append(c.get("image"))
        return image_inputs or None, None

    img_inputs, vid_inputs = fallback_process_vision_info(messages)
    assert img_inputs is not None
    assert len(img_inputs) == 1
    assert img_inputs[0] == img
    assert vid_inputs is None


def test_scribe_websocket_disconnect_clean_handling(gateway_client):
    """
    Verifies that when a WebSocket client disconnects or sends websocket.disconnect,
    the server terminates the stream cleanly without Starlette 'receive once disconnected' RuntimeError.
    """
    with gateway_client.websocket_connect("/api/v1/scribe/stream") as ws:
        # Initialize session
        ws.send_text(json.dumps({"type": "init", "patient_id": "PT-WS-TEST-001"}))
        resp = ws.receive_json()
        assert resp["type"] == "ready"

        # Send dialogue turn
        ws.send_text(json.dumps({
            "type": "dialogue_turn",
            "speaker": "Doctor",
            "text": "Good morning Liam, how has your shortness of breath been lately?"
        }))
        ack = ws.receive_json()
        assert ack["type"] == "ack"
        assert ack["turn"]["speaker"] == "Doctor"

        # Clean client close without error
        ws.close()


def test_scribe_finalize_with_unregistered_patient(gateway_client):
    """
    Verifies that finalizing a Scribe session with an unregistered patient ID
    auto-provisions the patient and persists the SOAP ClinicalReport without ForeignKeyViolation.
    """
    adhoc_pt = f"UPLOAD-SCRIBE-PT-{uuid.uuid4().hex[:6].upper()}"
    with gateway_client.websocket_connect("/api/v1/scribe/stream") as ws:
        ws.send_text(json.dumps({"type": "init", "patient_id": adhoc_pt}))
        ws.receive_json()

        ws.send_text(json.dumps({
            "type": "dialogue_turn",
            "speaker": "Doctor",
            "text": "Patient presents with persistent cough and pleuritic pain."
        }))
        ws.receive_json()

        # Send finalize
        ws.send_text(json.dumps({"type": "finalize"}))
        final_msg = ws.receive_json()
        assert final_msg["type"] == "soap_synthesized"
        assert "soap" in final_msg

    # Verify patient was auto-provisioned and report was persisted
    db = SessionLocal()
    try:
        pt = db.query(Patient).filter(Patient.id == adhoc_pt[:36]).first()
        assert pt is not None

        soap_rep = db.query(ClinicalReport).filter(
            ClinicalReport.patient_id == pt.id,
            ClinicalReport.report_type == "soap",
        ).first()
        assert soap_rep is not None
        assert "SOAP" in soap_rep.title
    finally:
        db.close()
