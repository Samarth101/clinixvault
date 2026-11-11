import pytest
from fastapi.testclient import TestClient
from backend.gateway.main import app as gateway_app
from inference.shared.clinical_sufficiency import is_clinically_sufficient

client = TestClient(gateway_app)
AUTH_HEADERS = {"Authorization": "Bearer vault-local-admin-token"}

def test_clinical_sufficiency_validator():
    """Verify syntactic and clinical lexical gate correctly identifies non-clinical gibberish."""
    # Gibberish and short noise from user screenshot
    gibberish_inputs = [
        "jhbk",
        "asdf",
        "xyz123",
        "aaaaabbbbb",
        "hello world",
        "ok sure",
    ]
    for g in gibberish_inputs:
        is_valid, reason = is_clinically_sufficient(g)
        assert not is_valid, f"Expected '{g}' to be rejected, but passed with reason: {reason}"

    # Genuine clinical texts
    valid_inputs = [
        "Patient presents with fever and productive cough. Bilateral breath sounds clear.",
        "BP 130/85, HR 78, SpO2 98% on room air. Cor stable, no murmur.",
        "Chest radiograph shows mild cardiomegaly without focal airspace consolidation or pleural effusion.",
        "Post-op day 2 after laparoscopic appendectomy. Pain well-controlled on oral analgesics.",
    ]
    for v in valid_inputs:
        is_valid, reason = is_clinically_sufficient(v)
        assert is_valid, f"Expected '{v}' to be valid clinical text, but was rejected: {reason}"

def test_summarize_patient_rejects_gibberish():
    """Verify POST /api/v1/summarize/patient returns is_insufficient=True on gibberish without hallucinating."""
    resp = client.post(
        "/api/v1/summarize/patient",
        json={"clinical_text": "jhbk", "report_type": "radiology"},
        headers=AUTH_HEADERS,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_insufficient"] is True
    report = data["patient_report"]
    assert report.get("is_insufficient") is True
    # Verify no hallucinated STEMI or cardiac infarction stories
    assert "infarction" not in report["doctor_explanation"].lower()
    assert "stemi" not in report["doctor_explanation"].lower()
    assert "toy breaks" not in report["doctor_explanation"].lower()
    assert "No clinical information" in report["headline"]

def test_summarize_document_rejects_gibberish():
    """Verify POST /api/v1/summarize/document returns clean warning on non-clinical text."""
    resp = client.post(
        "/api/v1/summarize/document",
        json={"document_text": "jhbk"},
        headers=AUTH_HEADERS,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_insufficient"] is True
    assert data["status"] == "insufficient_input"
    assert "Insufficient clinical documentation" in data["summary"]

def test_radiology_cases_patient_scoping():
    """Verify GET /api/v1/radiology/cases filters by patient_id when provided."""
    # Test query without patient filter
    resp_all = client.get("/api/v1/radiology/cases", headers=AUTH_HEADERS)
    assert resp_all.status_code == 200

    # Test query with specific non-existent patient ID
    resp_filtered = client.get("/api/v1/radiology/cases?patient_id=NEW-PATIENT-ZERO-STUDIES", headers=AUTH_HEADERS)
    assert resp_filtered.status_code == 200
    data = resp_filtered.json()
    assert len(data.get("cases", [])) == 0
