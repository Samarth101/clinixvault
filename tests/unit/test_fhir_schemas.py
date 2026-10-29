"""
Unit Tests for FHIR R4 Pydantic Schemas and Bundles.
"""

import pytest
from backend.gateway.schemas.fhir import (
    FHIRPatientResource,
    FHIRObservationResource,
    FHIRConditionResource,
    FHIRDiagnosticReportResource,
    FHIRBundleResource,
    FHIRBundleEntry,
    FHIRCodeableConcept,
    FHIRCoding,
)


def test_fhir_patient_creation():
    patient = FHIRPatientResource(
        id="pat-100",
        gender="male",
        birthDate="1975-08-20",
        name=[{"family": "Smith", "given": ["John"]}],
    )
    assert patient.resourceType == "Patient"
    assert patient.gender == "male"
    assert patient.name[0]["family"] == "Smith"


def test_fhir_observation_creation():
    obs = FHIRObservationResource(
        code=FHIRCodeableConcept(
            coding=[FHIRCoding(code="883-9", display="ABO blood group")],
            text="Blood type",
        ),
        valueString="O-Positive",
    )
    assert obs.resourceType == "Observation"
    assert obs.valueString == "O-Positive"
    assert obs.status == "final"


def test_fhir_diagnostic_report_and_bundle():
    diag = FHIRDiagnosticReportResource(
        code=FHIRCodeableConcept(
            coding=[FHIRCoding(code="18748-4", display="Diagnostic imaging report")],
            text="Radiology Report",
        ),
        conclusion="No acute cardiopulmonary disease.",
    )

    bundle = FHIRBundleResource(
        total=1,
        entry=[FHIRBundleEntry(fullUrl="urn:uuid:report-1", resource=diag)],
    )

    dumped = bundle.model_dump()
    assert dumped["resourceType"] == "Bundle"
    assert len(dumped["entry"]) == 1
    assert dumped["entry"][0]["resource"]["resourceType"] == "DiagnosticReport"
