"""
Pytest Test Fixtures and Test Harness for ClinixVault.
Provides in-memory SQLite database, FastAPI TestClients, sample DICOM/PNG images,
synthetic clinical notes, and JWT authorization headers.
"""

import os
import sys
import io
import base64
import wave
import struct
import pytest
from PIL import Image
from fastapi.testclient import TestClient

import tempfile
import uuid

# Ensure root package is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Isolate test SQLite database and graph to prevent test pollution of clinixvault_edge.db
_test_db_file = os.path.join(tempfile.gettempdir(), f"clinixvault_test_db_{uuid.uuid4().hex[:8]}.db")
_test_graph_file = os.path.join(tempfile.gettempdir(), f"clinixvault_test_graph_{uuid.uuid4().hex[:8]}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db_file}"
os.environ["GRAPH_SQLITE_PATH"] = _test_graph_file
os.environ["SQLITE_GRAPH_PATH"] = _test_graph_file

from backend.database.connection import Base, engine, SessionLocal
from backend.database.models import Patient
from backend.gateway.main import app as gateway_app
from backend.gateway.middleware.auth import create_access_token


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    # Cleanup test db and graph files
    try:
        if os.path.exists(_test_db_file):
            os.remove(_test_db_file)
        if os.path.exists(_test_graph_file):
            os.remove(_test_graph_file)
    except Exception:
        pass


@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def test_patient(db_session):
    p = db_session.query(Patient).filter(Patient.mrn == "MRN-VAL-999").first()
    if not p:
        p = Patient(
            id="test-patient-uuid-1",
            mrn="MRN-VAL-999",
            first_name="Clinical",
            last_name="TestCohort",
            dob="1980-05-15",
            gender="female",
        )
        db_session.add(p)
        db_session.commit()
        db_session.refresh(p)
    return p


@pytest.fixture
def auth_headers():
    token = create_access_token(user_id="test-physician-01", role="physician")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def gateway_client():
    return TestClient(gateway_app)


@pytest.fixture
def sample_cxr_image_bytes():
    img = Image.new("RGB", (256, 256), color=(30, 30, 30))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def sample_cxr_base64(sample_cxr_image_bytes):
    return base64.b64encode(sample_cxr_image_bytes).decode("utf-8")


@pytest.fixture
def sample_audio_wav_path(tmp_path):
    wav_path = str(tmp_path / "test_ambient.wav")
    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        # 1 second of silence / tone
        samples = [int(1000 * struct.unpack("h", b"\x00\x00")[0]) for _ in range(16000)]
        packed = struct.pack(f"<{len(samples)}h", *samples)
        wf.writeframes(packed)
    return wav_path


@pytest.fixture
def sample_clinical_pdf_bytes():
    from pypdf import PdfWriter
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()
