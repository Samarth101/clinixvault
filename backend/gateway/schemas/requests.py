"""
API Gateway Request and Response Schemas.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user_role: str


class GatewayRadiologyRequest(BaseModel):
    patient_id: str
    encounter_id: Optional[str] = None
    image_base64: Optional[str] = None
    image_path: Optional[str] = None
    image_filename: Optional[str] = None
    clinical_indication: Optional[str] = ""
    projection: str = "PA"
    model_name: Optional[str] = None
    prior_study_id: Optional[str] = None
    prior_image_base64: Optional[str] = None
    prior_image_path: Optional[str] = None
    comparison_mode: Optional[bool] = False
    explicit_priority: Optional[str] = None


class RadiologyVoiceAmendRequest(BaseModel):
    report_id: str
    spoken_text: Optional[str] = None
    voice_audio_base64: Optional[str] = None
    target_compartment: Optional[str] = None  # lungs_pleura, cardiomediastinum, bones_soft_tissues, support_devices


class GatewayRadiologyResponse(BaseModel):
    report_id: str
    patient_id: str
    findings: str
    impression: str
    full_report: str
    status: Optional[str] = "success"
    error_message: Optional[str] = None
    error_category: Optional[str] = None
    fhir_report: Optional[Dict[str, Any]] = None
    provenance: Optional[Dict[str, Any]] = None
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    grounding_score: float = 1.0
    latency_ms: float = 0.0
    model_version: Optional[str] = None
    patient_report: Optional[Dict[str, Any]] = None
    anatomical_breakdown: Optional[Dict[str, str]] = None
    critic_audit: Optional[Dict[str, Any]] = None
    dicom_sr_metadata: Optional[Dict[str, Any]] = None
    pathologies: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    interval_trajectory: Optional[Dict[str, Any]] = None
    spatial_coordinates: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    biomarkers: Optional[Dict[str, Any]] = None
    technical_qa: Optional[Dict[str, Any]] = None
    cache_hit: Optional[bool] = False
    temporal_subtraction: Optional[Dict[str, Any]] = None


class DicomSRExportRequest(BaseModel):
    report_id: Optional[str] = None
    patient_id: Optional[str] = None
    findings: Optional[str] = None
    impression: Optional[str] = None
    anatomical_breakdown: Optional[Dict[str, str]] = None
    critic_audit: Optional[Dict[str, Any]] = None
    projection: Optional[str] = "PA"
    interval_trajectory: Optional[Dict[str, Any]] = None
    spatial_coordinates: Optional[List[Dict[str, Any]]] = None


class MedicalCodeItem(BaseModel):
    code: str
    description: str
    category: str  # ICD-10-CM, CPT, RxNorm
    confidence: float = 0.95
    rationale: str = ""
    is_primary: bool = False


class CodingExtractionRequest(BaseModel):
    clinical_text: str
    patient_id: Optional[str] = "ENC-9082"
    encounter_id: Optional[str] = None


class CodingExtractionResponse(BaseModel):
    status: str = "success"
    patient_id: Optional[str] = None
    encounter_id: Optional[str] = None
    primary_diagnosis: Optional[MedicalCodeItem] = None
    secondary_diagnoses: List[MedicalCodeItem] = Field(default_factory=list)
    cpt_procedure_codes: List[MedicalCodeItem] = Field(default_factory=list)
    medication_codes: List[MedicalCodeItem] = Field(default_factory=list)
    total_billable_units: int = 1
    medical_decision_making_level: str = "Moderate Complexity (Level 4 - 99214)"
    is_insufficient: bool = False


class GatewaySummarizeRequest(BaseModel):
    patient_id: str
    encounter_id: Optional[str] = None
    clinical_text: str
    summary_type: str = "discharge"  # discharge, progress, radiology
    model_name: Optional[str] = None


class GatewaySummarizeResponse(BaseModel):
    summary_id: str
    summary: str
    key_findings: List[str]
    action_items: List[str]
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    latency_ms: float
    model_version: Optional[str] = None
    patient_report: Optional[Dict[str, Any]] = None
    graph_factuality_score: Optional[float] = None
    graph_verified_triples: Optional[List[str]] = Field(default_factory=list)


class PatientSimplifyRequest(BaseModel):
    clinical_text: str
    report_type: str = "radiology"  # radiology, visit_summary, discharge
    clinical_indication: Optional[str] = ""
    patient_id: Optional[str] = None
    model_name: Optional[str] = None


class PatientSimplifyResponse(BaseModel):
    patient_report: Dict[str, Any]
    latency_ms: float
    model_version: Optional[str] = None


class GatewayDocumentSummarizeRequest(BaseModel):
    patient_id: str = "ENC-9082"
    encounter_id: Optional[str] = None
    document_base64: Optional[str] = None
    clinical_text: Optional[str] = None
    summary_type: str = "discharge"  # discharge, progress, radiology
    enable_ocr_fallback: bool = True
    model_name: Optional[str] = None


class GatewayDocumentSummarizeResponse(BaseModel):
    summary_id: str
    patient_id: str
    summary: str
    sections: Dict[str, str] = Field(default_factory=dict)
    key_findings: List[str] = Field(default_factory=list)
    action_items: List[str] = Field(default_factory=list)
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    flowsheet: List[Dict[str, Any]] = Field(default_factory=list)
    grounding_score: float = 1.0
    ocr_applied: bool = False
    pages_processed: int = 1
    latency_ms: float
    model_version: Optional[str] = None


class AmbientScribeInit(BaseModel):
    patient_id: str
    encounter_id: Optional[str] = None
    prior_conditions: List[str] = Field(default_factory=list)


class ModelPullRequest(BaseModel):
    model: str


class ModelActiveRequest(BaseModel):
    task: Optional[str] = None  # "radiology" | "summarize" | "all"
    model: Optional[str] = None
    radiology_model: Optional[str] = None
    summarize_model: Optional[str] = None


class OllamaRunRequest(BaseModel):
    model_name: str


class PatientVitalsSchema(BaseModel):
    bp: str = "120/80 mmHg"
    hr: str = "72 bpm"
    spo2: str = "98%"
    temp: str = "98.6°F"
    bmi: str = "24.5 kg/m²"


class PatientEncounterItem(BaseModel):
    id: str
    patient_id: str
    encounter_type: str = "ambulatory"
    status: str = "in-progress"
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    chief_complaint: Optional[str] = None
    exam_room: Optional[str] = None
    vitals: Optional[PatientVitalsSchema] = None


class PatientRosterItem(BaseModel):
    id: str
    mrn: str
    first_name: str
    last_name: str
    full_name: str
    dob: Optional[str] = None
    gender: Optional[str] = None
    encounter_count: int = 0
    latest_encounter: Optional[PatientEncounterItem] = None
    last_vitals: Optional[PatientVitalsSchema] = None


class PatientDetailResponse(BaseModel):
    id: str
    mrn: str
    first_name: str
    last_name: str
    full_name: str
    dob: Optional[str] = None
    gender: Optional[str] = None
    encounters: List[PatientEncounterItem] = Field(default_factory=list)
    reports: List[Dict[str, Any]] = Field(default_factory=list)


class PatientCreateRequest(BaseModel):
    first_name: str
    last_name: str
    dob: Optional[str] = "1980-01-01"
    gender: Optional[str] = "unknown"
    mrn: Optional[str] = None
    chief_complaint: Optional[str] = "Clinical evaluation"
    exam_room: Optional[str] = "Exam Room 1"
    vitals: Optional[PatientVitalsSchema] = None


class EncounterCreateRequest(BaseModel):
    encounter_type: str = "ambulatory"
    status: str = "in-progress"
    chief_complaint: Optional[str] = "Routine clinical evaluation"
    exam_room: Optional[str] = "Exam Room 1"
    vitals: Optional[PatientVitalsSchema] = None


class ReportProvenanceResponse(BaseModel):
    report_id: str
    patient_id: str
    encounter_id: Optional[str] = None
    report_type: str
    title: Optional[str] = None
    findings: Optional[str] = None
    impression: Optional[str] = None
    raw_content: str
    model_version: Optional[str] = None
    provenance_hash: Optional[str] = None
    created_at: Optional[str] = None
    provenance: Optional[Dict[str, Any]] = None

