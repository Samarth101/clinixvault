"""
Unit Tests for Scanned PDF Page Rasterization and OCR Processing.
Verifies real page rendering via PyMuPDF/fitz and document server OCR fallback.
"""

import io
import pytest
from PIL import Image
from pypdf import PdfWriter
from fastapi.testclient import TestClient

from inference.document_server.pdf_parser import get_pdf_parser
from inference.document_server.server import app as doc_app


def test_pdf_parser_render_pages_to_images(sample_clinical_pdf_bytes):
    parser = get_pdf_parser()
    images = parser.render_pages_to_images(sample_clinical_pdf_bytes, max_pages=3)
    if parser.has_pymupdf:
        assert len(images) >= 1
        assert isinstance(images[0], Image.Image)
        assert images[0].size[0] > 0
        assert images[0].size[1] > 0


def test_document_server_scanned_pdf_ocr_endpoint(sample_clinical_pdf_bytes):
    import base64
    client = TestClient(doc_app)
    b64_pdf = base64.b64encode(sample_clinical_pdf_bytes).decode("utf-8")

    response = client.post(
        "/parse_document",
        json={"document_base64": b64_pdf, "enable_ocr_fallback": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_pages"] == 1
    assert data["is_scanned"] is True
    assert "parser_used" in data
