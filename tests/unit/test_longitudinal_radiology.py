"""
Unit Tests for Longitudinal Same-Patient Temporal Delta Engine & Interval Trajectory.
Validates ADR-002 Zero-Bleed Bi-Temporal Prior Comparison.
"""

import pytest
from fastapi.testclient import TestClient
from backend.gateway.main import app
from inference.shared.model_manager import compute_interval_trajectory


@pytest.fixture
def client():
    return TestClient(app)


def test_compute_interval_trajectory_baseline():
    """Validates baseline report handling when no prior study exists."""
    trajectory = compute_interval_trajectory(
        prior_findings=None,
        prior_impression=None,
        current_findings="The lungs are clear without focal consolidation or pneumothorax.",
        current_impression="No acute cardiopulmonary abnormality.",
    )
    assert trajectory["has_prior"] is False
    assert trajectory["overall_trajectory"] == "Baseline Examination"
    assert "No prior comparative examinations" in trajectory["trajectory_summary"]
    assert len(trajectory["pathology_deltas"]) == 0


def test_compute_interval_trajectory_resolution():
    """Validates resolution of pleural effusion between prior and current study."""
    prior_f = "Moderate right-sided and small left-sided pleural effusions. Stable cardiomegaly."
    prior_i = "Bilateral pleural effusions, right greater than left."

    curr_f = "The lungs are clear bilaterally. Bilateral costophrenic angles are sharp. Normal cardiomediastinum."
    curr_i = "No acute cardiopulmonary process. Prior pleural effusions resolved."

    trajectory = compute_interval_trajectory(
        prior_findings=prior_f,
        prior_impression=prior_i,
        current_findings=curr_f,
        current_impression=curr_i,
        prior_date="2026-10-01",
    )
    assert trajectory["has_prior"] is True
    assert trajectory["overall_trajectory"] == "Significant Interval Improvement"
    assert "2026-10-01" in trajectory["trajectory_summary"]

    effusion_delta = next((d for d in trajectory["pathology_deltas"] if d["pathology"] == "Pleural Effusion"), None)
    assert effusion_delta is not None
    assert effusion_delta["change"] == "resolved"
    assert effusion_delta["badge_color"] == "emerald"
    assert effusion_delta["prior_status"] == "positive"
    assert effusion_delta["current_status"] == "negative"


def test_compute_interval_trajectory_new_finding():
    """Validates detection of new acute focal consolidation / pneumonia."""
    prior_f = "The lungs are clear without focal infiltrate or effusion."
    prior_i = "No acute disease."

    curr_f = "Dense confluent airspace consolidation in the right lower lobe with air bronchograms."
    curr_i = "Right lower lobe lobar pneumonia."

    trajectory = compute_interval_trajectory(
        prior_findings=prior_f,
        prior_impression=prior_i,
        current_findings=curr_f,
        current_impression=curr_i,
        prior_date="2026-10-10",
    )
    assert trajectory["has_prior"] is True
    assert trajectory["overall_trajectory"] == "New Acute Cardiopulmonary Finding"

    pna_delta = next((d for d in trajectory["pathology_deltas"] if "Pneumonia" in d["pathology"]), None)
    assert pna_delta is not None
    assert pna_delta["change"] == "new"
    assert pna_delta["badge_color"] == "rose"
    assert pna_delta["prior_status"] == "negative"
    assert pna_delta["current_status"] == "positive"


def test_compute_interval_trajectory_stable():
    """Validates stable cardiopulmonary structures with persistent cardiomegaly."""
    prior_f = "Moderate cardiomegaly. Lungs remain clear without focal consolidation."
    prior_i = "Stable cardiomegaly."

    curr_f = "Persistent moderate cardiomegaly. Clear lungs bilaterally."
    curr_i = "Stable cardiomegaly without acute pulmonary process."

    trajectory = compute_interval_trajectory(
        prior_findings=prior_f,
        prior_impression=prior_i,
        current_findings=curr_f,
        current_impression=curr_i,
        prior_date="2026-09-15",
    )
    assert trajectory["has_prior"] is True
    assert "Stable" in trajectory["overall_trajectory"]

    cardio_delta = next((d for d in trajectory["pathology_deltas"] if d["pathology"] == "Cardiomegaly"), None)
    assert cardio_delta is not None
    assert cardio_delta["change"] == "stable"
    assert cardio_delta["badge_color"] == "slate"


def test_radiology_endpoint_longitudinal_trajectory(client):
    """Validates gateway /generate endpoint with comparison_mode enabled."""
    import uuid
    headers = {"Authorization": "Bearer vault-local-admin-token"}
    patient_id = f"PT-LONG-{uuid.uuid4().hex[:8]}"

    # 1. First study (baseline)
    resp1 = client.post(
        "/api/v1/radiology/generate",
        json={
            "patient_id": patient_id,
            "clinical_indication": "Initial admission for acute congestive failure",
            "projection": "PA",
            "comparison_mode": True,
        },
        headers=headers,
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert "report_id" in data1
    assert data1["interval_trajectory"] is not None
    assert data1["interval_trajectory"]["has_prior"] is False

    # 2. Second study for same patient (longitudinal comparison against study 1)
    resp2 = client.post(
        "/api/v1/radiology/generate",
        json={
            "patient_id": patient_id,
            "clinical_indication": "Follow-up after 10 days of guideline diuresis",
            "projection": "PA",
            "comparison_mode": True,
        },
        headers=headers,
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert "report_id" in data2
    assert data2["interval_trajectory"] is not None
    assert data2["interval_trajectory"]["has_prior"] is True
    assert len(data2["interval_trajectory"]["pathology_deltas"]) > 0
    assert "INTERVAL COMPARISON" in data2["impression"]
