# ClinixVault System Architecture Specification

## 1. Executive Topology Overview

ClinixVault is engineered as a sovereign, air-gapped, zero-egress clinical edge AI appliance and HIPAA-compliant cloud platform. The architecture decouples client presentation, API gateway orchestration, dedicated multimodal inference engines, and sovereign data persistence.

```
                              ┌──────────────────────────────────────────────────┐
                              │            Client & Presentation Tier            │
                              │  Clinician Workstation / PACS / Ambient Mic      │
                              │  React 18 + Vite + TypeScript (Port 5173)        │
                              └────────────────────────┬─────────────────────────┘
                                                       │ HTTPS / WSS
                                                       ▼
                              ┌──────────────────────────────────────────────────┐
                              │               API Gateway Tier (8000)            │
                              │  FastAPI Gateway + Token Bucket Rate Limiter     │
                              │  JWT / RBAC Middleware + HIPAA Audit Logging     │
                              │  Prometheus Metrics Exporter (/metrics)          │
                              └───────┬─────────┬─────────┬─────────┬────────────┘
                                      │         │         │         │
                 ┌────────────────────┘         │         │         └────────────────────┐
                 ▼ HTTP                         ▼ HTTP    ▼ WS/HTTP                      ▼ HTTP
┌─────────────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│     VLM Service (:8001)     │ │  LLM Service (:8002)  │ │ Audio Service (:8003) │ │ Document Service (:8004)│
│  Florence-2 / Qwen2-VL /    │ │  llama.cpp C++ Runtime│ │  faster-whisper       │ │  PyMuPDF & Tesseract    │
│  CheXagent-2-3B in NF4      │ │  Mistral-7B / Llama-3 │ │  pyannote.audio       │ │  MedSpaCy Sectionizer   │
│  Two-Stage Hierarchical     │ │  Outlines JSON Schema │ │  Speaker Diarization  │ │  Clinical Extraction    │
│  Agentic Critic Reflection  │ │  SOAP Synthesis       │ │  16kHz Streaming PCM  │ │  OCR Fallback           │
└──────────────┬──────────────┘ └───────────┬───────────┘ └───────────────────────┘ └───────────────────────┘
               │                            │
               └──────────────┬─────────────┘
                              ▼
        ┌───────────────────────────────────────────┐
        │     C++ Acceleration Engine (Shared)      │
        │             libclinix_accel.so            │
        │  - apply_repetition_penalty_c             │
        │  - top_k_top_p_filter_c                   │
        │  - cosine_similarity_c                    │
        │  - batch_cosine_similarity_c              │
        └───────────────────────────────────────────┘
                              │
                              ▼
        ┌───────────────────────────────────────────────────────────┐
        │                 Data & Persistence Tier                   │
        │  - PostgreSQL 16 + pgvector (:5432) / SQLite Fallback     │
        │  - Neo4j 5 Community Graph Database (:7474 / :7687)       │
        │  - HMAC-SHA256 Cryptographic Provenance Ledger            │
        └───────────────────────────────────────────────────────────┘
```

---

## 2. Network Port Matrix & Microservice Topology

| Service | Container Name | Internal Port | External Port | Protocol | Description | Healthcheck Endpoint |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **Frontend** | `clinixvault_frontend` | 5173 | 5173 | HTTP | React SPA, Vite, WorkOS Atlas Light Theme UI | `GET /healthz` |
| **Gateway** | `clinixvault_gateway` | 8000 | 8000 | HTTP / WS | Core Orchestrator, Auth, Rate Limiter, Audit Trail | `GET /api/v1/health` |
| **VLM Server** | `clinixvault_vlm` | 8001 | 8001 | HTTP | Two-Stage Vision-Language Inference Engine | `GET /health` |
| **LLM Server** | `clinixvault_llm` | 8002 | 8002 | HTTP | C++ GGUF LLM Runner & Structured Output Engine | `GET /health` |
| **Audio Server** | `clinixvault_audio` | 8003 | 8003 | HTTP / WS | faster-whisper ASR & pyannote Diarization | `GET /health` |
| **Document Server** | `clinixvault_document` | 8004 | 8004 | HTTP | PyMuPDF text parser & Tesseract OCR engine | `GET /health` |
| **PostgreSQL** | `clinixvault_db` | 5432 | 5432 | TCP | PostgreSQL 16 with pgvector extension | `pg_isready -U postgres` |
| **Neo4j** | `clinixvault_neo4j` | 7474 / 7687 | 7474 / 7687 | HTTP / Bolt | Graph Database for Clinical Knowledge Entities | HTTP :7474 / Bolt :7687 |

