"""
Unit and Integration Tests for Phase 1: Zero-Egress Edge Hardening & Sovereign Offline Cache.
Verifies:
  1. Health Gateway Pulse endpoint (/api/v1/health) for continuous heartbeat monitoring
  2. Model switching endpoint (/api/v1/models/active) for dual-node failover to local quantized models
  3. Patient and encounter persistence for offline-to-online auto-sync
  4. In-flight clinical draft serialization and SOAP note synthesis endpoints
"""

import pytest
import time
from backend.database.models import Patient, Encounter


def test_gateway_health_heartbeat_contract(gateway_client):
    """Verifies that the /api/v1/health endpoint responds swiftly to failover heartbeats."""
    t0 = time.perf_counter()
    resp = gateway_client.get(
        "/api/v1/health",
        headers={"Authorization": "Bearer vault-local-admin-token"},
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000

    assert resp.status_code == 200, f"Health check failed with {resp.status_code}: {resp.text}"
    data = resp.json()

    assert data["status"] in ("operational", "degraded", "online")
    assert "timestamp" in data
    assert "telemetry" in data or "database" in data
    # Continuous ping monitor SLA requirement: edge heartbeat should return well under 1200ms
    assert elapsed_ms < 1200, f"Heartbeat latency {elapsed_ms}ms exceeded failover threshold"


def test_dual_node_failover_model_switching(gateway_client):
    """Verifies automated switching of active inference model to local quantized edge model upon failover."""
    headers = {
        "Authorization": "Bearer vault-local-admin-token",
        "Content-Type": "application/json",
    }

    # Failover switches to smolvlm-qlora on edge
    payload = {
        "radiology_model": "smolvlm-qlora",
        "summarize_model": "qwen2.5-coder:1.5b",
    }

    try:
        resp = gateway_client.post("/api/v1/models/active", json=payload, headers=headers)
        assert resp.status_code == 200, f"Failed to switch models: {resp.text}"
        data = resp.json()

        assert data["active_radiology_model"] == "smolvlm-qlora"
        assert data["active_summarize_model"] == "qwen2.5-coder:1.5b"
    finally:
        # Restore default model to prevent state leakage into other test modules
        gateway_client.post(
            "/api/v1/models/active",
            json={"radiology_model": "clinixvault-qwen2vl-qlora", "summarize_model": "qwen2.5-coder:1.5b"},
            headers=headers,
        )


def test_offline_encounter_auto_sync_endpoint(gateway_client, db_session):
    """Verifies committing an offline encounter queued during network disconnection."""
    headers = {
        "Authorization": "Bearer vault-local-admin-token",
        "Content-Type": "application/json",
    }

    sync_payload = {
        "first_name": "Eleanor",
        "last_name": "Vance-Offline",
        "dob": "1968-07-14",
        "gender": "female",
        "mrn": "MRN-OFFLINE-SYNC-901",
        "chief_complaint": "Acute exacerbation of asthma while offline",
        "exam_room": "Exam Room 3",
    }

    resp = gateway_client.post("/api/v1/patients", json=sync_payload, headers=headers)
    assert resp.status_code in (200, 201), f"Offline encounter sync failed: {resp.text}"
    data = resp.json()

    assert data["mrn"] == "MRN-OFFLINE-SYNC-901"
    assert "Eleanor" in data["full_name"]
    assert data["latest_encounter"] is not None
    assert data["latest_encounter"]["chief_complaint"] == "Acute exacerbation of asthma while offline"

    # Verify encounter persists in database
    db_patient = db_session.query(Patient).filter(Patient.mrn == "MRN-OFFLINE-SYNC-901").first()
    assert db_patient is not None
    assert len(db_patient.encounters) > 0


def test_in_flight_draft_soap_sync(gateway_client, test_patient, auth_headers):
    """Verifies synchronization of in-flight SOAP note drafts generated during edge operation."""
    dialogue = (
        "Doctor: Good morning Mrs. Vance. How has your breathing been today?\n"
        "Patient: I felt tight in my chest last night, but the albuterol inhaler helped slightly.\n"
        "Doctor: Let us listen to your lungs. Mild expiratory wheezing bilaterally. We will add budesonide."
    )

    payload = {
        "dialogue": dialogue,
        "patient_id": test_patient.id,
        "model_name": "qwen2.5-coder:1.5b",
    }

    resp = gateway_client.post(
        "/api/v1/scribe/synthesize-soap",
        json=payload,
        headers=auth_headers,
    )
    assert resp.status_code == 200, f"SOAP note sync failed: {resp.text}"
    data = resp.json()

    assert "soap_note" in data
    soap = data["soap_note"]
    assert "subjective" in soap or "assessment" in soap
    assert not soap.get("is_insufficient", False)
