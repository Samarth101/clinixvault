"""
Citation & Evidence Grounding Engine for Clinical AI Synthesis.
Maps generated claims and report sentences back to source dialogue turns,
clinical document spans, or radiographic regions to prevent hallucinations.
Includes NegEx polarity-aware contradiction detection and PDF bounding box grounding.
"""

import re
from typing import List, Dict, Any, Tuple, Optional, Set
from inference.cpp.binding import compute_cosine_similarity

# NegEx clinical negation trigger patterns
NEGATION_PATTERN = re.compile(
    r"\b(no|not|denies|denied|without|negative for|absence of|free of|unremarkable for|resolved|cleared|clear of|no evidence of)\b",
    re.I
)

# Canonical clinical finding entities for polarity verification
CLINICAL_FINDINGS = [
    "effusion", "pleural effusion", "cardiomegaly", "pneumonia", "consolidation",
    "infiltrate", "atelectasis", "pneumothorax", "edema", "pulmonary edema",
    "fracture", "mass", "nodule", "congestion", "cephalization", "blunting",
    "fever", "cough", "chest pain", "dyspnea", "orthopnea", "rales", "crackles"
]


class ClinicalCitationMapper:
    def __init__(self, default_overlap_ratio: float = 0.25):
        self.default_overlap_ratio = default_overlap_ratio

    def is_negated(self, text: str) -> bool:
        """Determines if clinical text asserts negative polarity / exclusion."""
        return bool(NEGATION_PATTERN.search(text))

    def extract_clinical_keywords(self, text: str) -> Set[str]:
        """Extracts recognizable medical entities to audit semantic alignment."""
        t_low = text.lower()
        found = set()
        for c in CLINICAL_FINDINGS:
            if c in t_low:
                found.add(c)
        return found

    def map_claims_to_sources(
        self,
        generated_text: str,
        source_texts: List[str],
        source_labels: Optional[List[str]] = None,
        source_bounding_boxes: Optional[List[Dict[str, Any]]] = None,
        min_overlap_ratio: float = 0.25,
    ) -> List[Dict[str, Any]]:
        """
        Segments generated report into distinct factual claims (sentences),
        aligns each claim with the most relevant source segment,
        and audits for NegEx polarity contradictions.
        """
        # Split generated text into sentences
        sentences = [
            s.strip()
            for s in re.split(r"(?<=[.!?])\s+", generated_text)
            if len(s.strip()) > 5
        ]

        if not source_labels or len(source_labels) != len(source_texts):
            source_labels = [f"Source_{i+1}" for i in range(len(source_texts))]

        citations = []

        for sent in sentences:
            sent_words = set(re.findall(r"\b\w{3,}\b", sent.lower()))
            sent_negated = self.is_negated(sent)
            sent_entities = self.extract_clinical_keywords(sent)

            best_score = 0.0
            best_idx = -1
            best_excerpt = ""
            polarity_conflict = False

            for idx, src in enumerate(source_texts):
                src_words = set(re.findall(r"\b\w{3,}\b", src.lower()))
                if not sent_words or not src_words:
                    continue

                intersection = sent_words.intersection(src_words)
                score = len(intersection) / len(sent_words)

                # NegEx Polarity Alignment Audit
                src_negated = self.is_negated(src)
                src_entities = self.extract_clinical_keywords(src)
                shared_entities = sent_entities.intersection(src_entities)

                # Flag contradiction if same finding has conflicting negation polarity
                if shared_entities and (sent_negated != src_negated):
                    if score > best_score:
                        polarity_conflict = True
                        best_score = score
                        best_idx = idx
                        best_excerpt = src[:150] + ("..." if len(src) > 150 else "")
                    continue

                if score > best_score:
                    polarity_conflict = False
                    best_score = score
                    best_idx = idx
                    best_excerpt = src[:150] + ("..." if len(src) > 150 else "")

            # If a polarity contradiction was identified, invalidate grounding
            if polarity_conflict:
                is_grounded = False
                effective_score = 0.0
                rejection_note = "Polarity Inversion: Claim assertion contradicts source negation status."
            else:
                is_grounded = best_score >= min_overlap_ratio
                effective_score = round(best_score, 3)
                rejection_note = None

            bbox = None
            if is_grounded and source_bounding_boxes and 0 <= best_idx < len(source_bounding_boxes):
                bbox = source_bounding_boxes[best_idx]

            citation_entry: Dict[str, Any] = {
                "claim": sent,
                "source_index": best_idx if is_grounded else None,
                "source_label": source_labels[best_idx] if (is_grounded and best_idx >= 0) else "UNGROUNDED",
                "source_excerpt": best_excerpt if is_grounded else "",
                "grounding_score": effective_score,
                "is_grounded": is_grounded,
            }
            if polarity_conflict:
                citation_entry["polarity_conflict"] = True
                citation_entry["rejection_reason"] = rejection_note
            if bbox:
                citation_entry["bounding_box"] = bbox

            citations.append(citation_entry)

        return citations

    def calculate_overall_grounding(self, citations: List[Dict[str, Any]]) -> float:
        """Calculates proportion of strictly grounded, non-contradictory claims."""
        if not citations:
            return 1.0
        grounded_count = sum(1 for c in citations if c.get("is_grounded", False) and not c.get("polarity_conflict", False))
        return round(grounded_count / len(citations), 3)


citation_mapper = ClinicalCitationMapper()
