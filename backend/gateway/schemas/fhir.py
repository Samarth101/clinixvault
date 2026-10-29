"""
FHIR R4 (Fast Healthcare Interoperability Resources) Pydantic Models.
Defines compliant schemas for Patient, Observation, Condition, DiagnosticReport, and Bundle.
"""

import uuid
import datetime
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field


class FHIRCoding(BaseModel):
    system: Optional[str] = "http://snomed.info/sct"
    version: Optional[str] = None
    code: str
    display: Optional[str] = None


class FHIRCodeableConcept(BaseModel):
    coding: List[FHIRCoding] = Field(default_factory=list)
    text: Optional[str] = None


class FHIRReference(BaseModel):
    reference: str
    display: Optional[str] = None


class FHIRPatientResource(BaseModel):
    resourceType: str = "Patient"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    identifier: List[Dict[str, Any]] = Field(default_factory=list)
    active: bool = True
    name: List[Dict[str, Any]] = Field(default_factory=list)
    gender: Optional[str] = None
    birthDate: Optional[str] = None


class FHIRObservationResource(BaseModel):
    resourceType: str = "Observation"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "final"
    category: List[FHIRCodeableConcept] = Field(default_factory=list)
    code: FHIRCodeableConcept
    subject: Optional[FHIRReference] = None
    effectiveDateTime: str = Field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    )
    valueString: Optional[str] = None
    interpretation: List[FHIRCodeableConcept] = Field(default_factory=list)


class FHIRConditionResource(BaseModel):
    resourceType: str = "Condition"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    clinicalStatus: FHIRCodeableConcept
    verificationStatus: FHIRCodeableConcept
    category: List[FHIRCodeableConcept] = Field(default_factory=list)
    code: FHIRCodeableConcept
    subject: Optional[FHIRReference] = None
    recordedDate: str = Field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    )


class FHIRDiagnosticReportResource(BaseModel):
    resourceType: str = "DiagnosticReport"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "final"
    category: List[FHIRCodeableConcept] = Field(default_factory=list)
    code: FHIRCodeableConcept
    subject: Optional[FHIRReference] = None
    effectiveDateTime: str = Field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    )
    conclusion: Optional[str] = None
    conclusionCode: List[FHIRCodeableConcept] = Field(default_factory=list)


class FHIRBundleEntry(BaseModel):
    fullUrl: Optional[str] = None
    resource: Union[
        FHIRPatientResource,
        FHIRObservationResource,
        FHIRConditionResource,
        FHIRDiagnosticReportResource,
        Dict[str, Any],
    ]


class FHIRBundleResource(BaseModel):
    resourceType: str = "Bundle"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = "collection"
    timestamp: str = Field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    )
    total: int = 0
    entry: List[FHIRBundleEntry] = Field(default_factory=list)
