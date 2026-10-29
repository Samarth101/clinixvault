"""
Load Testing Scenarios and Synthetic Data Generators for Locust.
"""

import base64
import io
from PIL import Image

# Pre-generate lightweight 256x256 test image base64
_buf = io.BytesIO()
Image.new("RGB", (256, 256), color=(40, 40, 40)).save(_buf, format="JPEG")
SAMPLE_CXR_BASE64 = base64.b64encode(_buf.getvalue()).decode("utf-8")

RADIOLOGY_SCENARIOS = [
    {
        "patient_id": "load-patient-001",
        "image_base64": SAMPLE_CXR_BASE64,
        "clinical_indication": "Shortness of breath, rule out pleural effusion.",
        "projection": "PA",
    },
    {
        "patient_id": "load-patient-002",
        "image_base64": SAMPLE_CXR_BASE64,
        "clinical_indication": "Fever, chills, persistent productive cough.",
        "projection": "AP",
    },
    {
        "patient_id": "load-patient-003",
        "image_base64": SAMPLE_CXR_BASE64,
        "clinical_indication": "Routine pre-operative clearance evaluation.",
        "projection": "PA",
    },
]

SUMMARIZATION_SCENARIOS = [
    {
        "patient_id": "load-patient-001",
        "clinical_text": (
            "Patient presented with sharp pleuritic chest pain. Electrocardiogram was normal sinus rhythm. "
            "Troponin negative times three. D-dimer normal. Discharged with diagnosis of musculoskeletal pain. "
            "Instructed to take ibuprofen with meals."
        ),
        "summary_type": "discharge",
    },
    {
        "patient_id": "load-patient-002",
        "clinical_text": (
            "Day 2 post exploratory laparotomy. Patient tolerating clear liquid diet. Surgical incisions "
            "clean, intact, without erythema. Ambulated in hallway twice today. Pain controlled on oral analgesics."
        ),
        "summary_type": "progress",
    },
]
