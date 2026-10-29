"""
Unit Tests for Neo4j/Graph-Primed Whisper Hotword Boosting.
Validates Roadmap Pillar 2 (Ambient Clinical Scribing & ASR Optimization).
"""

import pytest
import uuid
from backend.database.graph_store import get_graph_store
from inference.audio_server.transcriber import get_transcriber
from inference.audio_server.schemas import AudioTranscriptionRequest


def test_graph_store_get_patient_hotwords():
    store = get_graph_store()
    patient_id = f"pt-hotword-{uuid.uuid4().hex[:6]}"
    store.ensure_patient(patient_id)
    store.ingest_diagnostic_report(
        patient_id=patient_id,
        report_id=str(uuid.uuid4()),
        findings="Cardiomegaly with bilateral pleural effusions.",
        impression="Congestive heart failure exacerbation.",
    )

    hotwords = store.get_patient_hotwords(patient_id)
    assert isinstance(hotwords, str)
    assert len(hotwords) > 0
    # Must include baseline or graph terms
    assert "cardiomegaly" in hotwords.lower() or "furosemide" in hotwords.lower() or "effusion" in hotwords.lower()


def test_transcriber_accepts_hotwords_and_prompt(tmp_path):
    transcriber = get_transcriber()
    fake_wav = tmp_path / "test_ambient.wav"
    fake_wav.write_bytes(b"\x00" * 32000)

    full_text, segments, duration, lang = transcriber.transcribe_file(
        str(fake_wav),
        language="en",
        hotwords="furosemide, cardiomegaly, orthopnea",
        initial_prompt="Clinical conversation regarding congestive heart failure",
    )

    assert isinstance(full_text, str)
    assert isinstance(segments, list)
    assert duration >= 0.0
    assert lang == "en"


def test_audio_request_schema_supports_hotwords():
    req = AudioTranscriptionRequest(
        audio_base64="UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
        hotwords="metformin, lisinopril",
        initial_prompt="Routine diabetes consultation",
        patient_id="PT-999",
    )
    assert req.hotwords == "metformin, lisinopril"
    assert req.initial_prompt == "Routine diabetes consultation"
    assert req.patient_id == "PT-999"
