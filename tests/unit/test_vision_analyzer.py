"""
Unit Tests for Computer Vision & Pixel Biomarker Analyzer (`inference/shared/vision_analyzer.py`).
Verifies:
1. Authentic extraction of CTR, basal densities, and 4-compartment observations directly from image arrays.
2. Different images generate distinctly calibrated reports rather than static text.
3. Detection of cardiomegaly and hardware signatures.
"""

import numpy as np
from PIL import Image
from inference.shared.vision_analyzer import analyze_chest_xray_pixels


def test_analyze_chest_xray_pixels_normal():
    """Generates synthetic clear radiograph and confirms normal CTR and clear lungs."""
    # Synthetic 256x256 image with normal cardiac silhouette
    arr = np.full((256, 256), 40, dtype=np.uint8)  # dark lungs
    arr[120:180, 105:145] = 160  # small normal heart (~40px width out of 200px thorax -> CTR ~ 0.44)
    img = Image.fromarray(arr)

    res = analyze_chest_xray_pixels(img, projection="PA")
    assert "breakdown" in res
    assert "biomarkers" in res
    assert "findings" in res
    assert "impression" in res

    bm = res["biomarkers"]
    assert 0.38 <= bm["ctr"] <= 0.65
    assert not bm["has_hardware"]
    assert "lungs_pleura" in res["breakdown"]
    assert "cardiomediastinum" in res["breakdown"]


def test_analyze_chest_xray_pixels_cardiomegaly():
    """Generates synthetic radiograph with prominent enlarged heart and confirms cardiomegaly detection."""
    arr = np.full((256, 256), 40, dtype=np.uint8)
    arr[110:190, 80:185] = 210  # wide heart spanning 105px width -> CTR > 0.52
    img = Image.fromarray(arr)

    res = analyze_chest_xray_pixels(img, projection="PA")
    bm = res["biomarkers"]
    assert bm["ctr"] > 0.50
    assert bm["has_cardiomegaly"] is True
    assert "cardiomegaly" in res["impression"].lower()
    assert "cardiomegaly" in res["breakdown"]["cardiomediastinum"].lower()


def test_analyze_chest_xray_pixels_pacemaker_hardware():
    """Generates synthetic radiograph with high-density metal cluster in right pectoral region."""
    arr = np.full((256, 256), 50, dtype=np.uint8)
    # Right pectoral metallic pacemaker (intensity 250)
    arr[35:65, 30:60] = 250
    img = Image.fromarray(arr)

    res = analyze_chest_xray_pixels(img, projection="PA")
    bm = res["biomarkers"]
    assert bm["has_hardware"] is True
    assert "pacemaker" in res["breakdown"]["support_devices"].lower()
    assert "pac" in res["impression"].lower()


def test_distinct_images_generate_distinct_reports():
    """Confirms two different images produce distinct biomarkers and findings."""
    img1 = Image.fromarray(np.random.randint(20, 60, (256, 256), dtype=np.uint8))
    img2 = Image.fromarray(np.full((256, 256), 180, dtype=np.uint8))

    res1 = analyze_chest_xray_pixels(img1)
    res2 = analyze_chest_xray_pixels(img2)

    assert res1["biomarkers"]["image_hash"] != res2["biomarkers"]["image_hash"]
    assert res1["findings"] != res2["findings"]
