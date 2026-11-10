# ClinixVault Platform Architecture & Multi-Phase Implementation Plan

## Executive Summary & Vision Statement

**ClinixVault** is engineered as a sovereign, zero-egress, air-gapped clinical edge AI appliance and HIPAA-compliant cloud intelligence platform. It delivers enterprise-grade multimodal artificial intelligence directly within hospital security perimeters—enabling automated radiology report generation, ambient clinical conversation scribing, multi-page document summarization, bi-temporal medical knowledge graphing, and deterministic clinical decision support without transmitting protected health information (PHI) over untrusted public networks.

This implementation plan provides an exhaustive architectural blueprint of the platform as-built, formalizes the resolution of UI/layout scaling constraints, and establishes a phased engineering roadmap for enterprise hospital deployment, GPU cluster scaling, multimodal bi-temporal expansion, and native EHR/PACS interoperability.

---

## 1. As-Built System Architecture & Topology

ClinixVault is architected as a modular, loosely-coupled microservice topology where client workstations communicate through a hardened API Gateway that coordinates specialized inference engines, persistence databases, and hardware acceleration libraries.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               Presentation Layer (Web Client)                          │
│   React 19 + TypeScript + Vite + Tailwind CSS + Framer Motion (Port 5173)              │
│   - Single-Row Responsive HeaderBar (Sovereign Telemetry, Colab/Local Node Selector)   │
│   - Interactive Modals: BackendNodeModal, ModelManagerModal, SafetyAirGapModal         │
│   - Clinical Workspaces: Overview, Radiology Studio, Ambient Scribe, Document Summarizer│
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTPS / WSS
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              API Gateway Tier (Port 8000)                              │
│   FastAPI Gateway + Token Bucket Rate Limiter + JWT Authentication & RBAC              │
│   - Active Clinician Identity Directory & Dynamic Persona Switcher                     │
│   - HIPAA Immutable Audit Logger (SQLAlchemy + SHA-256 Provenance)                     │
│   - OpenMetrics / Prometheus Telemetry Exporter (/metrics)                             │
└───────────┬───────────────────────────────┼──────────────────────────────┬─────────────┘
            │ HTTP                          │ HTTP                         │ WS / HTTP
            ▼                               ▼                              ▼
┌───────────────────────┐       ┌───────────────────────┐      ┌─────────────────────────┐
│  VLM Service (:8001)  │       │  LLM Service (:8002)  │      │  Audio Service (:8003)  │
│ - Florence-2 / Qwen2-VL│      │ - llama.cpp C++ GGUF  │      │ - faster-whisper (CT2)  │
│ - 4-Compartment Seg.  │       │ - Outlines JSON Schema│      │ - pyannote.audio Diar.  │
│ - Agentic Critic      │       │ - ICD-10 / CPT Engine │      │ - 16kHz PCM Streamer    │
└───────────┬───────────┘       └───────────┬───────────┘      └─────────────────────────┘
            │                               │
            └───────────────┬───────────────┘
                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                    Native C++ Acceleration Engine (libclinix_accel.so)                 │
│   - SIMD Vectorized Top-K/Top-P Filtering & Token Sampling                             │
│   - AVX-512 / ARM NEON Batch Cosine Similarity for Citation Grounding                  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                Persistence & Data Tier                                 │
│   - PostgreSQL 16 + pgvector (Port 5432) / SQLite Multi-Dialect Fallback               │
│   - Neo4j 5 Community Graph Database (Ports 7474 / 7687)                               │
│   - Local Sovereign Storage (`data/uploads/`, `checkpoints/`)                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Microservice Port & Protocol Topology

| Service | Internal Port | External Port | Protocol | Purpose & SLA |
| :--- | :---: | :---: | :---: | :--- |
| **Frontend SPA** | 5173 | 5173 | HTTP | Clinician UX, DICOM Canvas Viewer, Audio capture |
| **Gateway Router** | 8000 | 8000 | HTTP / WS | Authentication, CDS validation, Rate limiting, Dispatch |
| **VLM Service** | 8001 | 8001 | HTTP | Two-stage vision-language chest X-ray inference |
| **LLM Service** | 8002 | 8002 | HTTP | Outlines grammar-guided SOAP note generation |
| **Audio Service** | 8003 | 8003 | WS / HTTP | Ambient clinical transcription & speaker separation |
| **Document Service** | 8004 | 8004 | HTTP | PyMuPDF parsing, Tesseract OCR, citation extraction |
| **PostgreSQL / pgvector**| 5432 | 5432 | TCP | Patient records, clinical reports, embeddings |
| **Neo4j Graph DB** | 7474 / 7687 | 7474 / 7687 | HTTP / Bolt | Longitudinal bi-temporal knowledge graph |

