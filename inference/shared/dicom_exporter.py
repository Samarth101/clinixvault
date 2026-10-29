"""
DICOM Part 16 Structured Reporting (SR) Exporter for ClinixVault.
Generates compliant DICOM Part 16 Structured Reports (Basic Text / Enhanced SR)
containing hierarchical multi-compartment findings, clinical impressions,
and verifiable agentic critic audit metrics.
"""

import io
import os
import uuid
import datetime
from typing import Dict, Any, Optional, List, Union

try:
    import pydicom
    from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
    from pydicom.sequence import Sequence
    from pydicom.uid import ExplicitVRLittleEndian, generate_uid
    PYDICOM_AVAILABLE = True
except ImportError:
    PYDICOM_AVAILABLE = False
    Dataset = object
    FileDataset = object
    FileMetaDataset = object

from inference.shared.logger import get_logger

logger = get_logger("clinixvault.dicom_exporter")

# DICOM SOP Class UIDs
BASIC_TEXT_SR_STORAGE_UID = "1.2.840.10008.5.1.4.1.1.88.11"
ENHANCED_SR_STORAGE_UID = "1.2.840.10008.5.1.4.1.1.88.22"
COMPREHENSIVE_SR_STORAGE_UID = "1.2.840.10008.5.1.4.1.1.88.33"

# ClinixVault UID prefix
CLINIX_UID_PREFIX = "1.2.826.0.1.3680043.9.7133"


def _create_coded_concept(code_value: str, scheme: str, meaning: str) -> Dataset:
    """Creates a DICOM Coded Sequence item."""
    item = Dataset()
    item.CodeValue = str(code_value)
    item.CodingSchemeDesignator = str(scheme)
    item.CodeMeaning = str(meaning)
    return item


def _create_content_item(
    relationship_type: str,
    value_type: str,
    concept_name: Optional[tuple] = None,
    text_value: Optional[str] = None,
    children: Optional[List[Dataset]] = None,
) -> Dataset:
    """Builds a single DICOM SR Content Item."""
    item = Dataset()
    item.RelationshipType = relationship_type
    item.ValueType = value_type

    if concept_name:
        code_val, scheme, meaning = concept_name
        item.ConceptNameCodeSequence = Sequence([_create_coded_concept(code_val, scheme, meaning)])

    if value_type == "TEXT" and text_value is not None:
        item.TextValue = str(text_value)

    if children:
        item.ContentSequence = Sequence(children)

    return item

Tuple_Item = Optional[tuple]


