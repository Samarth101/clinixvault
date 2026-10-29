# ClinixVault: Air-Gapped Edge AI Clinical Appliance

ClinixVault is an air-gapped, zero-egress clinical edge AI appliance engineered for hospital networks, emergency rooms, and radiology workstations. It provides automated chest radiograph report generation, real-time ambient medical scribing, and clinical document synthesis into HL7 FHIR R4 standard resources.

## 🚀 Key Capabilities

- **Radiology VLM Engine**: Fine-tuned Florence-2 and Qwen2-VL models generating structured radiographic findings and impressions from frontal/lateral chest X-rays.
- **Ambient Medical Scribing**: Speech-to-text with speaker diarization (`faster-whisper` + `pyannote.audio`) converting doctor-patient dialogues into structured SOAP notes over WebSocket.
- **Clinical Record Synthesis**: LLM summarization powered by C++ `llama.cpp` runtime, generating FHIR R4 resources (`DiagnosticReport`, `Observation`, `Condition`).
- **Low-Level C++ Acceleration**: Native shared library (`libclinix_accel`) providing fast repetition penalty, top-k/top-p logits filtering, and vector similarity for edge RAG.
- **Cryptographic Provenance**: HMAC-SHA256 digital signatures linking every output artifact to its source data, model weights digest, and timestamp.
- **Evidence Citation Grounding**: Claim-level alignment mapping generated statements back to source dialogue turns or notes to detect and eliminate hallucinations.

---

## 📁 Repository Structure

```
clinixvault/
├── backend/                     # API Gateway + Business Logic (port 8000)
│   ├── gateway/                 # FastAPI routes (radiology, scribe, summarize, health, metrics)
│   ├── database/                # SQLite edge default (clinixvault_edge.db) + Postgres/pgvector
│   ├── graph_rag/               # Clinical entity extractor & hallucination auditor
│   └── audit/                   # Token citation mapper and cryptographic provenance
│
├── frontend/                    # Sovereign Clinical UI (React + TypeScript + Vite, port 5173)
│   ├── src/pages/               # RadiologyStudio, Overview, Provenance, Graph3D, Hardware
│   └── src/components/          # WorkOS Atlas Light Theme UI components & 3D CSS2D viewer
│
├── inference/                   # Edge Inference Engine (Python + C++ bindings)
│   ├── vlm_server/              # Two-Stage Hierarchical VLM microservice (port 8001)
│   ├── llm_server/              # LLM microservice (llama.cpp / FHIR Outlines, port 8002)
│   ├── audio_server/            # Real-time WebSocket audio transcription & diarization (port 8003)
│   ├── document_server/         # Clinical PDF parsing & OCR microservice (port 8004)
│   ├── cpp/                     # C++ inference acceleration kernels (libclinix_accel)
│   └── shared/                  # Critic module, model manager, hardware detector, logger
│
├── deployment/                  # Deployment & Container Configurations
│   ├── docker-compose.yml       # Local air-gapped dev & edge deployment
│   ├── docker-compose.cloud.yml # Cloud GPU deployment variant
│   ├── dockerfiles/             # Multi-stage Dockerfiles for all microservices
│   ├── k3s/                     # Edge Kubernetes (K3s) manifests with HPA
│   └── cloud/                   # AWS ECS & GCP Cloud Run configurations
│
├── tests/                       # Automated Testing Suite (88 test cases)
│   ├── unit/                    # Unit tests for core microservices & critic logic
│   ├── integration/             # End-to-end integration tests for clinical pipelines
│   └── load/                    # Locust load test scenarios
│
├── docs/                        # Complete Governance & Engineering Documentation
│   ├── SETUP.md                 # Simple quick-start commands for local & Docker
│   ├── Decisions.md             # 12 Architecture Decision Records (ADRs)
│   ├── Flow.md                  # Detailed dataflow maps across files and functions
│   ├── Architecture.md          # System topology, port matrix, IPC schemas
│   ├── Feature.md               # Exhaustive catalog of all endpoints and UI tools
│   ├── Bug.md                   # 9 historical bug post-mortems and root-cause analyses
│   └── Constraints.md           # Non-negotiable system rules & HIPAA guardrails
│
├── Makefile                     # Build, dev, and test commands
└── pyproject.toml               # Package dependencies & configuration
```

---

## ⚡ Quick Start

### 1. Compile C++ Accelerator & Install Dependencies
```bash
make compile-cpp
pip install -e ".[dev]"
```

### 2. Run All Tests
```bash
make test
```

### 3. Start Local Microservices Suite (Docker Compose)
```bash
make dev
```
The gateway will be accessible at `http://localhost:8000` with interactive API docs at `http://localhost:8000/docs`.



---

## 🔒 Security & Compliance

- **Air-Gapped Operation**: Designed to run disconnected from public internet networks.
- **HIPAA Audit Trail**: Every API query is logged with client IP, timestamp, user ID, status code, and latency in PostgreSQL.
- **FHIR Interoperability**: Automatic serialization of clinical observations, conditions, and diagnostic reports into HL7 FHIR R4 format.
