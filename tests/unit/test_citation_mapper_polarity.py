"""
Unit Tests for NegEx Polarity-Aware Clinical Citation Mapper & Visual Bounding Box Grounding.
Validates Roadmap Pillar 3 (VLM-Assisted Document & Citation Grounding).
"""

import pytest
from backend.audit.citation_mapper import citation_mapper


def test_citation_mapper_concordant_grounding():
    claim = "Patient presents with severe acute cardiomegaly and bilateral pleural effusion."
    sources = [
        "Patient exhibits marked cardiomegaly and bilateral pleural effusion tracking along both costophrenic angles.",
        "Vital signs are stable with blood pressure 120/80 mmHg."
    ]
    citations = citation_mapper.map_claims_to_sources(claim, sources)
    assert len(citations) >= 1
    c = citations[0]
    assert c["is_grounded"] is True
    assert c.get("polarity_conflict") is not True
    assert c["source_index"] == 0
    assert c["grounding_score"] >= 0.5


def test_citation_mapper_negex_polarity_conflict_rejection():
    # Claim asserts negation (NO effusion), but source asserts POSITIVE effusion
    claim = "The lungs are clear without pleural effusion or pneumothorax."
    sources = [
        "Chest radiograph reveals dense consolidation and moderate pleural effusion in the right base.",
        "Cardiac silhouette is normal in size."
    ]
    citations = citation_mapper.map_claims_to_sources(claim, sources)
    assert len(citations) >= 1
    c = citations[0]

    # Must detect polarity conflict and invalidate grounding
    assert c["is_grounded"] is False
    assert c.get("polarity_conflict") is True
    assert "Polarity Inversion" in c.get("rejection_reason", "")
    assert c["grounding_score"] == 0.0


def test_citation_mapper_bounding_box_attachment():
    claim = "Elevated blood pressure observed during exam."
    sources = ["Vital signs demonstrate elevated blood pressure at 152/94 mmHg."]
    boxes = [{"page": 1, "x0": 50.0, "y0": 120.0, "x1": 240.0, "y1": 135.0, "text": "Vital signs"}]

    citations = citation_mapper.map_claims_to_sources(
        claim,
        sources,
        source_bounding_boxes=boxes
    )
    assert len(citations) >= 1
    c = citations[0]
    assert c["is_grounded"] is True
    assert "bounding_box" in c
    assert c["bounding_box"]["page"] == 1
    assert c["bounding_box"]["x0"] == 50.0


def test_calculate_overall_grounding_penalizes_conflicts():
    citations = [
        {"claim": "Claim 1", "is_grounded": True, "polarity_conflict": False},
        {"claim": "Claim 2", "is_grounded": False, "polarity_conflict": True},
        {"claim": "Claim 3", "is_grounded": True, "polarity_conflict": False},
    ]
    score = citation_mapper.calculate_overall_grounding(citations)
    assert score == round(2 / 3, 3)