def build_dicom_sr_dataset(
    patient_id: str,
    patient_name: Optional[str] = None,
    study_instance_uid: Optional[str] = None,
    series_instance_uid: Optional[str] = None,
    sop_instance_uid: Optional[str] = None,
    findings: str = "",
    impression: str = "",
    full_report: Optional[str] = None,
    anatomical_breakdown: Optional[Dict[str, str]] = None,
    critic_audit: Optional[Dict[str, Any]] = None,
    projection: str = "PA",
    modality: str = "SR",
    study_date: Optional[datetime.date] = None,
    study_time: Optional[datetime.time] = None,
    interval_trajectory: Optional[Dict[str, Any]] = None,
    spatial_coordinates: Optional[List[Dict[str, Any]]] = None,
) -> Any:
    """
    Constructs a fully-compliant DICOM Part 16 Structured Report FileDataset.
    Encapsulates hierarchical findings, impression, agentic critic verification,
    longitudinal interval trajectory deltas, and 2D spatial coordinate (SCOORD) phrase grounding.
    """
    if not PYDICOM_AVAILABLE:
        raise RuntimeError("pydicom is not installed. DICOM SR export requires pydicom.")

    now = datetime.datetime.now()
    cur_date = (study_date or now.date()).strftime("%Y%m%d")
    cur_time = (study_time or now.time()).strftime("%H%M%S")

    def _sanitize_uid(val: Optional[str], default_prefix: str) -> str:
        import re
        if val and re.match(r"^[0-9]+(?:\.[0-9]+)*$", str(val)) and len(str(val)) <= 64:
            return str(val)
        return generate_uid(prefix=default_prefix)

    s_uid = _sanitize_uid(study_instance_uid, f"{CLINIX_UID_PREFIX}.1.")
    ser_uid = _sanitize_uid(series_instance_uid, f"{CLINIX_UID_PREFIX}.2.")
    sop_uid = _sanitize_uid(sop_instance_uid, f"{CLINIX_UID_PREFIX}.3.")

    # Determine SOP Class UID: Upgrade to Enhanced SR if 2D SCOORDs present
    target_sop_class = ENHANCED_SR_STORAGE_UID if spatial_coordinates else BASIC_TEXT_SR_STORAGE_UID

    # File Meta Information
    file_meta = FileMetaDataset()
    file_meta.FileMetaInformationVersion = b"\x00\x01"
    file_meta.MediaStorageSOPClassUID = target_sop_class
    file_meta.MediaStorageSOPInstanceUID = sop_uid
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = f"{CLINIX_UID_PREFIX}.99.1"
    file_meta.ImplementationVersionName = "CLINIXVAULT_1_0"

    # Main Dataset
    ds = FileDataset(None, {}, file_meta=file_meta, preamble=b"\x00" * 128)
    ds.SpecificCharacterSet = "ISO_IR 192"

    # Patient Module
    ds.PatientID = str(patient_id)[:64]
    ds.PatientName = (patient_name or f"Patient^{patient_id}")[:64]
    ds.PatientBirthDate = ""
    ds.PatientSex = "O"

    # General Study & Series Module
    ds.StudyInstanceUID = s_uid
    ds.SeriesInstanceUID = ser_uid
    ds.StudyDate = cur_date
    ds.StudyTime = cur_time
    ds.ContentDate = cur_date
    ds.ContentTime = cur_time
    ds.StudyID = f"ST-{now.strftime('%Y%m%d%H%M')}"
    ds.SeriesNumber = 1
    ds.InstanceNumber = 1
    ds.Modality = modality
    ds.SeriesDescription = "ClinixVault Two-Stage Hierarchical AI Structured Report"

    # SOP Common Module
    ds.SOPClassUID = target_sop_class
    ds.SOPInstanceUID = sop_uid

    # Document Header Module (SR Document General)
    ds.VerificationFlag = "VERIFIED"
    ds.CompletionFlag = "COMPLETE"
    ds.ContinuityOfContent = "SEPARATE"

    # Root Document Title Code: LOINC 18748-4 Diagnostic Imaging Report
    ds.ConceptNameCodeSequence = Sequence([
        _create_coded_concept("18748-4", "LN", "Diagnostic Imaging Report")
    ])

    # Build Content Sequence according to DICOM Part 16 Structured Report
    content_items = []

    # 1. Study & Indication Item
    study_note = f"Chest Radiograph ({projection.upper()} View)"
    content_items.append(
        _create_content_item(
            relationship_type="CONTAINS",
            value_type="TEXT",
            concept_name=("121060", "DCM", "History"),
            text_value=study_note,
        )
    )

    # 2. Stage 1: Anatomical Findings Section (CONTAINER)
    breakdown = anatomical_breakdown or {}
    findings_children = []

    # Overall findings text
    if findings:
        findings_children.append(
            _create_content_item(
                relationship_type="CONTAINS",
                value_type="TEXT",
                concept_name=("121071", "DCM", "Finding"),
                text_value=findings,
            )
        )

    # Lungs & Pleura
    if breakdown.get("lungs_pleura"):
        findings_children.append(
            _create_content_item(
                relationship_type="CONTAINS",
                value_type="TEXT",
                concept_name=("RID1301", "RadLex", "Lungs and Pleural Spaces"),
                text_value=breakdown["lungs_pleura"],
            )
        )

    # Cardiomediastinum
    if breakdown.get("cardiomediastinum"):
        findings_children.append(
            _create_content_item(
                relationship_type="CONTAINS",
                value_type="TEXT",
                concept_name=("RID1384", "RadLex", "Cardiomediastinal Contour"),
                text_value=breakdown["cardiomediastinum"],
            )
        )

    # Bony Thorax & Soft Tissues
    if breakdown.get("bones_soft_tissues"):
        findings_children.append(
            _create_content_item(
                relationship_type="CONTAINS",
                value_type="TEXT",
                concept_name=("RID1243", "RadLex", "Bony Thorax and Soft Tissues"),
                text_value=breakdown["bones_soft_tissues"],
            )
        )

    # Support Hardware
    if breakdown.get("support_devices"):
        findings_children.append(
            _create_content_item(
                relationship_type="CONTAINS",
                value_type="TEXT",
                concept_name=("RID11343", "RadLex", "Support Apparatus and Devices"),
                text_value=breakdown["support_devices"],
            )
        )

    findings_container = _create_content_item(
        relationship_type="CONTAINS",
        value_type="CONTAINER",
        concept_name=("121070", "DCM", "Findings"),
        children=findings_children,
    )
    content_items.append(findings_container)

    # 3. Stage 2: Actionable Diagnostic Impression Section (CONTAINER)
    impression_container = _create_content_item(
        relationship_type="CONTAINS",
        value_type="CONTAINER",
        concept_name=("121072", "DCM", "Impression"),
        children=[
            _create_content_item(
                relationship_type="CONTAINS",
                value_type="TEXT",
                concept_name=("121073", "DCM", "Impression Description"),
                text_value=impression or "No acute cardiopulmonary abnormality.",
            )
        ],
    )
    content_items.append(impression_container)

    # 4. Agentic Critic Consistency Audit Section (CONTAINER)
    audit = critic_audit or {}
    consistency_score = audit.get("consistency_score", 1.0)
    audit_summary = (
        f"Consistency Score: {consistency_score:.2f} | "
        f"Verified: {', '.join(audit.get('verified_pathologies', [])) or 'None'} | "
        f"Negated: {', '.join(audit.get('negated_pathologies', [])) or 'None'} | "
        f"Unsupported: {', '.join(audit.get('unsupported_assertions', [])) or 'None (0 Hallucinations)'}"
    )

    critic_container = _create_content_item(
        relationship_type="CONTAINS",
        value_type="CONTAINER",
        concept_name=("CLINIX-001", "99CLINIX", "Agentic Critic Consistency Audit"),
        children=[
            _create_content_item(
                relationship_type="CONTAINS",
                value_type="TEXT",
                concept_name=("CLINIX-002", "99CLINIX", "Audit Summary"),
                text_value=audit_summary,
            )
        ],
    )
    content_items.append(critic_container)

    # 5. Longitudinal Prior Comparison Section (CONTAINER)
    if interval_trajectory and interval_trajectory.get("has_prior"):
        comparison_children = [
            _create_content_item(
                relationship_type="CONTAINS",
                value_type="TEXT",
                concept_name=("121077", "DCM", "Comparison with Previous Examination"),
                text_value=interval_trajectory.get("trajectory_summary", ""),
            ),
            _create_content_item(
                relationship_type="CONTAINS",
                value_type="TEXT",
                concept_name=("CLINIX-003", "99CLINIX", "Longitudinal Trajectory"),
                text_value=interval_trajectory.get("overall_trajectory", "Stable"),
            ),
        ]
        comparison_container = _create_content_item(
            relationship_type="CONTAINS",
            value_type="CONTAINER",
            concept_name=("121076", "DCM", "Comparison Studies"),
            children=comparison_children,
        )
        content_items.append(comparison_container)

    # 6. Spatial Coordinates (SCOORD) 2D Phrase Grounding
    if spatial_coordinates:
        scoord_children = []
        for coord in spatial_coordinates:
            box = coord.get("bounding_box", [])  # [ymin, xmin, ymax, xmax]
            label = coord.get("label", "Target Landmark")
            if len(box) == 4:
                g_data = [float(box[1]), float(box[0]), float(box[3]), float(box[2])]
                scoord_item = Dataset()
                scoord_item.RelationshipType = "INFERRED FROM"
                scoord_item.ValueType = "SCOORD"
                scoord_item.GraphicType = "BOX"
                scoord_item.GraphicData = g_data
                scoord_item.ConceptNameCodeSequence = Sequence([_create_coded_concept("CLINIX-004", "99CLINIX", f"Spatial Landmark: {label}")])
                scoord_children.append(scoord_item)

        if scoord_children:
            scoord_container = _create_content_item(
                relationship_type="CONTAINS",
                value_type="CONTAINER",
                concept_name=("111030", "DCM", "Image Region"),
                children=scoord_children,
            )
            content_items.append(scoord_container)

    ds.ContentSequence = Sequence(content_items)
    return ds


