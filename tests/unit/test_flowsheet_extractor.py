"""
Unit Tests for Roadmap Pillar 3: Clinical Document & Laboratory Flowsheet Parsing Engine.
Validates extraction of structured lab panels (CBC, BMP, Cardiac Enzymes),
reference interval validation, polarity flags, and knowledge graph cross-linking.
"""

import base64
import pytest
from fastapi.testclient import TestClient

from backend.gateway.main import app as gateway_app
from inference.document_server.pdf_parser import get_pdf_parser
from backend.database.graph_store import get_graph_store


@pytest.fixture
def client():
    return TestClient(gateway_app)


def test_clinical_pdf_parser_extract_lab_flowsheet():
    parser = get_pdf_parser()
    sample_lab_report = (
        "OUTPATIENT LABORATORY RESULTS - CARDIOVASCULAR & METABOLIC\n"
        "Specimen Collected: 2026-10-22 08:30 EDT\n\n"
        "Test Name                   Result   Flag   Units     Reference Range\n"
        "----------------------------------------------------------------------\n"
        "NT-proBNP                   1,850    H      pg/mL     0 - 125\n"
        "Troponin I                  0.42     H      ng/mL     0.00 - 0.04\n"
        "Serum Potassium             5.8      H      mmol/L    3.5 - 5.0\n"
        "Serum Sodium                138             mmol/L    135 - 145\n"
        "Serum Creatinine            2.1      H      mg/dL     0.7 - 1.3\n"
        "Blood Urea Nitrogen         34       H      mg/dL     7 - 20\n"
        "Estimated GFR               32       L      mL/min    > 60\n"
        "Blood Glucose               184      H      mg/dL     70 - 99\n"
        "Hemoglobin                  9.4      L      g/dL      12.0 - 16.0\n"
        "White Blood Cell Count      14.2     H      K/uL      4.5 - 11.0\n"
        "Platelet Count              240             K/uL      150 - 450\n"
        "D-Dimer                     720      H      ng/mL     < 500\n"
    )

    flowsheet = parser.extract_lab_flowsheet(sample_lab_report)
    assert len(flowsheet) >= 10, f"Expected at least 10 parsed lab rows, got {len(flowsheet)}"

    by_test = {r["test_name"]: r for r in flowsheet}

    # Verify NT-proBNP
    assert "NT-proBNP" in by_test
    bnp = by_test["NT-proBNP"]
    assert bnp["value"] == 1850.0
    assert bnp["flag"] == "HIGH"
    assert bnp["is_abnormal"] is True
    assert bnp["unit"] == "pg/mL"
    assert bnp["associated_condition"] == "Congestive Heart Failure"

    # Verify Potassium
    assert "Serum Potassium" in by_test
    k = by_test["Serum Potassium"]
    assert k["value"] == 5.8
    assert k["flag"] == "HIGH"
    assert k["is_abnormal"] is True
    assert k["associated_condition"] == "Hyperkalemia"

    # Verify Hemoglobin
    assert "Hemoglobin" in by_test
    hgb = by_test["Hemoglobin"]
    assert hgb["value"] == 9.4
    assert hgb["flag"] == "LOW"
    assert hgb["is_abnormal"] is True
    assert hgb["associated_condition"] == "Anemia"

    # Verify Platelets (Normal)
    assert "Platelet Count" in by_test
    plt = by_test["Platelet Count"]
    assert plt["value"] == 240.0
    assert plt["flag"] == "NORMAL"
    assert plt["is_abnormal"] is False
    assert plt["associated_condition"] is None


def test_summarize_document_with_lab_flowsheet_endpoint(client, test_patient):
    """Verifies that POST /api/v1/summarize/document extracts flowsheet and links to Knowledge Graph."""
    sample_report = (
        "HOSPITAL DISCHARGE LAB FLOWSHEET & SUMMARY:\n"
        "Patient presented with acute dyspnea, orthopnea, and bilateral lower extremity edema.\n\n"
        "LABORATORY FINDINGS:\n"
        "NT-proBNP                    1,850    H    pg/mL        0 - 125\n"
        "Serum Creatinine             2.1      H    mg/dL        0.7 - 1.3\n"
        "Serum Potassium              5.8      H    mmol/L       3.5 - 5.0\n"
        "Platelet Count               240           K/uL         150 - 450\n\n"
        "CLINICAL ASSESSMENT:\n"
        "Decompensated congestive heart failure complicated by acute kidney injury and hyperkalemia.\n"
    )
    b64_doc = base64.b64encode(sample_report.encode("utf-8")).decode("utf-8")

    response = client.post(
        "/api/v1/summarize/document",
        json={
            "patient_id": test_patient.id,
            "document_base64": b64_doc,
            "summary_type": "discharge",
            "enable_ocr_fallback": True,
        },
        headers={"Authorization": "Bearer vault-local-admin-token"},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert "flowsheet" in data
    flowsheet = data["flowsheet"]
    assert len(flowsheet) >= 3

    test_names = [f["test_name"] for f in flowsheet]
    assert "NT-proBNP" in test_names
    assert "Serum Creatinine" in test_names
    assert "Serum Potassium" in test_names

    # Check Knowledge Graph ingestion
    graph_store = get_graph_store()
    subgraph = graph_store.manager.get_patient_subgraph(test_patient.id, max_depth=2)
    node_labels = [n.get("label") for n in subgraph.get("nodes", [])]
    assert "LabResult" in node_labels
