"""
Unit tests for ClinixVault Two-Stage Hierarchical VLM Engine and Agentic Critic Integration.
Validates:
1. Micro-level 4-compartment anatomical findings generation (Lungs, Heart, Bones, Devices).
2. Stage 2 deductive impression synthesis conditioned on Stage 1 observations.
3. Agentic Critic reflection loop: NegEx negation audit, contradiction detection, and hallucination suppression.
4. DICOM Part 16 Structured Reporting (SR) generation and byte export.
5. API Gateway integration exposing anatomical_breakdown, critic_audit, and /export-dicom-sr endpoint.
"""

import io
import base64
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from backend.gateway.main import app as gateway_app
from inference.vlm_server.server import app as vlm_app
from inference.vlm_server.model_loader import (
    get_vlm_runner,
    extract_clinical_concepts_negex,
    audit_and_reconcile_report,
    synthesize_compartmental_breakdown,
    parse_compartments_from_findings,
)
from inference.shared.dicom_exporter import (
    build_dicom_sr_dataset,
    export_dicom_sr_bytes,
    extract_dicom_sr_metadata,
)
from inference.shared.model_manager import get_model_manager
import pydicom


@pytest.fixture
def vlm_client():
    return TestClient(vlm_app)


@pytest.fixture
def gateway_client():
    return TestClient(gateway_app)


@pytest.fixture
def sample_image():
    """Returns an in-memory 256x256 test image."""
    return Image.new("RGB", (256, 256), color=(60, 65, 75))


@pytest.fixture
def sample_image_b64(sample_image):
    buf = io.BytesIO()
    sample_image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# -----------------------------------------------------------------------------
# 1. Two-Stage Hierarchical Compartmental Breakdown Tests
# -----------------------------------------------------------------------------
def test_synthesize_compartmental_breakdown():
    """Verify that compartmental decomposition produces detailed observations across all 4 zones."""
    breakdown, findings = synthesize_compartmental_breakdown(
        clinical_history="Pre-operative evaluation. History of cardiac pacemaker.",
        graph_context="",
        projection="PA",
        image_size=(512, 512),
    )

    # 4 distinct compartments must be present
    assert "lungs_pleura" in breakdown
    assert "cardiomediastinum" in breakdown
    assert "bones_soft_tissues" in breakdown
    assert "support_devices" in breakdown

    # Grounded values verified
    assert "pacemaker" in breakdown["support_devices"].lower()
    assert "clear" in breakdown["lungs_pleura"].lower() or "aerated" in breakdown["lungs_pleura"].lower()
    assert "normal" in breakdown["cardiomediastinum"].lower()
    assert "intact" in breakdown["bones_soft_tissues"].lower()

    # Findings string aggregates the compartments
    assert breakdown["lungs_pleura"] in findings
    assert breakdown["support_devices"] in findings


def test_vlm_runner_hierarchical_generation_and_metadata(sample_image):
    """Verify VLMModelRunner returns anatomical_breakdown and critic_audit in metadata."""
    runner = get_vlm_runner()
    findings, impression, full_report, metadata = runner.generate_report(
        image=sample_image,
        clinical_history="Patient with moderate cardiomegaly and mild orthopnea.",
        projection="PA",
        hierarchical_mode=True,
        return_metadata=True,
    )

    assert len(findings) > 0
    assert len(impression) > 0
    assert "EXAMINATION: CHEST PA VIEW" in full_report
    assert "stage1_findings" in metadata
    assert "anatomical_breakdown" in metadata
    assert "critic_audit" in metadata

    breakdown = metadata["anatomical_breakdown"]
    assert "lungs_pleura" in breakdown
    assert "cardiomediastinum" in breakdown
    assert "bones_soft_tissues" in breakdown
    assert "support_devices" in breakdown

    critic_audit = metadata["critic_audit"]
    assert "consistency_score" in critic_audit
    assert critic_audit["consistency_score"] >= 0.8
    assert isinstance(critic_audit["unsupported_assertions"], list)
    assert isinstance(critic_audit["negated_pathologies"], list)
    assert isinstance(critic_audit["verified_pathologies"], list)


