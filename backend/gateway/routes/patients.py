"""
Patient Management REST API Gateway Routes.
Provides endpoints for patient roster discovery, longitudinal encounter retrieval,
cryptographically signed clinical reports, and new clinical encounter creation.
"""

import os
import sys
import uuid
import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from backend.database.connection import get_db
from backend.database.models import Patient, Encounter, ClinicalReport, ProvenanceRecord
from backend.audit.provenance import ProvenanceTracker
from backend.gateway.schemas.requests import (
    PatientRosterItem,
    PatientDetailResponse,
    PatientEncounterItem,
    PatientVitalsSchema,
    PatientCreateRequest,
    EncounterCreateRequest,
    ReportProvenanceResponse,
)
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.gateway.patients")
router = APIRouter(prefix="/api/v1/patients", tags=["Patients"])
provenance_tracker = ProvenanceTracker()

# In-memory metadata cache for dynamically registered patients
DYNAMIC_PATIENT_METADATA: Dict[str, Dict[str, Any]] = {}

# Default clinical cohort for air-gapped demo roster
DEFAULT_COHORT = [
    {
        "id": "ENC-9082",
        "mrn": "MRN-782194",
        "first_name": "Eleanor",
        "last_name": "Vance",
        "dob": "1968-04-12",
        "gender": "female",
        "chief_complaint": "Bilateral progressive knee pain, worse on weight bearing",
        "exam_room": "Exam Room 3",
        "status": "In Progress",
        "vitals": {"bp": "128/82 mmHg", "hr": "72 bpm", "spo2": "99%", "temp": "98.4°F", "bmi": "27.4 kg/m²"},
    },
    {
        "id": "ENC-9081",
        "mrn": "MRN-642109",
        "first_name": "Robert",
        "last_name": "Kowalski",
        "dob": "1954-11-29",
        "gender": "male",
        "chief_complaint": "Follow-up congestive heart failure and mild exertional dyspnea",
        "exam_room": "Exam Room 1",
        "status": "Ready for Review",
        "vitals": {"bp": "134/88 mmHg", "hr": "68 bpm", "spo2": "96%", "temp": "98.6°F", "bmi": "29.1 kg/m²"},
    },
    {
        "id": "ENC-9080",
        "mrn": "MRN-551028",
        "first_name": "Sarah",
        "last_name": "Jenkins",
        "dob": "1982-08-17",
        "gender": "female",
        "chief_complaint": "Persistent dry cough post-viral syndrome, 3 weeks duration",
        "exam_room": "Exam Room 4",
        "status": "Committed",
        "vitals": {"bp": "116/74 mmHg", "hr": "76 bpm", "spo2": "98%", "temp": "98.2°F", "bmi": "23.5 kg/m²"},
    },
    {
        "id": "ENC-9079",
        "mrn": "MRN-893012",
        "first_name": "Marcus",
        "last_name": "Rodriguez",
        "dob": "1991-03-22",
        "gender": "male",
        "chief_complaint": "Acute twisting injury to left knee during athletics, painful clicking",
        "exam_room": "Exam Room 2",
        "status": "Ready for Review",
        "vitals": {"bp": "122/78 mmHg", "hr": "64 bpm", "spo2": "99%", "temp": "98.5°F", "bmi": "25.1 kg/m²"},
    },
    {
        "id": "ENC-9078",
        "mrn": "MRN-410982",
        "first_name": "Elena",
        "last_name": "Rostova",
        "dob": "1960-07-09",
        "gender": "female",
        "chief_complaint": "Chronic lumbar radiculopathy radiating down right posterior thigh",
        "exam_room": "Exam Room 5",
        "status": "Committed",
        "vitals": {"bp": "130/84 mmHg", "hr": "70 bpm", "spo2": "97%", "temp": "98.3°F", "bmi": "26.8 kg/m²"},
    },
]


def ensure_demo_patients_seeded(db: Session):
    """No-op: Demo cohort seeding disabled. Operates with genuine zero records until a patient is added."""
    pass


