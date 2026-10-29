"""
High-Level Clinical Knowledge Graph Store & Operations.
Coordinates node/edge creation, ontological seed ingestion, and patient graph lifecycle.
"""

from typing import Dict, Any, List, Optional
import uuid
import time
from backend.database.neo4j_connection import get_graph_manager, Neo4jGraphManager
from backend.database.graph_schema import (
    GraphNodeLabels,
    GraphRelationTypes,
    CURATED_CLINICAL_ONTOLOGY,
)
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.database.graph_store")


class ClinicalGraphStore:
    def __init__(self, manager: Optional[Neo4jGraphManager] = None):
        self.manager = manager or get_graph_manager()
        self._seeded = False
        self.seed_ontology()

    def seed_ontology(self) -> None:
        """Seeds curated ontology triples into graph database."""
        if self._seeded:
            return
        try:
            for item in CURATED_CLINICAL_ONTOLOGY:
                src = item["source"]
                tgt = item["target"]
                rel = item["rel"]
                props = item.get("props", {})

                # Upsert source node
                self.manager.add_node(
                    node_id=src["id"],
                    label=src["label"],
                    properties={k: v for k, v in src.items() if k not in ("id", "label")},
                )
                # Upsert target node
                self.manager.add_node(
                    node_id=tgt["id"],
                    label=tgt["label"],
                    properties={k: v for k, v in tgt.items() if k not in ("id", "label")},
                )
                # Upsert relationship
                self.manager.add_edge(
                    source_id=src["id"],
                    target_id=tgt["id"],
                    rel_type=rel,
                    properties=props,
                )
            self._seeded = True
            logger.info(f"Seeded {len(CURATED_CLINICAL_ONTOLOGY)} clinical ontology triples into graph.")
        except Exception as e:
            logger.warning(f"Error seeding clinical ontology: {e}")

    def ensure_patient(
        self,
        patient_id: str,
        name: Optional[str] = None,
        gender: Optional[str] = None,
        mrn: Optional[str] = None,
    ) -> None:
        """Ensures Patient node exists with authentic cohort metadata."""
        resolved_name = name
        resolved_gender = gender or "Unknown"
        resolved_mrn = mrn

        if not resolved_name or resolved_name == "Clinical Patient":
            try:
                from backend.database.connection import SessionLocal
                from backend.database.models import Patient
                with SessionLocal() as db:
                    p = db.query(Patient).filter((Patient.id == patient_id) | (Patient.mrn == patient_id)).first()
                    if p:
                        resolved_name = f"{p.first_name} {p.last_name}"
                        resolved_gender = p.gender or resolved_gender
                        resolved_mrn = p.mrn
            except Exception:
                pass

        if not resolved_name or resolved_name == "Clinical Patient":
            from backend.gateway.routes.patients import DEFAULT_COHORT
            for c in DEFAULT_COHORT:
                if c["id"] == patient_id or c["mrn"] == patient_id:
                    resolved_name = f"{c['first_name']} {c['last_name']}"
                    resolved_gender = c["gender"]
                    resolved_mrn = c["mrn"]
                    break

        if not resolved_name or resolved_name == "Clinical Patient":
            resolved_name = f"Patient {patient_id}"

        self.manager.add_node(
            node_id=patient_id,
            label=GraphNodeLabels.PATIENT,
            properties={
                "name": resolved_name,
                "gender": resolved_gender,
                "mrn": resolved_mrn or f"MRN-{patient_id[:8]}",
                "registered_at": time.time(),
            },
        )

    def ingest_diagnostic_report(
        self,
        patient_id: str,
        report_id: str,
        findings: str,
        impression: str,
        pathologies: Optional[List[Dict[str, Any]]] = None,
        provenance: Optional[Dict[str, Any]] = None,
        modality: str = "Chest Radiography (CXR)",
        interval_trajectory: Optional[Dict[str, Any]] = None,
        study_date: Optional[str] = None,
        prior_study_id: Optional[str] = None,
    ) -> str:
        """
        Maps a generated radiology report into connected graph nodes and edges.
        Links: (Patient)-[:HAS_REPORT]->(DiagnosticReport)-[:REPORTS_FINDING]->(Condition)
        Supports bi-temporal interval comparison edges and cross-study delta tracking.
        """
        self.ensure_patient(patient_id)

        # 1. DiagnosticReport node
        report_node_id = f"report-{report_id}"
        self.manager.add_node(
            node_id=report_node_id,
            label=GraphNodeLabels.DIAGNOSTIC_REPORT,
            properties={
                "report_id": report_id,
                "modality": modality,
                "findings": findings[:400],
                "impression": impression[:400],
                "timestamp": time.time(),
                "study_date": study_date or time.strftime("%Y-%m-%d"),
            },
        )

        # Connect Patient -> DiagnosticReport
        self.manager.add_edge(
            source_id=patient_id,
            target_id=report_node_id,
            rel_type="HAS_REPORT",
            properties={"modality": modality, "study_date": study_date or time.strftime("%Y-%m-%d")},
        )

        # 2. Pathologies / Findings as Condition nodes
        findings_lower = (findings + " " + impression).lower()

        # Check for CHF / Cardiomegaly / Effusion
        if "cardiomegaly" in findings_lower:
            self.manager.add_edge(
                source_id=report_node_id,
                target_id="cond-cardiomegaly",
                rel_type=GraphRelationTypes.REPORTS_FINDING,
                properties={"confidence": 0.98, "status": "active", "temporal_status": "active"},
            )
            self.manager.add_edge(
                source_id=patient_id,
                target_id="cond-cardiomegaly",
                rel_type=GraphRelationTypes.DIAGNOSED_WITH,
                properties={"onset": "acute-on-chronic", "source": "radiology", "temporal_status": "active"},
            )

        if "pleural effusion" in findings_lower or "effusions" in findings_lower:
            self.manager.add_edge(
                source_id=report_node_id,
                target_id="cond-pleural-effusion",
                rel_type=GraphRelationTypes.REPORTS_FINDING,
                properties={"confidence": 0.96, "status": "active", "temporal_status": "active"},
            )
            self.manager.add_edge(
                source_id=patient_id,
                target_id="cond-pleural-effusion",
                rel_type=GraphRelationTypes.DIAGNOSED_WITH,
                properties={"laterality": "bilateral", "temporal_status": "active"},
            )

        if "heart failure" in findings_lower or "chf" in findings_lower:
            self.manager.add_edge(
                source_id=report_node_id,
                target_id="cond-chf",
                rel_type=GraphRelationTypes.REPORTS_FINDING,
                properties={"confidence": 0.98, "status": "active", "temporal_status": "active"},
            )
            self.manager.add_edge(
                source_id=patient_id,
                target_id="cond-chf",
                rel_type=GraphRelationTypes.DIAGNOSED_WITH,
                properties={"source": "radiology/clinical", "temporal_status": "active"},
            )

        if "furosemide" in findings_lower or "lasix" in findings_lower:
            self.manager.add_edge(
                source_id=patient_id,
                target_id="med-furosemide",
                rel_type=GraphRelationTypes.PRESCRIBED,
                properties={"route": "oral", "temporal_status": "active"},
            )

        if "consolidation" in findings_lower or "pneumonia" in findings_lower:
            self.manager.add_edge(
                source_id=report_node_id,
                target_id="cond-pneumonia",
                rel_type=GraphRelationTypes.REPORTS_FINDING,
                properties={"confidence": 0.95, "status": "active", "temporal_status": "active"},
            )
            self.manager.add_edge(
                source_id=patient_id,
                target_id="cond-pneumonia",
                rel_type=GraphRelationTypes.DIAGNOSED_WITH,
                properties={"type": "community-acquired", "temporal_status": "active"},
            )

        if "osteoarthritis" in findings_lower or "joint space" in findings_lower:
            self.manager.add_edge(
                source_id=report_node_id,
                target_id="cond-knee-oa",
                rel_type=GraphRelationTypes.REPORTS_FINDING,
                properties={"confidence": 0.97, "status": "active", "temporal_status": "active"},
            )
            self.manager.add_edge(
                source_id=patient_id,
                target_id="cond-knee-oa",
                rel_type=GraphRelationTypes.DIAGNOSED_WITH,
                properties={"joint": "bilateral knees", "temporal_status": "active"},
            )

        # 3. Bi-Temporal Trajectory Deltas (ADR-017 / ADR-020)
        if interval_trajectory and interval_trajectory.get("pathology_deltas"):
            trajectory_label = interval_trajectory.get("overall_trajectory", "Stable")
            for delta in interval_trajectory["pathology_deltas"]:
                p_name = delta.get("pathology", "").lower()
                change = delta.get("change", "stable")
                score = delta.get("current_score", 0.5)

                cond_target = None
                if "effusion" in p_name:
                    cond_target = "cond-pleural-effusion"
                elif "cardiomegaly" in p_name:
                    cond_target = "cond-cardiomegaly"
                elif "pneumonia" in p_name or "consolidation" in p_name:
                    cond_target = "cond-pneumonia"
                elif "atelectasis" in p_name:
                    cond_target = "cond-atelectasis"

                if cond_target:
                    temporal_props: Dict[str, Any] = {
                        "temporal_status": change,
                        "confidence": score,
                        "trajectory": trajectory_label,
                        "valid_from": study_date or time.strftime("%Y-%m-%d"),
                        "modality": "radiology",
                    }
                    if change == "resolved":
                        temporal_props["resolved_date"] = study_date or time.strftime("%Y-%m-%d")
                    elif change == "new":
                        temporal_props["onset_date"] = study_date or time.strftime("%Y-%m-%d")

                    self.manager.add_edge(
                        source_id=report_node_id,
                        target_id=cond_target,
                        rel_type=GraphRelationTypes.REPORTS_FINDING,
                        properties=temporal_props,
                    )

        # 4. Longitudinal Edge Link to Prior Study
        if prior_study_id:
            prior_node = f"report-{prior_study_id}" if not str(prior_study_id).startswith("report-") else prior_study_id
            self.manager.add_edge(
                source_id=report_node_id,
                target_id=prior_node,
                rel_type=GraphRelationTypes.INTERVAL_CHANGE_FROM,
                properties={
                    "trajectory": interval_trajectory.get("overall_trajectory", "Comparative Interval Analysis") if interval_trajectory else "Comparative Prior",
                    "comparison_date": study_date or time.strftime("%Y-%m-%d"),
                },
            )

        # 3. Provenance Node
        if provenance:
            prov_node_id = f"prov-{report_id[:8]}"
            self.manager.add_node(
                node_id=prov_node_id,
                label=GraphNodeLabels.PROVENANCE,
                properties={
                    "content_sha256": provenance.get("content_sha256", ""),
                    "signer_identity": provenance.get("signer_identity", "physician-vault"),
                    "model_name": provenance.get("model_name", "florence2-edge"),
                    "timestamp": provenance.get("timestamp", str(time.time())),
                },
            )
            self.manager.add_edge(
                source_id=report_node_id,
                target_id=prov_node_id,
                rel_type=GraphRelationTypes.HAS_PROVENANCE,
                properties={"status": "verified"},
            )

        return report_node_id

    def ingest_visit_summary(
        self,
        patient_id: str,
        encounter_id: str,
        subjective: str,
        objective: str,
        assessment: str,
        plan: str,
        provenance: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Maps a clinical SOAP note into the Knowledge Graph.
        Links: (Patient)-[:HAS_ENCOUNTER]->(Encounter)-[:DIAGNOSED_WITH]->(Condition)
        """
        self.ensure_patient(patient_id)

        enc_node_id = f"enc-{encounter_id}"
        self.manager.add_node(
            node_id=enc_node_id,
            label=GraphNodeLabels.ENCOUNTER,
            properties={
                "encounter_id": encounter_id,
                "type": "Ambulatory Clinic Visit",
                "assessment": assessment[:300],
                "plan": plan[:300],
                "timestamp": time.time(),
            },
        )

        self.manager.add_edge(
            source_id=patient_id,
            target_id=enc_node_id,
            rel_type=GraphRelationTypes.HAS_ENCOUNTER,
            properties={"department": "Internal Medicine / Cardiology"},
        )

        full_text = f"{subjective} {objective} {assessment} {plan}".lower()

        if "chf" in full_text or "heart failure" in full_text:
            self.manager.add_edge(
                source_id=enc_node_id,
                target_id="cond-chf",
                rel_type=GraphRelationTypes.DIAGNOSED_WITH,
                properties={"assessment": "acute decompensation"},
            )
            self.manager.add_edge(
                source_id=patient_id,
                target_id="cond-chf",
                rel_type=GraphRelationTypes.DIAGNOSED_WITH,
            )

        if "furosemide" in full_text or "lasix" in full_text or "diuretic" in full_text:
            self.manager.add_edge(
                source_id=enc_node_id,
                target_id="med-furosemide",
                rel_type=GraphRelationTypes.MANAGED_BY,
                properties={"dosage": "40mg daily", "route": "oral"},
            )

        if "osteoarthritis" in full_text or "knee" in full_text:
            self.manager.add_edge(
                source_id=enc_node_id,
                target_id="cond-knee-oa",
                rel_type=GraphRelationTypes.DIAGNOSED_WITH,
                properties={"stage": "moderate-to-severe"},
            )
            self.manager.add_edge(
                source_id=patient_id,
                target_id="cond-knee-oa",
                rel_type=GraphRelationTypes.DIAGNOSED_WITH,
            )

        if provenance:
            prov_node_id = f"prov-{encounter_id[:8]}"
            self.manager.add_node(
                node_id=prov_node_id,
                label=GraphNodeLabels.PROVENANCE,
                properties={
                    "content_sha256": provenance.get("content_sha256", ""),
                    "signer_identity": provenance.get("signer_identity", "scribe-vault"),
                    "model_name": provenance.get("model_name", "mistral-edge"),
                },
            )
            self.manager.add_edge(
                source_id=enc_node_id,
                target_id=prov_node_id,
                rel_type=GraphRelationTypes.HAS_PROVENANCE,
            )

        return enc_node_id

    def link_study_to_encounter(
        self,
        report_id: str,
        encounter_id: str,
        relationship_type: str = GraphRelationTypes.CONFIRMS_EPISODE,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Cross-modal linking between DiagnosticReport (Radiology) and Encounter (Scribe SOAP note).
        """
        rep_node = f"report-{report_id}" if not str(report_id).startswith("report-") else report_id
        enc_node = f"enc-{encounter_id}" if not str(encounter_id).startswith("enc-") else encounter_id
        props = properties or {"status": "cross_modal_verified", "timestamp": time.time()}
        self.manager.add_edge(
            source_id=rep_node,
            target_id=enc_node,
            rel_type=relationship_type,
            properties=props,
        )

    def ingest_lab_result(
        self,
        patient_id: str,
        lab_id: str,
        test_name: str,
        value: float,
        unit: str,
        reference_range: str,
        specimen_time: Optional[str] = None,
        flag: str = "NORMAL",
        condition_id: Optional[str] = None,
    ) -> str:
        """
        Ingests a laboratory test flowsheet result (e.g., BNP, Troponin, Potassium, eGFR).
        Links: (Patient)-[:HAS_LAB_RESULT]->(LabResult)-[:INDICATES_CONDITION]->(Condition)
        """
        self.ensure_patient(patient_id)
        lab_node_id = f"lab-{lab_id}"
        self.manager.add_node(
            node_id=lab_node_id,
            label=GraphNodeLabels.LAB_RESULT,
            properties={
                "lab_id": lab_id,
                "test_name": test_name,
                "value": value,
                "unit": unit,
                "reference_range": reference_range,
                "specimen_time": specimen_time or time.strftime("%Y-%m-%d %H:%M:%S"),
                "flag": flag,
            },
        )
        self.manager.add_edge(
            source_id=patient_id,
            target_id=lab_node_id,
            rel_type="HAS_LAB_RESULT",
            properties={"modality": "Laboratory / Flowsheet", "flag": flag},
        )
        if condition_id:
            self.manager.add_edge(
                source_id=lab_node_id,
                target_id=condition_id,
                rel_type=GraphRelationTypes.INDICATES_CONDITION,
                properties={"flag": flag, "value": value, "unit": unit},
            )
        return lab_node_id

    def get_patient_hotwords(self, patient_id: Optional[str] = None) -> str:
        """
        Derives high-priority clinical vocabulary and pharmaceutical hotwords from
        the patient's active conditions, medications, and clinical ontology to prime Whisper ASR.
        """
        hotwords = set()
        default_vocab = [
            "dyspnea", "orthopnea", "cardiomegaly", "effusion", "furosemide",
            "lisinopril", "metformin", "pneumonia", "consolidation", "atelectasis",
            "edema", "hypertension", "osteoarthritis", "troponin", "natriuretic",
            "cephalosporin", "sublingual"
        ]
        hotwords.update(default_vocab)

        if patient_id and self.manager._memory_graph.has_node(patient_id):
            subgraph = self.manager.get_patient_subgraph(patient_id, max_depth=2)
            for node in subgraph.get("nodes", []):
                name = node.get("name") or node.get("label") or ""
                if name and len(name) > 3:
                    for token in name.replace("/", " ").replace("-", " ").replace("(", " ").replace(")", " ").split():
                        if len(token) > 3 and token.isalpha():
                            hotwords.add(token.lower())
        return ", ".join(sorted(list(hotwords))[:35])

    def get_patient_graph(
        self, patient_id: str, depth: int = 2
    ) -> Dict[str, Any]:
        """Returns visualizable sub-graph for patient."""
        subgraph = self.manager.get_patient_subgraph(patient_id, max_depth=depth)
        stats = self.manager.get_stats()
        return {
            "patient_id": patient_id,
            "nodes": subgraph.get("nodes", []),
            "links": subgraph.get("links", []),
            "meta": {
                "depth": depth,
                "node_count": len(subgraph.get("nodes", [])),
                "link_count": len(subgraph.get("links", [])),
                "storage_engine": stats.get("engine"),
                "connected_to_bolt": stats.get("connected"),
            },
        }

    def delete_patient_graph(self, patient_id: str) -> None:
        """Deletes all nodes and relationships directly associated with patient."""
        if not patient_id:
            return
        # Delete primary patient node
        self.manager.delete_node(patient_id)
        # Delete related study and encounter nodes if keyed by patient_id
        for prefix in [f"report-{patient_id}", f"enc-{patient_id}"]:
            self.manager.delete_node(prefix)

    def _populate_demo_patient_graph(self, patient_id: str) -> None:
        """No-op: Demo cohort disabled. Subgraph is built from real clinical records only."""
        pass


# Global singleton instance
_clinical_graph_store: Optional[ClinicalGraphStore] = None


def get_graph_store() -> ClinicalGraphStore:
    """Returns singleton ClinicalGraphStore instance."""
    global _clinical_graph_store
    if _clinical_graph_store is None:
        _clinical_graph_store = ClinicalGraphStore()
    return _clinical_graph_store
