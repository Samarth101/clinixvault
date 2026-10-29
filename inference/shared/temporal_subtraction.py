"""
Same-Patient Digital Subtraction Radiography (DSR) Temporal Engine.
Computes longitudinal attenuation deltas and difference heatmaps
between sequential radiographs of the same patient without MM-RAG prompt contamination (ADR-002).
"""

from typing import Dict, Any, Optional
import numpy as np
import base64
import io
from PIL import Image


def compute_temporal_subtraction_metrics(
    current_img: np.ndarray,
    prior_img: np.ndarray,
    generate_base64_heatmap: bool = False,
) -> Dict[str, Any]:
    """
    Computes same-patient longitudinal pixel attenuation changes across thoracic quadrants
    without cross-patient MM-RAG prompt contamination (ADR-002 compliant).
    """
    curr = current_img.mean(axis=-1).astype(np.float32) if current_img.ndim == 3 else current_img.astype(np.float32)
    prev = prior_img.mean(axis=-1).astype(np.float32) if prior_img.ndim == 3 else prior_img.astype(np.float32)

    # Zero-mean unit-variance intensity normalization to account for portable X-ray exposure drift
    curr_norm = (curr - curr.mean()) / max(float(curr.std()), 1e-5)
    prev_norm = (prev - prev.mean()) / max(float(prev.std()), 1e-5)

    # Resize prior via nearest-neighbor grid sampling if dimensions differ
    if curr_norm.shape != prev_norm.shape:
        h, w = curr_norm.shape
        y_idx = (np.linspace(0, prev_norm.shape[0] - 1, h)).astype(np.int32)
        x_idx = (np.linspace(0, prev_norm.shape[1] - 1, w)).astype(np.int32)
        prev_norm = prev_norm[np.ix_(y_idx, x_idx)]

    diff = curr_norm - prev_norm
    h, w = diff.shape
    right_lung_roi = diff[int(h * 0.2) : int(h * 0.8), int(w * 0.1) : int(w * 0.45)]
    left_lung_roi = diff[int(h * 0.2) : int(h * 0.8), int(w * 0.55) : int(w * 0.9)]

    r_delta = float(right_lung_roi.mean()) if right_lung_roi.size > 0 else 0.0
    l_delta = float(left_lung_roi.mean()) if left_lung_roi.size > 0 else 0.0

    def _classify_delta(val: float) -> str:
        if val > 0.25:
            return "INTERVAL_INCREASED_OPACITY"
        if val < -0.25:
            return "INTERVAL_CLEARING_AERATION"
        return "STABLE_INTERVAL_APPEARANCE"

    # Normalize difference map to [0, 255] uint8 heatmap intensity
    heatmap_uint8 = np.clip((diff + 2.0) / 4.0 * 255.0, 0, 255).astype(np.uint8)

    r_status = _classify_delta(r_delta)
    l_status = _classify_delta(l_delta)
    overall_status = r_status if r_status != "STABLE_INTERVAL_APPEARANCE" else l_status

    result = {
        "right_hemithorax_delta": round(r_delta, 4),
        "left_hemithorax_delta": round(l_delta, 4),
        "right_status": r_status,
        "left_status": l_status,
        "temporal_delta_classification": overall_status,
        "difference_map_shape": list(heatmap_uint8.shape),
    }

    if generate_base64_heatmap:
        try:
            pil_img = Image.fromarray(heatmap_uint8, mode="L")
            buf = io.BytesIO()
            pil_img.save(buf, format="PNG")
            result["difference_heatmap_base64"] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception:
            pass

    return result
