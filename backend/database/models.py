"""
SQLAlchemy ORM Data Models for ClinixVault.
Encapsulates patients, encounters, clinical reports, pgvector embeddings,
cryptographic provenance records, and HIPAA/GDPR audit logs.
"""

import uuid
import datetime
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
from sqlalchemy.orm import relationship
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
