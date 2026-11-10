import pytest
from fastapi.testclient import TestClient
from backend.gateway.main import app

client = TestClient(app)


def test_clinician_crud_and_activation_endpoints():
    # 1. Create a clinician
    create_payload = {
        "name": "Dr. Marcus Vance",
        "role": "Attending Cardiologist",
        "title": "Lead Cardiologist",
        "department": "Cardiology",
        "specialty": "Interventional Cardiology",
        "npi": "NPI-1942084920",
        "email": "m.vance@hospital.org",
        "access_tier": "Tier 1 — Executive/Attending",
        "break_glass_authorized": True,
        "sso_status": "Keycloak SAML Synced",
        "status": "Active",
        "assigned_node": "CV-NODE-CARDIOLOGY",
        "badge_id": "BADGE-MV-01",
    }
    r = client.post("/api/v1/clinicians", json=create_payload)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["name"] == "Dr. Marcus Vance"
    assert data["role"] == "Attending Cardiologist"
    assert data["npi"] == "NPI-1942084920"
    assert data["is_active"] is True  # first clinician is automatically activated
    clinician_id = data["id"]

    # 2. List clinicians
    r_list = client.get("/api/v1/clinicians")
    assert r_list.status_code == 200
    clinicians = r_list.json()
    assert any(c["id"] == clinician_id for c in clinicians)

    # 3. Get active clinician
    r_act = client.get("/api/v1/clinicians/active")
    assert r_act.status_code == 200
    active = r_act.json()
    assert active is not None
    assert active["id"] == clinician_id

    # 4. Create second clinician and activate it
    create_payload_2 = {
        "name": "Dr. Sarah Jenkins",
        "role": "Attending Radiologist",
        "department": "Diagnostic Radiology",
        "npi": "NPI-9988776655",
    }
    r2 = client.post("/api/v1/clinicians", json=create_payload_2)
    assert r2.status_code == 201
    c2 = r2.json()
    c2_id = c2["id"]

    # Activate second clinician
    r_switch = client.post(f"/api/v1/clinicians/{c2_id}/activate")
    assert r_switch.status_code == 200
    assert r_switch.json()["is_active"] is True

    # Verify active clinician is now Dr. Sarah Jenkins
    r_act2 = client.get("/api/v1/clinicians/active")
    assert r_act2.json()["id"] == c2_id

    # 5. Clean up - delete second clinician
    r_del = client.delete(f"/api/v1/clinicians/{c2_id}")
    assert r_del.status_code == 204
