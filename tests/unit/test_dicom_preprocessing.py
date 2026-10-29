"""
Unit Tests for Kaggle Preprocessing Image Resizing and DICOM Support.
"""

import os
import pytest
from PIL import Image
from inference.shared.image_utils import resize_and_save_image, TARGET_SIZE


def test_resize_and_save_standard_image(tmp_path):
    src_img = tmp_path / "raw_cxr.png"
    dst_img = tmp_path / "out_cxr.jpg"

    # Create synthetic raw 1024x768 image
    img = Image.new("RGB", (1024, 768), color=(100, 150, 200))
    img.save(src_img)

    success = resize_and_save_image(str(src_img), str(dst_img), target_size=TARGET_SIZE)
    assert success is True
    assert os.path.exists(dst_img)

    with Image.open(dst_img) as res_img:
        assert res_img.size == TARGET_SIZE
        assert res_img.format == "JPEG"


def test_resize_and_save_missing_file(tmp_path):
    missing_path = tmp_path / "non_existent.dcm"
    dst_img = tmp_path / "out.jpg"

    success = resize_and_save_image(str(missing_path), str(dst_img))
    assert success is False
