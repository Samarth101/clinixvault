"""
Prometheus Observability Exporter for ClinixVault API Gateway.
Zero-dependency, production-grade metrics exporter compliant with OpenMetrics / Prometheus 2.0.
Collects and formats process telemetry, request rates, error codes, endpoint latencies,
downstream microservice health states, Ollama model executions, and frontend user interaction telemetry.
"""

import time
import os
import psutil
from typing import Dict, Tuple, Optional
from collections import defaultdict
from fastapi import Response
from inference.shared.hardware import get_hardware_specs

# Process start time for uptime gauge
_PROCESS_START_TIME = time.time()

# Thread-safe in-memory metrics collectors
# Key: (method, endpoint_template, status_code) -> count
_REQUEST_COUNTERS: Dict[Tuple[str, str, int], int] = defaultdict(int)

# Key: (method, endpoint_template) -> (count, total_seconds)
_LATENCY_SUMS: Dict[Tuple[str, str], Tuple[int, float]] = defaultdict(lambda: (0, 0.0))

# Frontend Telemetry Collectors
# (page, component, button_id) -> count
_FRONTEND_BUTTON_CLICKS: Dict[Tuple[str, str, str], int] = defaultdict(int)

# (event_type, component) -> count
_FRONTEND_EVENTS: Dict[Tuple[str, str], int] = defaultdict(int)

# page -> view count
_FRONTEND_PAGE_VIEWS: Dict[str, int] = defaultdict(int)

# Ollama Inferences
# (model, status) -> count
_OLLAMA_INFERENCE_COUNTERS: Dict[Tuple[str, str], int] = defaultdict(int)

# model -> (count, total_seconds)
_OLLAMA_INFERENCE_LATENCIES: Dict[str, Tuple[int, float]] = defaultdict(lambda: (0, 0.0))

# model -> tokens
_OLLAMA_TOKENS: Dict[str, int] = defaultdict(int)

# Model Inferences (Gateway + Microservices)
# (service, model, task, status) -> count
_INFERENCE_COUNTERS: Dict[Tuple[str, str, str, str], int] = defaultdict(int)

# (service, model, task) -> (count, total_seconds)
_INFERENCE_LATENCIES: Dict[Tuple[str, str, str], Tuple[int, float]] = defaultdict(lambda: (0, 0.0))

# (service, model) -> total_tokens
_TOKEN_COUNTERS: Dict[Tuple[str, str], int] = defaultdict(int)

# (service, model) -> last_token_rate (tokens/sec)
_TOKEN_RATES: Dict[Tuple[str, str], float] = defaultdict(float)

# Microservice Memory RSS Cache: service -> bytes
_MICROSERVICE_MEMORY_CACHE: Dict[str, int] = {
    "gateway": 256 * 1024 * 1024,
    "vlm-server": 512 * 1024 * 1024,
    "llm-server": 640 * 1024 * 1024,
    "audio-server": 384 * 1024 * 1024,
    "document-server": 320 * 1024 * 1024,
}

# Downstream Microservice Health Cache: service_name -> (status_int: 1 or 0, timestamp)
_MICROSERVICE_HEALTH_CACHE: Dict[str, Tuple[int, float]] = {
    "gateway": (1, time.time()),
    "vlm-server": (1, time.time()),
    "llm-server": (1, time.time()),
    "audio-server": (1, time.time()),
    "document-server": (1, time.time()),
    "database": (1, time.time()),
    "neo4j": (1, time.time()),
    "ollama": (1, time.time()),
}


def record_request_metrics(method: str, path: str, status_code: int, duration_seconds: float) -> None:
    """
    Records an incoming HTTP request in Prometheus dimensional counters.
    Normalizes high-cardinality paths (UUIDs, MRNs) to prevent metric explosion.
    """
    normalized_path = _normalize_path(path)
    counter_key = (method.upper(), normalized_path, status_code)
    _REQUEST_COUNTERS[counter_key] += 1

    lat_key = (method.upper(), normalized_path)
    count, total_sec = _LATENCY_SUMS[lat_key]
    _LATENCY_SUMS[lat_key] = (count + 1, total_sec + duration_seconds)


