# ClinixVault Platform Capabilities & API Endpoint Catalog

## 1. Comprehensive Feature Matrix

| Feature Domain | Capability Description | Primary Technologies | Validation Status |
| :--- | :--- | :--- | :---: |
| **Radiology AI** | Two-Stage Hierarchical Report Generation (Findings -> Impression) | Florence-2, Qwen2-VL, CheXagent-2-3B | **Verified (Unit & Live)** |
| **Radiology AI** | 4-Compartment Anatomical Segmentation (Lungs, Heart, Bones, Devices) | Regex grammar & zero-shot routing | **Verified** |
| **Radiology AI** | Agentic Self-Reflective Critic (NegEx + CheXpert Contradiction Audit) | NegEx negation scope & synonym maps | **Verified** |
| **Radiology AI** | DICOM Part 16 Structured Report Export (.dcm binary with UTF-8) | pydicom, ISO_IR 192, VR UI sanitize | **Verified** |
| **Radiology AI** | Patient-Friendly Layman Translation (simplify clinical reports) | ModelManager / Ollama / LLM | **Verified** |
| **Ambient Scribing** | Real-Time Audio Streaming Transcription via WebSocket | Web Audio API, WebSocket | **Verified** |
| **Ambient Scribing** | Neural Speaker Diarization (Doctor vs. Patient Role Clustering) | pyannote.audio, faster-whisper | **Verified** |
| **Ambient Scribing** | Structured SOAP Clinical Note Synthesis | llama.cpp, Outlines, Mistral-7B | **Verified** |
| **Document AI** | Multi-Page PDF Clinical Document Ingestion | PyMuPDF (fitz) | **Verified** |
| **Document AI** | Scanned Document OCR with Adaptive Contrast Stretching | Tesseract OCR, Pillow | **Verified** |
| **Document AI** | Clinical Section Segmentation (HPI, PMH, Meds, Labs, Plan) | MedSpaCy regex rules | **Verified** |
| **Document AI** | Token-Level Source Evidence Citation Mapping & Grounding Score | C++ Cosine Similarity | **Verified** |
| **EHR Interoperability** | HL7 FHIR R4 DiagnosticReport, Observation, Condition Bundles | Pydantic FHIR schemas | **Verified** |
| **Knowledge Graph** | Patient Clinical Knowledge Graph Traversal & Subgraph Extraction | Neo4j 5 Community, Cypher | **Verified** |
| **Knowledge Graph** | Interactive 3D/2D Knowledge Graph Visualizer in UI | Canvas, Three.js CSS2D | **Verified** |
| **Security & Audit** | Cryptographic Provenance Ledger with HMAC-SHA256 Signatures | hashlib, hmac | **Verified** |
| **Security & Audit** | HIPAA Access Audit Log Tracking with Latency & Client IP | SQLAlchemy, AuditLog table | **Verified** |
| **Security & Audit** | Token Bucket Rate Limiting (120 requests/min per IP) | In-memory token bucket | **Verified** |
| **Model Management** | Dynamic Hardware Telemetry (Apple Silicon Unified Memory / CUDA) | psutil, torch, sysctl | **Verified** |
| **Model Management** | Local Ollama Daemon Discovery and Dynamic Model Hot-Swapping | Ollama REST API | **Verified** |
| **Radiology AI** | Automated Cardiothoracic Ratio (CTR) & Carina Caliper Measurement | SVG Calipers, Millimeter Calibration | **Verified** |
| **Clinical Decision Support** | Real-Time DDI & Drug-Allergy Interaction Guard with Safe Substitution | Neo4j Graph, RxNorm, KDIGO rules | **Verified (Unit & Live)** |
| **Observability** | Prometheus OpenMetrics Metric Exporter (`/metrics`) | Custom zero-dep exporter | **Verified** |

---

## 2. API Endpoint Specification Catalog

### 2.1 Authentication & Security (`/api/v1/auth`)
- **`POST /api/v1/auth/login`**:
  * **Description**: Verifies air-gapped credentials and issues signed JWT bearer token.
  * **Input**: `{"username": "radiologist1", "password": "..."}`
  * **Output**: `{"access_token": "...", "token_type": "bearer", "expires_in_minutes": 480, "user_role": "radiologist"}`
  * **Status**: **Verified**

