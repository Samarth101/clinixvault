"""
Unit Tests for Generalized Radiology Case Storage, Dynamic Upload, and Fine-Tuned Model Surfacing.
Validates database-driven study queries and dynamic upload storage across any SQL database.
"""

import os
import io
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.gateway.main import app
from backend.database.connection import SessionLocal
from backend.database.models import ClinicalReport, Patient


@pytest.fixture
def client():
    return TestClient(app)


def test_radiology_cases_database_endpoint(client):
    """
    Verifies that GET /api/v1/radiology/cases queries persistent database and PACS vault
    without depending on hardcoded external datasets.
    """
    resp = client.get("/api/v1/radiology/cases?page=1&limit=10")
    assert resp.status_code == 200
    data = resp.json()
    assert "cases" in data
    assert "total" in data
    assert data["dataSource"] in ("clinical_database", "pacs_vault", "database")
    assert isinstance(data["cases"], list)


def test_radiology_upload_and_case_lookup_workflow(client):
    """
    End-to-end test: Upload radiograph -> verify database persistence -> query case and stream image.
    """
    img = Image.new("RGB", (256, 256), color=(50, 55, 65))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    files = {"file": ("cxr_evaluation_study.png", buf, "image/png")}
    data = {
        "patient_name": "Sarah Connor",
        "clinical_indication": "Evaluation for focal consolidation or infiltrates.",
        "projection": "PA",
    }
    headers = {"Authorization": "Bearer vault-local-admin-token"}

    # 1. Upload study
    resp = client.post("/api/v1/radiology/upload", files=files, data=data, headers=headers)
    assert resp.status_code == 200, f"Upload failed: {resp.text}"
    res_data = resp.json()
    assert res_data["status"] == "success"
    case = res_data["case"]
    case_id = case["id"]
    assert "imagePath" in case
    assert os.path.exists(case["imagePath"])

    # 2. Query case list via API
    list_resp = client.get("/api/v1/radiology/cases?page=1&limit=20")
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] >= 1
    found = any(c["id"] == case_id or c["uid"] == case["uid"] for c in list_data["cases"])
    assert found is True, f"Uploaded study {case_id} not found in /cases response"

    # 3. Single case detail lookup
    detail_resp = client.get(f"/api/v1/radiology/cases/{case_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["id"] == case_id
    assert "projections" in detail

    # 4. Stream full-resolution image preflight and content
    head_resp = client.head(f"/api/v1/radiology/cases/{case_id}/image")
    assert head_resp.status_code == 200

    img_resp = client.get(f"/api/v1/radiology/cases/{case_id}/image")
    assert img_resp.status_code == 200
    assert img_resp.headers["content-type"] in ("image/png", "image/jpeg")
    assert len(img_resp.content) > 0


def test_fine_tuned_models_surfaced_in_catalog(client):
    """Verifies that the fine-tuned research models are returned in /api/v1/models/list."""
    resp = client.get("/api/v1/models/list")
    assert resp.status_code == 200
    data = resp.json()

    assert "fine_tuned_models" in data
    ft_models = data["fine_tuned_models"]
    assert len(ft_models) >= 4

    qwen_lora = next((m for m in ft_models if m["id"] == "clinixvault-qwen2vl-qlora"), None)
    assert qwen_lora is not None
    assert qwen_lora["benchmark_scores"]["clinical_f1"] == 0.9027
    assert qwen_lora["benchmark_scores"]["chexpert_recall"] == "89.50%"
    assert qwen_lora["benchmark_scores"]["hallucination_rate"] == "3.33%"
    assert qwen_lora["is_installed"] is True

    # Active radiology model should default to our SOTA fine-tuned champion or valid active model
    assert data["active_radiology_model"] in ["clinixvault-qwen2vl-qlora", "llava:latest"]
