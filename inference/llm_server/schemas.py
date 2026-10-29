"""
Pydantic Schemas for LLM Clinical Summarization & SOAP Synthesis Service.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class SOAPNoteSection(BaseModel):
    subjective: str = Field(description="Patient reported history, Chief Complaint, HPI, ROS")
    objective: str = Field(description="Physical exam findings, vital signs, labs, and imaging results")
    assessment: str = Field(description="Clinical diagnoses, differential, etiology, disease trajectory")
    plan: str = Field(description="Medications, therapies, further workup, consultations, and patient education")


class SOAPGenerationRequest(BaseModel):
    clinical_dialogue: str = Field(description="Raw transcribed ambient dialogue or doctor-patient conversation")
    patient_id: Optional[str] = Field(default=None)
    encounter_id: Optional[str] = Field(default=None)
    prior_conditions: List[str] = Field(default_factory=list)
    temperature: float = Field(default=0.1, ge=0.0, le=1.5)
    max_tokens: int = Field(default=1024, ge=64, le=4096)


class SOAPGenerationResponse(BaseModel):
    soap_note: SOAPNoteSection
    formatted_markdown: str
    identified_allergies: List[str] = Field(default_factory=list)
    prescribed_medications: List[Dict[str, str]] = Field(default_factory=list)
    follow_up_instructions: str
    generation_latency_ms: float


class SummarizeRequest(BaseModel):
    text: str = Field(description="Clinical report or discharge narrative to summarize")
    summary_type: str = Field(
        default="discharge",
        description="Type of summary: discharge, progress, radiologic, emergency, brief",
    )
    model_name: Optional[str] = Field(default=None, description="Optional target model identifier")
    max_tokens: int = Field(default=512)
    temperature: float = Field(default=0.2)


class SummarizeResponse(BaseModel):
    summary: str
    key_findings: List[str]
    action_items: List[str]
    latency_ms: float
    model_version: Optional[str] = Field(default="ClinixVault-Mistral-7B-Summarizer")


class FHIRStructuredRequest(BaseModel):
    clinical_narrative: str
    target_resource_type: str = Field(
        default="Observation",
        description="FHIR resource: Observation, Condition, DiagnosticReport",
    )


class FHIRStructuredResponse(BaseModel):
    resource_type: str
    fhir_json: Dict[str, Any]
    schema_valid: bool
    latency_ms: float