### 2.2 Radiology Studio (`/api/v1/radiology`)
- **`POST /api/v1/radiology/generate`**:
  * **Description**: Primary Two-Stage Hierarchical radiology report generation pipeline.
  * **Input**:
    ```json
    {
      "patient_id": "ENC-9082",
      "clinical_indication": "Persistent cough and dyspnea, rule out pneumonia",
      "projection": "PA",
      "image_base64": "data:image/png;base64,...",
      "model_name": "qwen2-vl:latest"
    }
    ```
  * **Output**:
    ```json
    {
      "report_id": "rpt-94819d4b-32ac",
      "patient_id": "ENC-9082",
      "findings": "Lungs & Pleural Spaces: The lungs are clear without focal consolidation...",
      "impression": "1. No acute cardiopulmonary abnormality.",
      "anatomical_breakdown": {
        "lungs_pleura": "The lungs are clear without focal consolidation, pneumothorax, or effusion.",
        "cardiomediastinum": "Normal cardiac silhouette and mediastinal contour.",
        "bones_soft_tissues": "Bony thorax is intact.",
        "support_devices": "No monitoring or support devices present."
      },
      "critic_audit": {
        "consistency_score": 1.0,
        "negated_pathologies": ["pneumonia", "pneumothorax", "pleural_effusion"],
        "verified_pathologies": []
      },
      "fhir_report": { "resourceType": "DiagnosticReport", "status": "final", ... },
      "provenance": { "hmac_signature": "...", "model_weights_hash": "..." },
      "grounding_score": 0.98,
      "latency_ms": 1140.5
    }
    ```
  * **Status**: **Verified**

- **`POST /api/v1/radiology/export-dicom-sr`**:
  * **Description**: Exports standard binary DICOM Part 16 Structured Report (.dcm).
  * **Input**: `{"report_id": "rpt-94819d4b-32ac"}` or direct text payload.
  * **Output**: Binary stream (`Content-Type: application/dicom`).
  * **Status**: **Verified**

- **`POST /api/v1/radiology/simplify`**:
  * **Description**: Converts complex radiological findings into clear, empathetic 6th-grade patient language.
  * **Input**: `{"findings": "...", "impression": "..."}`
  * **Output**: `{"simplified_report": "Your chest X-ray looks healthy! Your lungs are completely clear with no signs of infection or pneumonia..."}`
  * **Status**: **Verified**

- **`GET /api/v1/radiology/cases`**:
  * **Description**: Serves authentic clinical radiograph cases dynamically loaded from the local Indiana University (IU) X-ray collection (3,826 cases, 7,470 projections). Supports pagination (`page`, `limit`), search queries (`search`), and projection filtering (`Frontal`, `Lateral`).
  * **Input Query Parameters**: `?page=1&limit=20&search=cardiomegaly&projection=Frontal`
  * **Output**:
    ```json
    {
      "total": 3826,
      "page": 1,
      "limit": 20,
      "cases": [
        {
          "id": "iu_1",
          "patient_id": "iu_1",
          "study_uid": "1",
          "indication": "Cardiac pacemakers and defibrillators",
          "findings": "The cardiac silhouette and mediastinum are within normal limits...",
          "impression": "Normal chest.",
          "projections": [
            {
              "filename": "1_1_frontal.png",
              "projection": "Frontal",
              "image_url": "/api/v1/radiology/cases/iu_1/image?filename=1_1_frontal.png",
              "exists": true
            }
          ],
          "created_at": "2026-10-22T21:00:00Z",
          "is_real_case": true
        }
      ]
    }
    ```
  * **Status**: **Verified (Live & Unit Tested)**

- **`GET /api/v1/radiology/cases/{case_id}`**:
  * **Description**: Returns complete metadata, ground truth report, and all projection views for a specific study.
  * **Status**: **Verified**

