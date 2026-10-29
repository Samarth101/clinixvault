# ClinixVault Non-Negotiable System Constraints & Governance Rules

This document establishes the inviolable architectural boundaries, data protection mandates, research integrity rules, and operational safeguards for the ClinixVault sovereign clinical AI platform. **Under no circumstances should any developer, agent, or CI/CD script violate these constraints.**

---

## 1. Research Integrity & Benchmark Test Split Isolation

### Constraint: Strict Test Split Immunity
- **The Rule**: The standardized 50-patient MIMIC-CXR benchmark test cohort and its ground-truth annotations must **NEVER** be merged with, contaminated by, or exposed to training or validation data splits.
- **Protected Files**:
  * `data/mimic_cxr_benchmark_test_split.csv`
  * `mimic_cxr_benchmark_results.csv`
  * Remote test directories on research clusters (`/files/p10/test/`).
- **Rationale**: Any cross-contamination of test samples produces invalid benchmark scores, invalidating regulatory validation records and paper publications.
- **Enforcement**: Benchmark evaluation scripts must execute in read-only mode against ground truth CSVs. Evaluation dry-runs must never overwrite production benchmark result tables.

---

## 2. Ground-Truth Data Protection

### Constraint: Immutable Benchmark Baselines
- **The Rule**: Ground-truth radiology reports, CheXpert-14 pathology labels, and expert clinician gold-standard annotations must **NEVER** be edited, synthetic-augmented, or altered to fit model outputs.
- **Rationale**: Artificially modifying ground truth to boost F1 or BLEU scores is academic and clinical misconduct. If a model disagrees with ground truth, the metric must record the discrepancy faithfully.
- **Enforcement**: Pre-flight test suites verify SHA256 checksums of gold-standard test splits before initiating evaluation runs.

---

## 3. Sovereign Air-Gapped HIPAA Privacy & Zero-Egress

### Constraint: Zero Outbound WAN Communication in Production
- **The Rule**: In air-gapped clinical deployments, the application must operate with **ZERO** outbound internet connectivity. No telemetry, no error reporting pings, no cloud model API calls (OpenAI, Anthropic, Google), and no remote metric tracking are permitted during clinical inference.
- **Protected Data**:
  * Patient Protected Health Information (PHI): Name, MRN, Date of Birth, Gender.
  * Diagnostic imaging pixel data (DICOM files).
  * Audio recordings of clinical dialogues.
  * Free-text clinical notes, SOAP summaries, and discharge summaries.
- **Rationale**: HIPAA Privacy Rule (§ 164.502), HITECH Act, and EU GDPR Article 9 strictly prohibit unauthorized transmission of identifiable patient health information outside the covered entity's security perimeter.
- **Enforcement**: Network isolation in Docker Compose and K3s edge deployments blocks outbound WAN gateway egress. All dependencies, model weights, and tokenizer files must reside on local persistent disk.

---

## 4. Preservation of Active Remote GPU Server Training Sessions

### Constraint: Non-Interruption of Research Server Workloads
- **The Rule**: When interacting with remote GPU training environments (e.g. servers with NVIDIA A100/H100 or MIG slices), never terminate, overwrite, or restart running training jobs without explicit confirmation.
- **Protected Resources**:
  * Active tmux / screen / nohup sessions running `train.py`.
  * Checkpoint directories (`checkpoints/`, `florence2_train.log`, `qwen2_vl_train.log`).
  * Dedicated GPU MIG slices assigned to other researchers.
- **Rationale**: Training runs on multi-gigabyte clinical datasets consume dozens of hours of compute time. Unplanned interruption destroys intermediate optimizer states and wastes substantial computational budgets.
- **Enforcement**: Always check `ps aux | grep python` and `nvidia-smi` before initiating any script execution on remote hosts.

---

## 5. Non-Destructive Graceful Fallback Strategy

### Constraint: No Crashing on Missing Optional Subsystems
- **The Rule**: The core ClinixVault API Gateway and UI must **NEVER** crash or return 500 fatal exceptions if an optional downstream microservice (Neo4j, Ollama, GPU accelerator, PostgreSQL) is unavailable.
- **Fallback Hierarchy**:
  * **Database**: If PostgreSQL with pgvector is unreachable, automatically fall back to local embedded SQLite (`clinixvault_edge.db`).
  * **Knowledge Graph**: If Neo4j Bolt port (:7687) is unreachable, fall back to in-memory graph emulation backed by durable SQLite tables (`graph_nodes` & `graph_edges` in `clinixvault_edge.db`).
  * **Hardware Accelerator**: If CUDA/MPS is unavailable, automatically fall back to multi-threaded CPU execution with C++ acceleration (`libclinix_accel`).
  * **Model Inference**: If the designated primary VLM or LLM microservice is offline, fall back to the dynamic ModelManager or native deterministic fallback logic with a degraded status warning.
- **Rationale**: In critical healthcare settings (emergency rooms, intensive care units), partial degraded functionality is infinitely preferable to total application collapse.
- **Enforcement**: Tested rigorously in `tests/unit/test_model_manager_graceful_offline_fallback` and `test_neo4j_connection.py`.