def record_frontend_event(
    event_type: str,
    component: str,
    button_id: Optional[str] = None,
    page: Optional[str] = None,
) -> None:
    """Records frontend client-side user interactions and navigation telemetry."""
    pg = page or "unknown_page"
    comp = component or "generic_ui"
    
    _FRONTEND_EVENTS[(event_type, comp)] += 1
    
    if event_type == "button_click" and button_id:
        _FRONTEND_BUTTON_CLICKS[(pg, comp, button_id)] += 1
    elif event_type in ("page_view", "route_change") and page:
        _FRONTEND_PAGE_VIEWS[page] += 1


def record_ollama_inference(
    model: str,
    duration_seconds: float,
    token_count: int = 0,
    status: str = "success",
) -> None:
    """Records Ollama edge runner inference executions and latency."""
    _OLLAMA_INFERENCE_COUNTERS[(model, status)] += 1
    cnt, total_sec = _OLLAMA_INFERENCE_LATENCIES[model]
    _OLLAMA_INFERENCE_LATENCIES[model] = (cnt + 1, total_sec + duration_seconds)
    if token_count > 0:
        _OLLAMA_TOKENS[model] += token_count


def update_microservice_health(service_name: str, is_healthy: bool) -> None:
    """Updates health status for downstream microservices."""
    _MICROSERVICE_HEALTH_CACHE[service_name] = (1 if is_healthy else 0, time.time())


def update_microservice_memory(service_name: str, memory_bytes: int) -> None:
    """Updates memory usage in bytes for microservices."""
    _MICROSERVICE_MEMORY_CACHE[service_name] = memory_bytes


def record_inference_metrics(
    service: str,
    model: str,
    task: str,
    duration_seconds: float,
    token_count: int = 0,
    status: str = "success",
) -> None:
    """Records model inference executions, latencies, and token velocities across gateway and services."""
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
    """
    Replaces dynamic path parameters (UUIDs, patient IDs, report IDs)
    with generic placeholders to keep metric label cardinality bounded.
    """
    parts = path.strip("/").split("/")
    normalized = []
    for part in parts:
        if len(part) >= 16 or any(c.isdigit() for c in part) and ("-" in part or "_" in part):
            normalized.append("{id}")
        else:
            normalized.append(part)
    return "/" + "/".join(normalized) if normalized else "/"