- **`GET /api/v1/radiology/cases/{case_id}/image`**:
  * **Description**: Streams full-resolution clinical radiograph PNG image bytes from local disk without external network egress.
  * **Output**: `Content-Type: image/png` stream with caching headers.
  * **Status**: **Verified**

- **`POST /api/v1/radiology/upload`**:
  * **Description**: Accepts authentic patient radiograph image uploads (PNG/JPEG/DICOM), stores bytes in local air-gapped storage (`clinixvault/data/uploads/{patient_id}/`), registers `Patient` and `Encounter` records in PostgreSQL/SQLite, and returns registered case object.
  * **Input**: Multipart `file`, optional `patient_name`, `indication`, `projection`.
  * **Output**: Registered `RadiologyCase` object.
  * **Status**: **Verified**

- **`GET /api/v1/radiology/real-cases`**:
  * **Description**: Backwards-compatible dynamic proxy endpoint routing directly to the IU X-ray loader.
  * **Status**: **Verified**

### 2.3 Ambient Clinical Scribing (`/api/v1/scribe`)
- **`WebSocket /api/v1/scribe/ws`**:
  * **Description**: Full-duplex audio stream for live consultation transcription.
  * **Message In**: Binary 16kHz PCM audio bytes or JSON configuration.
  * **Message Out**: `{"type": "transcript_chunk", "speaker": "DOCTOR", "text": "How long have you felt dizzy?", "timestamp": 12.4}`
  * **Status**: **Verified**

- **`POST /api/v1/scribe/generate-soap`**:
  * **Description**: Converts raw dialogue transcript into structured SOAP clinical note.
  * **Input**: `{"transcript": "...", "patient_id": "ENC-9082"}`
  * **Output**: `{"subjective": "...", "objective": "...", "assessment": "...", "plan": "..."}`
  * **Status**: **Verified**

- **`POST /api/v1/scribe/check-interactions`**:
  * **Description**: Real-time Clinical Decision Support (CDS) engine verifying drug-drug interactions (DDI), drug-allergy contraindications, and clinical safety flags across active dialogue turns and SOAP orders.
  * **Input**:
    ```json
    {
      "medications": ["Meloxicam 15mg", "Lisinopril 20mg"],
      "allergies": ["Aspirin"],
      "dialogue": "..."
    }
    ```
  * **Output**:
    ```json
    {
      "status": "checked",
      "total_alerts": 2,
      "contraindications_count": 1,
      "warnings_count": 1,
      "alerts": [
        {
          "id": "DDI-002",
          "severity": "CRITICAL",
          "title": "Cross-Reactive Hypersensitivity / Severe Bronchospasm Contraindication",
          "drugs_involved": ["Meloxicam", "Aspirin"],
          "mechanism": "Non-selective COX-1 inhibition triggers leukotriene overproduction in aspirin-sensitive patients.",
          "clinical_recommendation": "STRICT CONTRAINDICATION. Discontinue Meloxicam immediately.",
          "evidence_source": "FDA Black Box Warning / AAAAI Practice Parameter"
        }
      ],
      "safe_alternatives": ["Topical Diclofenac 1% gel", "Acetaminophen"]
    }
    ```
  * **Status**: **Verified (Live & Unit Tested)**

### 2.4 Document Summarizer & EHR Synthesis (`/api/v1/summarize`)
- **`POST /api/v1/summarize/document`**:
  * **Description**: Extracts, segments, and summarizes multi-page clinical records (PDF/scanned).
  * **Input**: JSON payload (`document_base64`, `clinical_text`, `summary_type: discharge|progress`, `enable_ocr_fallback: true`).
  * **Output**: `{"summary": "...", "sections": {...}, "citations": [...], "flowsheet": [...], "grounding_score": 0.98}`
  * **Status**: **Verified**

- **`POST /api/v1/summarize/patient`**:
  * **Description**: Translates technical physician discharge notes or SOAP documentation into a plain-language (Grade 6 reading level) After-Visit Summary (AVS) for patients and caregivers.
  * **Input**: `{"clinical_text": "...", "report_type": "discharge"}`
  * **Output**: `{"patient_report": {"headline": "...", "doctor_explanation": "...", "key_findings": [...], "next_steps": [...]}}`
  * **Status**: **Verified**

