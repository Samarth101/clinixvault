"""
Unit Tests for Clinical Evaluation Metrics Suite.
"""

import pytest
from training.evaluation.eval_metrics import (
    compute_bleu_ngram,
    compute_rouge_l,
    compute_clinical_metrics,
    compute_all_metrics,
    extract_clinical_concepts,
)


def test_extract_clinical_concepts():
    text = "The cardiac silhouette demonstrates cardiomegaly and bilateral pleural effusion."
    concepts = extract_clinical_concepts(text)
    assert "cardiomegaly" in concepts
    assert "pleural effusion" in concepts
    assert "pneumothorax" not in concepts


def test_bleu_ngram_computation():
    ref = "lungs are clear without acute focal consolidation"
    pred_exact = "lungs are clear without acute focal consolidation"
    pred_diff = "heart is enlarged and marked atelectasis present"

    score_perfect = compute_bleu_ngram([pred_exact], [ref])
    score_low = compute_bleu_ngram([pred_diff], [ref])

    assert score_perfect > 0.90
    assert score_low == 0.0


def test_rouge_l_computation():
    ref = "no pneumothorax or pleural effusion seen"
    pred = "no pneumothorax seen in the examination"

    score = compute_rouge_l([pred], [ref])
    assert 0.0 < score < 1.0


def test_clinical_metrics_recall_and_hallucination():
    ref = "Bilateral pleural effusion and cardiomegaly noted."
    # Pred captures cardiomegaly, misses effusion, hallucinates pneumothorax
    pred = "Cardiomegaly with small right pneumothorax."

    metrics = compute_clinical_metrics([pred], [ref])

    assert 0.0 <= metrics["clinical_concept_recall"] <= 1.0
    assert 0.0 <= metrics["hallucination_rate"] <= 1.0
    assert metrics["hallucination_rate"] > 0.0  # pneumothorax hallucinated


def test_compute_all_metrics_pipeline():
    preds = ["Clear lungs. No focal consolidation, pneumothorax, or pleural effusion."]
    refs = ["Lungs are clear. No consolidation, effusion, or pneumothorax."]

    results = compute_all_metrics(preds, refs, try_bertscore=False)
    assert results["num_samples"] == 1
    assert "bleu" in results
    assert "rougeL" in results
    assert "clinical_concept_recall" in results
    assert "hallucination_rate" in results
