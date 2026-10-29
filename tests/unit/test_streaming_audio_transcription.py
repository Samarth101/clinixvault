"""
Unit Tests for Real-Time Streaming Audio Transcription and WebSocket Processing.
Verifies binary PCM audio chunk buffering and ASR decoding.
"""

import struct
import pytest
from fastapi.testclient import TestClient

from inference.audio_server.server import app as audio_app
from backend.gateway.main import app as gateway_app


def test_audio_server_streaming_websocket():
    client = TestClient(audio_app)
    # Generate 16kHz 16-bit PCM chunk (32000 bytes = 1 second)
    samples = [int(500 * (i % 10)) for i in range(16000)]
    pcm_bytes = struct.pack(f"<{len(samples)}h", *samples)

    with client.websocket_connect("/ws/stream") as ws:
        # Send first audio PCM chunk
        ws.send_bytes(pcm_bytes)
        update1 = ws.receive_json()

        assert update1["event"] == "segment"
        assert update1["speaker"] == "DOCTOR"
        assert "text" in update1
        assert len(update1["text"]) > 0

        # Send second chunk - speaker must persist as DOCTOR (not flip to PATIENT)
        ws.send_bytes(pcm_bytes)
        update2 = ws.receive_json()
        assert update2["event"] == "segment"
        assert update2["speaker"] == "DOCTOR", "Audio server speaker incorrectly flipped to PATIENT on chunk 2"

        # Send FINALIZE signal
        ws.send_text("FINALIZE")
        final_msg = ws.receive_json()
        assert final_msg["event"] == "complete"
        assert final_msg["speaker"] == "SYSTEM"


def test_gateway_scribe_websocket_with_audio_bytes(test_patient):
    client = TestClient(gateway_app)
    samples = [int(300 * (i % 10)) for i in range(8000)]
    pcm_bytes = struct.pack(f"<{len(samples)}h", *samples)

    with client.websocket_connect("/api/v1/scribe/stream") as ws:
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


def test_gateway_scribe_synthesize_soap_endpoint(test_patient):
    client = TestClient(gateway_app)
    dialogue = "Doctor: Good morning. How are you feeling today?\nPatient: I have had bad knee pain and stiffness in the mornings."
    resp = client.post(
        "/api/v1/scribe/synthesize-soap",
        json={"dialogue": dialogue, "patient_id": test_patient.id},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "soap_note" in data
    assert "subjective" in data["soap_note"]
    assert "objective" in data["soap_note"]
    assert "assessment" in data["soap_note"]
    assert "plan" in data["soap_note"]
    assert "provenance_hash" in data
    assert "patient_report" in data


def test_gateway_scribe_warmup_endpoint():
    client = TestClient(gateway_app)
    resp = client.post("/api/v1/scribe/warmup")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert "model" in data
    assert "Faster-Whisper" in data["model"]


def test_gateway_scribe_speaker_persistence_and_timestamp(test_patient):
    client = TestClient(gateway_app)
    with client.websocket_connect("/api/v1/scribe/stream") as ws:
        # 1. Initialize session with explicit speaker
        ws.send_json({"type": "init", "patient_id": test_patient.id, "speaker": "Doctor"})
        ready = ws.receive_json()
        assert ready["type"] == "ready"
        assert ready["active_speaker"] == "Doctor"

        # 2. First dialogue turn: speaker must remain Doctor
        ws.send_json({"type": "dialogue_turn", "text": "Good morning. How are you feeling today?"})
        ack1 = ws.receive_json()
        assert ack1["type"] == "ack"
        assert ack1["turn"]["speaker"] == "Doctor"
        assert "AM" in ack1["turn"]["timestamp"] or "PM" in ack1["turn"]["timestamp"]

        # 3. Second dialogue turn without flip: speaker must still be Doctor
        ws.send_json({"type": "dialogue_turn", "text": "Let us examine your knee."})
        ack2 = ws.receive_json()
        assert ack2["type"] == "ack"
        assert ack2["turn"]["speaker"] == "Doctor", "Speaker incorrectly flipped to Patient on second turn!"

        # 4. Explicit speaker change to Patient
        ws.send_json({"type": "set_speaker", "speaker": "Patient"})
        spk_ack = ws.receive_json()
        assert spk_ack["type"] == "speaker_ack"
        assert spk_ack["active_speaker"] == "Patient"

        # 5. Third dialogue turn: speaker is now Patient
        ws.send_json({"type": "dialogue_turn", "text": "The knee has been stiff for two weeks."})
        ack3 = ws.receive_json()
        assert ack3["type"] == "ack"
        assert ack3["turn"]["speaker"] == "Patient"


def test_gateway_scribe_synthesize_soap_non_clinical(test_patient):
    """Verifies that non-clinical conversational filler/greetings return is_insufficient: True."""
    client = TestClient(gateway_app)
    dialogue = (
        "Dr. Amanda Chen, MD, CMIO: and we're...\n"
        "Dr. Amanda Chen, MD, CMIO: hallo-\n"
        "Dr. Amanda Chen, MD, CMIO: hello, hellooooo\n"
        "Dr. Amanda Chen, MD, CMIO: dalalalala\n"
        "Dr. Amanda Chen, MD, CMIO: metformin\n"
        "Dr. Amanda Chen, MD, CMIO: so doctor\n"
        "Dr. Amanda Chen, MD, CMIO: is what i want to do."
    )
    resp = client.post(
        "/api/v1/scribe/synthesize-soap",
        json={"dialogue": dialogue, "patient_id": test_patient.id},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    soap = data["soap_note"]
    assert soap.get("is_insufficient") is True
    assert "Non-Clinical" in soap.get("assessment", "")
    assert soap.get("medications") == []
    assert soap.get("allergies") == []
    # Patient report should indicate non-clinical consultation
    assert data["patient_report"]["headline"] == "No clinical consultation documented."


def test_gateway_scribe_extract_codes_non_clinical():
    """Verifies that extract-codes returns is_insufficient: True for non-clinical text."""
    client = TestClient(gateway_app)
    non_clinical_text = "Non-Clinical / Conversational Dialogue. Insufficient clinical dialogue recorded."
    resp = client.post(
        "/api/v1/scribe/extract-codes",
        json={"clinical_text": non_clinical_text},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_insufficient"] is True
    assert data["primary_diagnosis"] is None
    assert data["total_billable_units"] == 0



