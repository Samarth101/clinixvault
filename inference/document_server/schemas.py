"""
Pydantic Schemas for Clinical Document Parsing Microservice.
"""

from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field


class ClinicalSection(BaseModel):
    title: str = Field(description="Normalized section header: e.g. CHIEF_COMPLAINT, HISTORY_PRESENT_ILLNESS")
    original_header: str
    content: str
    char_start: int
    char_end: int


class DocumentParseRequest(BaseModel):
    document_base64: Optional[str] = Field(default=None, description="Base64 encoded PDF or TIFF")
    file_path: Optional[str] = Field(default=None, description="Server filepath to clinical document")
    enable_ocr_fallback: bool = Field(default=True, description="Run OCR if digital text layer is empty")


class LabFlowsheetItem(BaseModel):
    test_name: str
    value: Any
    value_raw: str
    unit: str
    reference_range: str
    flag: str = "NORMAL"
    is_abnormal: bool = False
    associated_condition: Optional[str] = None
    bounding_box: Optional[List[float]] = None
    page_number: int = 1


class DocumentParseResponse(BaseModel):
    total_pages: int
    extracted_text: str
    sections: List[ClinicalSection]
    flowsheet: List[LabFlowsheetItem] = Field(default_factory=list, description="Structured clinical laboratory test flowsheet")
    is_scanned: bool
    parser_used: str
    latency_ms: float


class OCRRequest(BaseModel):
    image_base64: Optional[str] = None
    image_path: Optional[str] = None
    lang: str = "eng"


class OCRResponse(BaseModel):
    text: str
    confidence: float
    latency_ms: float
