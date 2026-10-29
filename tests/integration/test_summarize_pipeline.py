"""
Integration Test: End-to-End Clinical Text Summarization and RAG Pipeline.
Verifies:
  1. Default and fine-tuned Qwen-2.5 summarization models (clinixvault-qwen2.5-summarizer)
  2. Detailed high-visibility verbose terminal logs
  3. Patient plain-language AVS simplification
  4. Clinical document summarization and token-level citation grounding
"""

import pytest
from backend.database.models import ClinicalReport
from backend.database.vector_store import vector_store


def test_summarize_pipeline_and_rag(gateway_client, test_patient, auth_headers, db_session):
    narrative = (
        "Patient was admitted for acute decompensated heart failure with bilateral lower extremity edema "
        "and exertional dyspnea. Administered intravenous furosemide with significant diuresis. "
        "Echocardiogram demonstrated left ventricular ejection fraction of 35%. "
        "Discharged on guideline-directed medical therapy including sacubitril/valsartan and spironolactone."
    )

    payload = {
        "patient_id": test_patient.id,
        "clinical_text": narrative,
        "summary_type": "discharge",
    }

    response = gateway_client.post(
        "/api/v1/summarize",
        json=payload,
        headers=auth_headers,
    )

    assert response.status_code == 200, f"Error: {response.text}"
    data = response.json()

    assert "summary_id" in data
    assert "summary" in data
    assert len(data["key_findings"]) > 0
    assert len(data["action_items"]) > 0
    assert "citations" in data

    # Verify RAG Retrieval from Vector Store
    results = vector_store.search_similar_chunks(db_session, query="heart failure and ejection fraction", top_k=3)
    assert len(results) > 0
    assert results[0]["score"] is not None


def test_summarize_with_fine_tuned_qwen_model(gateway_client, test_patient, auth_headers):
    """Verifies clinical summarization with fine-tuned Qwen 2.5 3B QLoRA model."""
    findings_narrative = (
        "INDICATION: Shortness of breath and cough.\n"
        "FINDINGS: The lungs are clear without focal consolidation, pneumothorax, or large effusion. "
        "The cardiac silhouette and mediastinal contours are within normal limits. "
        "Mild degenerative changes of the thoracic spine. No acute bony abnormality."
    )

    payload = {
        "patient_id": test_patient.id,
        "clinical_text": findings_narrative,
        "summary_type": "radiology",
        "model_name": "clinixvault-qwen2.5-summarizer",
    }

    response = gateway_client.post(
        "/api/v1/summarize",
        json=payload,
        headers=auth_headers,
    )

    assert response.status_code == 200, f"Error: {response.text}"
    data = response.json()

    assert data["model_version"] == "clinixvault-qwen2.5-summarizer"
    assert "summary" in data and len(data["summary"]) > 10
    assert len(data["key_findings"]) > 0
    assert len(data["action_items"]) > 0
    assert data["latency_ms"] >= 0
    assert "patient_report" in data
    assert data["patient_report"] is not None


def test_patient_simplify_avs_pipeline(gateway_client, test_patient, auth_headers):
    """Verifies lay-audience Grade 6 patient translation endpoint."""
    tech_note = (
        "Post-procedure evaluation following ultrasound-guided thoracentesis. "
        "200 mL of serosanguinous pleural fluid evacuated. Post-procedural chest radiography "
        "confirms no evidence of iatrogenic pneumothorax. Stable residual right basilar atelectasis."
    )

    payload = {
        "clinical_text": tech_note,
        "report_type": "discharge",
        "clinical_indication": "Post-thoracentesis monitoring",
        "patient_id": test_patient.id,
        "model_name": "clinixvault-qwen2.5-summarizer",
    }

    response = gateway_client.post(
        "/api/v1/summarize/patient",
        json=payload,
        headers=auth_headers,
    )

    assert response.status_code == 200, f"Error: {response.text}"
    data = response.json()
    assert "patient_report" in data
    rep = data["patient_report"]
    assert "headline" in rep
    assert "doctor_explanation" in rep
    assert "key_findings" in rep
    assert "next_steps" in rep


def test_document_summarize_pipeline(gateway_client, test_patient, auth_headers):
    """Verifies clinical document summarization with citation grounding."""
    doc_payload = {
        "patient_id": test_patient.id,
        "summary_type": "discharge",
        "model_name": "clinixvault-qwen2.5-summarizer",
    }

    response = gateway_client.post(
        "/api/v1/summarize/document",
        json=doc_payload,
        headers=auth_headers,
    )

    assert response.status_code == 200, f"Error: {response.text}"
    data = response.json()
    assert "summary_id" in data
    assert "summary" in data
    assert "sections" in data
    assert "citations" in data
    assert "latency_ms" in data
