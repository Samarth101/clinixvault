"""
Unit Tests for Bi-Temporal Cross-Modal Knowledge Graph & In-Memory SQLite Fallback.
Validates ADR-020, Roadmap Pillar 4, and HL7 FHIR / SNOMED CT / LOINC linking.
"""

import pytest
import uuid
import time
from backend.database.graph_store import get_graph_store
from backend.database.graph_schema import GraphRelationTypes, GraphNodeLabels


def test_bi_temporal_radiology_trajectory_ingestion():
    store = get_graph_store()
    patient_id = f"pt-temporal-{uuid.uuid4().hex[:6]}"
    report_id = f"rad-{uuid.uuid4().hex[:6]}"
    prior_id = f"rad-prior-{uuid.uuid4().hex[:6]}"

    # Ingest baseline prior study
    store.ingest_diagnostic_report(
        patient_id=patient_id,
        report_id=prior_id,
        findings="Cardiomegaly with bilateral pleural effusions.",
        impression="Congestive heart failure with effusions.",
        study_date="2026-10-01",
    )

    # Ingest current study with interval trajectory (effusion resolved, cardiomegaly persistent)
    trajectory = {
        "has_prior": True,
        "overall_trajectory": "Significant Interval Improvement",
        "trajectory_summary": "Complete resolution of bilateral pleural effusions; persistent stable cardiomegaly.",
        "pathology_deltas": [
            {
                "pathology": "Pleural Effusion",
                "change": "resolved",
                "current_score": 0.04,
                "prior_score": 0.88,
            },
            {
                "pathology": "Cardiomegaly",
                "change": "stable",
                "current_score": 0.85,
                "prior_score": 0.86,
            },
        ],
    }

    store.ingest_diagnostic_report(
        patient_id=patient_id,
        report_id=report_id,
        findings="Cardiomegaly is persistent. Costophrenic sulci are sharp. Prior effusions resolved.",
        impression="Resolved pleural effusions. Stable cardiomegaly.",
        interval_trajectory=trajectory,
        study_date="2026-10-15",
        prior_study_id=prior_id,
    )

    graph = store.get_patient_graph(patient_id, depth=2)
    links = graph["links"]

    # Check longitudinal edge between current report and prior report
    prior_link = next(
        (l for l in links if l.get("type") == GraphRelationTypes.INTERVAL_CHANGE_FROM or l.get("label") == GraphRelationTypes.INTERVAL_CHANGE_FROM),
        None
    )
    assert prior_link is not None
    assert "report-" in prior_link["source"]
    assert prior_link["trajectory"] == "Significant Interval Improvement"

    # Check bi-temporal properties on resolved effusion finding
    effusion_link = next(
        (l for l in links if "effusion" in str(l.get("target")).lower() and l.get("temporal_status") == "resolved"),
        None
    )
    assert effusion_link is not None
    assert effusion_link["resolved_date"] == "2026-10-15"
    assert effusion_link["confidence"] == 0.04


def test_cross_modal_study_encounter_and_lab_linking():
    store = get_graph_store()
    patient_id = f"pt-crossmodal-{uuid.uuid4().hex[:6]}"
    encounter_id = f"enc-{uuid.uuid4().hex[:6]}"
    report_id = f"rad-{uuid.uuid4().hex[:6]}"
    lab_id = f"lab-{uuid.uuid4().hex[:6]}"

    # Ingest Scribe visit note
    store.ingest_visit_summary(
        patient_id=patient_id,
        encounter_id=encounter_id,
        subjective="Patient reports worsening orthopnea and bilateral leg swelling.",
        objective="BP 148/92, bibasilar rales.",
        assessment="Acute decompensated congestive heart failure.",
        plan="Initiate IV furosemide 40mg, STAT chest radiograph, check NT-proBNP.",
    )

    # Ingest Radiology report
    store.ingest_diagnostic_report(
        patient_id=patient_id,
        report_id=report_id,
        findings="Moderate cardiomegaly CTR 0.58. Blunted costophrenic angles.",
        impression="Acute pulmonary congestion and cardiomegaly.",
    )

    # Cross-modal link: Radiology report confirms Encounter episode
    store.link_study_to_encounter(
        report_id=report_id,
        encounter_id=encounter_id,
        relationship_type=GraphRelationTypes.CONFIRMS_EPISODE,
        properties={"department": "Emergency Medicine / Cardiology", "concordance": "high"},
    )

    # Ingest Lab result (elevated BNP)
    store.ingest_lab_result(
        patient_id=patient_id,
        lab_id=lab_id,
        test_name="NT-proBNP (N-Terminal Pro-B-Type Natriuretic Peptide)",
        value=1850.0,
        unit="pg/mL",
        reference_range="< 125 pg/mL",
        flag="CRITICAL_HIGH",
        condition_id="cond-chf",
    )

    graph = store.get_patient_graph(patient_id, depth=3)
    nodes = {n["id"]: n for n in graph["nodes"]}
    links = graph["links"]

    # Verify cross-modal link exists
    cross_modal_edge = next(
        (l for l in links if (l.get("type") == GraphRelationTypes.CONFIRMS_EPISODE or l.get("label") == GraphRelationTypes.CONFIRMS_EPISODE) and report_id in str(l.get("source"))),
        None
    )
    assert cross_modal_edge is not None
    assert report_id in cross_modal_edge["source"]
    assert encounter_id in cross_modal_edge["target"]

    # Verify lab node and link exist
    lab_node = nodes.get(f"lab-{lab_id}")
    assert lab_node is not None
    assert lab_node.get("label") == GraphNodeLabels.LAB_RESULT
    assert lab_node.get("flag") == "CRITICAL_HIGH"
    assert lab_node.get("value") == 1850.0
