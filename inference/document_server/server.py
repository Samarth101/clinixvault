"""
ClinixVault Document Parsing Microservice (Port 8004).
Parses clinical PDFs, executes OCR on scanned notes, and segments medical narratives
into MedSpaCy-compatible clinical sections.
"""

import os
import sys
import io
import time
import base64
import tempfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from PIL import Image

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from inference.shared.config import settings
from inference.shared.logger import get_logger
from inference.shared.health import create_health_router
from inference.shared.metrics import setup_microservice_metrics, record_inference_metrics
from inference.document_server.schemas import (
    DocumentParseRequest,
    DocumentParseResponse,
    OCRRequest,
    OCRResponse,
)
from inference.document_server.pdf_parser import get_pdf_parser
from inference.document_server.ocr_engine import get_ocr_engine
from inference.document_server.section_detector import get_section_detector

logger = get_logger("clinixvault.document_server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing ClinixVault Document Parsing Server...")
    _ = get_pdf_parser()
    _ = get_ocr_engine()
    _ = get_section_detector()
    yield
    logger.info("Document Parsing Server shutting down.")


app = FastAPI(
    title="ClinixVault Document Parsing Service",
    version="1.0.0",
    description="Air-gapped edge microservice for clinical PDF parsing, OCR, and MedSpaCy section extraction",
    lifespan=lifespan,
)

app.include_router(create_health_router("document-service"))
setup_microservice_metrics(app, "document-server")


@app.post("/parse_document", response_model=DocumentParseResponse)
async def parse_clinical_document(request: DocumentParseRequest):
    start_time = time.time()
    pdf_parser = get_pdf_parser()
    ocr_engine = get_ocr_engine()
    section_detector = get_section_detector()

    pdf_bytes = None
    if request.document_base64:
        try:
            pdf_bytes = base64.b64decode(request.document_base64)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid base64 document string: {str(e)}",
            )
    elif request.file_path:
        if not os.path.exists(request.file_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File not found at path: {request.file_path}",
            )
        with open(request.file_path, "rb") as f:
            pdf_bytes = f.read()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either 'document_base64' or 'file_path' must be provided.",
        )

    # Extract text using PyMuPDF / pypdf
    text, total_pages, is_scanned, parser_used = pdf_parser.parse_pdf(pdf_bytes)

    # If document is scanned and OCR fallback is enabled
    if is_scanned and request.enable_ocr_fallback:
        logger.info("Scanned document detected. Engaging OCR fallback engine...")
        try:
            rendered_pages = pdf_parser.render_pages_to_images(pdf_bytes, max_pages=5)
            ocr_page_texts = []
            for page_img in rendered_pages:
                page_text, _ = ocr_engine.extract_text_from_image(page_img)
                if page_text:
                    ocr_page_texts.append(page_text)

            if ocr_page_texts:
                combined_ocr = "\n\n".join(ocr_page_texts)
                text = (text + "\n\n" + combined_ocr).strip() if text else combined_ocr
                parser_used += "+TesseractOCR"
        except Exception as e:
            logger.warning(f"OCR fallback encountered error: {e}")

    sections = section_detector.detect_sections(text)
    flowsheet = pdf_parser.extract_lab_flowsheet(text)
    latency_ms = round((time.time() - start_time) * 1000, 2)
    record_inference_metrics(
        service="document-server",
        model=parser_used,
        task="clinical_pdf_parse",
        duration_seconds=latency_ms / 1000.0,
        token_count=len(text.split()),
        status="success",
    )

    return DocumentParseResponse(
        total_pages=total_pages,
        extracted_text=text,
        sections=sections,
        flowsheet=flowsheet,
        is_scanned=is_scanned,
        parser_used=parser_used,
        latency_ms=latency_ms,
    )


@app.post("/ocr_image", response_model=OCRResponse)
async def ocr_image_endpoint(request: OCRRequest):
    start_time = time.time()
    ocr_engine = get_ocr_engine()

    image = None
    if request.image_base64:
        try:
            img_bytes = base64.b64decode(request.image_base64)
            image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid base64 image data: {str(e)}",
            )
    elif request.image_path:
        if not os.path.exists(request.image_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Image file not found at: {request.image_path}",
            )
        image = Image.open(request.image_path).convert("RGB")
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either 'image_base64' or 'image_path' must be provided.",
        )

    text, conf = ocr_engine.extract_text_from_image(image, lang=request.lang)
    latency_ms = round((time.time() - start_time) * 1000, 2)

    return OCRResponse(text=text, confidence=conf, latency_ms=latency_ms)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.DOCUMENT_HOST, port=settings.DOCUMENT_PORT)