- **Frontend Studio: `DocumentSummarizerPage.tsx`**:
  * **Description**: Dedicated clinical workspace with split-screen source document reader, Doctor Mode vs. Patient Mode toggle, lab flowsheet analyzer with out-of-range flag badges, and token-level citation grounding inspector.
  * **Status**: **Verified**

- **ML Training Pipeline: `mimic_vlm_project/`**:
  * `src/summarization_data.py`: Multi-task dataset loader for paired Findings-to-Impression (MIMIC-CXR, IU X-Ray 3,331 cases).
  * `scripts/train_summarizer.py`: QLoRA fine-tuning for edge LLMs (`Qwen2.5-3B-Instruct`, `BioMistral-7B`).
  * `scripts/eval_summarizer.py`: NLP and clinical safety benchmark engine (ROUGE-1/2/L, NegEx hallucination rate).
  * `scripts/train_dpo_summarizer.py`: Direct Preference Optimization for clinical negation alignment.
  * **Status**: **Verified**

### 2.5 Clinical Knowledge Graph (`/api/v1/graph`)
- **`GET /api/v1/graph/stats`**:
  * **Description**: Returns graph node and edge counts (`total_nodes`, `total_edges`, `node_types`).
  * **Status**: **Verified**

- **`GET /api/v1/graph/patient/{patient_id}`**:
  * **Description**: Returns 2.5D/3D visual graph node and edge objects for the given patient.
  * **Status**: **Verified**

- **`POST /api/v1/graph/query`**:
  * **Description**: Executes sanitized read-only Cypher query with AST mutation blocking.
  * **Status**: **Verified**

- **`POST /api/v1/graph/sync-report`**:
  * **Description**: Extracts clinical entities from report and merges them into Neo4j graph.
  * **Status**: **Verified**

### 2.6 Hardware Telemetry & Model Management (`/api/v1/system`, `/api/v1/models`)
- **`GET /api/v1/system/hardware`**:
  * **Description**: Live CPU, RAM, Apple Silicon Unified Memory, and GPU accelerator specifications.
  * **Status**: **Verified**

- **`GET /api/v1/models`**:
  * **Description**: Catalogs all locally installed and discovered Ollama models.
  * **Status**: **Verified**

- **`POST /api/v1/models/select`**:
  * **Description**: Hot-swaps the active inference model across platform pipelines.
  * **Status**: **Verified**

### 2.7 Observability & System Health (`/health`, `/metrics`, `/`)
- **`GET /api/v1/health`**:
  * **Description**: Deep healthcheck across database, VLM, LLM, Audio, and Document microservices.
  * **Status**: **Verified**

- **`GET /metrics`**:
  * **Description**: Prometheus 2.0 text format exposition with memory, CPU, request counts, and latencies.
  * **Status**: **Verified**

- **`GET /`**:
  * **Description**: Root service identity, version, and operational mode descriptor.
  * **Status**: **Verified**

### 2.8 Clinical Decision Support & Longitudinal Radiology (`/api/v1/scribe`, `/api/v1/radiology`)
- **`POST /api/v1/scribe/check-interactions`**:
  * **Description**: Live Clinical Decision Support (CDS) drug-allergy and drug-drug interaction checker with evidence-based rules (FDA Black Box, KDIGO 2024, ACG) and 1-click safe order substitutions.
  * **Status**: **Verified**

- **`POST /api/v1/radiology/generate` (Longitudinal Temporal Delta Mode)**:
  * **Description**: Compares current radiograph against immediate prior study for the same patient, generating an interval trajectory with pathology transition matrix (`resolved`, `improved`, `stable`, `new`, `worsened`).
  * **Status**: **Verified**

- **Quantitative Radiographic Caliper System**:
  * **Description**: Real-time biometric caliper overlays on radiograph canvas computing Cardiothoracic Ratio ($\text{CTR} = C / T = 0.58$) and Endotracheal Tube tip to Carina distance ($4.2\text{ cm}$) with threshold validation.
  * **Status**: **Verified**

