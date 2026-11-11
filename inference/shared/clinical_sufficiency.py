"""
Clinical Content Sufficiency and Gibberish Validator.

Guards generative clinical LLMs/VLMs against hallucinating when provided with
gibberish, random keystrokes, insufficient text, or non-clinical inputs.
"""

import re
from typing import Tuple, Set

# Standard medical abbreviations and acronyms (including vowel-less acronyms)
MEDICAL_ACRONYMS: Set[str] = {
    "bp", "hr", "rr", "mmhg", "bpm", "prn", "ekg", "ecg", "cxr", "ct", "mri",
    "iv", "im", "sc", "po", "sl", "wbc", "rbc", "bun", "hgb", "hct", "plt",
    "cr", "sob", "dm", "htn", "cad", "chf", "pvd", "copd", "dvt", "pe", "pt",
    "inr", "ptt", "ast", "alt", "bnp", "ck", "ck-mb", "esr", "crp", "tsh",
    "gfr", "egfr", "abg", "vbg", "cpap", "bipap", "ett", "icu", "ccu", "ed",
    "er", "or", "pacu", "wnl", "nad", "perrla", "eomi", "ctab", "rrr", "bs",
    "ext", "neuro", "gi", "gu", "ms", "msk", "cns", "pns", "ent", "heent",
    "nkda", "nka", "yo", "y/o", "s/p", "dx", "tx", "rx", "hx", "sx", "fx",
    "covid", "covid-19", "sars-cov-2", "stemi", "nstemi", "afib", "a-fib"
}

# Recognized clinical and medical domain terms
CLINICAL_KEYWORDS: Set[str] = {
    "patient", "exam", "examination", "history", "hpi", "pmh", "ros", "vital", "vitals",
    "bp", "hr", "rr", "spo2", "temp", "temperature", "pulse", "pain", "chest", "lung",
    "lungs", "heart", "cardiac", "cardiopulmonary", "abdomen", "abdominal", "cough",
    "fever", "sob", "dyspnea", "shortness", "breath", "headache", "edema", "swelling",
    "normocephalic", "atraumatic", "clear", "bilateral", "auscultation", "wheezing",
    "rales", "rhonchi", "murmur", "rhythm", "sinus", "ecg", "ekg", "xray", "x-ray",
    "radiograph", "ct", "mri", "ultrasound", "labs", "wbc", "rbc", "hemoglobin", "hgb",
    "hematocrit", "platelets", "creatinine", "bun", "glucose", "sodium", "potassium",
    "alt", "ast", "troponin", "bnp", "medication", "medications", "meds", "mg", "mcg",
    "daily", "bid", "tid", "qid", "prn", "po", "iv", "tablet", "capsule", "prescription",
    "allergy", "allergies", "assessment", "plan", "diagnosis", "diagnoses", "stable",
    "unremarkable", "acute", "chronic", "mild", "moderate", "severe", "followup",
    "follow-up", "discharge", "admitted", "admission", "consultation", "consult",
    "hypertension", "diabetes", "asthma", "copd", "pneumonia", "effusion", "consolidation",
    "cardiomegaly", "fracture", "infection", "rash", "lesion", "mass", "nodule", "doctor",
    "physician", "nurse", "clinic", "hospital", "status", "post", "s/p", "male", "female",
    "year-old", "yo", "yo/m", "yo/f", "denies", "reports", "presents", "noted", "evaluated",
    "afebrile", "febrile", "benign", "distress", "alert", "oriented", "intact", "normal",
    "positive", "negative", "appendicitis", "infarction", "ischemia", "arrhythmia",
    "nausea", "vomiting", "diarrhea", "constipation", "dizziness", "vertigo", "syncope",
    "hypotension", "tachycardia", "bradycardia", "tachypnea", "hypoxia", "hypoxemia",
    "weakness", "fatigue", "malaise", "chills", "diaphoresis", "sputum", "hemoptysis"
}

