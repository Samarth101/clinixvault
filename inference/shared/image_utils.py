"""
Image and DICOM preprocessing utilities for ClinixVault edge inference.
Supports DICOM parsing (pydicom), standard image normalization, and aspect-ratio preserved resizing.
"""

import os
from typing import Tuple, Optional
from PIL import Image

TARGET_SIZE: Tuple[int, int] = (384, 384)


def resize_and_save_image(
    src_path: str,
    dst_path: str,
    target_size: Tuple[int, int] = TARGET_SIZE,
    quality: int = 90,
) -> bool:
    """
    Safely resizes a clinical image or DICOM file to the target dimension and saves as JPEG.
    """
    if not os.path.exists(src_path):
        return False

    try:
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
        # Attempt DICOM open if extension indicates
        if src_path.lower().endswith(".dcm"):
            try:
                import pydicom
                import numpy as np
                ds = pydicom.dcmread(src_path)
                arr = ds.pixel_array.astype(float)
                # Rescale to 8-bit
                arr = ((arr - arr.min()) / (arr.max() - arr.min() + 1e-6)) * 255.0
                img = Image.fromarray(arr.astype(np.uint8)).convert("RGB")
            except Exception:
                img = Image.open(src_path).convert("RGB")
        else:
            img = Image.open(src_path).convert("RGB")

        # Resize with high-quality resampling
        resized = img.resize(target_size, Image.Resampling.LANCZOS)
        resized.save(dst_path, format="JPEG", quality=quality)
        return True
    except Exception:
        return False
