"""
Unit Test: Clinical Knowledge Graph REST API Gateway Endpoints.
Verifies /api/v1/graph/stats, /patient/{id}, /query, and /sync-report.
"""

import pytest


def test_graph_stats_endpoint(gateway_client, auth_headers):
    resp = gateway_client.get("/api/v1/graph/stats", headers=auth_headers)
    assert resp.status_code == 200, f"Stats failed: {resp.text}"
    data = resp.json()
    assert "mode" in data
    assert "node_count" in data
    assert "relationship_count" in data
    assert "engine" in data


def test_get_patient_subgraph_endpoint(gateway_client, auth_headers):
    # Ingest a diagnostic report for test patient
    gateway_client.post("/api/v1/graph/sync-report", json={
        "patient_id": "test-patient-01",
        "report_id": "rep-test-01",
        "findings": "Cardiomegaly with bilateral pleural effusion.",
        "impression": "Decompensated congestive heart failure.",
    }, headers=auth_headers)
    resp = gateway_client.get("/api/v1/graph/patient/test-patient-01", headers=auth_headers)
    assert resp.status_code == 200, f"Patient graph failed: {resp.text}"
    data = resp.json()
    assert "nodes" in data and len(data["nodes"]) > 0
    assert "links" in data and len(data["links"]) > 0
    assert "meta" in data
    assert data["patient_id"] == "test-patient-01"


def test_execute_cypher_endpoint(gateway_client, auth_headers):
    payload = {"query": "MATCH (n:Condition) RETURN n LIMIT 5"}
    resp = gateway_client.post("/api/v1/graph/query", json=payload, headers=auth_headers)
    assert resp.status_code == 200, f"Query failed: {resp.text}"
    data = resp.json()
    assert "record_count" in data
    assert "records" in data
    assert data["latency_ms"] >= 0


def test_execute_cypher_forbidden_mutation(gateway_client, auth_headers):
    payload = {"query": "MATCH (n) DELETE n"}
    resp = gateway_client.post("/api/v1/graph/query", json=payload, headers=auth_headers)
    assert resp.status_code == 400
    assert "forbidden keyword" in resp.json()["detail"].lower()


def test_sync_report_endpoint(gateway_client, auth_headers):
    payload = {
        "patient_id": "pt-sync-test-99",
        "report_id": "rep-test-99",
        "findings": "Marked cardiomegaly with bibasilar effusion.",
        "impression": "Heart failure decompensation.",
        "modality": "CXR PA View",
    }
    resp = gateway_client.post("/api/v1/graph/sync-report", json=payload, headers=auth_headers)
    assert resp.status_code == 200, f"Sync failed: {resp.text}"
    data = resp.json()
    assert data["status"] == "synchronized"
    assert "report_node_id" in data