- **Side-by-Side Dual Viewport**:
  * **Description**: Interactive split comparison viewport displaying same-patient prior radiograph alongside today's active study with synchronized window presets and zoom.
  * **Status**: **Verified**

### 2.9 Medical Billing & Enhanced DICOM Part 16 SCOORD Structured Reports
- **`POST /api/v1/scribe/extract-codes`**:
  * **Description**: Automated offline medical ontology extraction mapping clinical text into billable ICD-10-CM diagnosis codes (with laterality), AMA CPT procedure codes (with MDM Level 4 justification), and RxNorm medication concepts.
  * **Status**: **Verified**

- **Enhanced DICOM Part 16 SCOORD Structured Reporting (`POST /api/v1/radiology/export-dicom-sr`)**:
  * **Description**: Exports compliant Enhanced DICOM SR (1.2.840.10008.5.1.4.1.1.88.22) with 2D GraphicData spatial coordinate bounding boxes (`SCOORD`) and structured longitudinal comparison containers (DCM 121077).
  * **Status**: **Verified**

- **Automated ICD-10 & CPT Billing Code Ledger (UI)**:
  * **Description**: Interactive billing summary card in Overview Page featuring primary diagnosis rationale, CPT procedure breakdown, 1-click EHR claim approval, and CMS-1500 copy utility.
  * **Status**: **Verified**

### 2.10 Bi-Temporal Cross-Modal Knowledge Graph & 2D SCOORD Phrase-Grounding Canvas
- **Interactive 2D Phrase-Grounding SCOORD Canvas (UI)**:
  * **Description**: High-precision PACS bounding box overlay (`DCM 111030 SCOORD`) with corner brackets, glowing highlight accents, and coordinate HUD readouts. Hovering over any item in the Pathology Findings Assessment list previews its spatial region; clicking pins the bounding box (`[Pinned SCOORD]`). Supported across Single View Canvas, Dual View (Frontal PA + Lateral), and Split Prior Comparison View.
  * **Status**: **Verified**

- **Bi-Temporal Edge Tracking (`backend/database/graph_store.py`)**:
  * **Description**: Ingests temporal interval deltas with granular `onset_date`, `resolved_date`, `valid_from`, and `temporal_status` (`resolved`, `new`, `improved`, `stable`). Links current radiology studies to prior exams via `INTERVAL_CHANGE_FROM` edges.
  * **Status**: **Verified**

- **Cross-Modal Episode Linking (`CONFIRMS_EPISODE`, `INDICATES_CONDITION`)**:
  * **Description**: Links radiology diagnostic reports to outpatient clinical encounters via `CONFIRMS_EPISODE` and laboratory flowsheet test results (e.g. NT-proBNP) to diagnosed conditions via `INDICATES_CONDITION`.
  * **Status**: **Verified**

- **Durable In-Memory SQLite Fallback Store (`backend/database/neo4j_connection.py`)**:
  * **Description**: Persistent SQLite backing (`graph_nodes` and `graph_edges` in `clinixvault_edge.db`) for the in-memory NetworkX property graph when running without a live Neo4j cluster, ensuring zero triple loss across daemon restarts.
  * **Status**: **Verified**

### 2.11 Neo4j & Clinical Knowledge Graph-Primed Whisper Hotword Boosting
- **Graph-Primed Hotword Vocabulary (`backend/database/graph_store.py`)**:
  * **Description**: Automatically retrieves active conditions, medications, and high-frequency clinical ontology triples to generate tailored hotword prompts (`get_patient_hotwords`).
  * **Status**: **Verified**

- **CTranslate2 Whisper Beam Hotword Injection (`inference/audio_server/transcriber.py`)**:
  * **Description**: Injects primed medical vocabulary into faster-whisper beam decoding, boosting recognition accuracy for complex medications (*e.g., Furosemide, Lisinopril, Amiodarone*) and anatomical landmarks.
  * **Status**: **Verified**

- **Ambient Scribing WebSocket Auto-Priming (`backend/gateway/routes/scribe.py`)**:
  * **Description**: Ambient scribe WebSocket streams auto-prime audio buffer transcription with patient-specific graph hotwords during session finalization.
  * **Status**: **Verified**

