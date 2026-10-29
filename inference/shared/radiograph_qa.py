"""
Pre-VLM Radiographic Technical Quality Assurance (QA) Gate.
Evaluates portable chest radiograph exposure adequacy, contrast fog,
hemithorax symmetry (rotation), and costophrenic angle clipping in < 10ms on CPU.
"""

from typing import Dict, Any, List
import numpy as np


def evaluate_radiograph_technical_qa(pixel_array: np.ndarray) -> Dict[str, Any]:
    """
    Fast pre-VLM technical quality assurance gate evaluating exposure adequacy,
    dynamic contrast, hemithorax symmetry (rotation), and inferior border clipping.
    """
    gray = pixel_array.mean(axis=-1).astype(np.float32) if pixel_array.ndim == 3 else pixel_array.astype(np.float32)
    p_max = float(gray.max()) if gray.size > 0 else 255.0
    scale = 4095.0 if p_max > 255.0 else 255.0
    norm = np.clip(gray / scale, 0.0, 1.0)

    warnings: List[str] = []
    mean_intensity = float(norm.mean())
    std_contrast = float(norm.std())

    # 1. Under-penetration / Over-exposure check
    if mean_intensity > 0.82:
        warnings.append("UNDER_PENETRATED_BRIGHT: High mean attenuation may obscure retrocardiac pathology.")
    elif mean_intensity < 0.18:
        warnings.append("OVER_EXPOSED_DARK: Low mean signal may obscure subtle pneumothorax or interstitial markings.")

    # 2. Low dynamic contrast check
    if std_contrast < 0.08:
        warnings.append("LOW_CONTRAST_FOG: Narrow dynamic range detected; apply CLAHE windowing.")

    # 3. Patient rotation / clavicular-thoracic asymmetry estimation
    h, w = norm.shape
    upper_thorax = norm[int(h * 0.15) : int(h * 0.35), :]
    left_half = float(upper_thorax[:, : w // 2].mean()) if w >= 2 else 0.5
    right_half = float(upper_thorax[:, w // 2 :].mean()) if w >= 2 else 0.5
    asymmetry_score = abs(left_half - right_half)
    if asymmetry_score > 0.18:
        warnings.append("PATIENT_ROTATION_ASYMMETRY: Significant hemithorax attenuation asymmetry suggests rotation.")

    # 4. Inferior costophrenic angle cutoff check
    bottom_strip = norm[int(h * 0.94) :, int(w * 0.15) : int(w * 0.85)]
    if bottom_strip.size > 0 and float(bottom_strip.mean()) < 0.25:
        warnings.append("COSTOPHRENIC_CLIPPING_RISK: Aerated lung extends to inferior image edge; bases may be clipped.")

    status = "ADEQUATE" if not warnings else ("REJECT_REPEAT_RECOMMENDED" if len(warnings) >= 3 else "SUBOPTIMAL_WARNING")
    return {
        "status": status,
        "technical_status": status,
        "mean_intensity": round(mean_intensity, 3),
        "mean_exposure": round(mean_intensity, 3),
        "contrast_std": round(std_contrast, 3),
        "asymmetry_score": round(asymmetry_score, 3),
        "rotation_asymmetry": round(asymmetry_score, 3),
        "warnings": warnings,
        "qa_warnings": warnings,
    }