# Common English syntactic words for semantic coherence
COMMON_ENGLISH_WORDS: Set[str] = {
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not",
    "on", "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "from",
    "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would",
    "there", "their", "what", "so", "up", "out", "if", "about", "who", "get", "which",
    "go", "me", "when", "make", "can", "like", "time", "no", "just", "him", "know",
    "take", "people", "into", "year", "your", "good", "some", "could", "them", "see",
    "other", "than", "then", "now", "look", "only", "come", "its", "over", "think",
    "also", "back", "after", "use", "two", "how", "our", "work", "first", "well",
    "way", "even", "new", "want", "because", "any", "these", "give", "day", "most", "us",
    "is", "was", "are", "were", "been", "has", "had", "did", "does"
}

VOWEL_RE = re.compile(r"[aeiouyAEIOUY]")
WORD_SPLIT_RE = re.compile(r"\b[a-zA-Z0-9'-]+\b")


def is_clinically_sufficient(text: str) -> Tuple[bool, str]:
    """
    Evaluates whether an input text contains meaningful, coherent documentation
    suitable for clinical summarization, as opposed to gibberish (e.g. 'jhbk'),
    random punctuation, single fragments, or non-semantic noise.

    Returns:
        (is_sufficient: bool, reason: str)
    """
    if not text or not isinstance(text, str):
        return False, "Input document is empty."

    cleaned = text.strip()
    if len(cleaned) < 8:
        return False, "Input text is too short to extract clinical context (minimum 8 characters required)."

    words = WORD_SPLIT_RE.findall(cleaned)
    if len(words) < 2:
        return False, "Document contains only 1 word. A clinical summary requires clinical findings, vitals, or observations."

    # Clinical numeric patterns (e.g., vitals like 120/80, 98.6 F, 10 mg)
    has_clinical_patterns = bool(
        re.search(r"\b\d+(\.\d+)?\s*(mg|mcg|g|ml|mmhg|bpm|%|f|c|tab|tabs|units?)\b", cleaned, re.IGNORECASE)
        or re.search(r"\b\d{2,3}/\d{2,3}\b", cleaned)
    )

    # Extract alphabetical words
    alpha_words = [w.lower() for w in words if w.isalpha()]
    if not alpha_words and not has_clinical_patterns:
        return False, "Input contains no alphabetical words or readable clinical terms."

    # 1. Phonetic / linguistic check: readable words have vowels, recognized medical acronyms, or clinical terms
    valid_words_count = 0
    for w in alpha_words:
        if VOWEL_RE.search(w) or w in MEDICAL_ACRONYMS or w in CLINICAL_KEYWORDS:
            valid_words_count += 1

    if alpha_words:
        valid_ratio = valid_words_count / len(alpha_words)
        if valid_ratio < 0.6:
            return False, "Input appears to contain random character keystrokes without readable English or clinical words."

    # 2. Repetitive characters / low character entropy check (rejects 'aaaaa', 'asdfasdf')
    for w in alpha_words:
        if len(w) >= 5 and len(set(w)) <= 2:
            return False, f"Input contains repetitive non-semantic token '{w}'."

    # 3. Clinical concept & vocabulary overlap
    clinical_matches = sum(1 for w in alpha_words if (w in CLINICAL_KEYWORDS or w in MEDICAL_ACRONYMS))
    english_matches = sum(1 for w in alpha_words if w in COMMON_ENGLISH_WORDS)

    # Short 2-word input check: must contain at least 1 clinical keyword or clinical pattern
    if len(words) == 2 and not (clinical_matches > 0 or has_clinical_patterns):
        return False, "Document contains only 2 non-clinical words without clinical findings or vital signs."

    # General recognition check
    total_recognized = clinical_matches + english_matches
    if not has_clinical_patterns and total_recognized == 0:
        return False, "Input text does not contain recognizable clinical concepts or standard English vocabulary."

    # Conversational text without clinical substance check
    if clinical_matches == 0 and not has_clinical_patterns and len(alpha_words) < 6 and all(w in COMMON_ENGLISH_WORDS for w in alpha_words):
        return False, "Input contains general conversational words but lacks clinical observations, diagnoses, or vitals."

    return True, "Valid clinical text."
