"""
Unit Test: GraphRAG Entity Extraction, Context Assembly, and Hallucination Audit.
"""

import pytest
from backend.graph_rag.entity_extractor import get_triple_extractor
from backend.graph_rag.graph_retriever import get_graph_retriever
from backend.graph_rag.hallucination_auditor import get_hallucination_auditor
from backend.database.graph_store import get_graph_store


def test_triple_extractor_positive_and_negated():
    extractor = get_triple_extractor()
    text = (
        "Patient presents with severe cardiomegaly and bilateral pleural effusion. "
        "No evidence of pneumothorax or acute focal consolidation. Prescribed oral furosemide."
    )
    entities, triples = extractor.extract_entities_and_triples(text, patient_id="pt-101")

    # Positive findings
    entity_names = {e["name"] for e in entities if not e["negated"]}
    assert "Cardiomegaly" in entity_names
    assert "Pleural Effusion" in entity_names
    assert "Furosemide" in entity_names

    # Negated findings
    negated_names = {e["name"] for e in entities if e["negated"]}
    assert "Pneumothorax" in negated_names or "Alveolar Consolidation" in negated_names

    # Check extracted triples
    predicates = {t["predicate"] for t in triples}
    assert "DIAGNOSED_WITH" in predicates
    assert "LOCATED_AT" in predicates


def test_graph_retriever_context_assembly():
    retriever = get_graph_retriever()
    store = get_graph_store()
    store.seed_ontology()
    store.ingest_diagnostic_report(
        patient_id="pt-test-retriever",
        report_id="rep-retriever-1",
        findings="Cardiomegaly with bilateral pleural effusion.",
        impression="Congestive heart failure exacerbation with bilateral pleural effusions.",
    )

    res = retriever.get_patient_graph_context("pt-test-retriever", max_depth=2)
    assert "prompt_context_text" in res
    assert "[VERIFIED CLINICAL KNOWLEDGE GRAPH (NEO4J GROUND TRUTH)]" in res["prompt_context_text"]
    assert "Active Diagnosed Conditions:" in res["prompt_context_text"]
    assert res["active_triples_count"] > 0


def test_hallucination_auditor_verification():
    auditor = get_hallucination_auditor()
    store = get_graph_store()
    store.seed_ontology()
    store.ingest_diagnostic_report(
        patient_id="pt-test-auditor",
        report_id="rep-auditor-1",
        findings="Moderate cardiomegaly with congestive heart failure managed with oral furosemide.",
        impression="Congestive heart failure managed with oral furosemide.",
    )

    grounded_text = "Patient with known cardiomegaly and congestive heart failure managed with oral furosemide."
    audit_res = auditor.audit_generated_text(grounded_text, "pt-test-auditor")

    assert audit_res["is_factually_grounded"] is True
    assert audit_res["graph_factuality_score"] >= 0.7
    assert len(audit_res["verified_triples"]) > 0
    assert audit_res["audit_verdict"] == "VERIFIED_SAFE"
