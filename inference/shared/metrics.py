"""
Zero-dependency Prometheus Metrics Exporter & Middleware for ClinixVault Microservices.
OpenMetrics / Prometheus 2.0 compliant.
Collects process telemetry, HTTP request throughput, endpoint latencies,
model inference durations, and token generation velocities for VLM, LLM, Audio, and OCR microservices.
"""

import time
import os
import psutil
from typing import Dict, Tuple, Optional
from collections import defaultdict
from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from inference.shared.hardware import get_hardware_specs

# Global service registry for in-memory collectors
# service_name -> data structures
_SERVICE_START_TIMES: Dict[str, float] = {}

# (service, method, normalized_path, status) -> count
_REQUEST_COUNTERS: Dict[Tuple[str, str, str, int], int] = defaultdict(int)

# (service, method, normalized_path) -> (count, total_seconds)
_REQUEST_LATENCIES: Dict[Tuple[str, str, str], Tuple[int, float]] = defaultdict(lambda: (0, 0.0))

# (service, model, task, status) -> count
_INFERENCE_COUNTERS: Dict[Tuple[str, str, str, str], int] = defaultdict(int)

# (service, model, task) -> (count, total_seconds)
_INFERENCE_LATENCIES: Dict[Tuple[str, str, str], Tuple[int, float]] = defaultdict(lambda: (0, 0.0))

# (service, model) -> total_tokens
_TOKEN_COUNTERS: Dict[Tuple[str, str], int] = defaultdict(int)

# (service, model) -> last_token_rate (tokens/sec)
_TOKEN_RATES: Dict[Tuple[str, str], float] = defaultdict(float)


def register_service_start(service_name: str) -> None:
    if service_name not in _SERVICE_START_TIMES:
        _SERVICE_START_TIMES[service_name] = time.time()


def record_microservice_request(service: str, method: str, path: str, status_code: int, duration_seconds: float) -> None:
    normalized_path = _normalize_path(path)
    counter_key = (service, method.upper(), normalized_path, status_code)
    _REQUEST_COUNTERS[counter_key] += 1

    lat_key = (service, method.upper(), normalized_path)
    cnt, total_sec = _REQUEST_LATENCIES[lat_key]
    _REQUEST_LATENCIES[lat_key] = (cnt + 1, total_sec + duration_seconds)


def record_inference_metrics(
    service: str,
    model: str,
    task: str,
    duration_seconds: float,
    token_count: int = 0,
    status: str = "success",
) -> None:
    counter_key = (service, model, task, status)
    _INFERENCE_COUNTERS[counter_key] += 1

    lat_key = (service, model, task)
    cnt, total_sec = _INFERENCE_LATENCIES[lat_key]
    _INFERENCE_LATENCIES[lat_key] = (cnt + 1, total_sec + duration_seconds)

    if token_count > 0:
        tok_key = (service, model)
        _TOKEN_COUNTERS[tok_key] += token_count
        if duration_seconds > 0:
            rate = round(token_count / duration_seconds, 2)
            _TOKEN_RATES[tok_key] = rate


def _normalize_path(path: str) -> str:
    parts = path.strip("/").split("/")
    normalized = []
    for part in parts:
        if len(part) >= 16 or (any(c.isdigit() for c in part) and ("-" in part or "_" in part)):
            normalized.append("{id}")
        else:
            normalized.append(part)
    return "/" + "/".join(normalized) if normalized else "/"


