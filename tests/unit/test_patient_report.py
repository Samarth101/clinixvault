"""
Unit Test: Patient-Facing Lay Audience Report Generation and Simplification.
Verifies plain-language medical translation, jargon glossaries, and API endpoints.
"""

import pytest
from inference.shared.model_manager import get_model_manager


def test_patient_report_generation_from_model_manager():
    manager = get_model_manager()
    clinical_text = (
        "FINDINGS: Moderate cardiomegaly with CTR 0.58. Bilateral blunting of costophrenic angles "
        "with pleural fluid tracking. Accompanying bibasilar compressive atelectasis.\n"
        "IMPRESSION: Congestive heart failure decompensation with bilateral pleural effusions."
    )
    report, model_ver = manager.generate_patient_report(
        clinical_text=clinical_text,
        report_type="radiology",
        clinical_indication="Dyspnea and orthopnea",
    )

    assert isinstance(report, dict)
    assert "headline" in report and len(report["headline"]) > 0
    assert "what_was_examined" in report
    assert "doctor_explanation" in report and len(report["doctor_explanation"]) > 0
    assert "key_findings" in report and len(report["key_findings"]) > 0
    assert "what_it_means" in report
    assert "next_steps" in report and len(report["next_steps"]) > 0
    assert "jargon_translations" in report and len(report["jargon_translations"]) > 0
    assert "questions_for_doctor" in report and len(report["questions_for_doctor"]) > 0
    assert "reading_level" in report


def test_patient_simplify_radiology_endpoint(gateway_client, auth_headers):
    payload = {
        "clinical_text": "Right middle lobe focal alveolar consolidation consistent with acute community-acquired pneumonia.",
        "report_type": "radiology",
        "clinical_indication": "Fever and cough",
    }
    resp = gateway_client.post(
        "/api/v1/radiology/simplify",
        json=payload,
        headers=auth_headers,
    )
    assert resp.status_code == 200, f"Error: {resp.text}"
    data = resp.json()
    assert "patient_report" in data
    assert "headline" in data["patient_report"]
    assert "doctor_explanation" in data["patient_report"]
    assert "next_steps" in data["patient_report"]
    assert data["latency_ms"] >= 0


def test_patient_simplify_summarize_endpoint(gateway_client, auth_headers):
    payload = {
        "clinical_text": "Patient has bilateral primary knee osteoarthritis with severe medial joint space narrowing and marginal osteophytes.",
        "report_type": "visit_summary",
        "clinical_indication": "Knee pain",
    }
    resp = gateway_client.post(
        "/api/v1/summarize/patient",
        json=payload,
        headers=auth_headers,
    )
    assert resp.status_code == 200, f"Error: {resp.text}"
    data = resp.json()
    assert "patient_report" in data
    assert "headline" in data["patient_report"]
    assert "jargon_translations" in data["patient_report"]
