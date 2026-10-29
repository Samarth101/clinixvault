"""
Unit Test: Neo4j Connection Pool & Air-Gapped In-Memory Property Graph Engine.
Verifies Bolt driver resilience, fallback behavior, node/edge ingestion, and Cypher execution.
"""

import pytest
from backend.database.neo4j_connection import Neo4jGraphManager, get_graph_manager


def test_graph_manager_initialization_and_fallback():
    manager = Neo4jGraphManager(uri="bolt://localhost:7687")
    stats = manager.get_stats()
    assert "mode" in stats
    assert "node_count" in stats
    assert "relationship_count" in stats
    assert "engine" in stats


def test_in_memory_graph_node_and_edge_crud():
    manager = Neo4jGraphManager()
    manager.reset_memory_graph()

    # Add patient node
    manager.add_node("pt-test-01", "Patient", {"name": "Test Patient", "mrn": "MRN-001"})

    # Add condition node
    manager.add_node("cond-test-chf", "Condition", {"name": "Heart Failure", "code": "I50.9"})

    # Add directed edge
    manager.add_edge("pt-test-01", "cond-test-chf", "DIAGNOSED_WITH", {"confidence": 0.99})

    subgraph = manager.get_patient_subgraph("pt-test-01", max_depth=1)
    assert len(subgraph["nodes"]) == 2
    assert len(subgraph["links"]) == 1
    assert subgraph["links"][0]["type"] == "DIAGNOSED_WITH"


def test_cypher_emulation_in_memory():
    manager = Neo4jGraphManager()
    manager.reset_memory_graph()
    manager.add_node("cond-1", "Condition", {"name": "Cardiomegaly"})
    manager.add_node("cond-2", "Condition", {"name": "Pneumonia"})

    # Test count query
    res_count = manager.execute_cypher("MATCH (n) RETURN count(n)")
    assert len(res_count) > 0
    assert res_count[0]["count"] >= 2

    # Test label match query
    res_nodes = manager.execute_cypher("MATCH (c:Condition) RETURN c")
    assert len(res_nodes) == 2
    names = [r["c"]["name"] for r in res_nodes]
    assert "Cardiomegaly" in names
    assert "Pneumonia" in names
