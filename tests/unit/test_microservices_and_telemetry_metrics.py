"""
Unit tests for ClinixVault microservices Prometheus metrics exporter,
Ollama inference telemetry, and frontend UI button click telemetry endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from backend.gateway.main import app
from backend.gateway.metrics import (
    record_frontend_event,
    record_ollama_inference,
    update_microservice_health,
    generate_prometheus_metrics,
)
from inference.shared.metrics import (
    record_microservice_request,
    record_inference_metrics,
    generate_service_metrics,
)


def test_microservices_metrics_generation():
    # Record mock request and inference
    record_microservice_request("vlm-server", "POST", "/generate", 200, 0.45)
    record_inference_metrics(
        service="vlm-server",
        model="clinixvault-qwen2vl",
        task="radiology_report",
        duration_seconds=0.45,
        token_count=120,
        status="success",
    )

    metrics_text = generate_service_metrics("vlm-server")
    assert 'clinixvault_microservice_up{service="vlm-server"} 1' in metrics_text
    assert 'clinixvault_microservice_requests_total{method="POST",path="/generate",service="vlm-server",status="200"} 1' in metrics_text
    assert 'clinixvault_inference_total{model="clinixvault-qwen2vl",service="vlm-server",status="success",task="radiology_report"} 1' in metrics_text
    assert 'clinixvault_inference_tokens_total{model="clinixvault-qwen2vl",service="vlm-server"} 120' in metrics_text


def test_gateway_ollama_and_frontend_telemetry():
    # Record frontend click and Ollama inference
    record_frontend_event(
        event_type="button_click",
        component="NavigationDock",
        button_id="radiology_btn",
        page="overview",
    )
    record_frontend_event(
        event_type="page_view",
        component="Router",
        page="radiology",
    )
    record_ollama_inference(
        model="llama3:latest",
        duration_seconds=1.25,
        token_count=85,
        status="success",
    )
    update_microservice_health("vlm-server", True)

    gateway_metrics = generate_prometheus_metrics()
    assert 'clinixvault_frontend_button_clicks_total{button_id="radiology_btn",component="NavigationDock",page="overview"} 1' in gateway_metrics
    assert 'clinixvault_frontend_page_views_total{page="radiology"} 1' in gateway_metrics
    assert 'clinixvault_ollama_inferences_total{model="llama3:latest",status="success"} 1' in gateway_metrics
    assert 'clinixvault_microservice_healthy{service="vlm-server"} 1' in gateway_metrics


def test_frontend_telemetry_endpoint_http():
    client = TestClient(app)
    response = client.post(
        "/api/v1/telemetry/event",
        json={
            "event_type": "button_click",
            "component": "RadiologyStudio",
            "button_id": "analyze_xray_btn",
            "page": "radiology",
            "metadata": {"projection": "PA"},
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "recorded"

    # Verify reflected in /metrics
    metrics_resp = client.get("/metrics")
    assert response.status_code == 200
    assert "clinixvault_frontend_button_clicks_total" in metrics_resp.text
    assert 'button_id="analyze_xray_btn"' in metrics_resp.text


def test_gateway_inference_and_token_velocity_metrics():
    from backend.gateway.metrics import record_inference_metrics, update_microservice_memory
    update_microservice_memory("vlm-server", 512 * 1024 * 1024)
    record_inference_metrics(
        service="gateway",
        model="clinixvault-qwen2vl",
        task="radiology_vlm",
        duration_seconds=0.5,
        token_count=100,
        status="success",
    )
    metrics = generate_prometheus_metrics()
    assert 'clinixvault_inference_total{model="clinixvault-qwen2vl",service="gateway",status="success",task="radiology_vlm"} 1' in metrics
    assert 'clinixvault_inference_tokens_total{model="clinixvault-qwen2vl",service="gateway"} 100' in metrics
    assert 'clinixvault_inference_token_rate{model="clinixvault-qwen2vl",service="gateway"} 200.00' in metrics
    assert 'clinixvault_microservice_memory_bytes{service="vlm-server"} 536870912' in metrics