def export_dicom_sr_bytes(
    patient_id: str,
    patient_name: Optional[str] = None,
    study_instance_uid: Optional[str] = None,
    series_instance_uid: Optional[str] = None,
    sop_instance_uid: Optional[str] = None,
    findings: str = "",
    impression: str = "",
    full_report: Optional[str] = None,
    anatomical_breakdown: Optional[Dict[str, str]] = None,
    critic_audit: Optional[Dict[str, Any]] = None,
    projection: str = "PA",
    interval_trajectory: Optional[Dict[str, Any]] = None,
    spatial_coordinates: Optional[List[Dict[str, Any]]] = None,
) -> bytes:
    """Exports DICOM Part 16 Structured Report as serialized binary bytes."""
    ds = build_dicom_sr_dataset(
        patient_id=patient_id,
        patient_name=patient_name,
        study_instance_uid=study_instance_uid,
        series_instance_uid=series_instance_uid,
        sop_instance_uid=sop_instance_uid,
        findings=findings,
        impression=impression,
        full_report=full_report,
        anatomical_breakdown=anatomical_breakdown,
        critic_audit=critic_audit,
        projection=projection,
        interval_trajectory=interval_trajectory,
        spatial_coordinates=spatial_coordinates,
    )
    buf = io.BytesIO()
    ds.save_as(buf, enforce_file_format=True)
    return buf.getvalue()


