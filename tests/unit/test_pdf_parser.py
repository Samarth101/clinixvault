"""
Unit Tests for PDF Parser, OCR Engine, and Clinical Section Detection.
"""

import pytest
from PIL import Image
from inference.document_server.pdf_parser import get_pdf_parser
from inference.document_server.ocr_engine import get_ocr_engine
from inference.document_server.section_detector import get_section_detector


def test_pdf_parser_blank_document(sample_clinical_pdf_bytes):
    parser = get_pdf_parser()
    text, total_pages, is_scanned, parser_used = parser.parse_pdf(sample_clinical_pdf_bytes)

    assert total_pages == 1
    assert isinstance(text, str)
    assert isinstance(is_scanned, bool)
    assert parser_used in ["PyMuPDF", "pypdf", "raw_fallback"]


def test_ocr_engine_processing():
    ocr = get_ocr_engine()
    img = Image.new("RGB", (400, 200), color=(255, 255, 255))
    text, confidence = ocr.extract_text_from_image(img)

    assert isinstance(text, str)
    assert 0.0 <= confidence <= 1.0


def test_section_detector():
    detector = get_section_detector()
    clinical_note = """
    CHIEF COMPLAINT:
    Severe chest pain radiating to left arm.

    HISTORY OF PRESENT ILLNESS:
    Patient is a 55-year-old male with sudden onset pressure-like chest pain.

    PAST MEDICAL HISTORY:
    Hypertension, Type 2 Diabetes.

    ASSESSMENT AND PLAN:
    Rule out acute coronary syndrome. Perform troponin serial assays.
    """

    sections = detector.detect_sections(clinical_note)
    assert len(sections) >= 3

    titles = [s.title for s in sections]
    assert "CHIEF_COMPLAINT" in titles
    assert "HISTORY_PRESENT_ILLNESS" in titles
    assert "ASSESSMENT_AND_PLAN" in titles

    cc = next(s for s in sections if s.title == "CHIEF_COMPLAINT")
    assert "Severe chest pain" in cc.content