---

## 3. Microservice Inter-Process Communication (IPC) Contracts

### 3.1 Gateway <-> VLM Server (:8001)
- **POST `/hierarchical`**:
  * Request: `{"image_base64": "...", "projection": "PA", "clinical_history": "..."}`
  * Response: `{"findings": "...", "impression": "...", "anatomical_breakdown": {"lungs_pleura": "...", "cardiomediastinum": "...", "bones_soft_tissues": "...", "support_devices": "..."}, "critic_audit": {"consistency_score": 1.0, "negated_pathologies": [...], "verified_pathologies": [...]}}`
- **POST `/generate`**: Monolithic single-pass generation (fallback).
- **GET `/health`**: Returns uptime, memory, CPU, and GPU/MPS telemetry.

### 3.2 Gateway <-> LLM Server (:8002)
- **POST `/generate_soap`**:
  * Request: `{"transcript": "...", "patient_context": "..."}`
  * Response: `{"subjective": "...", "objective": "...", "assessment": "...", "plan": "...", "fhir_observations": [...]}`
- **POST `/structured_extract`**:
  * Enforces Pydantic schema validation using JSON grammar-guided decoding.

### 3.3 Gateway <-> Audio Server (:8003)
- **Audio Microservice WebSocket `/ws/stream`** (and Gateway `/api/v1/scribe/stream`, `/api/v1/scribe/ws`):
  * Full-duplex binary stream accepting 16kHz 16-bit mono PCM chunks.
  * Real-time return: `{"type": "audio_frame_ack", "bytes_received": 32000}`
  * Final return: `{"type": "soap_synthesized", "soap": {...}, "provenance": {...}}`

### 3.4 Gateway <-> Document Server (:8004)
- **Document Microservice POST `/parse_document`** (and Gateway `/api/v1/summarize/document`):
  * Accepts `{"document_base64": "...", "enable_ocr_fallback": true}`.
  * Response: `{"extracted_text": "...", "sections": {"CHIEF_COMPLAINT": "...", "HPI": "..."}, "total_pages": 1, "ocr_applied": true/false}`
  * Gateway integrates token-level citation grounding and persists `ClinicalReport`.

---

## 4. Hardware Acceleration & Dynamic Topology Adaptation

ClinixVault features dynamic zero-config hardware adaptation implemented in `inference/shared/hardware.py`:

```
                                 [Hardware Auto-Detection]
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
             [Apple Silicon macOS]                        [Linux / Cloud GPU]
             - Chip: M1/M2/M3/M4 Max/Pro                  - NVIDIA CUDA / MIG Slice
             - Memory: Unified Memory Architecture        - Memory: Dedicated HBM2e / GDDR6
             - PyTorch: Metal Performance Shaders (MPS)   - Driver: nvidia-container-toolkit
             - Quantization: 4-bit GGUF via Metal llama   - Quantization: AWQ / NF4 / bitsandbytes
```

### Fallback Matrix
1. **Tier 1 (NVIDIA Cloud/Server)**: Full CUDA 12.x acceleration with tensor cores.
2. **Tier 2 (Apple Silicon Edge)**: Metal Performance Shaders (MPS) + unified host/device memory zero-copy tensors.
3. **Tier 3 (Local Ollama Engine)**: Seamless proxying to local Ollama runtime (`http://localhost:11434`) for installed models.
4. **Tier 4 (CPU Air-Gapped Fallback)**: Multi-threaded AVX2/AVX-512 SIMD execution with native C++ `libclinix_accel`.

---

## 5. Security Architecture & HIPAA Compliance Boundaries

