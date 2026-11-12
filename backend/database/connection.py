"""
Database Connection Management & Session Pooling for ClinixVault.
Supports PostgreSQL with pgvector extension, with automated SQLite fallback
for offline testing and development.
"""

import os
import sys
import datetime
from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base, Session

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from inference.shared.config import settings
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.database")

Base = declarative_base()


def get_engine():
    db_url = os.getenv("DATABASE_URL") or settings.DATABASE_URL
    if db_url and db_url.startswith("sqlite"):
        engine = create_engine(db_url, connect_args={"check_same_thread": False})
        logger.info(f"Connected to SQLite database at {db_url}")
        return engine

    # Check if PostgreSQL is available or if fallback SQLite should be used
    if "postgresql" in db_url:
        try:
            engine = create_engine(
                db_url,
                pool_size=settings.POOL_SIZE,
                max_overflow=settings.MAX_OVERFLOW,
                echo=settings.SQL_DEBUG,
                connect_args={"connect_timeout": 3},
            )
            # Verify connectivity
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                # Try creating pgvector extension if postgres
                try:
                    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                    conn.commit()
                except Exception as ext_err:
                    logger.info(f"pgvector extension check/creation notice: {ext_err}")
            logger.info("Connected to PostgreSQL database.")
            return engine
        except Exception as e:
            logger.warning(
                f"PostgreSQL unreachable at {db_url} ({e}). "
                "Engaging edge SQLite fallback database."
            )

    # SQLite fallback
    fallback_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "clinixvault_edge.db"))
    fallback_url = f"sqlite:///{fallback_path}"
    engine = create_engine(fallback_url, connect_args={"check_same_thread": False})
    logger.info(f"Connected to edge SQLite database at {fallback_url}")
    return engine


engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initializes tables in database and auto-seeds baseline clinical scenarios if empty."""
    Base.metadata.create_all(bind=engine)
    logger.info("Database schemas initialized.")

    db = SessionLocal()
    try:
        from backend.database.models import Patient, Encounter
        if db.query(Patient).count() == 0:
            logger.info("Database empty on boot. Auto-seeding core clinical patient encounters...")
            seed_data = [
                {
                    "id": "PT-ROSTER-001",
                    "mrn": "MRN-847291",
                    "first_name": "Liam",
                    "last_name": "Cooper",
                    "dob": "1972-04-15",
                    "gender": "male",
                    "chief_complaint": "Acute exacerbation of CHF, exertional dyspnea, bilateral pitting ankle edema",
                    "exam_room": "Cardiology Suite 3",
                    "vitals": {"bp": "142/88 mmHg", "hr": "84 bpm", "spo2": "94%", "temp": "98.4°F", "bmi": "28.1 kg/m²"}
                },
                {
                    "id": "PT-ROSTER-002",
                    "mrn": "MRN-619403",
                    "first_name": "Sarah",
                    "last_name": "Jenkins",
                    "dob": "1988-11-22",
                    "gender": "female",
                    "chief_complaint": "Persistent productive cough, right pleuritic chest pain, tactile fevers",
                    "exam_room": "Pulmonology Clinic 1",
                    "vitals": {"bp": "118/76 mmHg", "hr": "78 bpm", "spo2": "97%", "temp": "100.8°F", "bmi": "23.4 kg/m²"}
                },
                {
                    "id": "PT-ROSTER-003",
                    "mrn": "MRN-392817",
                    "first_name": "Elena",
                    "last_name": "Rostova",
                    "dob": "1965-08-30",
                    "gender": "female",
                    "chief_complaint": "Follow-up for type 2 diabetes mellitus, recurrent morning hypoglycemia",
                    "exam_room": "Endocrinology Room 2",
                    "vitals": {"bp": "126/80 mmHg", "hr": "68 bpm", "spo2": "99%", "temp": "98.6°F", "bmi": "25.8 kg/m²"}
                },
                {
                    "id": "PT-ROSTER-004",
                    "mrn": "MRN-520184",
                    "first_name": "Marcus",
                    "last_name": "Chen",
                    "dob": "1995-02-14",
                    "gender": "male",
                    "chief_complaint": "Post-fall right wrist trauma, swelling and reduced range of motion",
                    "exam_room": "Urgent Care Bay A",
                    "vitals": {"bp": "122/78 mmHg", "hr": "70 bpm", "spo2": "99%", "temp": "98.2°F", "bmi": "22.6 kg/m²"}
                }
            ]

            try:
                from backend.gateway.routes.patients import DYNAMIC_PATIENT_METADATA
            except Exception:
                DYNAMIC_PATIENT_METADATA = {}

            for item in seed_data:
                p = Patient(
                    id=item["id"],
                    mrn=item["mrn"],
                    first_name=item["first_name"],
                    last_name=item["last_name"],
                    dob=item["dob"],
                    gender=item["gender"]
                )
                db.add(p)
                enc = Encounter(
                    id=f"ENC-{item['id']}",
                    patient_id=item["id"],
                    encounter_type="ambulatory",
                    status="In Progress",
                    started_at=datetime.datetime.utcnow()
                )
                db.add(enc)
                meta_dict = {
                    "id": item["id"],
                    "mrn": item["mrn"],
                    "first_name": item["first_name"],
                    "last_name": item["last_name"],
                    "dob": item["dob"],
                    "gender": item["gender"],
                    "chief_complaint": item["chief_complaint"],
                    "exam_room": item["exam_room"],
                    "status": "In Progress",
                    "vitals": item["vitals"]
                }
                DYNAMIC_PATIENT_METADATA[item["id"]] = meta_dict
                DYNAMIC_PATIENT_METADATA[item["mrn"]] = meta_dict

            db.commit()
            logger.info(f"Successfully auto-seeded {len(seed_data)} clinical encounters into database.")
    except Exception as e:
        logger.warning(f"Error during auto-seeding baseline encounters: {e}")
        db.rollback()
    finally:
        db.close()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a transactional database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
