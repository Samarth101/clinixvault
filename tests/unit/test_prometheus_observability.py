"""
Unit tests for ClinixVault Prometheus Observability and Metrics Exporter.
Verifies /metrics endpoint returns compliant OpenMetrics/Prometheus 2.0 format,
proper content-type, process gauges, HTTP request counters, and hardware metadata.
"""

import pytest
from fastapi.testclient import TestClient
from backend.gateway.main import app
from backend.gateway.metrics import (
    record_request_metrics,
    generate_prometheus_metrics,
    _normalize_path,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_normalize_path_replaces_dynamic_segments():
    assert _normalize_path("/api/v1/patients") == "/api/v1/patients"
    assert _normalize_path("/api/v1/patients/pt-uuid-1234-5678-90ab") == "/api/v1/patients/{id}"
    assert _normalize_path("/api/v1/reports/rpt-abcdef1234567890") == "/api/v1/reports/{id}"


def test_record_request_and_metrics_generation():
    record_request_metrics("GET", "/api/v1/health", 200, 0.015)
    record_request_metrics("POST", "/api/v1/radiology/generate", 200, 1.25)
    
    text = generate_prometheus_metrics()
    assert "clinixvault_uptime_seconds" in text
    assert "clinixvault_process_resident_memory_bytes" in text
    assert "clinixvault_process_cpu_percent" in text
    assert "clinixvault_system_memory_total_bytes" in text
    assert "clinixvault_hardware_info" in text
    assert 'clinixvault_http_requests_total{method="GET",path="/api/v1/health",status="200"}' in text
    assert 'clinixvault_http_requests_total{method="POST",path="/api/v1/radiology/generate",status="200"}' in text
    assert "clinixvault_http_request_duration_seconds_sum" in text
    assert "clinixvault_http_request_duration_seconds_count" in text


def test_metrics_endpoint_http_response(client):
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]
    assert "clinixvault_uptime_seconds" in response.text
    assert "clinixvault_hardware_info" in response.text


def test_root_endpoint_includes_metrics_url(client):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "metrics_url" in data
    assert data["metrics_url"] == "/metrics"
