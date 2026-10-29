"""
GraphRAG Subgraph Retriever & Context Assembler.
Extracts multi-hop semantic subgraphs from Neo4j / In-Memory graph
and serializes them into deterministic prompt context for LLM generation.
"""

from typing import Dict, Any, List, Optional
from backend.database.graph_store import get_graph_store, ClinicalGraphStore
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.graph_rag.retriever")


class ClinicalGraphRetriever:
    """Retrieves and formats patient subgraphs into structured ground-truth prompt context."""

    def __init__(self, store: Optional[ClinicalGraphStore] = None):
        self.store = store or get_graph_store()

    def get_patient_graph_context(
        self, patient_id: str, max_depth: int = 2
    ) -> Dict[str, Any]:
        """
        Retrieves the connected subgraph for patient_id and produces:
        - raw_subgraph: { nodes, links }
        - prompt_context_text: Formatted plain-text block for LLM prompt augmentation
        - active_triples_count: Number of verified relations
        """
        subgraph = self.store.get_patient_graph(patient_id, depth=max_depth)
        nodes = subgraph.get("nodes", [])
        links = subgraph.get("links", [])

        if not nodes:
            return {
                "raw_subgraph": subgraph,
                "prompt_context_text": "",
                "active_triples_count": 0,
            }

        # Organize nodes by type
        conditions = []
        medications = []
        anatomies = []
        observations = []
        reports = []

        node_map = {n["id"]: n for n in nodes}

        for n in nodes:
            label = n.get("label", "")
            name = n.get("name", n.get("id"))
            code = n.get("code", "")
            code_str = f" ({code})" if code else ""

            if label == "Condition":
                conditions.append(f"{name}{code_str}")
            elif label == "Medication":
                medications.append(f"{name}{code_str}")
            elif label == "Anatomy":
                anatomies.append(name)
            elif label == "Observation":
                observations.append(f"{name}{code_str}")
            elif label == "DiagnosticReport":
                imp = n.get("impression", n.get("findings", ""))
                reports.append(f"Report [{n.get('modality', 'Study')}]: {imp[:120]}")

        # Build relation lines
        relation_lines = []
        for link in links:
            src_node = node_map.get(link.get("source"))
            tgt_node = node_map.get(link.get("target"))
            if src_node and tgt_node:
                src_name = src_node.get("name", src_node.get("id"))
                tgt_name = tgt_node.get("name", tgt_node.get("id"))
                rel_type = link.get("type", "RELATED_TO")
                relation_lines.append(f"- ({src_name}) -[:{rel_type}]-> ({tgt_name})")

        # Assemble prompt block
        lines = [
            "[VERIFIED CLINICAL KNOWLEDGE GRAPH (NEO4J GROUND TRUTH)]",
            f"Patient ID: {patient_id}",
        ]

        if conditions:
            lines.append("Active Diagnosed Conditions:")
            for c in conditions[:6]:
                lines.append(f"  * {c}")

        if medications:
            lines.append("Active Medications & Orders:")
            for m in medications[:6]:
                lines.append(f"  * {m}")

        if anatomies:
            lines.append(f"Relevant Anatomy: {', '.join(anatomies[:5])}")

        if observations:
            lines.append(f"Key Findings / Observations: {', '.join(observations[:6])}")

        if reports:
            lines.append("Recent Diagnostic Imaging Studies:")
            for r in reports[:3]:
                lines.append(f"  * {r}")

        if relation_lines:
            lines.append("Explicit Ground-Truth Clinical Relationships:")
            for rl in relation_lines[:8]:
                lines.append(f"  {rl}")

        lines.append("[END KNOWLEDGE GRAPH CONTEXT]\n")

        prompt_block = "\n".join(lines)
        return {
            "raw_subgraph": subgraph,
            "prompt_context_text": prompt_block,
            "active_triples_count": len(relation_lines),
        }


_graph_retriever: Optional[ClinicalGraphRetriever] = None


def get_graph_retriever() -> ClinicalGraphRetriever:
    global _graph_retriever
    if _graph_retriever is None:
        _graph_retriever = ClinicalGraphRetriever()
    return _graph_retriever
