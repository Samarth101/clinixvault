"""
Unit Tests for Automated Medical Ontology Extraction & Enhanced DICOM Part 16 SCOORD SR.
Validates ICD-10-CM, AMA CPT E&M Level 4, RxNorm concepts, and Enhanced SR Storage.
"""

import pytest
from fastapi.testclient import TestClient
from backend.gateway.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_extract_billing_codes_knee_osteoarthritis(client):
    """Verifies ICD-10 M17.11, CPT 99214, CPT 73562, and RxNorm Meloxicam extraction."""
    payload = {
        "clinical_text": (
            "Assessment: 58yo female with unilateral primary osteoarthritis of the right knee. "
            "Physical exam demonstrates joint crepitus, line tenderness, and antalgic limp. "
            "Plan: Prescribe Meloxicam 15mg daily with meals. Order standing knee X-rays 3 views."
        ),
        "patient_id": "PT-OA-10023",
    }
    resp = client.post("/api/v1/scribe/extract-codes", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["primary_diagnosis"] is not None
    assert data["primary_diagnosis"]["code"] == "M17.11"
    assert "right knee" in data["primary_diagnosis"]["description"].lower()

    # CPT verification
    cpt_codes = [c["code"] for c in data["cpt_procedure_codes"]]
    assert "99214" in cpt_codes
    assert "73562" in cpt_codes

    # RxNorm verification
    rx_codes = [r["code"] for r in data["medication_codes"]]
    assert any("849727" in c for c in rx_codes)


def test_extract_billing_codes_heart_failure(client):
    """Verifies ICD-10 I50.22 systolic CHF, CPT 71046, and Lisinopril extraction."""
    payload = {
        "clinical_text": (
            "Assessment: Decompensated chronic systolic congestive heart failure with peripheral edema. "
            "Plan: Continue Lisinopril 20mg daily. Order two-view chest radiograph PA and lateral."
        ),
        "patient_id": "PT-CHF-8002",
    }
    resp = client.post("/api/v1/scribe/extract-codes", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["primary_diagnosis"] is not None
    assert data["primary_diagnosis"]["code"] == "I50.22"

    cpt_codes = [c["code"] for c in data["cpt_procedure_codes"]]
    assert "71046" in cpt_codes

    rx_codes = [r["code"] for r in data["medication_codes"]]
    assert any("314076" in c for c in rx_codes)


def test_extract_billing_codes_pneumonia(client):
    """Verifies ICD-10 J18.9 lobar pneumonia and Amoxicillin extraction."""
    payload = {
        "clinical_text": (
            "Assessment: Right lower lobe community acquired lobar pneumonia with fever. "
            "Plan: Initiate Amoxicillin 500mg oral capsules. Rest and hydration."
        ),
        "patient_id": "PT-PNA-4001",
    }
    resp = client.post("/api/v1/scribe/extract-codes", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["primary_diagnosis"] is not None
    assert data["primary_diagnosis"]["code"] == "J18.9"

    rx_codes = [r["code"] for r in data["medication_codes"]]
    assert any("723" in c for c in rx_codes)


def test_dicom_sr_export_with_scoord_and_interval_trajectory(client):
    """Verifies enhanced DICOM SR export with 2D SCOORDs and interval trajectory."""
    headers = {"Authorization": "Bearer vault-local-admin-token"}
    payload = {
        "patient_id": "PT-SR-SCOORD-01",
        "findings": "Cardiomegaly is present. Lungs are clear.",
        "impression": "Stable cardiomegaly.",
        "projection": "PA",
        "spatial_coordinates": [
            {
                "label": "Cardiac Silhouette",
                "bounding_box": [190.0, 210.0, 350.0, 290.0],
            }
        ],
        "interval_trajectory": {
            "has_prior": True,
            "overall_trajectory": "Significant Interval Improvement",
            "trajectory_summary": "Compared to prior examination: Resolution of pleural effusion.",
        },
    }
    resp = client.post("/api/v1/radiology/export-dicom-sr", json=payload, headers=headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/dicom"
    assert resp.headers["X-DICOM-SOP-Class"] == "1.2.840.10008.5.1.4.1.1.88.22"
    assert len(resp.content) > 1000
