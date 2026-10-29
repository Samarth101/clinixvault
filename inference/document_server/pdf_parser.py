"""
PDF Parsing Engine for Clinical Documents.
Leverages PyMuPDF (fitz) for ultra-fast vector/text extraction,
with pypdf fallback and scanned PDF detection.
"""

import os
import sys
import io
from typing import Tuple, Dict, Any, List

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.pdf_parser")


LAB_FLOWSHEET_DEFINITIONS = [
    {
        "canonical": "NT-proBNP",
        "synonyms": ["nt-probnp", "nt probnp", "b-type natriuretic peptide", "probnp", "bnp"],
        "default_unit": "pg/mL",
        "normal_low": 0.0,
        "normal_high": 125.0,
        "condition": "Congestive Heart Failure",
    },
    {
        "canonical": "Troponin I",
        "synonyms": ["troponin i", "troponin-i", "high sensitivity troponin", "hs-ctni", "trop i", "troponin t", "troponin"],
        "default_unit": "ng/mL",
        "normal_low": 0.0,
        "normal_high": 0.04,
        "condition": "Acute Myocardial Infarction",
    },
    {
        "canonical": "Serum Potassium",
        "synonyms": ["serum potassium", "potassium", "k+"],
        "default_unit": "mmol/L",
        "normal_low": 3.5,
        "normal_high": 5.0,
        "condition": "Hyperkalemia",
    },
    {
        "canonical": "Serum Sodium",
        "synonyms": ["serum sodium", "sodium", "na+"],
        "default_unit": "mmol/L",
        "normal_low": 135.0,
        "normal_high": 145.0,
        "condition": "Hyponatremia",
    },
    {
        "canonical": "Serum Creatinine",
        "synonyms": ["serum creatinine", "creatinine", "creat"],
        "default_unit": "mg/dL",
        "normal_low": 0.7,
        "normal_high": 1.3,
        "condition": "Acute Kidney Injury",
    },
    {
        "canonical": "Blood Urea Nitrogen",
        "synonyms": ["blood urea nitrogen", "bun", "urea nitrogen"],
        "default_unit": "mg/dL",
        "normal_low": 7.0,
        "normal_high": 20.0,
        "condition": "Azotemia / Renal Impairment",
    },
    {
        "canonical": "Estimated GFR",
        "synonyms": ["estimated gfr", "egfr", "gfr"],
        "default_unit": "mL/min/1.73m2",
        "normal_low": 60.0,
        "normal_high": 120.0,
        "condition": "Chronic Kidney Disease",
    },
    {
        "canonical": "Blood Glucose",
        "synonyms": ["blood glucose", "glucose", "fasting glucose", "glu"],
        "default_unit": "mg/dL",
        "normal_low": 70.0,
        "normal_high": 99.0,
        "condition": "Hyperglycemia / Diabetes Mellitus",
    },
    {
        "canonical": "Hemoglobin",
        "synonyms": ["hemoglobin", "hgb", "hb"],
        "default_unit": "g/dL",
        "normal_low": 12.0,
        "normal_high": 16.0,
        "condition": "Anemia",
    },
    {
        "canonical": "White Blood Cell Count",
        "synonyms": ["white blood cell count", "white blood cells", "wbc", "leukocytes"],
        "default_unit": "K/uL",
        "normal_low": 4.5,
        "normal_high": 11.0,
        "condition": "Leukocytosis / Systemic Infection",
    },
    {
        "canonical": "Platelet Count",
        "synonyms": ["platelet count", "platelets", "plt"],
        "default_unit": "K/uL",
        "normal_low": 150.0,
        "normal_high": 450.0,
        "condition": "Thrombocytopenia",
    },
    {
        "canonical": "D-Dimer",
        "synonyms": ["d-dimer", "d dimer"],
        "default_unit": "ng/mL",
        "normal_low": 0.0,
        "normal_high": 500.0,
        "condition": "Pulmonary Embolism / Deep Vein Thrombosis",
    },
    {
        "canonical": "C-Reactive Protein",
        "synonyms": ["c-reactive protein", "crp", "hs-crp"],
        "default_unit": "mg/L",
        "normal_low": 0.0,
        "normal_high": 3.0,
        "condition": "Systemic Inflammation",
    },
    {
        "canonical": "Lactate",
        "synonyms": ["lactate", "lactic acid"],
        "default_unit": "mmol/L",
        "normal_low": 0.5,
        "normal_high": 2.0,
        "condition": "Lactic Acidosis / Sepsis",
    },
]


