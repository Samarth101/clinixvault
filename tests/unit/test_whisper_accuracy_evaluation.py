"""
Unit Tests for Whisper Accuracy Evaluation Suite.
Validates WER, CER, Clinical Keyword Recall (CKR), Hallucination Detection,
and Hotword Boosting Evaluation.
"""

import pytest
from inference.audio_server.eval_whisper import (
    compute_wer,
    compute_cer,
    compute_clinical_keyword_recall,
    detect_hallucinations,
    evaluate_whisper_sample,
    run_whisper_benchmark_evaluation,
    normalize_clinical_text,
)


def test_wer_exact_match():
    ref = "Patient exhibits mild cardiomegaly without acute infiltration."
    hyp = "Patient exhibits mild cardiomegaly without acute infiltration."
    res = compute_wer(ref, hyp)
    assert res["wer"] == 0.0
    assert res["substitutions"] == 0
    assert res["deletions"] == 0
    assert res["insertions"] == 0


def test_wer_with_clinical_substitutions():
    ref = "Administer furosemide twenty milligrams intravenous push."
    hyp = "Administer torsemide twenty milligrams intravenous push."
    res = compute_wer(ref, hyp)
    assert res["wer"] > 0.0
    assert res["substitutions"] == 1
    assert res["deletions"] == 0
    assert res["insertions"] == 0
    assert res["ref_word_count"] == 6


def test_cer_on_drug_misspellings():
    ref = "hydralazine"
    hyp = "hydroxyzine"
    cer = compute_cer(ref, hyp)
    assert 0.0 < cer < 1.0


def test_clinical_keyword_recall():
    ref = "Chest radiograph shows right basilar pleural effusion and cardiomegaly."
    hyp = "Chest radiograph shows right basilar effusion and cardiomegaly."
    keywords = ["pleural effusion", "cardiomegaly", "pneumothorax"]

    ckr = compute_clinical_keyword_recall(ref, hyp, keywords)
    assert ckr["total_keywords"] == 2  # Only pleural effusion and cardiomegaly are in ref
    assert "cardiomegaly" in ckr["recalled_list"]
    assert ckr["recall_rate"] >= 0.5


def test_hallucination_detection_on_silence():
    assert detect_hallucinations("Thank you for watching.") is True
    assert detect_hallucinations("subtitles by amara.org") is True
    assert detect_hallucinations("Please subscribe to the channel") is True
    assert detect_hallucinations("Patient breathing normally on room air") is False


def test_hallucination_detection_on_repetitive_loop():
    loop = "fluid overload fluid overload fluid overload fluid overload fluid overload"
    assert detect_hallucinations(loop) is True


def test_whisper_evaluation_metrics_object():
    ref = "Patient has type two diabetes mellitus."
    hyp = "Patient has type 2 diabetes mellitus."
    metrics = evaluate_whisper_sample(
        reference=ref,
        hypothesis=hyp,
        audio_duration_sec=4.0,
        processing_time_sec=0.8,
        clinical_keywords=["diabetes mellitus"],
    )
    assert metrics.audio_duration_sec == 4.0
    assert metrics.processing_time_sec == 0.8
    assert metrics.real_time_factor == 0.2  # 0.8 / 4.0
    assert metrics.clinical_keyword_recall == 1.0


def test_full_benchmark_run():
    report = run_whisper_benchmark_evaluation(model_name="large-v3-turbo")
    assert report["model_name"] == "large-v3-turbo"
    assert report["total_cases"] == 4
    assert report["mean_wer"] == 0.0
    assert report["mean_clinical_keyword_recall"] == 1.0
    assert report["overall_real_time_factor"] <= 0.35
