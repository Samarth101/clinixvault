"""
Integration Test: End-to-End Radiology Pipeline.
Validates POST /api/v1/radiology/generate with image decoding,
clinical provenance signature verification, and database persistence.
"""

import pytest
from backend.audit.provenance import provenance_tracker
from backend.database.models import ClinicalReport


def test_radiology_pipeline_e2e(gateway_client, test_patient, sample_cxr_base64, auth_headers, db_session):
    payload = {
        "patient_id": test_patient.id,
        "image_base64": sample_cxr_base64,
        "clinical_indication": "Persistent cough and dyspnea on exertion. Evaluate for pneumonia.",
        "projection": "PA",
    }

    response = gateway_client.post(
        "/api/v1/radiology/generate",
        json=payload,
        headers=auth_headers,
    )

    assert response.status_code == 200, f"Error: {response.text}"
    data = response.json()

    assert "report_id" in data
    assert data["patient_id"] == test_patient.id
    assert "findings" in data and len(data["findings"]) > 0
    assert "impression" in data and len(data["impression"]) > 0
    assert "full_report" in data
    assert "provenance" in data
    assert "citations" in data
    assert "grounding_score" in data

    # Verify Cryptographic Signature
    prov = data["provenance"]
    is_valid, msg = provenance_tracker.verify_provenance_manifest(data["full_report"], prov)
    assert is_valid, f"Provenance signature failed: {msg}"

    # Verify Database Storage
    report_db = db_session.query(ClinicalReport).filter(ClinicalReport.id == data["report_id"]).first()
    assert report_db is not None
    assert report_db.report_type == "radiology"
    assert report_db.patient_id == test_patient.id