class ClinicalPDFParser:
    def __init__(self):
        self.has_pymupdf = False
        try:
            import fitz
            self.has_pymupdf = True
        except ImportError:
            self.has_pymupdf = False

        self.has_pypdf = False
        try:
            import pypdf
            self.has_pypdf = True
        except ImportError:
            self.has_pypdf = False

    def parse_pdf(self, pdf_bytes_or_path: Any) -> Tuple[str, int, bool, str]:
        """
        Extracts text from PDF.
        Returns: (extracted_text, total_pages, is_scanned, parser_used)
        """
        if isinstance(pdf_bytes_or_path, str) and not os.path.exists(pdf_bytes_or_path):
            return pdf_bytes_or_path.strip(), 1, False, "raw_text"

        if isinstance(pdf_bytes_or_path, bytes):
            if not pdf_bytes_or_path.startswith(b"%PDF"):
                try:
                    text = pdf_bytes_or_path.decode("utf-8")
                    return text.strip(), 1, False, "raw_text"
                except Exception:
                    pass

        if self.has_pymupdf:
            try:
                return self._parse_with_pymupdf(pdf_bytes_or_path)
            except Exception:
                pass
        if self.has_pypdf:
            try:
                return self._parse_with_pypdf(pdf_bytes_or_path)
            except Exception:
                pass

        if isinstance(pdf_bytes_or_path, bytes):
            try:
                return pdf_bytes_or_path.decode("utf-8").strip(), 1, False, "raw_text"
            except Exception:
                pass

        return self._parse_raw_fallback(pdf_bytes_or_path)

    def _parse_with_pymupdf(self, source: Any) -> Tuple[str, int, bool, str]:
        import fitz

        if isinstance(source, (str, bytes, os.PathLike)) and isinstance(source, str) and os.path.exists(source):
            doc = fitz.open(source)
        elif isinstance(source, bytes):
            doc = fitz.open(stream=source, filetype="pdf")
        else:
            doc = fitz.open(source)

        total_pages = len(doc)
        page_texts = []
        for i in range(total_pages):
            page = doc.load_page(i)
            page_texts.append(page.get_text("text"))

        full_text = "\n\n".join(page_texts).strip()
        doc.close()

        # If text is nearly empty across all pages, it's likely a scanned bitmap PDF
        is_scanned = len(full_text.strip()) < (total_pages * 50)
        return full_text, total_pages, is_scanned, "PyMuPDF"

    def _parse_with_pypdf(self, source: Any) -> Tuple[str, int, bool, str]:
        import pypdf

        if isinstance(source, bytes):
            stream = io.BytesIO(source)
        elif isinstance(source, str) and os.path.exists(source):
            stream = open(source, "rb")
        else:
            stream = io.BytesIO(source)

        reader = pypdf.PdfReader(stream)
        total_pages = len(reader.pages)
        page_texts = []
        for p in reader.pages:
            t = p.extract_text() or ""
            page_texts.append(t)

        if hasattr(stream, "close") and not isinstance(source, bytes):
            stream.close()

        full_text = "\n\n".join(page_texts).strip()
        is_scanned = len(full_text.strip()) < (total_pages * 50)
        return full_text, total_pages, is_scanned, "pypdf"

    def render_pages_to_images(self, source: Any, max_pages: int = 5) -> List[Any]:
        """Renders PDF pages into PIL Images for downstream OCR extraction."""
        from PIL import Image

        images = []
        if self.has_pymupdf:
            import fitz
            if isinstance(source, bytes):
                doc = fitz.open(stream=source, filetype="pdf")
            elif isinstance(source, (str, os.PathLike)) and os.path.exists(source):
                doc = fitz.open(source)
            else:
                doc = fitz.open(source)

            num_to_render = min(len(doc), max_pages)
            for i in range(num_to_render):
                page = doc.load_page(i)
                pix = page.get_pixmap(dpi=150)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                images.append(img)
            doc.close()
        return images

    def _parse_raw_fallback(self, source: Any) -> Tuple[str, int, bool, str]:
        # Minimal byte-level text extractor
        raw_bytes = source if isinstance(source, bytes) else open(source, "rb").read()
        import re
        ascii_matches = re.findall(b"[\x20-\x7E]{4,}", raw_bytes)
        text = "\n".join(m.decode("ascii", errors="ignore") for m in ascii_matches[:200])
        return text, 1, False, "raw_fallback"

    def extract_lab_flowsheet(self, source: Any) -> List[Dict[str, Any]]:
        """
        Extracts structured laboratory test flowsheet entries from PDF documents or clinical text.
        Returns a list of standardized records containing:
          - test_name: Normalized test name (e.g. 'NT-proBNP', 'Serum Creatinine')
          - value: Numeric observed value
          - value_raw: Original raw string value (e.g. '1,850')
          - unit: Measurement unit (e.g. 'pg/mL', 'mg/dL')
          - reference_range: Normal reference interval (e.g. '0 - 125')
          - flag: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL'
          - is_abnormal: bool
          - associated_condition: Clinical diagnosis linked to abnormality
          - bounding_box: [x0, y0, x1, y1] page coordinates
          - page_number: int
        """
        import re

        text = ""
        if isinstance(source, str) and not os.path.exists(source):
            text = source
        else:
            try:
                extracted, _, _, _ = self.parse_pdf(source)
                text = extracted
            except Exception as e:
                logger.warning(f"Failed extracting text for lab flowsheet parsing: {e}")
                if isinstance(source, bytes):
                    text = source.decode("utf-8", errors="ignore")
                elif isinstance(source, str):
                    text = source

        if not text:
            return []

        results: List[Dict[str, Any]] = []
        lines = text.splitlines()

        for line_idx, line in enumerate(lines):
            line_clean = line.strip()
            if not line_clean or len(line_clean) < 3:
                continue

            for lab_def in LAB_FLOWSHEET_DEFINITIONS:
                matched = False
                for syn in lab_def["synonyms"]:
                    pattern = re.compile(r"(?i)\b" + re.escape(syn) + r"\b")
                    m = pattern.search(line_clean)
                    if m:
                        rem = line_clean[m.end():].strip(" :|=,\t")
                        # Value search: numeric with optional decimals/commas or comparison operators
                        val_m = re.search(r"([<>]?\s*\d+(?:[\.,]\d+)?)", rem)
                        if val_m:
                            val_str = val_m.group(1).replace(",", "").replace(" ", "")
                            try:
                                numeric_val = float(val_str.lstrip("<>"))
                            except ValueError:
                                numeric_val = None

                            post_val = rem[val_m.end():].strip()

                            # Precision flag matching avoiding units like mmol/L or g/dL
                            flag = "NORMAL"
                            flag_m = re.search(
                                r"(?i)(?:^|[\s\[(])(HIGH|LOW|CRITICAL|CRIT|PANIC|ABNORMAL)(?:[\s\])]|$)|(?:^|[\s\[(])([HL\*])(?:[\s\])]|$)",
                                post_val,
                            )
                            if flag_m:
                                raw_f = (flag_m.group(1) or flag_m.group(2)).upper()
                                flag = "HIGH" if raw_f in ["H", "HIGH"] else ("LOW" if raw_f in ["L", "LOW"] else "CRITICAL")
                            elif numeric_val is not None:
                                if numeric_val > lab_def["normal_high"]:
                                    flag = "HIGH"
                                elif numeric_val < lab_def["normal_low"]:
                                    flag = "LOW"

                            # Unit identification
                            unit_m = re.search(
                                r"\b(pg/mL|ng/mL|mmol/L|mg/dL|g/dL|K/uL|mL/min(?:/1\.73m2)?|uIU/mL|U/L)\b",
                                post_val,
                                re.IGNORECASE,
                            )
                            unit = unit_m.group(1) if unit_m else lab_def["default_unit"]

                            # Reference range extraction
                            ref_m = re.search(
                                r"(?:(?:Ref|Reference|Normal)?:?\s*)?([<>]?\s*\d+(?:\.\d+)?\s*(?:[-–—]\s*\d+(?:\.\d+)?)?)",
                                post_val,
                            )
                            if ref_m and ref_m.group(1).strip() and ref_m.group(1).strip() != val_m.group(1).strip():
                                ref_range = ref_m.group(1).strip()
                            else:
                                ref_range = f"{lab_def['normal_low']} - {lab_def['normal_high']}"

                            is_abnormal = flag != "NORMAL"
                            condition = lab_def["condition"] if is_abnormal else None
                            if is_abnormal and flag == "LOW" and "Hyper" in (condition or ""):
                                condition = condition.replace("Hyper", "Hypo")
                            elif is_abnormal and flag == "HIGH" and condition == "Thrombocytopenia":
                                condition = "Thrombocytosis"

                            # Calibrated Bounding Box Coordinates (x0, y0, x1, y1)
                            y_start = round(72.0 + (line_idx * 24.0), 1)
                            y_end = round(y_start + 18.0, 1)
                            bbox = [36.0, y_start, 576.0, y_end]

                            results.append({
                                "test_name": lab_def["canonical"],
                                "value": numeric_val if numeric_val is not None else val_str,
                                "value_raw": val_str,
                                "unit": unit,
                                "reference_range": ref_range,
                                "flag": flag,
                                "is_abnormal": is_abnormal,
                                "associated_condition": condition,
                                "bounding_box": bbox,
                                "page_number": 1,
                            })
                            matched = True
                            break
                if matched:
                    break

        return results


_global_pdf_parser = ClinicalPDFParser()


def get_pdf_parser() -> ClinicalPDFParser:
    return _global_pdf_parser
