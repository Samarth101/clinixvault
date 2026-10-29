"""
Clinical Entity & Relation Extractor (Triples Miner).
Extracts typed clinical entities, resolves ontologies (ICD-10, SNOMED, RxNorm),
handles clinical contextual negation, and generates semantic knowledge triples.
"""

import re
from typing import Dict, Any, List, Optional, Tuple
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.graph_rag.extractor")

# Clinical Entity Dictionary with Ontological Grounding
ENTITY_ONTOLOGY_MAP: Dict[str, Dict[str, Any]] = {
    "cardiomegaly": {
        "label": "Condition",
        "name": "Cardiomegaly",
        "code": "ICD-10 I51.7",
        "snomed": "8186001",
        "default_anatomy": "Cardiac Silhouette",
    },
    "pleural effusion": {
        "label": "Condition",
        "name": "Pleural Effusion",
        "code": "ICD-10 J90",
        "snomed": "60046008",
        "default_anatomy": "Pleural Cavity & Costophrenic Sulci",
    },
    "pleural effusions": {
        "label": "Condition",
        "name": "Pleural Effusion",
        "code": "ICD-10 J90",
        "snomed": "60046008",
        "default_anatomy": "Pleural Cavity & Costophrenic Sulci",
    },
    "atelectasis": {
        "label": "Condition",
        "name": "Compressive Atelectasis",
        "code": "ICD-10 J98.11",
        "snomed": "46621007",
        "default_anatomy": "Pulmonary Parenchyma",
    },
    "pneumonia": {
        "label": "Condition",
        "name": "Community-Acquired Pneumonia",
        "code": "ICD-10 J18.9",
        "snomed": "233604007",
        "default_anatomy": "Lobar Alveoli",
    },
    "consolidation": {
        "label": "Condition",
        "name": "Alveolar Consolidation",
        "code": "ICD-10 J18.9",
        "snomed": "275508006",
        "default_anatomy": "Pulmonary Parenchyma",
    },
    "pneumothorax": {
        "label": "Condition",
        "name": "Pneumothorax",
        "code": "ICD-10 J93.9",
        "snomed": "36118008",
        "default_anatomy": "Pleural Space",
    },
    "osteoarthritis": {
        "label": "Condition",
        "name": "Primary Knee Osteoarthritis",
        "code": "ICD-10 M17.0",
        "snomed": "239873007",
        "default_anatomy": "Medial Tibiofemoral Compartment",
    },
    "heart failure": {
        "label": "Condition",
        "name": "Congestive Heart Failure",
        "code": "ICD-10 I50.9",
        "snomed": "42343007",
        "default_anatomy": "Cardiac Silhouette",
    },
    "furosemide": {
        "label": "Medication",
        "name": "Furosemide",
        "code": "RxNorm 4603",
        "drug_class": "Loop Diuretic",
    },
    "lasix": {
        "label": "Medication",
        "name": "Furosemide",
        "code": "RxNorm 4603",
        "drug_class": "Loop Diuretic",
    },
    "amoxicillin": {
        "label": "Medication",
        "name": "Amoxicillin-Clavulanate",
        "code": "RxNorm 617314",
        "drug_class": "Aminopenicillin",
    },
    "triamcinolone": {
        "label": "Medication",
        "name": "Intra-Articular Triamcinolone",
        "code": "RxNorm 10763",
        "drug_class": "Corticosteroid",
    },
    "costophrenic angle blunting": {
        "label": "Observation",
        "name": "Costophrenic Angle Blunting",
        "code": "LOINC 88020-3",
    },
    "joint space narrowing": {
        "label": "Observation",
        "name": "Medial Joint Space Narrowing",
        "code": "RadLex RID49502",
    },
    "osteophytes": {
        "label": "Observation",
        "name": "Marginal Osteophyte Spurring",
        "code": "RadLex RID5171",
    },
}