---

## 6. Strict Non-Root Container Security Context

### Constraint: Unprivileged Execution Mandatory
- **The Rule**: Container images deployed to K3s or Kubernetes must **NEVER** run as root (`UID 0`). All Dockerfiles must create and drop to an unprivileged system user (`appuser`, UID 10001).
- **Rationale**: Running containers as root creates catastrophic container breakout risks if a vulnerability is discovered in an underlying C++ library (e.g. PyMuPDF, libsndfile, or ffmpeg).
---

## 7. No Hardcoded Clinical Findings in Production Pathways

### Constraint: Authentic Data Flow & Dynamic Synthesis Mandatory
- **The Rule**: Production report generation, pathology extraction, and clinical decision support pathways must **NEVER** return hardcoded static strings, fake pathology probabilities (e.g., hardcoded 0.50), or mock study cases.
- **Enforcement**:
  * Case ingestion routes (`GET /api/v1/radiology/cases`) dynamically query real dataset loaders (`IUXrayDatasetLoader`) or database records.
  * Direct image uploads (`POST /api/v1/radiology/upload`) persist real files and trigger dynamic Two-Stage VLM synthesis.
  * Clinical pathology scores (`pathologies`) must be dynamically extracted using the NegEx clinical concept scanner (`compute_clinical_pathologies`), reflecting verified positive and negated assertions in the generated text.
- **Rationale**: Hardcoded diagnostic outputs create acute patient safety risks and prevent genuine clinical and regulatory validation.

---

## 8. Self-Contained Checkpoint Portability & Zero External HuggingFace/Cloud Downloads

### Constraint: Strict Offline Weight Resolution
- **The Rule**: In production and testing, the VLM and LLM inference engines must **NEVER** initiate online Hugging Face hub model downloads, remote tokenizer network queries, or rely on absolute developer workstation paths (e.g. `/Users/.../mimic_vlm_project`).
- **Enforcement**:
  * All model weights, adapters, and indexes must resolve via `CHECKPOINTS_DIR` (defaulting to `clinixvault/checkpoints/` or configured via `CLINIX_CHECKPOINTS_DIR`).
  * The production runtime must load locally available full merged weights (`qwen2_vl_mimic_cxr_lora_full`) or local base+adapter weights directly.
  * Attempting to contact `huggingface.co` or download remote weights during hospital runtime is strictly prohibited and guarded by fallback handlers.
- **Rationale**: Hospital appliances operate in disconnected air-gapped server closets without internet access. Any code path that attempts to download weights from the internet will hang, crash, or breach clinical air-gap security protocols.

---

## 9. Strict Patient-Centric Relational Graph Isolation (Zero Multi-Tenant Bleed)

### Constraint: Bounded Directed Ego-Graph Extraction
- **The Rule**: Any sub-graph query for a patient must **NEVER** traverse undirected edges through shared clinical ontology nodes (`cond-chf`, `med-furosemide`, etc.) that link to other patients' records or encounters.
- **Enforcement**:
  * `_get_memory_subgraph()` and Neo4j Cypher queries must enforce strictly directed, patient-outward traversal:
    $$\text{Hop 1}: \text{Patient} \to \{\text{Encounters}, \text{Reports}, \text{Labs}, \text{Conditions}\}$$
    $$\text{Hop 2}: \text{Hop 1 Nodes} \to \{\text{Anatomy}, \text{Medications}, \text{Observations}, \text{Provenance}\}$$
  * An individual patient graph must never exceed the bounds of their personal medical encounters and related clinical concepts.
  * Synthetic condition seeding for demo patients must never inject foreign pathology (e.g. knee osteoarthritis) into unrecognized or newly registered patient IDs.
- **Rationale**: Mixing data between different patients in the Knowledge Graph violates HIPAA Minimum Necessary standards and causes clinical decision support confusion.

---

## 10. Truthful Hardware Execution Mode Telemetry & Metric Authenticity

### Constraint: Prohibition of Synthetic Token Throughput During Fallback Runs
- **The Rule**: When radiology inference executes via the heuristic biomarker engine or rule-based fallback, the system must **NEVER** calculate or display synthetic tokens per second (e.g. `tok_count / latency_ms * 1000 = 2500+ tok/s`), nor claim that a neural model generated the text.
- **Enforcement**:
  * The inference result must carry an explicit `runtime_mode` property (`SOVEREIGN_VLM_ACTIVE`, `OLLAMA_VISION_ACTIVE`, `EDGE_DIAGNOSTIC_FALLBACK`).
  * Telemetry banners and gateway logs must report `EDGE DETERMINISTIC BIOMARKER ENGINE (Rule-Based Fallback)` when running heuristics, reserving tokens/sec reporting exclusively for verified live neural model forward passes.
- **Rationale**: Misleading clinical personnel regarding whether an interpretation was generated by an authentic multimodal neural model or a rule-based deterministic engine creates unacceptable liability and regulatory non-compliance.
