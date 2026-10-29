"""
Unit Tests: Patient REST API Gateway Endpoints.
Verifies /api/v1/patients roster, patient details, historical encounters,
provenance reports, and encounter creation.
"""

import pytest


@pytest.fixture
def sample_test_patient(gateway_client, auth_headers):
    import uuid
    mrn = f"MRN-TEST-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "first_name": "Eleanor",
        "last_name": "Vance",
        "dob": "1968-04-12",
        "gender": "female",
        "mrn": mrn,
        "chief_complaint": "Bilateral progressive knee pain",
        "exam_room": "Exam Room 3",
        "vitals": {
            "bp": "128/82 mmHg",
            "hr": "72 bpm",
            "spo2": "99%",
            "temp": "98.4°F",
            "bmi": "27.4 kg/m²",
        },
    }
    resp = gateway_client.post("/api/v1/patients", json=payload, headers=auth_headers)
    assert resp.status_code == 201
    return resp.json()


def test_list_patients_endpoint(gateway_client, auth_headers, sample_test_patient):
    resp = gateway_client.get("/api/v1/patients", headers=auth_headers)
    assert resp.status_code == 200, f"List patients failed: {resp.text}"
    patients = resp.json()
    assert isinstance(patients, list)
    assert len(patients) >= 1
    # Verify fields in roster item
    p0 = patients[0]
    assert "id" in p0
    assert "mrn" in p0
    assert "full_name" in p0
    assert "encounter_count" in p0
    assert "last_vitals" in p0
    assert "latest_encounter" in p0


def test_get_patient_detail_endpoint(gateway_client, auth_headers, sample_test_patient):
    p_id = sample_test_patient["id"]
    resp = gateway_client.get(f"/api/v1/patients/{p_id}", headers=auth_headers)
    assert resp.status_code == 200, f"Get patient failed: {resp.text}"
    data = resp.json()
    assert data["id"] == p_id or data["mrn"] == sample_test_patient["mrn"]
    assert "encounters" in data
    assert "reports" in data
    assert data["first_name"] == "Eleanor"


def test_get_patient_encounters_endpoint(gateway_client, auth_headers, sample_test_patient):
    p_id = sample_test_patient["id"]
    resp = gateway_client.get(f"/api/v1/patients/{p_id}/encounters", headers=auth_headers)
    assert resp.status_code == 200, f"Get encounters failed: {resp.text}"
    encs = resp.json()
    assert isinstance(encs, list)
    assert len(encs) >= 1
    assert encs[0]["patient_id"] == p_id


def test_get_patient_reports_endpoint(gateway_client, auth_headers, sample_test_patient):
    p_id = sample_test_patient["id"]
    resp = gateway_client.get(f"/api/v1/patients/{p_id}/reports", headers=auth_headers)
    assert resp.status_code == 200, f"Get reports failed: {resp.text}"
    reports = resp.json()
    assert isinstance(reports, list)


def test_create_patient_encounter_endpoint(gateway_client, auth_headers, sample_test_patient):
    p_id = sample_test_patient["id"]
    payload = {
        "encounter_type": "ambulatory",
        "status": "In Progress",
        "chief_complaint": "Acute exacerbation of joint discomfort",
        "exam_room": "Exam Room 3B",
        "vitals": {
            "bp": "126/80 mmHg",
            "hr": "74 bpm",
            "spo2": "99%",
            "temp": "98.5°F",
            "bmi": "27.1 kg/m²",
        },
    }
    resp = gateway_client.post(f"/api/v1/patients/{p_id}/encounters", json=payload, headers=auth_headers)
    assert resp.status_code == 200, f"Create encounter failed: {resp.text}"
    data = resp.json()
    assert data["patient_id"] == p_id
    assert data["chief_complaint"] == "Acute exacerbation of joint discomfort"
    assert data["exam_room"] == "Exam Room 3B"


def test_get_unknown_patient_returns_404(gateway_client, auth_headers):
    resp = gateway_client.get("/api/v1/patients/non-existent-patient-99999", headers=auth_headers)
    assert resp.status_code == 404


def test_create_patient_endpoint_success(gateway_client, auth_headers):
    import uuid
    mrn = f"MRN-TEST-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "first_name": "Clinical",
        "last_name": "TestPatient",
        "dob": "1975-08-06",
        "gender": "male",
        "mrn": mrn,
        "chief_complaint": "Persistent night sweats and productive cough",
        "exam_room": "Exam Room 7",
        "vitals": {
            "bp": "118/76 mmHg",
            "hr": "70 bpm",
            "spo2": "99%",
            "temp": "98.7°F",
            "bmi": "23.8 kg/m²",
        },
    }
    resp = gateway_client.post("/api/v1/patients", json=payload, headers=auth_headers)
    assert resp.status_code == 201, f"Create patient failed: {resp.text}"
    data = resp.json()
    assert data["first_name"] == "Clinical"
    assert data["last_name"] == "TestPatient"
    assert data["full_name"] == "Clinical TestPatient"
    assert data["mrn"] == mrn
    assert data["encounter_count"] == 1
    assert data["latest_encounter"]["chief_complaint"] == "Persistent night sweats and productive cough"
    assert data["latest_encounter"]["exam_room"] == "Exam Room 7"

    # Verify patient can be retrieved via detail endpoint
    p_id = data["id"]
    get_resp = gateway_client.get(f"/api/v1/patients/{p_id}", headers=auth_headers)
    assert get_resp.status_code == 200
    p_data = get_resp.json()
    assert p_data["first_name"] == "Clinical"


def test_create_patient_duplicate_mrn_fails(gateway_client, auth_headers):
    import uuid
    mrn = f"MRN-VAL-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "first_name": "Synthetic",
        "last_name": "CohortPatient",
        "mrn": mrn,
    }
    resp1 = gateway_client.post("/api/v1/patients", json=payload, headers=auth_headers)
    assert resp1.status_code == 201
    resp2 = gateway_client.post("/api/v1/patients", json=payload, headers=auth_headers)
    assert resp2.status_code == 400
    assert "already exists" in resp2.json()["detail"]


def test_create_patient_missing_name_fails(gateway_client, auth_headers):
    payload = {
        "first_name": "",
        "last_name": "   ",
    }
    resp = gateway_client.post("/api/v1/patients", json=payload, headers=auth_headers)
    assert resp.status_code == 400


def test_delete_patient_endpoint(gateway_client, auth_headers):
    import uuid
    mrn = f"MRN-DEL-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "first_name": "Deletable",
        "last_name": "Patient",
        "mrn": mrn,
        "chief_complaint": "Testing patient deletion flow",
    }
    resp = gateway_client.post("/api/v1/patients", json=payload, headers=auth_headers)
    assert resp.status_code == 201
    created = resp.json()
    p_id = created["id"]

    # Delete patient
    del_resp = gateway_client.delete(f"/api/v1/patients/{p_id}", headers=auth_headers)
    assert del_resp.status_code == 200
    del_data = del_resp.json()
    assert del_data["status"] == "deleted"
    assert del_data["patient_id"] == p_id

    # Verify patient lookup now fails with 404
    get_resp = gateway_client.get(f"/api/v1/patients/{p_id}", headers=auth_headers)
    assert get_resp.status_code == 404