### 2.12 NegEx Polarity-Aware Citation Grounding & Visual Evidence Mapping
- **Polarity Inversion Conflict Detection (`backend/audit/citation_mapper.py`)**:
  * **Description**: Clinical NegEx assertion scanner checks claims against source spans for semantic polarity mismatch (e.g. claim asserts absence "no effusion" while source documents presence "severe effusion"). Automatically flags `polarity_conflict = True`, marks `is_grounded = False`, and zeros the alignment score to prevent negation hallucinations.
  * **Status**: **Verified**

- **Source Visual Bounding Box Passthrough (`backend/audit/citation_mapper.py`)**:
  * **Description**: Enriches document citation mappings with pixel/page coordinates (`[x0, y0, x1, y1]`, `page_number`), enabling visual phrase highlighting in document viewers and DICOM overlays.
  * **Status**: **Verified**

### 2.13 Dynamic Aspect-Ratio Grounding, Zero-Mock Diagnostics & Resilient Uploads
- **Adaptive Normalized Aspect-Ratio Coordinates (`inference/shared/vision_analyzer.py`)**:
  * **Description**: Biomarker engine dynamically calculates normalized bounding envelopes for bilateral lungs, cardiac silhouette, costophrenic sulci, carina, and CTR calipers adapted to physical film orientation ($W > H$ landscape vs. $H \ge W$ portrait).
  * **Status**: **Verified**

- **Zero-Mock Diagnostic Failure Surfacing (`frontend/src/services/api.ts`, `RadiologyStudioPage.tsx`)**:
  * **Description**: Completely eliminates silent synthetic fallbacks. Server or model offline conditions return explicit error categories (`ollama_offline`, `model_not_found`, `weights_unavailable`) rendered in an actionable clinical diagnostic alert card with 1-click Model Manager access and retry triggers.
  * **Status**: **Verified**

- **Session-Safe Patient Upload Workflow (`backend/gateway/routes/radiology.py`, `RadiologyStudioPage.tsx`)**:
  * **Description**: Preserves user-uploaded radiographs across cohort filtering, search queries, and tab transitions without data eviction or URL breakage.
  * **Status**: **Verified**

- **Streamlined Deductive Viewport (`RadiologyStudioPage.tsx`)**:
  * **Description**: Replaced redundant dual-stage mode with clean, dedicated Stage 1 (Anatomical Compartments) and Stage 2 (Deductive Impression) views.
  * **Status**: **Verified**

### 2.14 Dynamic Sovereign Patient Registration & Self-Contained Checkpoints Architecture
- **Dynamic Patient Registration Endpoint (`POST /api/v1/patients`)**:
  * **Description**: Endpoints to register arbitrary sovereign clinical patients dynamically, generating collision-safe MRNs, creating initial encounters, seeding clean Knowledge Graph patient nodes, and persisting clinical metadata across sessions.
  * **Status**: **Verified**

- **UI Patient Registration Modal (`frontend/src/pages/KnowledgeGraphPage.tsx`)**:
  * **Description**: Modal allowing clinicians to register walk-in or newly transferred patients directly from the Knowledge Graph and Overview pages with instant focus and sub-graph hydration.
  * **Status**: **Verified**

- **Self-Contained Appliance Checkpoints (`clinixvault/checkpoints/`)**:
  * **Description**: Self-contained local model checkpoints directory containing fine-tuned Qwen2-VL LoRA adapters, DPO models, SmolVLM, LLaVA 1.5, full merged FP16 weights, and multimodal visual indexes. Eliminates hardcoded local developer paths and cloud downloads.
  * **Status**: **Verified**

- **Patient-Centric Directed 2-Hop Graph Extraction (`backend/database/neo4j_connection.py`)**:
  * **Description**: Strict outward directed traversal from Patient to Encounters/Reports/Conditions and outward to Anatomy/Medications/Provenance. Prevents shared ontology bridge leakage across patients and avoids graph explosion.
  * **Status**: **Verified**

