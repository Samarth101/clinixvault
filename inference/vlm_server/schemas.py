"""
Pydantic Schemas for ClinixVault VLM Radiology Report Generation Service.
Supports MM-RAG exemplar retrieval, GraphRAG context injection, and Two-Stage Hierarchical generation.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class RadiologyReportRequest(BaseModel):
    image_base64: Optional[str] = Field(default=None, description="Base64 encoded JPEG/PNG image")
    image_path: Optional[str] = Field(default=None, description="Local disk or container path to chest radiograph")
    patient_id: Optional[str] = Field(default=None, description="Patient ID for GraphRAG EHR and prior hardware lookup")
    clinical_history: Optional[str] = Field(default="", description="Patient clinical history and indication")
    projection_view: Optional[str] = Field(default="PA", description="Radiographic view: PA, AP, Lateral")
    enable_graph_rag: bool = Field(default=True, description="Inject verified prior conditions and surgical hardware from GraphRAG")
    enable_mm_rag: bool = Field(default=False, description="Retrieve nearest visual exemplars using BioViL-T / ResNet embeddings")
    hierarchical_mode: bool = Field(default=True, description="Enable two-stage hierarchical report synthesis (Findings -> Impression)")
    num_exemplars: int = Field(default=2, ge=1, le=5, description="Number of MM-RAG visual exemplars to retrieve")
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(default=350, ge=16, le=2048)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    top_k: int = Field(default=50, ge=1, le=200)
    repetition_penalty: float = Field(default=1.2, ge=1.0, le=3.0)


class FindingDetection(BaseModel):
    pathology: str
    confidence: float
    evidence: str
    negated: bool = False


class AnatomicalBreakdown(BaseModel):
    lungs_pleura: str = Field(
        default="",
        description="Lungs, airway, parenchyma, and pleural spaces (aeration, consolidation, pneumothorax, effusion)",
    )
    cardiomediastinum: str = Field(
        default="",
        description="Cardiomediastinal silhouette, cardiac size, CTR ratio, aortic knob, hilar contours",
    )
    bones_soft_tissues: str = Field(
        default="",
        description="Osseous thorax (ribs, clavicles, spine) and surrounding soft tissues",
    )
    support_devices: str = Field(
        default="",
        description="Support hardware, monitoring lines, tubes, pacemakers, foreign bodies",
    )


class CriticAudit(BaseModel):
    consistency_score: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Anatomical consistency score between findings and impression (0.0 to 1.0)",
    )
    unsupported_assertions: List[str] = Field(
        default_factory=list,
        description="Impression claims lacking visual or documented support in findings",
    )
    negated_pathologies: List[str] = Field(
        default_factory=list,
        description="Pathologies explicitly ruled out or documented as absent",
    )
    verified_pathologies: List[str] = Field(
        default_factory=list,
        description="Pathologies positively confirmed across findings and impression",
    )


class RadiologyReportResponse(BaseModel):
    findings: str = Field(description="Detailed anatomical and pathological findings section")
    impression: str = Field(description="Radiologist diagnostic summary and primary impression")
    full_report: str = Field(description="Consolidated standardized radiology report")
    detected_pathologies: List[FindingDetection] = Field(default_factory=list)
    generation_latency_ms: float
    model_version: str
    graph_context_used: Optional[str] = Field(default=None, description="Injected GraphRAG context summary")
    retrieved_exemplars_count: int = Field(default=0, description="Count of retrieved MM-RAG visual exemplars")
    stage1_findings: Optional[str] = Field(default=None, description="Intermediate Stage 1 anatomical findings")
    consistency_verified: bool = Field(default=True, description="NegEx cross-stage consistency check status")
    anatomical_breakdown: Optional[AnatomicalBreakdown] = Field(
        default=None,
        description="Structured 4-zone anatomical observations (Lungs, Heart, Bones, Devices)",
    )
    critic_audit: Optional[CriticAudit] = Field(
        default=None,
        description="Agentic Critic consistency audit and NegEx validation metrics",
    )
