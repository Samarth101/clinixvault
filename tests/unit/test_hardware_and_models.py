"""
Unit tests for hardware auto-detection and model manager endpoints.
Validates Apple Silicon unified memory detection, Ollama model list,
active model switching, and pull status tracking.
"""

import pytest
from inference.shared.hardware import get_hardware_specs
from inference.shared.model_manager import get_model_manager


def test_hardware_specs_detection():
    specs = get_hardware_specs()
    assert "platform" in specs
    assert "chip" in specs
    assert "memory_type" in specs
    assert "total_memory_gb" in specs
    assert "accelerator" in specs
    assert "is_apple_silicon" in specs
    assert "gpu_name" in specs
    assert specs["total_memory_gb"] > 0
    assert specs["free_memory_gb"] >= 0

    if specs["platform"] == "darwin" and specs["is_apple_silicon"]:
        assert specs["memory_type"] == "Unified Memory"
        assert "Apple" in specs["chip"]
        assert "Metal" in specs["accelerator"] or "MPS" in specs["accelerator"]


def test_system_hardware_endpoint(gateway_client, auth_headers):
    resp = gateway_client.get("/api/v1/system/hardware")
    assert resp.status_code == 200
    data = resp.json()
    assert "platform" in data
    assert "chip" in data
    assert "memory_type" in data
    assert "total_memory_gb" in data
    assert "accelerator" in data


def test_models_list_endpoint(gateway_client, auth_headers):
    resp = gateway_client.get("/api/v1/models/list")
    assert resp.status_code == 200
    data = resp.json()
    assert "installed_models" in data
    assert "available_models" in data
    assert "active_radiology_model" in data
    assert "active_summarize_model" in data
    assert "ollama_status" in data

    # Verify catalog contains vision and medical models
    cat = data["available_models"]
    model_ids = [m["id"] for m in cat]
    assert any("llava" in mid for mid in model_ids)
    assert any("meditron" in mid or "biomistral" in mid or "mistral" in mid for mid in model_ids)


def test_models_active_and_status_endpoints(gateway_client, auth_headers):
    # Set active models
    resp = gateway_client.post(
        "/api/v1/models/active",
        json={"radiology_model": "llava:latest", "summarize_model": "qwen2.5-coder:1.5b"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["active_radiology_model"] == "llava:latest"
    assert data["active_summarize_model"] == "qwen2.5-coder:1.5b"

    # Status check
    status_resp = gateway_client.get("/api/v1/models/status")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert "status" in status_data
    assert "progress_pct" in status_data

    # Restore default active radiology model
    gateway_client.post(
        "/api/v1/models/active",
        json={"radiology_model": "clinixvault-qwen2vl-qlora", "summarize_model": "qwen2.5-coder:1.5b"},
    )


def test_models_pull_empty_name(gateway_client):
    resp = gateway_client.post("/api/v1/models/pull", json={"model": ""})
    assert resp.status_code == 400


def test_vault_local_admin_token_auth(gateway_client, test_patient):
    # Tests that the frontend dev token Bearer vault-local-admin-token authenticates properly
    headers = {"Authorization": "Bearer vault-local-admin-token"}
    resp = gateway_client.post(
        "/api/v1/summarize",
        headers=headers,
        json={"patient_id": test_patient.id, "clinical_text": "Follow-up visit for hypertension and knee pain."},
    )
    assert resp.status_code == 200, f"Token failed with status {resp.status_code}: {resp.text}"
    data = resp.json()
    assert "summary_id" in data
    assert "summary" in data


def test_model_manager_graceful_offline_fallback():
    # Model manager should fall back cleanly when model is not available in Ollama
    manager = get_model_manager()
    summary, key_f, acts, model = manager.generate_clinical_summary(
        clinical_text="Patient reports mild headache and fatigue.",
        summary_type="progress",
        model_name="non-existent-model-xyz:latest",
    )
    assert summary is not None and len(summary) > 0
    assert len(key_f) > 0
    assert len(acts) > 0


def test_radiology_with_vault_local_admin_token(gateway_client, sample_cxr_base64):
    # Tests that the frontend dev token Bearer vault-local-admin-token authenticates for radiology
    headers = {"Authorization": "Bearer vault-local-admin-token"}
    resp = gateway_client.post(
        "/api/v1/radiology/generate",
        headers=headers,
        json={
            "patient_id": "pt-vault-admin-rad-01",
            "image_base64": sample_cxr_base64,
            "clinical_indication": "Evaluation for dyspnea.",
        },
    )
    assert resp.status_code == 200, f"Radiology auth failed: {resp.text}"
    data = resp.json()
    assert "report_id" in data
    assert "findings" in data
    assert "provenance" in data


def test_patient_mrn_collision_resilience(gateway_client, sample_cxr_base64):
    # Two patients with identical prefixes must not fail with UNIQUE constraint on MRN
    headers = {"Authorization": "Bearer vault-local-admin-token"}
    resp1 = gateway_client.post(
        "/api/v1/radiology/generate",
        headers=headers,
        json={"patient_id": "col-patient-alpha", "image_base64": sample_cxr_base64, "clinical_indication": "Check"},
    )
    resp2 = gateway_client.post(
        "/api/v1/radiology/generate",
        headers=headers,
        json={"patient_id": "col-patient-beta", "image_base64": sample_cxr_base64, "clinical_indication": "Check"},
    )
    assert resp1.status_code == 200
    assert resp2.status_code == 200


def test_stop_ollama_endpoint(gateway_client):
    resp = gateway_client.post("/api/v1/models/ollama/stop")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "connected" in data
    assert data["connected"] is False
    assert "message" in data


def test_start_ollama_endpoint(gateway_client):
    resp = gateway_client.post("/api/v1/models/ollama/start")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert data["status"] in ("already_running", "started", "starting")


