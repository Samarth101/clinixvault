"""
Unit Tests for Zero-Dependency Clinical NLP & Critic Module (`inference/shared/critic.py`).
Verifies:
1. Module can be imported and executed in environments without PyTorch.
2. CheXpert synonym recognition with NegEx scope.
3. Grammatical contradiction reconciliation.
4. Anatomical compartment parsing.
"""

import sys
import pytest

from inference.shared.critic import (
    CHEXPERT_CONCEPTS,
    extract_clinical_concepts_negex,
    audit_and_reconcile_report,
    parse_compartments_from_findings,
    synthesize_compartmental_breakdown,
)


def test_shared_critic_no_torch_dependency():
    """Confirms inference.shared.critic does not import or require torch."""
    import inference.shared.critic as critic_mod
    assert "torch" not in dir(critic_mod)
    assert not hasattr(critic_mod, "torch")


def test_shared_critic_synonym_negex_detection():
    """Validates synonym extraction and negation detection."""
    text_neg = "Cardiac silhouette is normal in size without enlarged heart or pleural effusion."
    pos, neg = extract_clinical_concepts_negex(text_neg)
    assert "cardiomegaly" in neg
    assert "pleural_effusion" in neg
    assert "cardiomegaly" not in pos
    assert "pleural_effusion" not in pos

    text_pos = "Marked cardiac enlargement and bilateral pleural fluid noted."
    pos2, neg2 = extract_clinical_concepts_negex(text_pos)
    assert "cardiomegaly" in pos2
    assert "pleural_effusion" in pos2


def test_shared_critic_contradiction_reconciliation():
    """Validates that contradicted acute statements are cleanly rewritten without corrupt grammar."""
    findings = "The lungs are clear. No evidence of pneumothorax or consolidation."
    impression = "1. Acute right apical pneumothorax.\n2. Normal heart size."
    reconciled, audit = audit_and_reconcile_report(findings, impression)

    assert "acute right apical no pneumothorax" not in reconciled.lower()
    assert "no pneumothorax" in reconciled.lower()
    assert audit["consistency_score"] <= 1.0
    assert "pneumothorax" in audit["negated_pathologies"]


def test_shared_critic_compartment_parsing():
    """Validates parsing of 4 anatomical compartments from free-form text."""
    text = "Lungs are well expanded. Normal cardiomediastinal contour. Intact ribs. No pacemakers or lines."
    breakdown = parse_compartments_from_findings(text)
    assert "lungs_pleura" in breakdown
    assert "cardiomediastinum" in breakdown
    assert "bones_soft_tissues" in breakdown
    assert "support_devices" in breakdown
