"""
Unit Tests for Structured Output and FHIR Schema Enforcement Engine.
"""

import pytest
from inference.llm_server.structured_output import (
    StructuredOutputEngine,
    FHIRObservationSchema,
    FHIRConditionSchema,
    FHIRDiagnosticReportSchema,
)


def test_structured_output_synthesize_observation():
    engine = StructuredOutputEngine()
    narrative = "Blood pressure elevated at 145/92 mmHg on sitting exam."
    fhir_data = engine.extract_or_build_fhir(narrative, "Observation")

    assert fhir_data["resourceType"] == "Observation"
    assert "code" in fhir_data
    assert "effectiveDateTime" in fhir_data
    assert "valueString" in fhir_data
    assert "145/92" in fhir_data["valueString"]


def test_structured_output_synthesize_condition():
    engine = StructuredOutputEngine()
    narrative = "Patient diagnosed with Acute Bronchitis."
    fhir_data = engine.extract_or_build_fhir(narrative, "Condition")

    assert fhir_data["resourceType"] == "Condition"
    assert fhir_data["clinicalStatus"]["coding"][0]["code"] == "active"
    assert "code" in fhir_data
    assert "Bronchitis" in fhir_data["code"]["text"]


def test_structured_output_synthesize_diagnostic_report():
    engine = StructuredOutputEngine()
    narrative = "Chest radiograph indicates mild cardiomegaly without acute infiltration."
    fhir_data = engine.extract_or_build_fhir(narrative, "DiagnosticReport")

    assert fhir_data["resourceType"] == "DiagnosticReport"
    assert fhir_data["status"] == "final"
    assert "cardiomegaly" in fhir_data["conclusion"]


def test_embedded_json_parsing():
    engine = StructuredOutputEngine()
    valid_json_text = """
    ```json
    {
        "resourceType": "Observation",
        "code": {
            "coding": [{"code": "883-9", "display": "ABO Blood Group"}],
            "text": "ABO blood group"
        },
        "valueString": "Type A Positive"
    }
    ```
    """
    fhir_data = engine.extract_or_build_fhir(valid_json_text, "Observation")
    assert fhir_data["resourceType"] == "Observation"
    assert fhir_data["valueString"] == "Type A Positive"