# -----------------------------------------------------------------------------
# 2. Agentic Critic Reflection & Contradiction / Hallucination Reconciler
# -----------------------------------------------------------------------------
def test_critic_contradiction_detection_and_reconciliation():
    """Verify critic detects when impression asserts a pathology explicitly negated in findings."""
    # Findings explicitly says NO pneumothorax
    findings = "The lungs are well aerated. No pneumothorax, consolidation, or effusion is present. Cardiac size is normal."
    # Flawed draft impression claiming pneumothorax
    contradictory_impression = "1. Acute right apical pneumothorax.\n2. Normal heart size."

    reconciled_imp, audit = audit_and_reconcile_report(
        findings=findings,
        impression=contradictory_impression,
        clinical_history="Routine checkup",
    )

    # Pneumothorax must be detected in negated pathologies
    assert "pneumothorax" in audit["negated_pathologies"]
    # The contradiction must be reconciled so that the impression no longer asserts acute pneumothorax
    assert "acute right apical pneumothorax" not in reconciled_imp.lower()
    assert "no pneumothorax" in reconciled_imp.lower() or "pneumothorax" not in reconciled_imp.lower()


def test_critic_hallucination_suppression():
    """Verify critic flags ungrounded assertions absent from both findings and clinical history."""
    findings = "The lungs are clear bilaterally. Heart size is normal. Bones are intact. No lines."
    # Draft impression asserts fracture and pneumonia without any basis
    hallucinated_impression = "1. Active pneumonia in right lower lobe.\n2. Rib fracture present."

    reconciled_imp, audit = audit_and_reconcile_report(
        findings=findings,
        impression=hallucinated_impression,
        clinical_history="Cough only",
    )

    # Hallucinations should be filtered from the reconciled impression
    assert "rib fracture" not in reconciled_imp.lower()


# -----------------------------------------------------------------------------
# 3. DICOM Part 16 Structured Reporting (SR) Tests
# -----------------------------------------------------------------------------
def test_dicom_sr_dataset_and_metadata():
    """Verify DICOM Part 16 SR dataset construction and metadata extraction."""
    breakdown = {
        "lungs_pleura": "Lungs clear bilaterally without effusion.",
        "cardiomediastinum": "Cardiomediastinal silhouette is normal.",
        "bones_soft_tissues": "Bony thorax unremarkable.",
        "support_devices": "No foreign bodies.",
    }
    critic_audit = {
        "consistency_score": 1.0,
        "unsupported_assertions": [],
        "negated_pathologies": ["pneumothorax", "consolidation"],
        "verified_pathologies": [],
    }

    ds = build_dicom_sr_dataset(
        patient_id="PT-SR-TEST",
        findings="Lungs are clear bilaterally. No pneumothorax.",
        impression="1. Normal chest radiograph.",
        anatomical_breakdown=breakdown,
        critic_audit=critic_audit,
        projection="PA",
    )

    assert ds.PatientID == "PT-SR-TEST"
    assert ds.Modality == "SR"
    assert ds.VerificationFlag == "VERIFIED"
    assert ds.CompletionFlag == "COMPLETE"
    assert len(ds.ContentSequence) >= 3

    meta = extract_dicom_sr_metadata(ds)
    assert meta["patient_id"] == "PT-SR-TEST"
    assert meta["modality"] == "SR"
    assert "sop_instance_uid" in meta


def test_dicom_sr_binary_export_and_readback():
    """Verify export_dicom_sr_bytes produces a valid binary DICOM that pydicom can parse."""
    raw_bytes = export_dicom_sr_bytes(
        patient_id="PT-DICOM-002",
        findings="Clear lungs.",
        impression="Normal examination.",
    )

    assert len(raw_bytes) > 500
    # Read back through pydicom
    buf = io.BytesIO(raw_bytes)
    read_ds = pydicom.dcmread(buf)
    assert read_ds.PatientID == "PT-DICOM-002"
    assert read_ds.Modality == "SR"