@router.get("", response_model=List[PatientRosterItem])
async def list_patients(db: Session = Depends(get_db)):
    """
    Returns clinical patient roster with encounter counts, latest encounter, and vitals.
    """
    ensure_demo_patients_seeded(db)
    patients = db.query(Patient).order_by(Patient.created_at.desc()).all()
    
    roster: List[PatientRosterItem] = []
    cohort_lookup = {item["id"]: item for item in DEFAULT_COHORT}
    cohort_mrn_lookup = {item["mrn"]: item for item in DEFAULT_COHORT}

    for p in patients:
        encounters = db.query(Encounter).filter(Encounter.patient_id == p.id).order_by(Encounter.started_at.desc()).all()
        enc_count = len(encounters)
        
        meta = DYNAMIC_PATIENT_METADATA.get(p.id) or DYNAMIC_PATIENT_METADATA.get(p.mrn) or cohort_lookup.get(p.id) or cohort_mrn_lookup.get(p.mrn) or {}
        vitals_dict = meta.get("vitals", {
            "bp": "120/80 mmHg",
            "hr": "72 bpm",
            "spo2": "98%",
            "temp": "98.6°F",
            "bmi": "24.5 kg/m²"
        })
        
        latest_enc_item = None
        if encounters:
            latest = encounters[0]
            latest_enc_item = PatientEncounterItem(
                id=latest.id,
                patient_id=p.id,
                encounter_type=latest.encounter_type,
                status=latest.status,
                started_at=latest.started_at.isoformat() if latest.started_at else None,
                ended_at=latest.ended_at.isoformat() if latest.ended_at else None,
                chief_complaint=meta.get("chief_complaint", "Clinical evaluation"),
                exam_room=meta.get("exam_room", "Exam Room 1"),
                vitals=PatientVitalsSchema(**vitals_dict),
            )
        elif meta:
            latest_enc_item = PatientEncounterItem(
                id=f"ENC-{p.id}",
                patient_id=p.id,
                encounter_type="ambulatory",
                status=meta.get("status", "In Progress"),
                started_at=datetime.datetime.utcnow().isoformat(),
                chief_complaint=meta.get("chief_complaint", "Clinical evaluation"),
                exam_room=meta.get("exam_room", "Exam Room 1"),
                vitals=PatientVitalsSchema(**vitals_dict),
            )
            enc_count = 1

        full_name = f"{p.first_name} {p.last_name}".strip()
        if not full_name:
            full_name = meta.get("first_name", "") + " " + meta.get("last_name", "")
            full_name = full_name.strip() or f"Patient {p.mrn}"

        roster.append(
            PatientRosterItem(
                id=p.id,
                mrn=p.mrn,
                first_name=p.first_name or meta.get("first_name", "Clinical"),
                last_name=p.last_name or meta.get("last_name", "Patient"),
                full_name=full_name,
                dob=p.dob or meta.get("dob"),
                gender=p.gender or meta.get("gender"),
                encounter_count=enc_count,
                latest_encounter=latest_enc_item,
                last_vitals=PatientVitalsSchema(**vitals_dict),
            )
        )

    return roster


