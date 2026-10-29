"""
Cross-Modal Clinical Discordance Engine ("Virtual Case Board").
Automatically detects clinical contradictions across Radiology VLM (:8001),
Ambient Scribe SOAP (:8002/:8003), and Document AI (:8004).
"""

from enum import Enum
from typing import Dict, List, Any, Optional

try:
    from inference.vlm_server.model_loader import extract_clinical_concepts_negex
except Exception:
    from inference.shared.critic import extract_clinical_concepts_negex


class DiscordanceCategory(str, Enum):
    OCCULT_RADIOGRAPHIC_FINDING = "OCCULT_RADIOGRAPHIC_FINDING"
    CLINICAL_RADIOGRAPHIC_DISSOCIATION = "CLINICAL_RADIOGRAPHIC_DISSOCIATION"
    UNDOCUMENTED_IMPLANT_OR_HARDWARE = "UNDOCUMENTED_IMPLANT_OR_HARDWARE"


def _safe_extract_concepts(text: str):
    """Safely extracts positive and negative clinical concepts using NegEx."""
    res = extract_clinical_concepts_negex(text or "")
    if isinstance(res, (tuple, list)):
        pos = res[0] if len(res) > 0 else set()
        neg = res[1] if len(res) > 1 else set()
        return set(pos), set(neg)
    return set(), set()


def audit_cross_modal_discordance(
    radiology_findings: str = "",
    radiology_compartments: Optional[Dict[str, str]] = None,
    scribe_soap: Optional[Dict[str, str]] = None,
    ehr_summary_text: str = "",
    radiology_report: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Cross-Modal Virtual Case Board: Detects clinical contradictions across
    Radiology VLM (:8001), Ambient Scribe SOAP (:8002/:8003), and Document AI (:8004).
    """
    if radiology_report:
        f_txt = radiology_report.get("findings") or ""
        i_txt = radiology_report.get("impression") or ""
        radiology_findings = f"{f_txt} {i_txt}".strip()
        if not radiology_compartments:
            radiology_compartments = (
                radiology_report.get("anatomical_breakdown")
                or radiology_report.get("compartments")
                or {}
            )

    radiology_compartments = radiology_compartments or {}
    scribe_soap = scribe_soap or {}

    rad_pos, rad_neg = _safe_extract_concepts(radiology_findings)
    soap_obj = f"{scribe_soap.get('objective', '')} {scribe_soap.get('assessment', '')}"
    soap_pos, soap_neg = _safe_extract_concepts(soap_obj)
    ehr_pos, ehr_neg = _safe_extract_concepts(ehr_summary_text)

    discordances: List[Dict[str, Any]] = []

    # Check for exam stating clear lungs / normal breath sounds
    soap_lower = f"{soap_obj} {scribe_soap.get('subjective', '')}".lower()
    exam_lungs_clear = any(
        phrase in soap_lower
        for phrase in [
            "lungs clear",
            "clear to auscultation",
            "breath sounds clear",
            "no rales",
            "no wheezes",
            "no crackles",
            "normal respiratory exam",
        ]
    )

    # 1. Auscultation vs. Radiograph Discordance (Occult Radiographic Pathology)
    pulmonary_pathologies = {
        "pneumonia",
        "consolidation",
        "lung_opacity",
        "pleural_effusion",
        "pneumothorax",
        "edema",
        "atelectasis",
    }
    detected_pulmonary = rad_pos & pulmonary_pathologies

    occult_concepts = set()
    if exam_lungs_clear and detected_pulmonary:
        occult_concepts.update(detected_pulmonary)
    occult_concepts.update(rad_pos & soap_neg)

    for concept in sorted(occult_concepts):
        discordances.append(
            {
                "type": DiscordanceCategory.OCCULT_RADIOGRAPHIC_FINDING.value,
                "category": DiscordanceCategory.OCCULT_RADIOGRAPHIC_FINDING.value,
                "severity": "HIGH",
                "acuity": "CRITICAL" if concept in ("pneumonia", "pneumothorax") else "HIGH",
                "concept": concept,
                "message": (
                    f"Radiograph demonstrates positive '{concept.replace('_', ' ')}', "
                    f"but Ambient Scribe physical exam/assessment documented clear auscultation or explicitly negated it."
                ),
            }
        )

    # 2. Clinical Suspicion vs. Negative Radiograph (Early / Sub-radiographic Presentation)
    auscultated_but_occult = (soap_pos & pulmonary_pathologies) & rad_neg
    if "no_finding" in rad_pos and (soap_pos & pulmonary_pathologies):
        auscultated_but_occult.update(soap_pos & pulmonary_pathologies)

    for concept in sorted(auscultated_but_occult):
        discordances.append(
            {
                "type": DiscordanceCategory.CLINICAL_RADIOGRAPHIC_DISSOCIATION.value,
                "category": DiscordanceCategory.CLINICAL_RADIOGRAPHIC_DISSOCIATION.value,
                "severity": "MEDIUM",
                "acuity": "MEDIUM",
                "concept": concept,
                "message": (
                    f"Scribe SOAP note asserts '{concept.replace('_', ' ')}', "
                    f"but chest radiograph findings are negative. Consider CT or clinical correlation."
                ),
            }
        )

    # 3. Undocumented Support Devices / Hardware Alert
    dev_text = (
        (radiology_compartments.get("support_devices", "") or "")
        + " "
        + radiology_findings
    ).lower()
    has_implant = any(
        w in dev_text
        for w in [
            "pacemaker",
            "pacer",
            "transvenous leads",
            "sternotomy",
            "prosthetic",
            "defibrillator",
            "icd",
        ]
    )
    no_implant_negated = any(
        p in dev_text
        for p in ["no monitoring", "no support", "no hardware", "absent hardware"]
    )
    if has_implant and not no_implant_negated:
        combined_history = (
            f"{ehr_summary_text} {scribe_soap.get('subjective', '')} {scribe_soap.get('objective', '')} {scribe_soap.get('assessment', '')}"
        ).lower()
        if not any(
            w in combined_history
            for w in [
                "pacemaker",
                "pacer",
                "cabg",
                "sternotomy",
                "defibrillator",
                "icd",
                "hardware",
            ]
        ):
            discordances.append(
                {
                    "type": DiscordanceCategory.UNDOCUMENTED_IMPLANT_OR_HARDWARE.value,
                    "category": DiscordanceCategory.UNDOCUMENTED_IMPLANT_OR_HARDWARE.value,
                    "severity": "HIGH",
                    "acuity": "HIGH",
                    "concept": "support_devices",
                    "message": (
                        "Radiograph detected implanted hardware or permanent pacemaker, "
                        "which is completely absent from the patient's documented Scribe history and EHR."
                    ),
                }
            )

    return {
        "cross_modal_aligned": len(discordances) == 0,
        "discordance_detected": len(discordances) > 0,
        "discordance_count": len(discordances),
        "alerts": discordances,
        "discordances": discordances,
    }
