# ClinixVault Sovereign Hospital Appliance: Clinical & Operational User Guide

**Version**: 2.4.0-Production  
**Classification**: Hospital Confidential / Operational Protocol  
**Deployment Model**: On-Premise / Air-Gapped Edge Appliance  

---

## 1. Executive Summary & Core Guarantees

ClinixVault is an enterprise-grade, air-gapped clinical intelligence appliance designed for sovereign hospital infrastructure. It delivers high-accuracy multimodal medical vision-language modeling (VLM), ambient clinical consultation transcription, deterministic Knowledge Graph reasoning, and closed-loop hallucination suppression without transmitting a single byte of Protected Health Information (PHI) over external networks.

```
+-----------------------------------------------------------------------------------+
|                        CLINIXVAULT SOVEREIGN BOUNDARY                             |
|                                                                                   |
|  +--------------------+   DICOM / Audio   +------------------------------------+  |
|  | Hospital LAN / EHR | ----------------> | ClinixVault Edge Gateway           |  |
|  | (Workstations/PACS)| <---------------- | (FastAPI / TLS 1.3 / Port 8000)    |  |
|  +--------------------+    Signed FHIR    +-----------------+------------------+  |
|                                                             |                     |
|            +-------------------+----------------------------+                     |
|            |                   |                            |                     |
|            v                   v                            v                     |
|  +--------------------+  +--------------------+  +--------------------+           |
|  | Hierarchical VLM   |  | Ambient Scribe     |  | Clinical GraphRAG  |           |
|  | Engine (Qwen2-VL)  |  | (Whisper + Hotword)|  | (Neo4j / NetworkX) |           |
|  | Checkpoints Local  |  | Low-Latency Coder  |  | Bi-Temporal Graph  |           |
|  +--------------------+  +--------------------+  +--------------------+           |
|            |                   |                            |                     |
|            +-------------------+----------------------------+                     |
|                                |                                                  |
|                                v                                                  |
|              +------------------------------------+                               |
|              | SHA-256 Provenance & Audit Ledger  |                               |
|              | (Zero-Egress Strict Confinement)   |                               |
|              +------------------------------------+                               |
+-----------------------------------------------------------------------------------+
                                  ||
                      [WAN / PUBLIC INTERNET: BLOCKED]
```

### Guarantees
1. **Zero-Egress Confinement**: No telemetry, analytics, or model weights call external cloud endpoints. All neural models, vector indexes, and ontologies reside strictly on-premise in `checkpoints/`.
2. **Deterministic Reproducibility**: Every generated report, diagnostic summary, and interval comparison is cryptographically sealed with a SHA-256 digest and digital signature manifest.
3. **Hardware Agnostic Acceleration**: Engineered for unified-memory Apple Silicon (Metal Performance Shaders / MPS) and Linux edge appliances equipped with NVIDIA Ada/Ampere GPUs (CUDA 12.x).
4. **Closed-Loop Hallucination Audit**: Multimodal findings are verified against a bi-temporal Clinical Knowledge Graph to eliminate confabulations before reports are committed to the hospital EHR.

---

## 2. Clinical Roles & Operational Responsibilities

ClinixVault defines five distinct operational personas to streamline hospital workflows:

| Role | Key Interface | Primary Responsibilities |
| :--- | :--- | :--- |
| **Triage / Intake Nurse** | Patient Registry & Overview | Patient enrollment, vitals entry, exam room assignment, encounter initiation. |
| **Diagnostic Radiologist** | Radiology Studio | DICOM CXR ingestion, Two-Stage Hierarchical inference, interval trajectory comparison, DICOM-SR authorization. |
| **Attending Physician** | Clinical Overview & Scribe | Reviewing longitudinal records, SOAP note review, treatment planning, patient-friendly translation delivery. |
| **Medical Scribe** | Ambient Scribe Page | Real-time encounter recording, speaker diarization audit, ICD-10/CPT coding review. |
| **Chief Medical Officer (CMO) / Compliance** | Audit & Knowledge Graph | Cryptographic provenance verification, hallucination rate auditing, clinical ontology governance. |

---

## 3. End-to-End Clinical Workflow

```
[1. Patient Admission]
       │
       ▼
[2. DICOM CXR Acquisition] ──► [3. Two-Stage VLM Inference]
                                       │
                                       ▼
[5. EHR Commit & DICOM-SR] ◄── [4. GraphRAG Hallucination Audit]
       │
       ▼
[6. Ambient Consultation] ──► [7. Graph-Augmented SOAP & Billing]
```