def generate_service_metrics(service_name: str) -> str:
    register_service_start(service_name)
    now = time.time()
    uptime = now - _SERVICE_START_TIMES.get(service_name, now)

    proc = psutil.Process(os.getpid())
    proc_mem = proc.memory_info()
    proc_cpu = proc.cpu_percent(interval=None)

    hw = get_hardware_specs()

    lines = []

    # 1. Microservice Up & Uptime
    lines.append(f"# HELP clinixvault_microservice_up Service alive status.")
    lines.append(f"# TYPE clinixvault_microservice_up gauge")
    lines.append(f'clinixvault_microservice_up{{service="{service_name}"}} 1')

    lines.append(f"# HELP clinixvault_microservice_uptime_seconds Total runtime in seconds.")
    lines.append(f"# TYPE clinixvault_microservice_uptime_seconds gauge")
    lines.append(f'clinixvault_microservice_uptime_seconds{{service="{service_name}"}} {uptime:.2f}')

    # 2. Process Resource Footprint
    lines.append(f"# HELP clinixvault_microservice_cpu_percent Process CPU utilization percentage.")
    lines.append(f"# TYPE clinixvault_microservice_cpu_percent gauge")
    lines.append(f'clinixvault_microservice_cpu_percent{{service="{service_name}"}} {proc_cpu:.2f}')

    lines.append(f"# HELP clinixvault_microservice_memory_bytes Resident memory footprint in bytes.")
    lines.append(f"# TYPE clinixvault_microservice_memory_bytes gauge")
    lines.append(f'clinixvault_microservice_memory_bytes{{service="{service_name}"}} {proc_mem.rss}')

    # 3. Hardware & Accelerator Info
    lines.append("# HELP clinixvault_microservice_hardware_info Host accelerator architecture metadata.")
    lines.append("# TYPE clinixvault_microservice_hardware_info gauge")
    accelerator = hw.get("accelerator", "unknown")
    device_name = hw.get("gpu_name", "unknown")
    platform = hw.get("platform", "unknown")
    lines.append(
        f'clinixvault_microservice_hardware_info{{accelerator="{accelerator}",gpu_name="{device_name}",platform="{platform}",service="{service_name}"}} 1'
    )

    # 4. HTTP Requests Total
    lines.append(f"# HELP clinixvault_microservice_requests_total Total number of HTTP requests processed by endpoint and status.")
    lines.append(f"# TYPE clinixvault_microservice_requests_total counter")
    for (srv, method, path, status), count in sorted(_REQUEST_COUNTERS.items()):
        if srv == service_name:
            lines.append(f'clinixvault_microservice_requests_total{{method="{method}",path="{path}",service="{srv}",status="{status}"}} {count}')

    # 5. HTTP Latencies
    lines.append(f"# HELP clinixvault_microservice_duration_seconds_sum Total request handling time in seconds.")
    lines.append(f"# TYPE clinixvault_microservice_duration_seconds_sum counter")
    for (srv, method, path), (cnt, total_sec) in sorted(_REQUEST_LATENCIES.items()):
        if srv == service_name:
            lines.append(f'clinixvault_microservice_duration_seconds_sum{{method="{method}",path="{path}",service="{srv}"}} {total_sec:.6f}')

    lines.append(f"# HELP clinixvault_microservice_duration_seconds_count Total request count for latency calculation.")
    lines.append(f"# TYPE clinixvault_microservice_duration_seconds_count counter")
    for (srv, method, path), (cnt, total_sec) in sorted(_REQUEST_LATENCIES.items()):
        if srv == service_name:
            lines.append(f'clinixvault_microservice_duration_seconds_count{{method="{method}",path="{path}",service="{srv}"}} {cnt}')

    # 6. Model Inferences Total
    lines.append("# HELP clinixvault_inference_total Total model inferences executed.")
    lines.append("# TYPE clinixvault_inference_total counter")
    for (srv, model, task, status), count in sorted(_INFERENCE_COUNTERS.items()):
        if srv == service_name:
            lines.append(f'clinixvault_inference_total{{model="{model}",service="{srv}",status="{status}",task="{task}"}} {count}')

    # 7. Model Inference Latencies
    lines.append("# HELP clinixvault_inference_duration_seconds_sum Total inference time in seconds.")
    lines.append("# TYPE clinixvault_inference_duration_seconds_sum counter")
    for (srv, model, task), (cnt, total_sec) in sorted(_INFERENCE_LATENCIES.items()):
        if srv == service_name:
            lines.append(f'clinixvault_inference_duration_seconds_sum{{model="{model}",service="{srv}",task="{task}"}} {total_sec:.6f}')

    lines.append("# HELP clinixvault_inference_duration_seconds_count Total inference invocations count.")
    lines.append("# TYPE clinixvault_inference_duration_seconds_count counter")
    for (srv, model, task), (cnt, total_sec) in sorted(_INFERENCE_LATENCIES.items()):
        if srv == service_name:
            lines.append(f'clinixvault_inference_duration_seconds_count{{model="{model}",service="{srv}",task="{task}"}} {cnt}')

    # 8. Token Velocity
    lines.append("# HELP clinixvault_inference_tokens_total Total tokens generated.")
    lines.append("# TYPE clinixvault_inference_tokens_total counter")
    for (srv, model), tokens in sorted(_TOKEN_COUNTERS.items()):
        if srv == service_name:
            lines.append(f'clinixvault_inference_tokens_total{{model="{model}",service="{srv}"}} {tokens}')

    lines.append("# HELP clinixvault_inference_token_rate Real-time token generation rate in tokens/second.")
    lines.append("# TYPE clinixvault_inference_token_rate gauge")
    for (srv, model), rate in sorted(_TOKEN_RATES.items()):
        if srv == service_name:
            lines.append(f'clinixvault_inference_token_rate{{model="{model}",service="{srv}"}} {rate:.2f}')

    lines.append("")
    return "\n".join(lines)


def get_service_metrics_response(service_name: str) -> Response:
    payload = generate_service_metrics(service_name)
    return Response(content=payload, media_type="text/plain; version=0.0.4; charset=utf-8")


class MicroserviceMetricsMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: FastAPI, service_name: str):
        super().__init__(app)
        self.service_name = service_name
        register_service_start(service_name)

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        duration = time.time() - start_time
        path = request.url.path
        if path != "/metrics":
            record_microservice_request(
                service=self.service_name,
                method=request.method,
                path=path,
                status_code=response.status_code,
                duration_seconds=duration,
            )
        return response


def setup_microservice_metrics(app: FastAPI, service_name: str) -> None:
    register_service_start(service_name)
    app.add_middleware(MicroserviceMetricsMiddleware, service_name=service_name)

    @app.get("/metrics", tags=["Observability"], response_class=Response)
    async def microservice_metrics():
        return get_service_metrics_response(service_name)