### 2.15 True Execution Mode Telemetry & Overview Page Dynamic Patient Registration
- **Execution Mode Telemetry Banner (`backend/gateway/routes/radiology.py`)**:
  * **Description**: Distinguishes between `LIVE NEURAL VLM INFERENCE (MPS / CUDA Accelerated)` with real tokens/sec versus `EDGE DETERMINISTIC BIOMARKER ENGINE (Rule-Based Fallback)`. Completely suppresses misleading synthetic token throughput during heuristic runs.
  * **Status**: **Verified**

- **Overview Page Dynamic Roster & Patient Registration Modal (`frontend/src/pages/OverviewPage.tsx`)**:
  * **Description**: Directly hydrates newly registered patients from the hospital database into the primary encounter roster carousel and provides a 1-click modal for intake staff to enroll walk-in patients without leaving the overview dashboard.
  * **Status**: **Verified**

- **Outer-Margin Film Exclusion in Foreign Body Analysis (`inference/shared/vision_analyzer.py`)**:
  * **Description**: Excludes 6% outer margin border of radiograph arrays and scales pixel density cluster thresholds to prevent film edge artifacts and lead marker stamps from causing false pacemaker diagnoses.
  * **Status**: **Verified**

### 2.16 Sovereign Ambient Clinical Scribe, Real-Time SOAP Synthesis & Zero-Egress Microphone Lifecycle
- **Zero-Egress Dormant Microphone Lifecycle (`frontend/src/components/AudioWaveform.tsx`)**:
  * **Description**: Complete elimination of automatic microphone hardware activation and background audio processing upon page load. Decibel level starts strictly at `0.0 dB SPL` (labeled 'Off') and speaker indicator displays `'Off (Standby)'`. AudioContext, `getUserMedia()`, and Web Speech API instances are instantiated exclusively upon explicit user activation via "Start Ambient Listening" without brittle permission query gates. Re-entrancy guards prevent redundant hardware initialization.
  * **Status**: **Verified**

- **Live 16-Bit PCM Binary Audio Streaming & Web Speech Transcription (`AudioWaveform.tsx`)**:
  * **Description**: Captures continuous clinician-patient dialogue via `ScriptProcessorNode` (streaming 16-bit PCM binary frames) combined with browser Web Speech API for low-latency live utterance transcription, dishing `dialogue_turn` and `audio_telemetry` frames over `/api/v1/scribe/stream`. Turn deduplication logic prevents double-insertion of client-transcribed dialogue upon server acknowledgment.
  * **Status**: **Verified**

- **Verbose Scribe Server-Side Console Logging (`backend/gateway/routes/scribe.py`)**:
  * **Description**: Formatted verbose console logging on every incoming audio frame, binary chunk, and dialogue turn:
    `[SCRIBE STREAM] Received audio chunk: {chunk_size} bytes | Decibels: {decibels:.1f} dB | Speaker: {speaker} | Transcript: {transcript}`. Includes memory-safe buffer slicing before transcription and 1Hz log throttling to avoid terminal flooding.
  * **Status**: **Verified**

- **Dynamic Structured SOAP Note Synthesis Endpoint (`POST /api/v1/scribe/synthesize-soap`, `inference/llm_server/model_loader.py`)**:
  * **Description**: Dedicated endpoint consuming recorded dialogue turns to dynamically synthesize structured Subjective, Objective, Assessment, and Plan notes via downstream LLM or sovereign clinical summarization. Dynamically extracts patient verbal statements and categorizes orthopedic, cardiorespiratory, and pain complaints into ICD-10 diagnostic plans with clean loading and captured dialogue states.
  * **Status**: **Verified**

- **Universal Dynamic Encounter Roster Polling (`frontend/src/pages/OverviewPage.tsx`, `CommandPaletteModal.tsx`, `backend/gateway/routes/patients.py`)**:
  * **Description**: Replaced static mock encounter fixtures across all pages with real-time polling of `clinixApi.getPatients()`. Roster query returns patients ordered by `created_at.desc()` so newly registered active patients appear at index 0 immediately, while session discharge tracking (`completedIds`) prevents background polling from resurrecting completed encounters.
  * **Status**: **Verified**