### Step 1: Patient Admission & Sovereign Registration
- Clinical staff access the **Patient Registry** via the top navigation bar or the Knowledge Graph portal.
- Staff click **+ Register Patient** to enroll walk-in or newly transferred patients.
- The registration modal captures:
  - Demographic Identifiers: First Name, Last Name, Date of Birth, Gender.
  - Medical Record Number (MRN): Optional manual entry or auto-generated collision-free format (`MRN-XXXXXX`).
  - Clinical Baseline: Assigned Exam Room, Chief Complaint, and baseline vital signs (BP, HR, SpO2, Temp, BMI).
- Upon submission, ClinixVault:
  1. Persists the patient and encounter in the local database.
  2. Creates a clean, sovereign patient node in the property graph.
  3. Prepares an initial encounter record ready for imaging and ambient documentation.

### Step 2: Imaging Study Ingestion
- In the **Radiology Studio**, select the target patient from the roster dropdown.
- Upload a standard Chest Radiograph (DICOM, PNG, or high-resolution JPEG):
  - ClinixVault automatically normalizes pixel matrices, validates aspect ratios, and extracts projection geometry (PA, AP, Lateral).
  - Ground-truth research studies from the MIMIC-CXR / IU-Xray benchmark can be loaded directly from the case browser for comparison.

### Step 3: Two-Stage Hierarchical VLM Generation
Radiological reporting operates via a hierarchical reasoning pipeline:
1. **Stage 1 (Anatomical Compartmentalization)**: The vision model decomposes the chest radiograph into four distinct anatomical regions:
   - **Lungs & Pleural Spaces**: Focal consolidations, interstitial edema, pneumothorax, effusion blunting.
   - **Cardiomediastinum**: Authentic cardiothoracic ratio (CTR), mediastinal widening, cardiac contours.
   - **Bony Thorax & Soft Tissues**: Rib fractures, osseous lesions, degenerative changes, surgical clips.
   - **Support Apparatus & Devices**: Endotracheal tubes, pacemakers, central venous catheters, sternotomy wires.
2. **Stage 2 (Deductive Impression)**: An inductive synthesis pass summarizes key actionable pathologies in order of clinical acuity, suppressing normal baseline anatomy to emphasize urgent findings.

### Step 4: Closed-Loop GraphRAG Hallucination Audit
Before display to the radiologist:
- An independent **Critic Auditor** extracts claimed radiological entities and verifies them against the image's raw pixel biomarkers (density profiles, costophrenic gradients) and patient historical records.
- Any conflicting assertion (e.g., asserting "clear lungs" when severe basilar effusion was measured) is flagged with an automated audit badge, displaying exact grounding evidence and contradiction rationale.

### Step 5: Prior Study Comparison & Interval Trajectory
- ClinixVault matches the current study against previous imaging studies for the same patient.
- Pathologies are tracked on a 6-state longitudinal trajectory:
  - `Resolved` (e.g., pneumonia cleared)
  - `Improved` (e.g., pulmonary edema decreasing)
  - `Stable` (e.g., chronic cardiomegaly unchanged)
  - `Worsened` (e.g., enlarging effusion)
  - `New` (e.g., newly developed consolidation)
  - `Stable Negative` (e.g., continued absence of pneumothorax)
- Radiologists can export the finalized report as a standard **DICOM Structured Report (DICOM-SR)** binary or a **FHIR DiagnosticReport** bundle.

### Step 6: Ambient Consultation & Automated SOAP Documentation
- During patient consultations, the **Ambient Scribe** listens to the encounter via workstation microphone or uploaded audio.
- **Whisper Hotword Boosting**: Ingests patient-specific terminology (past medications, existing diagnoses, anatomical regions) directly from the Knowledge Graph to prevent speech recognition phonetic dropouts on rare drug names.
- The transcription is parsed into structured SOAP note sections (Subjective, Objective, Assessment, Plan) with automated ICD-10-CM and CPT billing code extraction.
- A **Patient-Friendly Summary** is generated, translating clinical jargon into accessible 6th-grade reading level language with explanations of all medical terms.

---

## 4. The Clinical Knowledge Graph: Architecture & Utility

### Why a Knowledge Graph on an Edge Appliance?
Large Language Models and Vision Models alone lack structural memory: they predict tokens based on statistical probabilities. In healthcare, probabilistic reasoning without hard relational constraints leads to hallucinations, false drug interactions, and unverified diagnoses.

ClinixVault couples neural models with a deterministic **Property Knowledge Graph** backed by Neo4j (with an embedded SQLite/NetworkX engine for single-box air-gapped workstations).