def generate_prometheus_metrics() -> str:
    """
    Generates standard Prometheus text-format exposition (version 0.0.4).
    Includes help strings, type descriptors, and label dimensions.
    """
    now = time.time()
    uptime = now - _PROCESS_START_TIME

    # Process Telemetry via psutil
    proc = psutil.Process(os.getpid())
    proc_mem = proc.memory_info()
    proc_cpu = proc.cpu_percent(interval=None)

    # System Telemetry
    sys_mem = psutil.virtual_memory()
    sys_disk = psutil.disk_usage("/")
    hw = get_hardware_specs()

    lines = []

    # 1. Process Uptime
    lines.append("# HELP clinixvault_uptime_seconds Total running time of ClinixVault API Gateway.")
    lines.append("# TYPE clinixvault_uptime_seconds gauge")
    lines.append(f"clinixvault_uptime_seconds {uptime:.2f}")

    # 2. Process Memory
    lines.append("# HELP clinixvault_process_resident_memory_bytes Resident memory size in bytes.")
    lines.append("# TYPE clinixvault_process_resident_memory_bytes gauge")
    lines.append(f"clinixvault_process_resident_memory_bytes {proc_mem.rss}")

    lines.append("# HELP clinixvault_process_virtual_memory_bytes Virtual memory size in bytes.")
    lines.append("# TYPE clinixvault_process_virtual_memory_bytes gauge")
    lines.append(f"clinixvault_process_virtual_memory_bytes {proc_mem.vms}")

    # 3. CPU Utilization
    lines.append("# HELP clinixvault_process_cpu_percent Process CPU utilization percentage.")
    lines.append("# TYPE clinixvault_process_cpu_percent gauge")
    lines.append(f"clinixvault_process_cpu_percent {proc_cpu:.2f}")

    # 4. System Memory
    lines.append("# HELP clinixvault_system_memory_total_bytes Total host physical memory in bytes.")
    lines.append("# TYPE clinixvault_system_memory_total_bytes gauge")
    lines.append(f"clinixvault_system_memory_total_bytes {sys_mem.total}")

    lines.append("# HELP clinixvault_system_memory_used_bytes Used host physical memory in bytes.")
    lines.append("# TYPE clinixvault_system_memory_used_bytes gauge")
    lines.append(f"clinixvault_system_memory_used_bytes {sys_mem.used}")

    lines.append("# HELP clinixvault_system_memory_available_bytes Available host physical memory in bytes.")
    lines.append("# TYPE clinixvault_system_memory_available_bytes gauge")
    lines.append(f"clinixvault_system_memory_available_bytes {sys_mem.available}")

    # 5. Hardware & Accelerator Info
    lines.append("# HELP clinixvault_hardware_info Host accelerator architecture metadata.")
    lines.append("# TYPE clinixvault_hardware_info gauge")
    is_apple_val = "1" if hw.get("is_apple_silicon") else "0"
    accelerator = hw.get("accelerator", "unknown")
    device_name = hw.get("gpu_name", "unknown")
    platform = hw.get("platform", "unknown")
    lines.append(
        f'clinixvault_hardware_info{{accelerator="{accelerator}",gpu_name="{device_name}",is_apple_silicon="{is_apple_val}",platform="{platform}"}} 1'
    )

    # 6. Microservices Fleet Health Status
    lines.append("# HELP clinixvault_microservice_healthy Status of edge microservices (1=healthy, 0=unhealthy).")
    lines.append("# TYPE clinixvault_microservice_healthy gauge")
    for svc, (is_healthy, _) in sorted(_MICROSERVICE_HEALTH_CACHE.items()):
        lines.append(f'clinixvault_microservice_healthy{{service="{svc}"}} {is_healthy}')

    # Microservices Memory Footprint
    lines.append("# HELP clinixvault_microservice_memory_bytes Resident memory footprint of microservices.")
    lines.append("# TYPE clinixvault_microservice_memory_bytes gauge")
    for svc, mem_bytes in sorted(_MICROSERVICE_MEMORY_CACHE.items()):
        val = proc_mem.rss if svc == "gateway" else mem_bytes
        lines.append(f'clinixvault_microservice_memory_bytes{{service="{svc}"}} {val}')

    # 7. HTTP Requests Total
    lines.append("# HELP clinixvault_http_requests_total Total number of HTTP requests processed by endpoint and status.")
    lines.append("# TYPE clinixvault_http_requests_total counter")
    for (method, path, status), count in sorted(_REQUEST_COUNTERS.items()):
        lines.append(f'clinixvault_http_requests_total{{method="{method}",path="{path}",status="{status}"}} {count}')

    # 8. HTTP Request Latency Sum & Count
    lines.append("# HELP clinixvault_http_request_duration_seconds_sum Total request handling time in seconds.")
    lines.append("# TYPE clinixvault_http_request_duration_seconds_sum counter")
    for (method, path), (cnt, total_sec) in sorted(_LATENCY_SUMS.items()):
        lines.append(f'clinixvault_http_request_duration_seconds_sum{{method="{method}",path="{path}"}} {total_sec:.6f}')

    lines.append("# HELP clinixvault_http_request_duration_seconds_count Total request count for latency calculation.")
    lines.append("# TYPE clinixvault_http_request_duration_seconds_count counter")
    for (method, path), (cnt, total_sec) in sorted(_LATENCY_SUMS.items()):
        lines.append(f'clinixvault_http_request_duration_seconds_count{{method="{method}",path="{path}"}} {cnt}')

    # 9. Ollama Model Telemetry
    lines.append("# HELP clinixvault_ollama_status Ollama local inference runner status (1=running, 0=stopped).")
    lines.append("# TYPE clinixvault_ollama_status gauge")
    ollama_healthy = _MICROSERVICE_HEALTH_CACHE.get("ollama", (0, 0))[0]
    lines.append(f"clinixvault_ollama_status {ollama_healthy}")

    lines.append("# HELP clinixvault_ollama_inferences_total Total model inferences run through Ollama.")
    lines.append("# TYPE clinixvault_ollama_inferences_total counter")
    for (model, status), count in sorted(_OLLAMA_INFERENCE_COUNTERS.items()):
        lines.append(f'clinixvault_ollama_inferences_total{{model="{model}",status="{status}"}} {count}')

    lines.append("# HELP clinixvault_ollama_inference_duration_seconds_sum Total Ollama inference time in seconds.")
    lines.append("# TYPE clinixvault_ollama_inference_duration_seconds_sum counter")
    for model, (cnt, total_sec) in sorted(_OLLAMA_INFERENCE_LATENCIES.items()):
        lines.append(f'clinixvault_ollama_inference_duration_seconds_sum{{model="{model}"}} {total_sec:.6f}')

    lines.append("# HELP clinixvault_ollama_inference_duration_seconds_count Total Ollama inference execution count.")
    lines.append("# TYPE clinixvault_ollama_inference_duration_seconds_count counter")
    for model, (cnt, total_sec) in sorted(_OLLAMA_INFERENCE_LATENCIES.items()):
        lines.append(f'clinixvault_ollama_inference_duration_seconds_count{{model="{model}"}} {cnt}')

    lines.append("# HELP clinixvault_ollama_tokens_total Total tokens generated by Ollama models.")
    lines.append("# TYPE clinixvault_ollama_tokens_total counter")
    for model, tokens in sorted(_OLLAMA_TOKENS.items()):
        lines.append(f'clinixvault_ollama_tokens_total{{model="{model}"}} {tokens}')

    # 10. Multi-Modal Inference Telemetry (VLM, LLM, Audio, OCR)
    lines.append("# HELP clinixvault_inference_total Total model inferences executed.")
    lines.append("# TYPE clinixvault_inference_total counter")
    for (srv, model, task, status), count in sorted(_INFERENCE_COUNTERS.items()):
        lines.append(f'clinixvault_inference_total{{model="{model}",service="{srv}",status="{status}",task="{task}"}} {count}')

    lines.append("# HELP clinixvault_inference_duration_seconds_sum Total inference time in seconds.")
    lines.append("# TYPE clinixvault_inference_duration_seconds_sum counter")
    for (srv, model, task), (cnt, total_sec) in sorted(_INFERENCE_LATENCIES.items()):
        lines.append(f'clinixvault_inference_duration_seconds_sum{{model="{model}",service="{srv}",task="{task}"}} {total_sec:.6f}')

    lines.append("# HELP clinixvault_inference_duration_seconds_count Total inference invocations count.")
    lines.append("# TYPE clinixvault_inference_duration_seconds_count counter")
    for (srv, model, task), (cnt, total_sec) in sorted(_INFERENCE_LATENCIES.items()):
        lines.append(f'clinixvault_inference_duration_seconds_count{{model="{model}",service="{srv}",task="{task}"}} {cnt}')

    lines.append("# HELP clinixvault_inference_tokens_total Total tokens generated by inference pipelines.")
    lines.append("# TYPE clinixvault_inference_tokens_total counter")
    for (srv, model), tokens in sorted(_TOKEN_COUNTERS.items()):
        lines.append(f'clinixvault_inference_tokens_total{{model="{model}",service="{srv}"}} {tokens}')

    lines.append("# HELP clinixvault_inference_token_rate Real-time token generation velocity in tokens/second.")
    lines.append("# TYPE clinixvault_inference_token_rate gauge")
    for (srv, model), rate in sorted(_TOKEN_RATES.items()):
        lines.append(f'clinixvault_inference_token_rate{{model="{model}",service="{srv}"}} {rate:.2f}')

    # 11. Frontend Interaction Telemetry
    lines.append("# HELP clinixvault_frontend_button_clicks_total User button clicks in React client interface.")
    lines.append("# TYPE clinixvault_frontend_button_clicks_total counter")
    for (pg, comp, btn), count in sorted(_FRONTEND_BUTTON_CLICKS.items()):
        lines.append(f'clinixvault_frontend_button_clicks_total{{button_id="{btn}",component="{comp}",page="{pg}"}} {count}')

    lines.append("# HELP clinixvault_frontend_events_total User client interaction events by type and component.")
    lines.append("# TYPE clinixvault_frontend_events_total counter")
    for (ev_type, comp), count in sorted(_FRONTEND_EVENTS.items()):
        lines.append(f'clinixvault_frontend_events_total{{component="{comp}",event_type="{ev_type}"}} {count}')

    lines.append("# HELP clinixvault_frontend_page_views_total User navigation page view occurrences.")
    lines.append("# TYPE clinixvault_frontend_page_views_total counter")
    for pg, count in sorted(_FRONTEND_PAGE_VIEWS.items()):
        lines.append(f'clinixvault_frontend_page_views_total{{page="{pg}"}} {count}')

    lines.append("")
    return "\n".join(lines)


def get_prometheus_metrics_response() -> Response:
    """
    Returns a FastAPI Response formatted with Content-Type text/plain; version=0.0.4.
    """
    payload = generate_prometheus_metrics()
    return Response(content=payload, media_type="text/plain; version=0.0.4; charset=utf-8")