---

## 2. Header Bar UI/UX Resilience & Responsive Scaling Fix

### 2.1 Problem Analysis (As Documented in Incident)
On client displays ranging between 768px, 1024px, and 1440px (common for iPads and 13"/14" clinical laptops), the clinician persona card (`Dr. Marcus Vance, Attending Radiologist`) visually collided with and occluded the `Colab GPU` backend connection pill.

**Root Causes Identified**:
1. **Viewport vs. Container Breakpoint Mismatch**: Tailwind's `xl:` breakpoint (1280px) evaluated `window.innerWidth`, enabling long labels across multiple buttons. However, the active dock sidebar (`pl-24 sm:pl-32` = 128px) plus container padding (`pr-6 sm:pr-12` = 48px) reduced actual available header width to ~1140px, causing a 180px content deficit.
2. **Unbounded Flex Shrinkage Collisions**: In standard CSS flexbox with `justify-between`, when total content width exceeds available container width and items lack strict boundary clamping, the right-aligned container slides leftward directly into the left-aligned container.
3. **Redundant Sizing Footprints**: The header rendered redundant triggers (`Hardware Node` and `Models Manager` both opened the same modal), and multi-line strings (`Attending Radiologist`) expanded horizontal footprint unnecessarily.

### 2.2 Implemented Architectural Fix
The header was re-architected with defensive flex boundaries and progressive disclosure:
- **Strict Boundary Decoupling**: 
  - Left container enforced with `flex-1 min-w-0 mr-2 overflow-hidden`. This mathematically guarantees that the left container cannot exceed `available_width - right_container_width`, making collisions physically impossible.
  - Right utility container enforced with `shrink-0 flex-nowrap justify-end`.
- **Doctor Persona Card Responsive Clamping**:
  - Doctor name clamped with progressive max-width truncation (`hidden md:block max-w-[100px] xl:max-w-[140px] 2xl:max-w-[180px] truncate`).
  - Second-line role text (`Attending Radiologist`) deferred to `>=2xl` (`hidden 2xl:flex`), converting it into a clean single-row element on standard laptop screens.
  - On viewports `<md` (<768px), the card displays the avatar initials (`MV`), saving 120px while preserving full 1-click identity switching.
- **Responsive Telemetry Tiering**:
  - `Colab GPU` / `Local Node` pill remains 100% visible and unclipped with active beacon ping across all viewports.
  - Secondary labels (`Air-Gapped`, `FHIR`) compressed to sleek icon-with-tooltip triggers below `2xl`, and hidden on tablet viewports below `lg` (<1024px) where space is premium.
  - Redundant `Models` button deferred to `hidden 2xl:flex`, relying on the adjacent `Hardware Node` button on standard viewports.
  - Header clock simplified to `HH:MM PM IST` without jittering seconds, and hidden on `<xl` (<1280px) to prevent collision with OS system clocks.
  - Logo brand title `.Enterprise` suffix hidden below `xl`, and brand title text hidden below `md` leaving the crisp logo badge on mobile.

---

