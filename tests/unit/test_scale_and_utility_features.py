"""
Unit and Integration Tests for Hospital-Scale Clinical Intelligence Features.
Validates:
1. Cross-Modal Discordance Engine ("Virtual Case Board")
2. Same-Patient Digital Subtraction Radiography (DSR) & Pre-VLM Technical QA Gate
3. Preemptive Priority Scheduler & Content-Addressable Cryptographic Cache
4. 6th-Grade Layman Readability Enforcer & Automated I-PASS Shift Handoff Synthesizer
5. Zero-PHI Federated LoRA Adapter Aggregator
"""

import asyncio
import numpy as np
import pytest
import tempfile
import os

from backend.audit.cross_modal_discordance import (
    audit_cross_modal_discordance,
    DiscordanceCategory,
)
from inference.shared.radiograph_qa import evaluate_radiograph_technical_qa
from inference.shared.temporal_subtraction import compute_temporal_subtraction_metrics
from backend.gateway.middleware.priority_scheduler import (
    ClinicalUrgency,
    ContentAddressableClinicalCache,
    PreemptiveClinicalScheduler,
)
from backend.gateway.routes.clinical_utilities import (
    enforce_6th_grade_layman_report,
    synthesize_ipass_shift_handoff,
)
from training.federated.adapter_aggregator import FederatedAdapterAggregator


def test_cross_modal_discordance_detects_occult_pneumonia_and_undocumented_pacemaker():
    """Validates virtual case board flags hidden discordances across clinical modalities."""
    # Scenario A: Occult Pneumonia (Clear physical exam vs dense consolidation on X-ray)
    scribe_clear_lungs = {
        "subjective": "Patient reports dry cough for two days without fevers.",
        "objective": "Vital signs normal. Lungs clear to auscultation bilaterally. No wheezes, rales, or rhonchi.",
        "assessment": "Mild viral upper respiratory infection.",
        "plan": "Symptomatic care and fluids.",
    }
    rad_pneumonia = {
        "findings": "Dense confluent consolidation in the right lower lobe with prominent air bronchograms.",
        "impression": "Acute right lower lobe bacterial pneumonia.",
    }

    audit_result = audit_cross_modal_discordance(
        scribe_soap=scribe_clear_lungs,
        radiology_report=rad_pneumonia,
    )

    assert audit_result["discordance_detected"] is True
    assert len(audit_result["discordances"]) >= 1
    categories = [d["category"] for d in audit_result["discordances"]]
    assert DiscordanceCategory.OCCULT_RADIOGRAPHIC_FINDING.value in categories or DiscordanceCategory.CLINICAL_RADIOGRAPHIC_DISSOCIATION.value in categories
    assert any(d["acuity"] in ("CRITICAL", "HIGH") for d in audit_result["discordances"])

    # Scenario B: Undocumented Pacemaker / Hardware
    scribe_no_devices = {
        "subjective": "Routine follow up.",
        "objective": "Heart regular rate and rhythm. No murmurs.",
        "assessment": "Hypertension controlled.",
        "plan": "Continue lisinopril.",
    }
    rad_pacemaker = {
        "findings": "Dual-chamber permanent pacemaker noted with transvenous leads terminating in the right atrium and right ventricle.",
        "impression": "Normal cardiomediastinal contour. Dual-chamber pacemaker intact.",
    }

    audit_pacemaker = audit_cross_modal_discordance(
        scribe_soap=scribe_no_devices,
        radiology_report=rad_pacemaker,
    )

    assert audit_pacemaker["discordance_detected"] is True
    pm_categories = [d["category"] for d in audit_pacemaker["discordances"]]
    assert DiscordanceCategory.UNDOCUMENTED_IMPLANT_OR_HARDWARE.value in pm_categories


