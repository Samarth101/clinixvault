"""
Clinical Knowledge Graph & Neo4j API Gateway Routes.
Provides endpoints for patient subgraph extraction, Cypher query execution,
and graph statistics for the ClinixVault workstation.
"""

import time
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status

from backend.gateway.middleware.auth import get_current_user
from backend.database.graph_store import get_graph_store
from backend.database.neo4j_connection import get_graph_manager
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.gateway.graph")
router = APIRouter(prefix="/api/v1/graph", tags=["Knowledge Graph"])


class CypherQueryRequest(BaseModel):
    query: str = Field(..., description="Cypher read query string")
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Query parameters")


class SyncReportRequest(BaseModel):
    patient_id: str
    report_id: str
    findings: str
    impression: str
    modality: Optional[str] = "Chest Radiography (CXR)"


@router.get("/stats")
async def get_graph_stats(user: dict = Depends(get_current_user)):
    """Returns connectivity, node counts, and relationship metrics."""
    manager = get_graph_manager()
    return manager.get_stats()


@router.get("/patient/{patient_id}")
async def get_patient_knowledge_graph(
    patient_id: str,
    depth: int = 2,
    user: dict = Depends(get_current_user),
):
    """
    Returns the connected multi-hop clinical knowledge graph for a patient,
    formatted for interactive force-directed visualizer.
    """
    store = get_graph_store()
    return store.get_patient_graph(patient_id=patient_id, depth=depth)


@router.post("/query")
async def execute_cypher_query(
    request: CypherQueryRequest,
    user: dict = Depends(get_current_user),
):
    """
    Executes a read-only Cypher query against the active Neo4j cluster
    or the in-memory property graph engine.
    """
    start_time = time.time()
    clean_q = request.query.strip()

    # Safety checks to prevent write queries through read endpoint
    dangerous_keywords = ["DELETE", "DROP", "CREATE CONSTRAINT", "REMOVE", "ALTER"]
    for kw in dangerous_keywords:
        if kw in clean_q.upper():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cypher statement contains forbidden keyword '{kw}'. Read-only execution permitted.",
            )

    manager = get_graph_manager()
    records = manager.execute_cypher(clean_q, request.parameters)
    latency_ms = round((time.time() - start_time) * 1000.0, 2)

    return {
        "query": clean_q,
        "record_count": len(records),
        "records": records,
        "latency_ms": latency_ms,
        "engine": manager.get_stats().get("engine"),
        "connected": manager.is_connected,
    }


@router.post("/sync-report")
async def sync_report_to_graph(
    request: SyncReportRequest,
    user: dict = Depends(get_current_user),
):
    """Synchronizes a radiology or clinical report into the patient's knowledge graph."""
    store = get_graph_store()
    report_node_id = store.ingest_diagnostic_report(
        patient_id=request.patient_id,
        report_id=request.report_id,
        findings=request.findings,
        impression=request.impression,
        modality=request.modality or "Chest Radiography (CXR)",
    )
    return {
        "status": "synchronized",
        "patient_id": request.patient_id,
        "report_node_id": report_node_id,
    }


class CrossModalAuditRequest(BaseModel):
    patient_id: Optional[str] = Field(default=None, description="Patient MRN or UUID")
    radiology_findings: Optional[str] = Field(default="", description="Findings from chest radiograph")
    radiology_compartments: Optional[Dict[str, str]] = Field(default_factory=dict, description="Compartments e.g. lungs_pleura, support_devices")
    scribe_soap: Optional[Dict[str, str]] = Field(default_factory=dict, description="SOAP note quadrants (objective, assessment, subjective)")
    ehr_summary_text: Optional[str] = Field(default="", description="EHR history or PDF document text")


@router.post("/cross-modal-audit")
async def cross_modal_discordance_audit_endpoint(
    request: CrossModalAuditRequest,
    user: dict = Depends(get_current_user),
):
    """
    Virtual Case Board: Audits cross-modal discordance across
    Radiology VLM, Scribe SOAP, and EHR/Document AI.
    """
    from backend.audit.cross_modal_discordance import audit_cross_modal_discordance
    from backend.database.connection import SessionLocal
    from backend.database.models import ClinicalReport

    rad_findings = request.radiology_findings or ""
    rad_compartments = request.radiology_compartments or {}
    soap = request.scribe_soap or {}
    ehr_text = request.ehr_summary_text or ""

    # If patient_id passed, pull latest reports if fields not populated
    if request.patient_id:
        try:
            db = SessionLocal()
            if not rad_findings:
                latest_rad = db.query(ClinicalReport).filter(
                    ClinicalReport.patient_id == request.patient_id,
                    ClinicalReport.report_type == "radiology"
                ).order_by(ClinicalReport.created_at.desc()).first()
                if latest_rad:
                    rad_findings = latest_rad.findings or latest_rad.raw_content or ""
                    if latest_rad.dicom_sr_metadata:
                        rad_compartments = latest_rad.dicom_sr_metadata.get("compartments", rad_compartments)
            if not soap:
                latest_soap = db.query(ClinicalReport).filter(
                    ClinicalReport.patient_id == request.patient_id,
                    ClinicalReport.report_type == "soap"
                ).order_by(ClinicalReport.created_at.desc()).first()
                if latest_soap:
                    soap = {
                        "subjective": latest_soap.findings or "",
                        "objective": latest_soap.findings or "",
                        "assessment": latest_soap.impression or "",
                    }
            if not ehr_text:
                latest_doc = db.query(ClinicalReport).filter(
                    ClinicalReport.patient_id == request.patient_id,
                    ClinicalReport.report_type == "summary"
                ).order_by(ClinicalReport.created_at.desc()).first()
                if latest_doc:
                    ehr_text = latest_doc.raw_content or ""
            db.close()
        except Exception as e:
            logger.debug(f"Cross-modal audit DB hydration notice: {e}")

    audit_result = audit_cross_modal_discordance(
        radiology_findings=rad_findings,
        radiology_compartments=rad_compartments,
        scribe_soap=soap,
        ehr_summary_text=ehr_text,
    )
    audit_result["patient_id"] = request.patient_id
    return audit_result