@router.post("", response_model=PatientRosterItem, status_code=status.HTTP_201_CREATED)
async def create_patient(
    payload: PatientCreateRequest,
    db: Session = Depends(get_db),
):
    """
    Registers a new clinical patient dynamically, creates their initial encounter,
    ensures their node exists in the Knowledge Graph, and returns the updated roster item.
    """
    first_name = (payload.first_name or "").strip()
    last_name = (payload.last_name or "").strip()
    if not first_name or not last_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Patient first_name and last_name are required.",
        )

    # Determine or generate MRN
    mrn = payload.mrn.strip() if payload.mrn and payload.mrn.strip() else f"MRN-{uuid.uuid4().hex[:6].upper()}"
    existing = db.query(Patient).filter(Patient.mrn == mrn).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Patient with MRN '{mrn}' already exists.",
        )

    patient_id = f"PT-{uuid.uuid4().hex[:8].upper()}"
    new_patient = Patient(
        id=patient_id,
        mrn=mrn,
        first_name=first_name,
        last_name=last_name,
        dob=payload.dob or "1980-01-01",
        gender=payload.gender or "unknown",
    )
    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)

    # Create initial clinical encounter
    enc_id = f"ENC-{uuid.uuid4().hex[:8].upper()}"
    new_enc = Encounter(
        id=enc_id,
        patient_id=new_patient.id,
        encounter_type="ambulatory",
        status="In Progress",
        started_at=datetime.datetime.utcnow(),
    )
    db.add(new_enc)
    db.commit()
    db.refresh(new_enc)

    vitals_schema = payload.vitals or PatientVitalsSchema()
    vitals_dict = vitals_schema.model_dump() if hasattr(vitals_schema, "model_dump") else vitals_schema.dict()

    # Store metadata for roster display
    DYNAMIC_PATIENT_METADATA[new_patient.id] = {
        "id": new_patient.id,
        "mrn": new_patient.mrn,
        "first_name": new_patient.first_name,
        "last_name": new_patient.last_name,
        "dob": new_patient.dob,
        "gender": new_patient.gender,
        "chief_complaint": payload.chief_complaint or "Clinical evaluation",
        "exam_room": payload.exam_room or "Exam Room 1",
        "status": "In Progress",
        "vitals": vitals_dict,
    }
    DYNAMIC_PATIENT_METADATA[new_patient.mrn] = DYNAMIC_PATIENT_METADATA[new_patient.id]

    # Synchronize with Knowledge Graph
    full_name = f"{new_patient.first_name} {new_patient.last_name}".strip()
    try:
        from backend.database.graph_store import get_graph_store
        graph_store = get_graph_store()
        graph_store.ensure_patient(
            patient_id=new_patient.id,
            name=full_name,
            gender=new_patient.gender or "Unknown",
            mrn=new_patient.mrn,
        )
    except Exception as g_err:
        logger.warning(f"Failed to register patient in graph store: {g_err}")

    latest_enc_item = PatientEncounterItem(
        id=new_enc.id,
        patient_id=new_patient.id,
        encounter_type=new_enc.encounter_type,
        status=new_enc.status,
        started_at=new_enc.started_at.isoformat() if new_enc.started_at else None,
        chief_complaint=payload.chief_complaint or "Clinical evaluation",
        exam_room=payload.exam_room or "Exam Room 1",
        vitals=vitals_schema,
    )

    return PatientRosterItem(
        id=new_patient.id,
        mrn=new_patient.mrn,
        first_name=new_patient.first_name,
        last_name=new_patient.last_name,
        full_name=full_name,
        dob=new_patient.dob,
        gender=new_patient.gender,
        encounter_count=1,
        latest_encounter=latest_enc_item,
        last_vitals=vitals_schema,
    )


