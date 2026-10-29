"""
Unit Tests for Clinical Decision Support (CDS) & Drug-Drug / Drug-Allergy Interaction Guard.
"""

import pytest
from fastapi.testclient import TestClient
from backend.gateway.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_drug_allergy_contraindication_check(client):
    """Verifies that Meloxicam is flagged as CRITICAL contraindication for Aspirin-allergic patients."""
    payload = {
        "medications": ["Meloxicam 15mg"],
        "allergies": ["Aspirin"],
    }
    resp = client.post("/api/v1/scribe/check-interactions", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "checked"
    assert data["contraindications_count"] >= 1

    crit_alert = next((a for a in data["alerts"] if a["severity"] == "CRITICAL"), None)
    assert crit_alert is not None
    assert "Cross-Reactive Hypersensitivity" in crit_alert["title"]
    assert "Topical Diclofenac" in data["safe_alternatives"] or "Acetaminophen" in str(data["safe_alternatives"])


def test_drug_drug_interaction_check(client):
    """Verifies Meloxicam + Lisinopril produces a WARNING for renal hemodynamic strain."""
    payload = {
        "medications": ["Meloxicam 15mg", "Lisinopril 20mg"],
        "allergies": [],
    }
    resp = client.post("/api/v1/scribe/check-interactions", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["warnings_count"] >= 1

    alert = next((a for a in data["alerts"] if a["id"] == "DDI-001"), None)
    assert alert is not None
    assert "ACE Inhibitor" in alert["title"]
    assert "acute kidney injury" in alert["mechanism"].lower()


def test_dialogue_extraction_interactions(client):
    """Verifies that dialogue mentions of drugs and allergies trigger interactions."""
    payload = {
        "dialogue": "Doctor: I see you have a documented penicillin allergy. Should we prescribe amoxicillin for this cough? Patient: I get hives and throat swelling with penicillin."
    }
    resp = client.post("/api/v1/scribe/check-interactions", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["contraindications_count"] >= 1
    pen_alert = next((a for a in data["alerts"] if "amoxicillin" in str(a["drugs_involved"]).lower()), None)
    assert pen_alert is not None