# -----------------------------------------------------------------------------
# 4. API Gateway Endpoints Integration Tests
# -----------------------------------------------------------------------------
def test_gateway_radiology_generate_returns_hierarchical_and_sr(gateway_client, sample_image_b64):
    """Verify POST /api/v1/radiology/generate exposes anatomical_breakdown, critic_audit, and dicom_sr_metadata."""
    payload = {
        "patient_id": "PT-INTEG-9999",
        "clinical_indication": "Shortness of breath. Suspect cardiomegaly.",
        "projection": "PA",
        "image_base64": sample_image_b64,
    }
    headers = {"Authorization": "Bearer vault-local-admin-token"}
    resp = gateway_client.post("/api/v1/radiology/generate", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert "report_id" in data
    assert "findings" in data
    assert "impression" in data
    assert "anatomical_breakdown" in data
    assert data["anatomical_breakdown"] is not None
    assert "lungs_pleura" in data["anatomical_breakdown"]
    assert "cardiomediastinum" in data["anatomical_breakdown"]

    assert "critic_audit" in data
    assert data["critic_audit"] is not None
    assert data["critic_audit"]["consistency_score"] >= 0.8

    assert "dicom_sr_metadata" in data
    assert data["dicom_sr_metadata"] is not None
    assert data["dicom_sr_metadata"]["modality"] == "SR"


def test_gateway_export_dicom_sr_endpoint(gateway_client):
    """Verify POST /api/v1/radiology/export-dicom-sr returns binary DICOM stream."""
    payload = {
        "patient_id": "PT-SR-EXPORT-1",
        "findings": "The lungs are clear without focal consolidation.",
        "impression": "1. No acute cardiopulmonary abnormality.",
        "projection": "PA",
        "anatomical_breakdown": {
            "lungs_pleura": "Clear lungs",
            "cardiomediastinum": "Normal heart",
            "bones_soft_tissues": "Intact",
            "support_devices": "None",
        },
        "critic_audit": {
            "consistency_score": 1.0,
            "unsupported_assertions": [],
            "negated_pathologies": ["pneumothorax"],
            "verified_pathologies": [],
        },
    }
    headers = {"Authorization": "Bearer vault-local-admin-token"}
    resp = gateway_client.post("/api/v1/radiology/export-dicom-sr", json=payload, headers=headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/dicom"
    assert "attachment" in resp.headers["content-disposition"]
    assert len(resp.content) > 500

    # Parse exported bytes with pydicom to confirm strict DICOM compliance
    ds = pydicom.dcmread(io.BytesIO(resp.content))
    assert ds.PatientID == "PT-SR-EXPORT-1"
    assert ds.Modality == "SR"


def test_parse_compartments_from_findings_sectioned():
    """Verify that sectioned findings text correctly populates the 4 anatomical zones."""
    sectioned_text = (
        "1. Lungs & Pleura: Lungs are well aerated with mild bibasilar atelectasis. No pneumothorax.\n"
        "2. Cardiomediastinum: Cardiomegaly is moderate with stable contours.\n"
        "3. Bony Thorax: Ribs and spine intact without fracture.\n"
        "4. Support Devices: Right subclavian PICC line in proper place."
    )
    bd = parse_compartments_from_findings(sectioned_text)
    assert "lungs_pleura" in bd
    assert "bibasilar atelectasis" in bd["lungs_pleura"]
    assert "Cardiomegaly is moderate" in bd["cardiomediastinum"]
    assert "Ribs and spine intact" in bd["bones_soft_tissues"]
    assert "PICC line" in bd["support_devices"]


def test_parse_compartments_from_findings_unsectioned_prose():
    """Verify that unstructured prose findings are routed to respective anatomical zones."""
    prose_text = (
        "Bilateral lungs clear without focal airspace disease. "
        "Normal cardiac silhouette and mediastinum. "
        "Intact bony thorax without rib fractures. "
        "Support lines and endotracheal tube are absent."
    )
    bd = parse_compartments_from_findings(prose_text)
    assert "clear without focal airspace" in bd["lungs_pleura"]
    assert "Normal cardiac silhouette" in bd["cardiomediastinum"]
    assert "Intact bony thorax" in bd["bones_soft_tissues"]
    assert "Support lines" in bd["support_devices"]


def test_critic_synonym_contradiction_and_reconciliation():
    """Verify that non-category synonyms (e.g. enlarged heart, pleural fluid) are detected and reconciled cleanly."""
    findings = "The cardiac silhouette is normal without cardiomegaly or enlargement. Clear pleural spaces without fluid or effusion."
    contradictory_impression = (
        "1. Marked enlarged heart.\n"
        "2. Trace pleural fluid noted."
    )
    reconciled, audit = audit_and_reconcile_report(findings, contradictory_impression)
    # Critic must detect both negated concepts
    assert "cardiomegaly" in audit["negated_pathologies"]
    assert "pleural_effusion" in audit["negated_pathologies"]
    # Reconciled text must be natural negative statements, not 'Marked no cardiomegaly'
    assert "marked no cardiomegaly" not in reconciled.lower()
    assert "trace no pleural" not in reconciled.lower()
    assert "no cardiomegaly" in reconciled.lower()
    assert "no pleural effusion" in reconciled.lower()
    assert audit["consistency_score"] == 1.0


def test_dicom_sr_with_string_uids_and_unicode():
    """Verify DICOM SR export sanitizes invalid non-numeric UIDs and handles Unicode clinical text."""
    unicode_findings = "Normal lung aeration. Temperature 37.5°C — patient denies acute chest pain."
    unicode_impression = "1. Normal study (BMI 24.5 kg/m²)."
    raw_bytes = export_dicom_sr_bytes(
        patient_id="PT-UNICODE-001",
        study_instance_uid="INVALID-STRING-UID-WITH-LETTERS",
        findings=unicode_findings,
        impression=unicode_impression,
    )
    assert len(raw_bytes) > 500
    ds = pydicom.dcmread(io.BytesIO(raw_bytes))
    # Sanitized UID must be numeric dots only and valid DICOM VR UI
    assert ds.StudyInstanceUID.startswith("1.2.826.0.1.3680043.9.7133.1.")


def test_gateway_export_dicom_sr_by_report_id(gateway_client, sample_image_b64):
    """Verify POST /api/v1/radiology/export-dicom-sr succeeds using report_id alone and preserves compartments."""
    headers = {"Authorization": "Bearer vault-local-admin-token"}
    # 1. Generate report
    gen_resp = gateway_client.post(
        "/api/v1/radiology/generate",
        json={
            "patient_id": "PT-ID-LOOKUP-TEST",
            "clinical_indication": "Routine pre-op",
            "image_base64": sample_image_b64,
        },
        headers=headers,
    )
    assert gen_resp.status_code == 200
    report_id = gen_resp.json()["report_id"]

    # 2. Export with report_id only
    exp_resp = gateway_client.post(
        "/api/v1/radiology/export-dicom-sr",
        json={"report_id": report_id},
        headers=headers,
    )
    assert exp_resp.status_code == 200
    assert exp_resp.headers["content-type"] == "application/dicom"
    assert len(exp_resp.content) > 500

    # 3. Read back and confirm DICOM Part 16 structure
    ds = pydicom.dcmread(io.BytesIO(exp_resp.content))
    assert ds.PatientID == "PT-ID-LOOKUP-TEST"
    assert ds.Modality == "SR"
    assert len(ds.ContentSequence) >= 3