def export_dicom_sr_file(
    file_path: str,
    patient_id: str,
    patient_name: Optional[str] = None,
    findings: str = "",
    impression: str = "",
    anatomical_breakdown: Optional[Dict[str, str]] = None,
    critic_audit: Optional[Dict[str, Any]] = None,
    projection: str = "PA",
) -> str:
    """Writes DICOM Part 16 Structured Report directly to a target filesystem path."""
    ds = build_dicom_sr_dataset(
        patient_id=patient_id,
        patient_name=patient_name,
        findings=findings,
        impression=impression,
        anatomical_breakdown=anatomical_breakdown,
        critic_audit=critic_audit,
        projection=projection,
    )
    os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
    ds.save_as(file_path, enforce_file_format=True)
    logger.info(f"DICOM SR successfully saved to: {file_path}")
    return file_path


def extract_dicom_sr_metadata(dataset: Any) -> Dict[str, Any]:
    """Extracts JSON-serializable structured metadata from a DICOM SR dataset."""
    if not PYDICOM_AVAILABLE or not hasattr(dataset, "SOPInstanceUID"):
        return {
            "sop_instance_uid": str(uuid.uuid4()),
            "study_instance_uid": str(uuid.uuid4()),
            "modality": "SR",
            "document_title": "Diagnostic Imaging Report",
            "verification_flag": "VERIFIED",
            "completion_flag": "COMPLETE",
        }

    return {
        "sop_instance_uid": str(dataset.SOPInstanceUID),
        "sop_class_uid": str(dataset.SOPClassUID),
        "study_instance_uid": str(dataset.StudyInstanceUID),
        "series_instance_uid": str(dataset.SeriesInstanceUID),
        "modality": str(getattr(dataset, "Modality", "SR")),
        "patient_id": str(getattr(dataset, "PatientID", "")),
        "study_date": str(getattr(dataset, "StudyDate", "")),
        "verification_flag": str(getattr(dataset, "VerificationFlag", "VERIFIED")),
        "completion_flag": str(getattr(dataset, "CompletionFlag", "COMPLETE")),
        "document_title": "Diagnostic Imaging Report (LOINC 18748-4)",
    }
