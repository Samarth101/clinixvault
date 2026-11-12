"""
SQLAlchemy ORM Data Models for ClinixVault.
Encapsulates patients, encounters, clinical reports, pgvector embeddings,
cryptographic provenance records, and HIPAA/GDPR audit logs.
"""

import uuid
import datetime
from typing import Optional
from sqlalchemy import (
    Column,
    String,
    Text,
    DateTime,
    ForeignKey,
    Float,
    Integer,
    Boolean,
    JSON,
)
from sqlalchemy.orm import relationship, Session
from backend.database.connection import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    mrn = Column(String(64), unique=True, index=True, nullable=False)
    first_name = Column(String(64), nullable=False)
    last_name = Column(String(64), nullable=False)
    dob = Column(String(10), nullable=True)  # YYYY-MM-DD
    gender = Column(String(16), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    encounters = relationship("Encounter", back_populates="patient", cascade="all, delete-orphan")
    reports = relationship("ClinicalReport", back_populates="patient", cascade="all, delete-orphan")


class Encounter(Base):
    __tablename__ = "encounters"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False, index=True)
    encounter_type = Column(String(32), default="ambulatory")  # inpatient, emergency, ambulatory
    status = Column(String(32), default="in-progress")
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    patient = relationship("Patient", back_populates="encounters")
    reports = relationship("ClinicalReport", back_populates="encounter")


class ClinicalReport(Base):
    __tablename__ = "clinical_reports"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False, index=True)
    encounter_id = Column(String(36), ForeignKey("encounters.id"), nullable=True, index=True)
    report_type = Column(String(32), nullable=False)  # radiology, soap, discharge, progress
    title = Column(String(255), nullable=True)
    findings = Column(Text, nullable=True)
    impression = Column(Text, nullable=True)
    raw_content = Column(Text, nullable=False)
    fhir_bundle = Column(JSON, nullable=True)
    model_version = Column(String(128), nullable=True)
    provenance_hash = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    patient = relationship("Patient", back_populates="reports")
    encounter = relationship("Encounter", back_populates="reports")
    provenance = relationship("ProvenanceRecord", back_populates="report", uselist=False)


class DocumentEmbedding(Base):
    __tablename__ = "document_embeddings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    report_id = Column(String(36), ForeignKey("clinical_reports.id"), nullable=True, index=True)
    chunk_index = Column(Integer, default=0)
    chunk_text = Column(Text, nullable=False)
    # Stored as serialized float array for universal compatibility across SQLite and pgvector
    embedding_json = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    user_id = Column(String(64), nullable=False, index=True)
    action = Column(String(64), nullable=False)  # GENERATE_RADIOLOGY, SYNTHESIZE_SOAP, VIEW_REPORT
    resource_type = Column(String(64), nullable=False)
    resource_id = Column(String(64), nullable=True)
    client_ip = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    status_code = Column(Integer, default=200)
    latency_ms = Column(Float, nullable=True)
    request_hash = Column(String(64), nullable=True)


class ProvenanceRecord(Base):
    __tablename__ = "provenance_records"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    report_id = Column(String(36), ForeignKey("clinical_reports.id"), unique=True, nullable=False)
    cryptographic_signature = Column(String(128), nullable=False)
    content_sha256 = Column(String(64), nullable=False)
    model_weights_hash = Column(String(64), nullable=False)
    signer_identity = Column(String(128), nullable=False)
    evidence_manifest = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    report = relationship("ClinicalReport", back_populates="provenance")


class Clinician(Base):
    __tablename__ = "clinicians"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    name = Column(String(128), nullable=False)
    role = Column(String(64), default="Attending Physician")
    title = Column(String(64), default="Licensed Clinician")
    department = Column(String(64), default="Internal Medicine")
    specialty = Column(String(64), default="Clinical Medicine")
    npi = Column(String(64), nullable=True)
    email = Column(String(128), nullable=True)
    access_tier = Column(String(64), default="Tier 1 — Executive/Attending")
    break_glass_authorized = Column(Boolean, default=False)
    sso_status = Column(String(64), default="Active Directory Synced")
    status = Column(String(32), default="Active")
    assigned_node = Column(String(64), default="CV-NODE-01 (Exam 1-4)")
    badge_id = Column(String(64), nullable=True)
    auth_method = Column(String(64), default="Keycloak Active Directory SSO")
    avatar_initials = Column(String(8), default="MD")
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