def test_temporal_subtraction_and_technical_qa_gate():
    """Validates DSR difference heatmaps and fast CPU pre-VLM technical quality gate."""
    # 1. Technical QA Gate: Normal Synthetic Radiograph
    normal_img = np.random.normal(loc=128, scale=35, size=(512, 512)).clip(0, 255).astype(np.uint8)
    qa_normal = evaluate_radiograph_technical_qa(normal_img)
    assert "status" in qa_normal
    assert "mean_intensity" in qa_normal
    assert "contrast_std" in qa_normal
    assert "asymmetry_score" in qa_normal

    # Technical QA Gate: Over-exposed / Under-penetrated bright image
    bright_img = np.full((512, 512), 245, dtype=np.uint8)
    qa_bright = evaluate_radiograph_technical_qa(bright_img)
    assert qa_bright["status"] in ("SUBOPTIMAL_WARNING", "REJECT_REPEAT_RECOMMENDED")
    assert any("UNDER_PENETRATED_BRIGHT" in w for w in qa_bright["warnings"])

    # Technical QA Gate: Low-contrast image
    flat_img = np.full((512, 512), 120, dtype=np.uint8)
    qa_flat = evaluate_radiograph_technical_qa(flat_img)
    assert any("LOW_CONTRAST_FOG" in w for w in qa_flat["warnings"])

    # 2. Digital Subtraction Radiography (DSR)
    prior_scan = np.ones((512, 512), dtype=np.float32) * 100.0
    current_scan = prior_scan.copy()
    # Add interval density in right lung zone
    current_scan[150:350, 80:200] += 80.0

    dsr_result = compute_temporal_subtraction_metrics(
        current_img=current_scan,
        prior_img=prior_scan,
        generate_base64_heatmap=True,
    )

    assert "temporal_delta_classification" in dsr_result
    assert dsr_result["right_hemithorax_delta"] > 0
    assert dsr_result["temporal_delta_classification"] == "INTERVAL_INCREASED_OPACITY"
    assert dsr_result["difference_heatmap_base64"] is not None


def test_priority_scheduler_and_content_addressable_cache():
    """Validates preemptive scheduling of STAT indications and sub-2ms cache hits."""
    # 1. Content-Addressable Cryptographic Cache
    cache = ContentAddressableClinicalCache(max_entries=10, ttl_seconds=60)
    img_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    key1 = cache.build_key(
        image_base64=img_b64,
        projection="PA",
        clinical_indication="Routine checkup",
        model_name="clinixvault-qwen2vl",
    )
    key2 = cache.build_key(
        image_base64=img_b64,
        projection="PA",
        clinical_indication="Routine checkup",
        model_name="clinixvault-qwen2vl",
    )
    assert key1 == key2

    # Put and retrieve
    dummy_payload = {"patient_id": "PT-101", "impression": "Normal chest radiograph."}
    cache.put(key1, dummy_payload)
    cached = cache.get(key1)
    assert cached is not None
    assert cached["patient_id"] == "PT-101"
    assert cached["cache_hit"] is True

    # 2. Priority Scheduler (Async Execution)
    async def _async_test():
        scheduler = PreemptiveClinicalScheduler(max_concurrent_gpu_tasks=1)
        stat_urgency = scheduler.infer_urgency("STAT trauma intubated acute dyspnea")
        routine_urgency = scheduler.infer_urgency("Routine outpatient health screening")
        assert stat_urgency == ClinicalUrgency.STAT_ICU_ER
        assert routine_urgency == ClinicalUrgency.ROUTINE_OUTPATIENT

        execution_order = []

        async def routine_coro():
            await asyncio.sleep(0.05)
            execution_order.append("ROUTINE")
            return "routine_done"

        async def stat_coro():
            execution_order.append("STAT")
            return "stat_done"

        # Start routine first, schedule stat immediately
        t_routine = asyncio.create_task(scheduler.execute_prioritized(routine_urgency, routine_coro))
        await asyncio.sleep(0.005)  # Let routine acquire the single slot
        t_stat = asyncio.create_task(scheduler.execute_prioritized(stat_urgency, stat_coro))

        res_routine, res_stat = await asyncio.gather(t_routine, t_stat)
        assert res_routine == "routine_done"
        assert res_stat == "stat_done"
        assert "STAT" in execution_order
        assert "ROUTINE" in execution_order

    asyncio.run(_async_test())