```
   (Patient: Eleanor Vance)
         │
         ├──[:HAS_ENCOUNTER]──► (Encounter: ENC-9082)
         │                            │
         │                            └──[:RECORDED_IN]──► (DiagnosticReport: Knee XR)
         │                                                        │
         └──[:HAS_CONDITION]──► (Condition: Osteoarthritis)       ├──[:SHOWS]──► (Observation: Joint Space Narrowing)
                                      │                           │
                                      └──[:AFFECTS]───────────────┴──► (Anatomy: Medial Compartment Knee)
```

### Practical Utility in Daily Hospital Operations

#### 1. Closed-Loop Hallucination Auditing
When the VLM generates a report, its asserted triples are evaluated against the patient's existing graph. If the model claims "no prior cardiac history" for a patient whose graph contains an active `(Patient)-[:HAS_CONDITION]->(Congestive Heart Failure)` node, the system flags a **Clinical Contradiction Alert** and suppresses the invalid text.

#### 2. Bi-Temporal Context Retrieval (GraphRAG)
During clinical note synthesis, the gateway executes a 2-hop directed traversal starting at the patient node:
- Depth 1: Encounters, Diagnostic Reports, Lab Results, Active Conditions.
- Depth 2: Anatomical sites, prescribed medications, prior surgeries, and signed provenance hashes.
This bounded traversal prevents global graph leakage (ensuring one patient never sees entities belonging to another) while feeding high-precision context to the synthesis engine.

#### 3. Acoustic Hotword Injection
Medical speech often includes specialized nomenclature (e.g., *Furosemide*, *Amiodarone*, *Costophrenic*). ClinixVault queries `get_patient_hotwords(patient_id)` before audio processing, boosting the Whisper transcription acoustic decoder for relevant terms.

#### 4. Cypher Query Console
Clinicians and administrators can execute read-only Cypher queries directly in the UI:
```cypher
// Trace CHF complications and affected anatomical sites
MATCH (c:Condition {name: "Congestive Heart Failure"})-[r:AFFECTS]->(a:Anatomy)
RETURN c.name, type(r), a.name;

// Count all active clinical entities in the hospital graph
MATCH (n) RETURN count(n);
```

---

## 5. Deployment, Maintenance & Troubleshooting

### Checkpoints Architecture
All model weights are stored in `clinixvault/checkpoints/` (configurable via `CLINIX_CHECKPOINTS_DIR`).

```
clinixvault/checkpoints/
├── qwen2_vl_mimic_cxr_lora/          # Fine-tuned LoRA adapter (Rank 16)
├── qwen2_vl_mimic_cxr_lora_full/     # Full FP16 merged safetensors (4.4 GB)
├── qwen2_vl_mimic_cxr_dpo/           # Direct Preference Optimization adapter
├── smolvlm_mimic_cxr_lora/           # Lightweight mobile/edge adapter
├── llava_1.5_7b_mimic_cxr_lora/      # High-capacity clinical reasoning adapter
└── mm_rag_visual_index.npz           # Multimodal RAG embedding index
```

### Starting the Appliance
```bash
# 1. Activate environment
source vlm_env/bin/activate

# 2. Launch Gateway
python3 -m uvicorn backend.gateway.main:app --host 0.0.0.0 --port 8000

# 3. Launch Frontend (or serve pre-built dist/ via Nginx)
cd frontend && npm run dev
```

### Verifying System Health
The appliance exposes a Prometheus metrics endpoint and a health check:
- **Health**: `GET http://localhost:8000/api/v1/health`
- **Metrics**: `GET http://localhost:8000/metrics`
- **Swagger Documentation**: `http://localhost:8000/docs`

### Troubleshooting Common Issues

| Symptom | Probable Cause | Clinical Resolution |
| :--- | :--- | :--- |
| **Model loading slow (> 10s)** | MPS / CUDA cold start | Normal on first boot; weights remain resident in unified VRAM after initial warm-up (~3.5s warm inference). |
| **Graph displays fallback engine** | Neo4j Bolt port 7687 inactive | Expected in air-gapped single-box mode; ClinixVault automatically activates the sovereign in-memory/SQLite engine (`clinixvault_edge.db`). |
| **Patient not found error (404)** | Unregistered Patient ID | Register the patient using the **+ Register Patient** modal in the Knowledge Graph or Overview page. |
| **Image produces fallback report** | Unsupported image format | Ensure image is standard 8-bit or 16-bit grayscale DICOM, PNG, or JPEG. |

---

*ClinixVault is engineered for privacy, speed, and absolute clinical integrity.*