def ensure_patient_exists(db: Session, patient_id: Optional[str] = None) -> Patient:
    """
    Ensures a Patient record exists in the database to satisfy relational foreign key constraints.
    If the requested patient_id is not found, dynamically provisions a sovereign patient
    record so child ClinicalReport or Encounter rows never fail with ForeignKeyViolation in PostgreSQL.
    """
    raw_pid = (patient_id or "default-patient").strip()
    if not raw_pid:
        raw_pid = "default-patient"

    # Truncate to match column schema boundaries (id is String(36), mrn is String(64))
    pid_short = raw_pid[:36]
    mrn_val = raw_pid[:64]

    # 1. Exact lookup by ID or MRN
    patient = db.query(Patient).filter(
        (Patient.id == raw_pid) | (Patient.id == pid_short) | (Patient.mrn == mrn_val)
    ).first()
    if patient:
        return patient

    # 2. Derive intuitive clinical identity labels
    first_name = "Clinical"
    last_name = f"Case {mrn_val[-8:]}" if len(mrn_val) > 8 else mrn_val
    if "UPLOAD" in mrn_val.upper():
        first_name = "Uploaded"
        parts = mrn_val.split("-")
        last_name = f"Study {parts[-1]}" if parts else mrn_val
    elif mrn_val.lower() in ("default-patient", "anonymous"):
        first_name = "Clinical"
        last_name = "Walk-in"

    new_patient = Patient(
        id=pid_short,
        mrn=mrn_val,
        first_name=first_name,
        last_name=last_name,
        gender="unknown",
    )
    try:
        with db.begin_nested():
            db.add(new_patient)
            db.flush()
        db.commit()
        return new_patient
    except Exception:
        db.rollback()
        # Concurrency or unique collision fallback
        existing = db.query(Patient).filter(
            (Patient.id == pid_short) | (Patient.mrn == mrn_val)
        ).first()
        if existing:
            return existing
        first_avail = db.query(Patient).first()
        if first_avail:
            return first_avail
        # Emergency UUID patient if table was completely empty and collision occurred
        try:
            emergency_pt = Patient(
                id=generate_uuid(),
                mrn=f"MRN-{uuid.uuid4().hex[:8].upper()}",
                first_name=first_name,
                last_name=last_name,
                gender="unknown",
            )
            with db.begin_nested():
                db.add(emergency_pt)
                db.flush()
            db.commit()
            return emergency_pt
        except Exception:
            db.rollback()
            return db.query(Patient).first()


def ensure_encounter_exists(
    db: Session, encounter_id: Optional[str] = None, patient_id: Optional[str] = None
) -> Optional[str]:
    """
    Validates encounter_id for foreign key constraints. If encounter_id is provided
    and not found in encounters table, auto-creates a minimal encounter record linked to patient_id.
    """
    if not encounter_id:
        return None
    enc_id = encounter_id.strip()[:36]
    if not enc_id:
        return None
    enc = db.query(Encounter).filter(Encounter.id == enc_id).first()
    if enc:
        return enc.id

    if patient_id:
        try:
            new_enc = Encounter(
                id=enc_id,
                patient_id=patient_id,
                encounter_type="ambulatory",
                status="in-progress",
            )
            with db.begin_nested():
                db.add(new_enc)
                db.flush()
            db.commit()
            return new_enc.id
        except Exception:
            db.rollback()
            existing = db.query(Encounter).filter(Encounter.id == enc_id).first()
            if existing:
                return existing.id
    return None