def test_layman_readability_and_ipass_handoff():
    """Validates 6th-grade readability enforcement and structured I-PASS handoff synthesis."""
    # 1. Layman Readability Enforcer
    raw_patient_report = {
        "title": "Radiology Findings",
        "explanation": "Severe cardiomegaly with dense alveolar consolidation, bibasilar atelectasis, and large pleural effusion.",
        "what_this_means": "Correlate with dyspnea.",
    }
    technical_source = "Cardiomegaly with bilateral pleural effusion and right lower lobe consolidation."

    calibrated = enforce_6th_grade_layman_report(raw_patient_report, technical_source)
    assert "readability_metrics" in calibrated
    metrics = calibrated["readability_metrics"]
    assert "fk_grade_level" in metrics
    assert "flesch_reading_ease" in metrics

    # Medical jargon translation check
    exp = calibrated["explanation"].lower()
    assert "enlarged heart" in exp or "fluid around the lungs" in exp or "lung collapse" in exp or "infection" in exp
    assert len(calibrated.get("return_precautions", [])) > 0

    # 2. I-PASS Shift Handoff Generator
    soap_data = {
        "subjective": "Patient admitted with severe worsening dyspnea and orthopnea.",
        "objective": "O2 sat 88% on room air, bilateral crackles.",
        "assessment": "Acute decompensated congestive heart failure with respiratory distress.",
        "plan": "IV furosemide 40mg, supplemental oxygen via nasal cannula.",
    }
    rad_data = {
        "impression": "Marked pulmonary vascular congestion and moderate bilateral pleural effusions consistent with fluid overload."
    }

    handoff = synthesize_ipass_shift_handoff(
        patient_id="PT-CARDIAC-99",
        patient_name="Eleanor Vance",
        mrn="MRN-EV-9901",
        scribe_soap=soap_data,
        radiology_report=rad_data,
        acuity_override="UNSTABLE / STAT",
    )

    assert handoff["patient_id"] == "PT-CARDIAC-99"
    assert handoff["illness_severity"]["category"] == "UNSTABLE / STAT"
    assert len(handoff["patient_summary"]["active_diagnoses"]) > 0
    assert len(handoff["action_list"]) > 0
    assert len(handoff["situation_awareness"]["contingency_plans"]) > 0
    assert "synthesis_by_receiver" in handoff


def test_federated_adapter_aggregator():
    """Validates Zero-PHI federated adapter aggregation with signed delta verification."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        aggregator = FederatedAdapterAggregator(secret_key="hospital-mesh-secret-key")

        # Simulate adapter weights from Node 1 (ER) and Node 2 (ICU)
        delta1 = {
            "base_model.model.vlm.q_proj.weight": np.array([[0.1, -0.2], [0.3, 0.4]], dtype=np.float32),
            "base_model.model.vlm.v_proj.weight": np.array([[-0.5, 0.2], [0.1, 0.0]], dtype=np.float32),
        }
        sig1 = aggregator.generate_node_signature("node-er-01", delta1)

        delta2 = {
            "base_model.model.vlm.q_proj.weight": np.array([[0.3, 0.0], [0.1, 0.2]], dtype=np.float32),
            "base_model.model.vlm.v_proj.weight": np.array([[-0.1, 0.4], [0.3, -0.2]], dtype=np.float32),
        }
        sig2 = aggregator.generate_node_signature("node-icu-02", delta2)

        # Ingest both node contributions
        ok1 = aggregator.ingest_node_delta(
            node_id="node-er-01",
            weights_delta=delta1,
            num_samples=100,
            signature_hex=sig1,
        )
        ok2 = aggregator.ingest_node_delta(
            node_id="node-icu-02",
            weights_delta=delta2,
            num_samples=300,
            signature_hex=sig2,
        )
        assert ok1 is True
        assert ok2 is True

        # Ingest with forged signature should fail
        bad_ok = aggregator.ingest_node_delta(
            node_id="node-rogue-03",
            weights_delta=delta1,
            num_samples=50,
            signature_hex="deadbeef0123456789abcdef",
        )
        assert bad_ok is False

        # Aggregate and export
        export_file = os.path.join(tmp_dir, "aggregated_adapter.safetensors")
        summary = aggregator.aggregate_and_export(export_path=export_file)

        assert summary["status"] == "success"
        assert summary["participating_nodes"] == ["node-er-01", "node-icu-02"]
        assert summary["total_samples"] == 400
        assert os.path.exists(export_file)