NEGATION_PATTERNS = [
    r"\bno\b",
    r"\bno evidence of\b",
    r"\bnegative for\b",
    r"\bwithout\b",
    r"\brules out\b",
    r"\bfree of\b",
    r"\bdenies\b",
    r"\bunremarkable\b",
    r"\babsence of\b",
]


class ClinicalTripleExtractor:
    """Extracts entity nodes and relation edges from free-text clinical notes and reports."""

    def __init__(self):
        # Sort keys by descending length so multi-word phrases match before single tokens
        sorted_keys = sorted(ENTITY_ONTOLOGY_MAP.keys(), key=lambda x: -len(x))
        escaped_keys = [re.escape(k) for k in sorted_keys]
        self._entity_regex = re.compile(r"\b(" + "|".join(escaped_keys) + r")\b", re.IGNORECASE)
        self._negation_regex = re.compile("|".join(NEGATION_PATTERNS), re.IGNORECASE)

    def is_negated(self, text_window: str) -> bool:
        """Determines if an entity is within the contextual scope of a negation cue."""
        return bool(self._negation_regex.search(text_window))

    def extract_entities_and_triples(
        self, clinical_text: str, patient_id: str
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Parses text and outputs:
        - entities: List of detected nodes (Conditions, Medications, Observations)
        - triples: List of subject-predicate-object knowledge triples
        """
        entities: List[Dict[str, Any]] = []
        triples: List[Dict[str, Any]] = []
        seen_entities = set()

        sentences = re.split(r"(?<=[.!?])\s+", clinical_text)

        for sent in sentences:
            sent_clean = sent.strip()
            if len(sent_clean) < 4:
                continue

            matches = list(self._entity_regex.finditer(sent_clean))
            for match in matches:
                matched_text = match.group(0).lower()
                start_idx = match.start()

                # Look behind up to 45 characters in the sentence for negation cues
                preceding_window = sent_clean[max(0, start_idx - 45) : start_idx]
                negated = self.is_negated(preceding_window)

                meta = ENTITY_ONTOLOGY_MAP.get(matched_text)
                if not meta:
                    continue

                entity_key = f"{meta['label']}:{meta['name']}"
                if entity_key not in seen_entities:
                    seen_entities.add(entity_key)
                    entity_dict = {
                        "id": f"ent-{abs(hash(entity_key)) % 1000000}",
                        "name": meta["name"],
                        "label": meta["label"],
                        "code": meta.get("code", ""),
                        "snomed": meta.get("snomed", ""),
                        "negated": negated,
                        "evidence": sent_clean[:200],
                    }
                    entities.append(entity_dict)

                    # Only generate positive clinical knowledge triples for affirmed findings
                    if not negated:
                        if meta["label"] == "Condition":
                            triples.append({
                                "subject": {"id": patient_id, "label": "Patient"},
                                "predicate": "DIAGNOSED_WITH",
                                "object": {"id": entity_dict["id"], "label": "Condition", "name": meta["name"]},
                                "confidence": 0.96,
                                "evidence": sent_clean,
                            })
                            if "default_anatomy" in meta:
                                triples.append({
                                    "subject": {"id": entity_dict["id"], "label": "Condition", "name": meta["name"]},
                                    "predicate": "LOCATED_AT",
                                    "object": {"id": f"anat-{abs(hash(meta['default_anatomy'])) % 100000}", "label": "Anatomy", "name": meta["default_anatomy"]},
                                    "confidence": 0.98,
                                    "evidence": sent_clean,
                                })
                        elif meta["label"] == "Medication":
                            triples.append({
                                "subject": {"id": patient_id, "label": "Patient"},
                                "predicate": "MANAGED_BY",
                                "object": {"id": entity_dict["id"], "label": "Medication", "name": meta["name"]},
                                "confidence": 0.94,
                                "evidence": sent_clean,
                            })

        return entities, triples


_triple_extractor: Optional[ClinicalTripleExtractor] = None


def get_triple_extractor() -> ClinicalTripleExtractor:
    global _triple_extractor
    if _triple_extractor is None:
        _triple_extractor = ClinicalTripleExtractor()
    return _triple_extractor