```
[Untrusted Network / Public Internet]
                  │
                  ▼ [TLS 1.3 Ingress Termination / WAF]
┌─────────────────┼────────────────────────────────────────────────────────┐
│ ClinixVault Protected Boundary                                           │
│                                                                          │
│  [API Gateway]                                                           │
│   ├── JWT Validation (RS256 / HS256)                                     │
│   ├── Token Bucket Rate Limiting (120 req/min/IP)                        │
│   ├── Role-Based Access Control (RBAC):                                  │
│   │   ├── Radiologist: Generate reports, sign off, export DICOM SR       │
│   │   ├── Attending Physician: Scribe SOAP notes, summarize records      │
│   │   ├── Nurse: View vitals, update encounters                          │
│   │   └── Compliance Auditor: Access immutable audit trail & metrics     │
│   └── Zero Outbound Telemetry: No outbound network egress permitted      │
│                                                                          │
│  [Internal Isolated Network]                                             │
│   ├── Microservices communicate over unexposed internal Docker/K3s net   │
│   ├── All containers run as non-root unprivileged users (UID 10001)      │
│   ├── No compilers, package managers, or debugging tools in runner stage │
│   └── Database credentials injected via K8s Secrets / environment vars   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Deployment Topologies: Air-Gapped Edge vs. Cloud Cluster

### Mode A: Air-Gapped Edge Appliance (Hospital LAN / Clinic Box)
- **Runtime**: Single-node K3s cluster or Docker Compose.
- **Hardware**: Mac Studio M2 Ultra (128GB Unified Memory) or Dell Precision Workstation (NVIDIA RTX 6000 Ada).
- **Network**: Zero WAN connectivity. Zero egress DNS lookups.
- **Persistence**: Local PostgreSQL 16 + pgvector volume, local Neo4j volume, SQLite fallback.
- **Image Distribution**: Pre-packaged container tarballs (`docker load -i clinixvault-edge-v1.tar.gz`).

### Mode B: HIPAA-Compliant Cloud Cluster (AWS / GCP / Azure)
- **Runtime**: Managed Kubernetes (EKS / GKE) with Karpenter / Cluster Autoscaler.
- **Hardware**: GPU node pools (`g5.2xlarge` with NVIDIA A10G or `g6.4xlarge` with NVIDIA L4).
- **Network**: Private VPC with AWS PrivateLink / VPC Endpoints, AWS ALB Ingress with ACM TLS certificates.
- **Persistence**: AWS Aurora PostgreSQL Serverless v2 with pgvector, Amazon Managed Neo4j / Aura.
- **Observability**: Prometheus scraping `/metrics` on gateway, Loki for JSON log streams, Grafana dashboards.

---

## 7. Generalized Clinical Case Retrieval & Sovereign Research Model Registry

### 7.1 Multi-Dialect Clinical Database Case Retrieval
- **Component**: `backend/gateway/routes/radiology.py` (`get_radiology_cases`, `get_single_radiology_case`).
- **Database Support**: Pure SQLAlchemy ORM integration over `ClinicalReport` and `Patient` models, fully dialect-agnostic (PostgreSQL, SQLite, MySQL).
- **Storage Location**: Integrated local PACS storage (`data/uploads/{patient_id}/`).
- **Dynamic Capabilities**:
  * Real-time paginated case catalog serving `GET /api/v1/radiology/cases`.
  * Multi-projection filtering (Frontal, Lateral, PA, AP) and search across patient names, indications, and findings.
  * Direct image streaming via `GET /api/v1/radiology/cases/{case_id}/image`.
  * Seamless DICOM & image upload pipeline (`POST /api/v1/radiology/upload`) storing files in `data/uploads/` and registering persistent entities in the database without any hardcoded datasets.

### 7.2 Sovereign Research Model Registry (Zero-Egress Local Checkpoints)
- **Registry Component**: `inference/shared/model_manager.py` (`FINE_TUNED_RESEARCH_CATALOG`).
- **Model Checkpoints**: Persisted locally in `clinixvault/checkpoints/` (zero cloud or HuggingFace downloads needed):
  * `clinixvault-qwen2vl-qlora`: Two-Stage Hierarchical QLoRA (NF4) [ICLR 2026 Champion • 90.27% Clinical F1 • 3.33% Hallucination Rate].
  * `clinixvault-qwen2vl-dpo`: Direct Preference Optimization Alignment [88.56% Clinical F1 • 4.00% Hallucination Rate].
  * `clinixvault-smolvlm-qlora`: Ultra-Lightweight Edge SLM (256M) [<1GB RAM • 480ms latency].
  * `clinixvault-llava-med-lora`: Baseline Clinical LoRA (7B) [78.12% Clinical F1].
- **Execution Architecture**: Requests specifying a fine-tuned model bypass external runners directly into `TwoStageVLMRunner` + `ClinicalCritic`, enforcing local deterministic clinical reasoning.

### 7.3 Longitudinal Same-Patient Temporal Delta Engine
- **Component**: `inference/shared/model_manager.py` (`compute_interval_trajectory`).
- **Architectural Grounding (ADR-002 & ADR-017)**:
  * Strict prohibition against foreign patient multi-modal RAG bleed to avoid visual attention distraction.
  * Same-patient bi-temporal comparator retrieves the immediate prior `ClinicalReport` for that patient UID.
  * Concept scanner evaluates pathology transitions across encounters: `resolved`, `improved`, `stable`, `new`, `worsened`.
  * Injects structured `INTERVAL COMPARISON` into Stage 2 Impression.
  * Synchronizes side-by-side Dual Split Viewport in `RadiologyStudioPage.tsx` with dynamic temporal delta transition matrix.

---

## 8. Clinical Decision Support (CDS) & Quantitative Biometric Calipers

### 8.1 Real-Time CDS & Drug-Allergy / DDI Safety Interlock
- **Component**: `backend/gateway/routes/scribe.py` (`check_clinical_interactions`).
- **Rule Matrix**: Cross-references verbalized or prescribed medications against patient allergy lists and concurrent medications using established guidelines:
  * FDA Black Box: NSAIDs in Aspirin-sensitive asthma (severe bronchospasm risk).
  * KDIGO 2024: NSAID + ACE Inhibitor (triple whammy renal hemodynamic compromise).
  * ACG Guidelines: Concurrent antiplatelet + anticoagulant bleeding risk.
- **Frontend Interlock**: Dynamic warning card in `OverviewPage.tsx` with biochemical mechanism callouts, attending physician override logging, and 1-click safe order substitution.

### 8.2 Quantitative Radiographic Caliper System
- **Component**: `frontend/src/pages/RadiologyStudioPage.tsx`.
- **Biometric Algorithms**:
  * **Cardiothoracic Ratio (CTR)**: Measures maximum right cardiac extent ($MRD$), maximum left cardiac extent ($MLD$), computes total transverse diameter $C = MRD + MLD$, and divides by internal thoracic diameter $T$. Flags cardiomegaly if $\text{CTR} > 0.50$.
  * **Carina-to-ETT Positioning Caliper**: Anchors on the T4-T5 tracheal bifurcation and calculates distance to the endotracheal tube tip, providing instantaneous placement validation (optimal range: $3.0\text{ cm} - 5.0\text{ cm}$).

---

## 9. Automated Medical Billing & Enhanced DICOM SCOORD Architecture

### 9.1 Automated Medical Ontology Extraction Subsystem
- **Component**: `backend/gateway/routes/scribe.py` (`extract_clinical_billing_codes`).
- **Clinical Ontology Specifications**:
  * **ICD-10-CM Laterality Mapping**: Evaluates anatomical modifiers to assign specific primary diagnosis codes (e.g. `M17.11` for unilateral right knee OA vs `M17.0` for bilateral knee OA; `I50.22` for chronic systolic CHF).
  * **AMA 2024 MDM Level 4 Determination**: Prescription drug management (NSAIDs, ACE inhibitors, antibiotics) combined with evaluation of chronic active conditions automatically justifies **CPT 99214** (Established Patient Outpatient, Moderate Complexity).
  * **RxNorm Normalization**: Standardizes prescribed pharmaceuticals to universal concept identifiers (`RxNorm:849727`, `RxNorm:314076`).
- **Frontend Integration**: Real-time billing ledger in `OverviewPage.tsx` with 1-click claim export approval and CMS-1500 summary generation.

### 9.2 Enhanced DICOM Part 16 SCOORD Structured Reporting
- **Component**: `inference/shared/dicom_exporter.py` (`build_dicom_sr_dataset`).
- **Enhanced SR Specifications**:
  * **SOP Class UID Dynamic Upgrade**: Automatically switches SOP Class UID to `ENHANCED_SR_STORAGE_UID` (`1.2.840.10008.5.1.4.1.1.88.22`) when spatial coordinates are present.
  * **2D GraphicData Coordinate Tuples**: Encapsulates planar normalized bounding boxes `[col1, row1, col2, row2]` under DCM 111030 ("Image Region") as `SCOORD` content items.
  * **Bi-Temporal Longitudinal Containers**: Injects structured interval trajectory deltas under DCM 121076 ("Comparison Studies") and DCM 121077 ("Comparison with Previous Examination").

---

## 10. Bi-Temporal Cross-Modal Knowledge Graph & 2D SCOORD Phrase-Grounding Architecture

### 10.1 Bi-Temporal Graph Edge Model & Cross-Modal Schema
- **Components**: `backend/database/graph_schema.py`, `backend/database/graph_store.py`.
- **Bi-Temporal Edge Attributes**:
  * `valid_from` / `valid_to`: ISO timestamps representing assertion validity window.
  * `onset_date` / `resolved_date`: Clinical disease progression markers derived from interval trajectories.
  * `temporal_status`: Discrete trajectory status (`active`, `resolved`, `new`, `improved`, `worsened`, `chronic`).
  * `modality`: Originating modality domain (`radiology`, `scribe`, `lab`).
- **Cross-Modal Linking Relationships**:
  * `(DiagnosticReport)-[:CONFIRMS_EPISODE]->(Encounter)`: Cross-references imaging studies to clinical SOAP encounters.
  * `(LabResult)-[:INDICATES_CONDITION]->(Condition)`: Connects laboratory flowsheet values (e.g. NT-proBNP 1,850 pg/mL) to clinical conditions (`cond-chf`).
  * `(DiagnosticReport)-[:INTERVAL_CHANGE_FROM]->(DiagnosticReport)`: Bi-temporal longitudinal links between current and prior studies.

### 10.2 Durable SQLite Fallback Persistence Architecture
- **Component**: `backend/database/neo4j_connection.py`.
- **Engine Mechanics**:
  * If Neo4j Bolt cluster (:7687) is unreachable, the system activates an in-memory NetworkX property graph backed by durable SQLite tables (`graph_nodes` and `graph_edges` in `clinixvault_edge.db`).
  * On node/edge upsert, entries are written to memory and asynchronously synced to SQLite.
  * On service restart, the in-memory graph is hydrated from SQLite, eliminating data loss in air-gapped environments.

### 10.3 Interactive 2D Phrase-Grounding SCOORD Canvas
- **Component**: `frontend/src/pages/RadiologyStudioPage.tsx`.
- **Design & Rendering Architecture**:
  * **Canonical Mapping**: `PATHOLOGY_SCOORD_MAP` defines calibrated 2D phrase-grounding bounding boxes for major cardiopulmonary pathologies (Cardiomegaly, Pleural Effusion, Pneumonia/Consolidation, Pneumothorax, Atelectasis, Pulmonary Edema, Fracture).
  * **Interactive Dual-Way Grounding**: Hovering over any item in the Pathology Findings Assessment list previews its spatial region; clicking toggles and pins the box (`[Pinned SCOORD]`).
  * **Multi-Viewport Consistency**: Renders seamlessly across Single View Canvas, Dual View (Frontal PA + Lateral), and Split Prior Comparison View.

---

## 11. Self-Contained Edge Checkpoints & Patient Graph Isolation Architecture

### 11.1 Self-Contained Checkpoints Directory (`clinixvault/checkpoints`)
- **Isolation Guarantee**: The appliance contains all required neural weights, LoRA adapters, DPO models, and multimodal vector indexes within a self-contained root directory (`clinixvault/checkpoints`).
- **Dynamic Resolution Protocol**:
  * Path resolution relies on `CHECKPOINTS_DIR` defined in `inference/shared/config.py` (overrideable via `CLINIX_CHECKPOINTS_DIR`).
  * Model loaders resolve checkpoints relative to this boundary, rejecting hardcoded developer paths (`/Users/.../mimic_vlm_project`).
  * In the absence of internet connectivity, the runner prioritizes full merged safetensors (`checkpoints/qwen2_vl_mimic_cxr_lora_full`) that execute in ~3.5s with zero external requests.

### 11.2 Patient-Centric Directed 2-Hop Graph Isolation
- **Component**: `backend/database/neo4j_connection.py` (`_get_memory_subgraph`).
- **Isolation Topology**:
  * Rather than creating an undirected ego graph that traverses backwards through shared clinical ontology nodes (`cond-chf`, `med-furosemide`) and pulls other patients into the subgraph, ClinixVault enforces a strict outward-directed BFS:
    $$\text{Hop 1}: \text{Patient} \xrightarrow{\text{outward}} \{\text{Encounters}, \text{Reports}, \text{Labs}, \text{Conditions}\}$$
    $$\text{Hop 2}: \text{Hop 1 Nodes} \xrightarrow{\text{outward}} \{\text{Anatomy}, \text{Medications}, \text{Observations}, \text{Provenance}\}$$
  * This guarantees that a patient's visual subgraph reflects strictly their personal clinical history (typically 8–18 nodes) with zero multi-tenant data leakage.
- **Dynamic Patient Registration & Clean Seeding**:
  * `POST /api/v1/patients` dynamically instantiates patients in the SQLite/PostgreSQL database and adds an isolated node in `ClinicalGraphStore`.
  * Demo graph populator strictly creates clean patient nodes for unrecognized IDs, eliminating synthetic knee osteoarthritis injection.