@router.get("/{patient_id}", response_model=PatientDetailResponse)
async def get_patient_detail(patient_id: str, db: Session = Depends(get_db)):
    """
    Returns complete patient record, including past encounters and signed clinical reports.
    """
    patient = db.query(Patient).filter((Patient.id == patient_id) | (Patient.mrn == patient_id)).first()
    if not patient:
        ensure_demo_patients_seeded(db)
        patient = db.query(Patient).filter((Patient.id == patient_id) | (Patient.mrn == patient_id)).first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found.",
        )

    encounters = db.query(Encounter).filter(Encounter.patient_id == patient.id).order_by(Encounter.started_at.desc()).all()
    reports = db.query(ClinicalReport).filter(ClinicalReport.patient_id == patient.id).order_by(ClinicalReport.created_at.desc()).all()

    meta = DYNAMIC_PATIENT_METADATA.get(patient.id) or DYNAMIC_PATIENT_METADATA.get(patient.mrn) or next((item for item in DEFAULT_COHORT if item["id"] == patient.id or item["mrn"] == patient.mrn), {})
    vitals_dict = meta.get("vitals", {"bp": "120/80 mmHg", "hr": "72 bpm", "spo2": "98%", "temp": "98.6°F", "bmi": "24.5 kg/m²"})

    enc_items = [
        PatientEncounterItem(
            id=enc.id,
            patient_id=patient.id,
            encounter_type=enc.encounter_type,
            status=enc.status,
            started_at=enc.started_at.isoformat() if enc.started_at else None,
            ended_at=enc.ended_at.isoformat() if enc.ended_at else None,
            chief_complaint=meta.get("chief_complaint", "Clinical visit"),
            exam_room=meta.get("exam_room", "Exam Room 1"),
            vitals=PatientVitalsSchema(**vitals_dict),
        )
        for enc in encounters
    ]

    report_items = []
    for r in reports:
        report_items.append({
            "id": r.id,
            "patient_id": r.patient_id,
            "encounter_id": r.encounter_id,
            "report_type": r.report_type,
            "title": r.title,
            "findings": r.findings,
            "impression": r.impression,
            "raw_content": r.raw_content,
            "model_version": r.model_version,
            "provenance_hash": r.provenance_hash,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    full_name = f"{patient.first_name} {patient.last_name}".strip() or f"Patient {patient.mrn}"

    return PatientDetailResponse(
        id=patient.id,
        mrn=patient.mrn,
        first_name=patient.first_name,
        last_name=patient.last_name,
        full_name=full_name,
        dob=patient.dob,
        gender=patient.gender,
        encounters=enc_items,
        reports=report_items,
    )


@router.get("/{patient_id}/encounters", response_model=List[PatientEncounterItem])
async def get_patient_encounters(patient_id: str, db: Session = Depends(get_db)):
    """
    Returns historical encounters for a given patient.
    """
    patient = db.query(Patient).filter((Patient.id == patient_id) | (Patient.mrn == patient_id)).first()
    if not patient:
        ensure_demo_patients_seeded(db)
        patient = db.query(Patient).filter((Patient.id == patient_id) | (Patient.mrn == patient_id)).first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found.",
        )

    encounters = db.query(Encounter).filter(Encounter.patient_id == patient.id).order_by(Encounter.started_at.desc()).all()
    meta = DYNAMIC_PATIENT_METADATA.get(patient.id) or DYNAMIC_PATIENT_METADATA.get(patient.mrn) or next((item for item in DEFAULT_COHORT if item["id"] == patient.id or item["mrn"] == patient.mrn), {})
    vitals_dict = meta.get("vitals", {"bp": "120/80 mmHg", "hr": "72 bpm", "spo2": "98%", "temp": "98.6°F", "bmi": "24.5 kg/m²"})

    return [
        PatientEncounterItem(
            id=enc.id,
            patient_id=patient.id,
            encounter_type=enc.encounter_type,
            status=enc.status,
            started_at=enc.started_at.isoformat() if enc.started_at else None,
            ended_at=enc.ended_at.isoformat() if enc.ended_at else None,
            chief_complaint=meta.get("chief_complaint", "Clinical evaluation"),
            exam_room=meta.get("exam_room", "Exam Room 1"),
            vitals=PatientVitalsSchema(**vitals_dict),
        )
        for enc in encounters
    ]


@router.get("/{patient_id}/reports", response_model=List[ReportProvenanceResponse])
async def get_patient_reports(patient_id: str, db: Session = Depends(get_db)):
    """
    Returns all clinical reports for a patient with joined cryptographic provenance records.
    """
    patient = db.query(Patient).filter((Patient.id == patient_id) | (Patient.mrn == patient_id)).first()
    if not patient:
        ensure_demo_patients_seeded(db)
        patient = db.query(Patient).filter((Patient.id == patient_id) | (Patient.mrn == patient_id)).first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found.",
        )

    reports = db.query(ClinicalReport).filter(ClinicalReport.patient_id == patient.id).order_by(ClinicalReport.created_at.desc()).all()
    
    result: List[ReportProvenanceResponse] = []
    for rep in reports:
        prov = db.query(ProvenanceRecord).filter(ProvenanceRecord.report_id == rep.id).first()
        prov_dict = None
        if prov:
            prov_dict = {
                "cryptographic_signature": prov.cryptographic_signature,
                "content_sha256": prov.content_sha256,
                "model_weights_hash": prov.model_weights_hash,
                "signer_identity": prov.signer_identity,
                "evidence_manifest": prov.evidence_manifest,
                "created_at": prov.created_at.isoformat() if prov.created_at else None,
            }

        result.append(
            ReportProvenanceResponse(
                report_id=rep.id,
                patient_id=rep.patient_id,
                encounter_id=rep.encounter_id,
                report_type=rep.report_type,
                title=rep.title,
                findings=rep.findings,
                impression=rep.impression,
                raw_content=rep.raw_content,
                model_version=rep.model_version,
                provenance_hash=rep.provenance_hash,
                created_at=rep.created_at.isoformat() if rep.created_at else None,
                provenance=prov_dict,
            )
        )

    return result


