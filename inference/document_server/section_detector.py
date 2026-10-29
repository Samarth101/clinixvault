"""
MedSpaCy Clinical Section Detection Engine.
Extracts and normalizes clinical note sections (HPI, PMH, Meds, Allergies, Exam, Plan)
using regular expressions and clinical rule-based boundaries aligned with MedSpaCy Sectionizer.
"""

import re
from typing import List, Dict, Any, Tuple
from inference.document_server.schemas import ClinicalSection

CLINICAL_SECTION_PATTERNS = [
    ("CHIEF_COMPLAINT", r"(?:CHIEF\s+COMPLAINT|CC|REASON\s+FOR\s+(?:VISIT|CONSULT)):?"),
    ("HISTORY_PRESENT_ILLNESS", r"(?:HISTORY\s+OF\s+PRESENT\s+ILLNESS|HPI):?"),
    ("PAST_MEDICAL_HISTORY", r"(?:PAST\s+MEDICAL\s+HISTORY|PMH|MEDICAL\s+HISTORY):?"),
    ("MEDICATIONS", r"(?:MEDICATIONS?(?:\s+ON\s+ADMISSION)?|CURRENT\s+MEDICATIONS|ACTIVE\s+MEDS|RX):?"),
    ("ALLERGIES", r"(?:ALLERGIES(?:\s+AND\s+ADVERSE\s+REACTIONS)?):?"),
    ("REVIEW_OF_SYSTEMS", r"(?:REVIEW\s+OF\s+SYSTEMS|ROS):?"),
    ("PHYSICAL_EXAM", r"(?:PHYSICAL\s+EXAMINATION|PHYSICAL\s+EXAM|PE|OBJECTIVE):?"),
    ("LABS_AND_IMAGING", r"(?:LABORATORY\s+DATA|LABS|DIAGNOSTIC\s+STUDIES|IMAGING|RADIOLOGY):?"),
    ("ASSESSMENT_AND_PLAN", r"(?:ASSESSMENT\s+AND\s+PLAN|A\s*/\s*P|ASSESSMENT|IMPRESSION|PLAN):?"),
    ("HOSPITAL_COURSE", r"(?:HOSPITAL\s+COURSE|BRIEF\s+RESUME\s+OF\s+HOSPITAL\s+COURSE):?"),
    ("DISCHARGE_INSTRUCTIONS", r"(?:DISCHARGE\s+INSTRUCTIONS|FOLLOW\s*-\s*UP|DISPOSITION):?"),
]


class ClinicalSectionDetector:
    def __init__(self):
        self.medspacy_available = False
        try:
            import medspacy
            self.medspacy_available = True
        except ImportError:
            self.medspacy_available = False

    def detect_sections(self, text: str) -> List[ClinicalSection]:
        """
        Scans clinical text and segments it into structured sections with character spans.
        """
        if not text or not text.strip():
            return []

        # Find all section headers and their character offsets
        matches: List[Tuple[int, int, str, str]] = []  # (start, end, normalized_name, original_header)

        for norm_name, pattern_str in CLINICAL_SECTION_PATTERNS:
            regex = re.compile(rf"(?:^|\n)\s*({pattern_str})", re.IGNORECASE)
            for m in regex.finditer(text):
                start = m.start(1)
                end = m.end(1)
                orig = m.group(1).strip()
                matches.append((start, end, norm_name, orig))

        # Sort matches by appearance in text
        matches.sort(key=lambda x: x[0])

        if not matches:
            # Entire document is a single section
            return [
                ClinicalSection(
                    title="GENERAL_NARRATIVE",
                    original_header="Narrative",
                    content=text.strip(),
                    char_start=0,
                    char_end=len(text),
                )
            ]

        sections = []
        for i in range(len(matches)):
            start_header, end_header, norm_name, orig_hdr = matches[i]
            # Content runs until start of next header or end of document
            content_start = end_header
            content_end = matches[i + 1][0] if i + 1 < len(matches) else len(text)
            content = text[content_start:content_end].strip()

            sections.append(
                ClinicalSection(
                    title=norm_name,
                    original_header=orig_hdr,
                    content=content,
                    char_start=start_header,
                    char_end=content_end,
                )
            )

        return sections


_global_detector = ClinicalSectionDetector()


def get_section_detector() -> ClinicalSectionDetector:
    return _global_detector