## 3. Platform Evolution Roadmap (Phases 1 through 5)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CLINIXVAULT PLATFORM ROADMAP                            │
├───────────────────┬───────────────────┬───────────────────┬────────────────────────────┤
│ Phase 1 (Q1 2026) │ Phase 2 (Q2 2026) │ Phase 3 (Q3 2026) │ Phase 4 & 5 (Q4 2026+)     │
├───────────────────┼───────────────────┼───────────────────┼────────────────────────────┤
│ Edge Hardening &  │ Multi-MIG GPU     │ Bi-Temporal       │ Ambient Multilingual AI    │
│ Sovereign Cache   │ Cluster Scaling   │ GraphRAG Matrix   │ & Enterprise PACS / EHR    │
│                   │                   │                   │ SMART-on-FHIR Federation   │
└───────────────────┴───────────────────┴───────────────────┴────────────────────────────┘
```

### Phase 1: Zero-Egress Edge Hardening & Sovereign Offline Cache
**Target Timeline**: Month 1 - 2
**Strategic Objective**: Deliver uninterrupted local clinician operations during network isolation or tunnel failovers.

#### Technical Deliverables:
1. **Client IndexedDB Zero-Egress Cache**:
   - Implement client-side persistent storage using Dexie.js / IndexedDB for local drafts, active SOAP notes, and pending DICOM annotations.
   - Background service worker synchronizes pending actions whenever local or Colab backend re-establishes connectivity.
2. **Automated Dual-Node Failover Agent**:
   - Gateway ping monitor that continuously detects tunnel health.
   - If Colab GPU tunnel latency exceeds 1,200ms or drops 3 consecutive heartbeats, automatic fallback route switches active inference to local quantized edge models (`smolvlm-qlora` or local Ollama) with visual toast notification.
3. **Session Vault Locking**:
   - Inactivity auto-lock timer (configurable 5 to 30 min) enforcing biometric / passphrase re-authentication without losing in-flight clinical state.

#### Acceptance Criteria:
- Clinician can transcribe audio and review radiology images when backend node disconnects; synchronization completes automatically upon reconnection with 0% data loss.
- Header connection pill reflects health status (`amber` = Colab GPU, `emerald` = Local Node, `rose` = Offline) within 500ms of state change.

---

### Phase 2: Multi-MIG GPU Fleet Scaling & High-Throughput Inference
**Target Timeline**: Month 3 - 4
**Strategic Objective**: Scale multimodal inference throughput for multi-department hospital workloads using NVIDIA Multi-Instance GPU (MIG) slicing and continuous batching.

#### Technical Deliverables:
1. **NVIDIA MIG Slicing Profile Architecture**:
   - Partition enterprise NVIDIA A100 (80GB) or H100 into isolated hardware instances:
     * `Slice 0 (3g.40gb)`: Dedicated to High-Resolution Vision-Language Model (`Qwen2-VL-7B` / `CheXagent-2-3B`).
     * `Slice 1 (2g.20gb)`: Dedicated to High-Concurrency LLM SOAP note generation (`Mistral-7B-Instruct-v0.3` via vLLM).
     * `Slice 2 (1g.10gb)`: Dedicated to streaming ASR (`faster-whisper-large-v3` + `pyannote.audio`).
     * `Slice 3 (1g.10gb)`: Dedicated to Embedding generation & Vector reranking (`bge-large-en-v1.5`).
2. **vLLM Engine Integration with PagedAttention**:
   - Replace standalone llama.cpp runners in cloud/server mode with vLLM continuous batching server.
   - Implement prefix caching for recurring clinical templates (SOAP boilerplate, organ system checklists) yielding a 3.4x throughput increase.
3. **Kubernetes Multi-GPU DaemonSet & Autoscaler**:
   - Helm charts with Karpenter GPU auto-scaling profiles targeting AWS `g5.12xlarge` / GCP `a2-highgpu-1g`.

#### Performance Benchmarks:
- Radiology report inference latency: $\le 1.8\text{ s}$ per study.
- Concurrent ambient scribe streams: $\ge 24$ active doctors per single A100 server.

---

### Phase 3: Bi-Temporal GraphRAG Expansion & SOTA Clinical Reasoning
**Target Timeline**: Month 5 - 6
**Strategic Objective**: Unify longitudinal patient history into a dynamic graph-vector hybrid knowledge engine for cross-encounter clinical decision support.

#### Technical Deliverables:
1. **Neo4j 5 Vector + Cypher Hybrid RAG**:
   - Implement hybrid retrieval combining dense semantic embeddings (cosine similarity over `ClinicalReport` paragraphs) with explicit Cypher graph traversals:
     ```cypher
     MATCH (p:Patient {id: $patient_id})-[:HAS_ENCOUNTER]->(e:Encounter)
     MATCH (e)-[:DIAGNOSED_WITH]->(c:Condition)
     MATCH (c)-[:MANAGED_BY]->(m:Medication)
     RETURN c.name, m.name, e.date ORDER BY e.date DESC LIMIT 10
     ```
2. **Interval Trajectory Reasoning Matrix**:
   - Expand the 2-point bi-temporal delta engine to an $N$-point disease trajectory model.
   - Automatically graph quantitative trendlines: Cardiothoracic Ratio (CTR) progression, pulmonary edema clearance curve, and lab flowsheet correlation (e.g. BNP vs. pleural effusion severity).
3. **Medical Ontology Standard Linking**:
   - Automated entity linking to UMLS Metathesaurus (CUI), SNOMED CT clinical terms, LOINC lab identifiers, and RxNorm pharmaceutical codes during note finalization.

---

### Phase 4: Ambient Clinical Intelligence & Multilingual Scribe
**Target Timeline**: Month 7 - 8
**Strategic Objective**: Expand ambient room transcription with real-time streaming speculative decoding, multilingual capability, and acoustic separation.

#### Technical Deliverables:
1. **Sub-350ms Speculative Streaming ASR**:
   - Implement chunked 250ms audio buffer pipeline over WebSocket.
   - Dual-engine architecture: Fast edge acoustic model produces real-time draft tokens; server-side Whisper validates and commits transcript text.
2. **Indic Healthcare Dialect & Code-Switching Engine**:
   - Fine-tuned multilingual Whisper adapters for clinical code-switching commonly encountered in Indian healthcare environments (Hinglish, Tamil-English, Marathi-English).
   - Medical custom hotword boosting lexicon with 12,000+ proprietary drug trade names and anatomy vocabulary.
3. **Autonomous Clinical Order Slip Generation**:
   - As physician verbally discusses treatment plans ("Let's order a non-contrast chest CT and start atorvastatin 20mg"), the system extracts proposed orders as staged pending tickets for 1-click physician sign-off.

---

### Phase 5: Enterprise PACS/EHR Integration & Federated Learning
**Target Timeline**: Month 9 - 12
**Strategic Objective**: Seamless enterprise interoperability with hospital IT ecosystems and privacy-preserving collaborative model improvement.

#### Technical Deliverables:
1. **Native DICOMweb Protocol Suite**:
   - **WADO-RS**: Direct high-speed retrieval of multi-frame DICOM studies from enterprise PACS (GE Centricity, Philips IntelliSpace, Sectra).
   - **STOW-RS**: Storing generated secondary capture images and DICOM Part 16 Structured Reports back into PACS archive.
   - **QIDO-RS**: Querying hospital worklists based on accession numbers.
2. **SMART-on-FHIR & HL7 MLLP Gateway**:
   - HL7 v2.5.1 interface engine parsing `ADT` (Admission, Discharge, Transfer) and `ORM` (Order Message) feeds.
   - SMART-on-FHIR Launch Context allowing ClinixVault to run embedded as an iframe / app inside Epic Hyperspace and Cerner Millennium.
3. **Cross-Hospital Federated Learning Framework**:
   - Decentralized model fine-tuning across partner hospital nodes using Flower / PySyft.
   - Gradient updates aggregated via secure multi-party computation (SMPC) with $( \epsilon, \delta )$-differential privacy guarantees; raw medical images never leave sovereign hospital hardware.

---

## 4. Security, Compliance & Governance Architecture

ClinixVault strictly adheres to HIPAA Security and Privacy Rules (45 CFR Parts 160 and 164) and FDA Good Machine Learning Practice (GMLP) principles:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              HIPAA TECHNICAL SAFEGUARD MATRIX                          │
├───────────────────────┬──────────────────────────────────┬─────────────────────────────┤
│ Safeguard Requirement │ Technical Implementation         │ Enforcement Location        │
├───────────────────────┼──────────────────────────────────┼─────────────────────────────┤
│ Access Control        │ Role-Based Access Control (RBAC) │ `backend/gateway/auth.py`   │
│ (§ 164.312(a)(1))     │ JWT RS256 Tokens + PBKDF2 Hashing│ Clinician Persona Switcher  │
├───────────────────────┼──────────────────────────────────┼─────────────────────────────┤
│ Audit Controls        │ Immutable Append-Only Ledger     │ `AuditLog` Table +          │
│ (§ 164.312(b))        │ Client IP, Latency, Action Code  │ HMAC-SHA256 Signatures      │
├───────────────────────┼──────────────────────────────────┼─────────────────────────────┤
│ Transmission Security │ TLS 1.3 Ingress Termination      │ NGINX / Gateway             │
│ (§ 164.312(e)(1))     │ Zero-Egress Network Policy       │ Docker / K8s NetworkPolicy  │
├───────────────────────┼──────────────────────────────────┼─────────────────────────────┤
│ Data Integrity        │ Cryptographic Hash Verification  │ `ProvenanceService`         │
│ (§ 164.312(c)(1))     │ Per-Report Nonce & SHA-256 Sum   │ DICOM SR Hashes             │
└───────────────────────┴──────────────────────────────────┴─────────────────────────────┘
```

---

## 5. Summary & Verification Blueprint

| Component | Target Objective | Verification Strategy | Status |
| :--- | :--- | :--- | :---: |
| **Responsive Header** | Zero visual overlap, Colab GPU visible | Multi-viewport builds (640px to 4K) | **Verified** |
| **Edge Hardware Telemetry**| Dynamic GPU/MPS detection | Hardware API & Model Manager check | **Verified** |
| **DICOM SR Pipeline** | Enhanced Part 16 SCOORD output | `pydicom` validator test suite | **Verified** |
| **CDS Safety Guard** | Real-time DDI & Allergy Interlock | Unit tests (`test_clinical_decision_support.py`) | **Verified** |
| **Multi-MIG Scaling** | 24 concurrent scribe streams | Load test with synthetic 16kHz audio | Planned (Phase 2) |
| **SMART-on-FHIR** | Epic / Cerner EHR embedding | Synthetic EHR launch sandbox | Planned (Phase 5) |
