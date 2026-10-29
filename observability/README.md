# 🩺 ClinixVault Observability Suite — Grafana Labs Setup

Production-grade observability pipeline shipping **Prometheus metrics** and **Loki structured logs** from ClinixVault directly to **Grafana Labs (Grafana Cloud)**.

```mermaid
flowchart LR
    subgraph ClinixVault Edge Host
        GW["API Gateway<br/>:8000/metrics"] -->|Prometheus Metrics| ALLOY["Grafana Alloy<br/>Collector"]
        LOGS["logs/clinixvault.log<br/>(Structured JSON)"] -->|Tail & Parse| ALLOY
        AUDIT["Audit & Scribe<br/>Inference Events"] --> LOGS
    end

    subgraph Grafana Labs (Grafana Cloud)
        ALLOY -->|Remote Write HTTP| G_PROM["Hosted Prometheus<br/>(Metrics TSDB)"]
        ALLOY -->|Loki Push API| G_LOKI["Hosted Loki<br/>(Log Streams)"]
        G_PROM --> DASHBOARD["ClinixVault Clinical<br/>AI Dashboard"]
        G_LOKI --> DASHBOARD
    end
```

---

## 🚀 Quick Start in 4 Steps

### Step 1: Get Your Free Grafana Cloud Credentials
1. Go to [https://grafana.com](https://grafana.com) and create a free account (Free forever tier includes 10k metrics + 50GB logs).
2. Open your **Grafana Cloud Portal** (`https://grafana.com/orgs/<your-org>`).
3. Click **Details** under the **Prometheus** card:
   - Note the **Remote Write Endpoint** (e.g. `https://prometheus-prod-10-prod-us-central-0.grafana.net/api/prom/push`)
   - Note the **Username / Instance ID** (numeric string, e.g. `1234567`)
4. Click **Details** under the **Loki** card:
   - Note the **URL** (e.g. `https://logs-prod-006.grafana.net/loki/api/v1/push`)
   - Note the **Username / Instance ID** (numeric string, e.g. `123456`)
5. In your Cloud Portal, go to **Security** → **Access Policies** (or API Keys):
   - Create a token with **Scopes**: `metrics:write`, `logs:write`.
   - Copy the generated API token (e.g. `glc_eyJ...`).

---

### Step 2: Configure Environment Variables
Copy the template and fill in your credentials:

```bash
cd /Users/samarthbhandegaonkar/Desktop/clinixvault/observability
cp .env.example .env
```

Edit `.env`:
```ini
GRAFANA_CLOUD_PROMETHEUS_URL=https://prometheus-prod-10-prod-us-central-0.grafana.net/api/prom/push
GRAFANA_CLOUD_PROMETHEUS_USER=1234567

GRAFANA_CLOUD_LOKI_URL=https://logs-prod-006.grafana.net/loki/api/v1/push
GRAFANA_CLOUD_LOKI_USER=123456

GRAFANA_CLOUD_API_TOKEN=glc_your_generated_token_here
```

---

### Step 3: Install & Start Grafana Alloy

#### Option A: Native macOS (Recommended)
Install Grafana Alloy via Homebrew:
```bash
brew install grafana-alloy
```

Start the telemetry collector:
```bash
./observability/start_observability.sh
```
*Alloy will scrape `http://127.0.0.1:8000/metrics` every 15s and tail `logs/clinixvault.log` in real time, shipping both to Grafana Cloud.*
*You can view Alloy's local diagnostic UI at: `http://127.0.0.1:12345`.*

#### Option B: Docker Compose
If you prefer running in a container:
```bash
docker compose -f observability/docker-compose.observability.yml up -d
```

---

### Step 4: Import the ClinixVault Dashboard in Grafana Cloud
1. In your browser, log in to your Grafana Cloud instance (`https://<your-org>.grafana.net`).
2. Navigate to **Dashboards** → **New** → **Import**.
3. Upload or paste the contents of:
   [`observability/dashboards/clinixvault_clinical_observability.json`](dashboards/clinixvault_clinical_observability.json)
4. When prompted, select your:
   - **Prometheus Source**: `grafanacloud-prom` (or your Grafana Cloud Prometheus data source)
   - **Loki Source**: `grafanacloud-logs` (or your Grafana Cloud Loki data source)
5. Click **Import**!

---

## 📊 Pre-Built Dashboard Capabilities

The imported dashboard provides 4 specialized clinical and operational sections:

1. **System & Hardware Telemetry (Top Row)**:
   - **Gateway Uptime**: Real-time process lifetime gauge.
   - **Process CPU %**: Sub-process utilization.
   - **Process Resident RAM**: Exact RSS memory footprint.
   - **System Memory Load %**: Host RAM usage vs total capacity.
   - **AI Hardware Badge**: Detects and displays local host accelerator (`Apple Metal (MPS) | Apple M3 (Unified) (darwin)`).

2. **Throughput & Performance (Middle Row)**:
   - **Request Throughput**: Real-time req/sec split by endpoint (`/api/v1/scribe`, `/api/v1/radiology/generate`, `/api/v1/summarize`, etc.) and HTTP status code.
   - **Average Latency**: 1-minute moving average latency per endpoint in milliseconds/seconds.

3. **Loki Live Logs & Severity Analysis (Bottom Rows)**:
   - **Log Volume by Severity**: Time-series histogram tracking `INFO`, `WARNING`, and `ERROR` rates.
   - **Flagged Warnings & Errors**: Filtered table isolating security notices, model fallback notes, and HTTP 5xx errors.
   - **Real-Time Clinical Event Stream**: Live scrolling stream of all gateway, ambient scribe, VLM vision, LLM synthesis, and audit log entries with expandable JSON attributes.

---

## 🔍 Useful Queries in Grafana Explore

### Prometheus (Metrics)
| Goal | PromQL Query |
|---|---|
| **Gateway Request Rate** | `sum(rate(clinixvault_http_requests_total[1m])) by (method, path)` |
| **Error Rate %** | `100 * sum(rate(clinixvault_http_requests_total{status=~"5.."}[1m])) / sum(rate(clinixvault_http_requests_total[1m]))` |
| **Scribe & ASR Latency** | `rate(clinixvault_http_request_duration_seconds_sum{path=~".*scribe.*"}[5m]) / rate(clinixvault_http_request_duration_seconds_count{path=~".*scribe.*"}[5m])` |
| **Host Memory Usage** | `clinixvault_system_memory_used_bytes / 1024 / 1024 / 1024` (in GB) |

### Loki (Logs)
| Goal | LogQL Query |
|---|---|
| **All ClinixVault Logs** | `{job="clinixvault"}` |
| **Errors & Warnings Only** | `{job="clinixvault"} \| json \| level =~ "(?i)ERROR\|WARN.*"` |
| **API Gateway Access Logs** | `{job="clinixvault"} \| json \| service = "api_gateway"` |
| **Specific Patient Events** | `{job="clinixvault"} \| json \| patient_id != ""` |
| **Slow Requests (> 500ms)** | `{job="clinixvault"} \| json \| duration_ms > 500` |