@router.post("/{patient_id}/encounters", response_model=PatientEncounterItem)
async def create_patient_encounter(
    patient_id: str,
    payload: EncounterCreateRequest,
    db: Session = Depends(get_db),
):
    """
    Creates a new clinical encounter for a patient.
    """
    patient = db.query(Patient).filter((Patient.id == patient_id) | (Patient.mrn == patient_id)).first()
    if not patient:
        ensure_demo_patients_seeded(db)
        patient = db.query(Patient).filter((Patient.id == patient_id) | (Patient.mrn == patient_id)).first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found.",
        )

    new_enc = Encounter(
        id=f"ENC-{uuid.uuid4().hex[:8].upper()}",
        patient_id=patient.id,
        encounter_type=payload.encounter_type,
        status=payload.status,
        started_at=datetime.datetime.utcnow(),
    )
    db.add(new_enc)
    db.commit()
    db.refresh(new_enc)

    return PatientEncounterItem(
        id=new_enc.id,
        patient_id=patient.id,
        encounter_type=new_enc.encounter_type,
        status=new_enc.status,
        started_at=new_enc.started_at.isoformat(),
        chief_complaint=payload.chief_complaint,
        exam_room=payload.exam_room,
        vitals=payload.vitals or PatientVitalsSchema(),
    )


@router.delete("/{patient_id}")
async def delete_patient(
    patient_id: str,
    db: Session = Depends(get_db),
):
    """
    Permanently deletes a patient, cascading across encounters, clinical reports,
    cryptographic provenance records, and clinical knowledge graph triples.
    """
    patient = db.query(Patient).filter((Patient.id == patient_id) | (Patient.mrn == patient_id)).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found.",
        )

    pid = patient.id
    mrn = patient.mrn

    try:
        # 1. Cascade delete reports and provenance records
        reports = db.query(ClinicalReport).filter(
            (ClinicalReport.patient_id == pid) | (ClinicalReport.patient_id == mrn)
        ).all()
        for rep in reports:
            db.query(ProvenanceRecord).filter(ProvenanceRecord.report_id == rep.id).delete(synchronize_session=False)
            db.delete(rep)

        # 2. Cascade delete encounters
        db.query(Encounter).filter(
            (Encounter.patient_id == pid) | (Encounter.patient_id == mrn)
        ).delete(synchronize_session=False)

        # 3. Clean up Clinical Knowledge Graph triples via same session
        try:
            from sqlalchemy import text
            db.execute(text("DELETE FROM graph_nodes WHERE id = :id OR id = :mrn"), {"id": pid, "mrn": mrn})
            db.execute(text("DELETE FROM graph_edges WHERE source_id = :id OR target_id = :id OR source_id = :mrn OR target_id = :mrn"), {"id": pid, "mrn": mrn})
        except Exception as graph_err:
            logger.debug(f"Graph triple deletion note: {graph_err}")

        # 4. Remove patient record
        db.delete(patient)
        db.commit()

        # In-memory graph manager cleanup
        try:
            from backend.database.graph_store import get_graph_store
            store = get_graph_store()
            if hasattr(store.manager, "_memory_graph"):
                if store.manager._memory_graph.has_node(pid):
                    store.manager._memory_graph.remove_node(pid)
                if store.manager._memory_graph.has_node(mrn):
                    store.manager._memory_graph.remove_node(mrn)
        except Exception:
            pass

        # 5. Evict from in-memory cache
        DYNAMIC_PATIENT_METADATA.pop(pid, None)
        DYNAMIC_PATIENT_METADATA.pop(mrn, None)

        # 6. Delete any disk uploads associated with this patient
        try:
            import shutil
            uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/uploads"))
            for target_name in [pid, mrn, f"UPLOAD-{pid}", f"UPLOAD-{mrn}"]:
                target_path = os.path.join(uploads_dir, target_name)
                if os.path.isdir(target_path):
                    shutil.rmtree(target_path, ignore_errors=True)
        except Exception as fs_err:
            logger.debug(f"Uploads deletion note: {fs_err}")

        logger.info(f"Patient '{pid}' ({mrn}) permanently deleted from sovereign vault.")
        return {
            "status": "deleted",
            "patient_id": pid,
            "mrn": mrn,
            "message": f"Patient '{pid}' and all associated clinical encounters, reports, and provenance records permanently purged.",
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete patient '{patient_id}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error during patient deletion: {str(e)}",
        )

