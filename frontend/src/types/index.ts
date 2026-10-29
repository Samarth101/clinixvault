export type PageId = 'landing' | 'overview' | 'patients' | 'provenance' | 'radiology' | 'summarizer' | 'microservices' | 'hardware' | 'staff' | 'graph';

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  department: string;
  specialty: string;
  npi: string;
  email: string;
  accessTier: 'Tier 1 — Executive/Attending' | 'Tier 2 — Fellow/Resident' | 'Tier 3 — Clinical Scribe' | 'Tier 4 — Registered Nurse' | 'SysAdmin — Air-Gap Vault';
  breakGlassPrivilege: boolean;
  ssoStatus: 'Active Directory Synced' | 'Keycloak SAML Synced' | 'Local Vault Pin';
  status: 'Active' | 'On-Call' | 'Offline';
  assignedNode: string;
  lastActive: string;
}

export interface AppSettings {
  darkMode: boolean;
  fontSize: 'normal' | 'large' | 'xlarge';
  audioDevice: string;
  whisperTemperature: number;
  selectedVllmModel: string;
  cppAcceleration: boolean;
  autoCommitFhir: boolean;
  redactPiiRealtime: boolean;
}

export interface SpeakerTurn {
  id: string;
  speaker: 'Doctor' | 'Patient';
  timestamp: string;
  text: string;
  highlightedCodes?: string[];
  audioStartMs: number;
  audioEndMs: number;
}

export interface DiagnosisCode {
  code: string;
  system: string;
  display: string;
  confidence: number;
  category: 'diagnosis' | 'procedure' | 'billing';
  audioTurnId: string;
  timestampRange: string;
  sourceQuote: string;
  radiologyFindingId?: string;
}

export interface SoapSection {
  id: 'subjective' | 'objective' | 'assessment' | 'plan';
  title: string;
  content: string[];
  badges: string[];
}

export interface EncounterSummary {
  id: string;
  patientId?: string;
  patientName: string;
  mrn: string;
  dob: string;
  chiefComplaint: string;
  examRoom: string;
  status: 'In Progress' | 'Synthesizing' | 'Ready for Review' | 'Committed';
  timestamp: string;
  vitals: {
    bp: string;
    hr: string;
    spo2: string;
    temp: string;
    bmi: string;
  };
}

export interface PodHealth {
  name: string;
  service: string;
  port: number;
  status: 'Healthy' | 'Degraded' | 'Syncing';
  latencyMs: number;
  memoryMb: number;
  vramMb?: number;
  uptime: string;
  restarts: number;
  description: string;
}

export interface PipelineStage {
  id: number;
  name: string;
  service: string;
  status: 'optimal' | 'processing' | 'standby';
  latencyMs: number;
  throughput: string;
  description: string;
}

export interface HardwareSpecs {
  platform: string;
  chip: string;
  raw_brand: string;
  memory_type: string;
  total_memory_gb: number;
  free_memory_gb: number;
  used_memory_gb: number;
  memory_percent: number;
  accelerator: string;
  is_apple_silicon: boolean;
  gpu_name: string;
  cpu_cores_physical: number;
  cpu_cores_logical: number;
  cpu_percent: number;
}

export interface InstalledModel {
  id: string;
  name: string;
  tag: string;
  source: string;
  format: string;
  parameter_size: string;
  quantization_level?: string;
  size_bytes: number;
  size_formatted: string;
  modified_at?: string;
  capabilities: string[];
  is_vision: boolean;
}

export interface PretrainedCatalogModel {
  id: string;
  name: string;
  tag: string;
  displayName: string;
  size: string;
  size_bytes: number;
  parameter_size: string;
  category: string;
  description: string;
  recommended_for: 'radiology' | 'summarize' | 'scribe';
  is_vision: boolean;
  is_installed: boolean;
}

export interface FineTunedBenchmarkScores {
  clinical_f1: number;
  chexpert_recall: string;
  hallucination_rate: string;
  bleu_4: number;
  rouge_l: number;
  latency_ms: number;
}

export interface FineTunedModel {
  id: string;
  name: string;
  tag: string;
  displayName: string;
  size: string;
  size_bytes: number;
  parameter_size: string;
  category: string;
  technique: string;
  description: string;
  recommended_for: 'radiology' | 'summarize' | 'scribe';
  is_vision: boolean;
  is_fine_tuned: boolean;
  is_installed: boolean;
  adapter_path: string;
  benchmark_scores: FineTunedBenchmarkScores;
  status: string;
  highlight: string;
}

export interface ModelListResponse {
  installed_models: InstalledModel[];
  available_models: PretrainedCatalogModel[];
  fine_tuned_models: FineTunedModel[];
  active_radiology_model: string;
  active_summarize_model: string;
  ollama_status: {
    connected: boolean;
    host: string;
    version?: string | null;
  };
}

export interface ModelPullStatus {
  status: 'idle' | 'downloading' | 'completed' | 'failed' | 'already_running';
  model: string | null;
  progress_pct: number;
  completed_bytes: number;
  total_bytes: number;
  message: string;
}

export interface JargonTranslation {
  medical_term: string;
  simple_meaning: string;
  context: string;
}

export interface PatientReport {
  headline: string;
  what_was_examined: string;
  doctor_explanation: string;
  key_findings: string[];
  what_it_means: string;
  next_steps: string[];
  jargon_translations: JargonTranslation[];
  questions_for_doctor: string[];
  reading_level?: string;
}

export type HighlightCategory = 'pathology' | 'anatomy' | 'normal' | 'code' | 'acuity';

export interface MedicalEntity {
  term: string;
  category: HighlightCategory;
  definition: string;
  clinicalSignificance: string;
  code?: string;
  confidence?: number;
}

export type GraphNodeCategory = 
  | 'Patient' 
  | 'Condition' 
  | 'Medication' 
  | 'Observation' 
  | 'Anatomy' 
  | 'DiagnosticReport' 
  | 'Encounter' 
  | 'ProvenanceNode'
  | 'Entity';

export interface GraphNode {
  id: string;
  label: GraphNodeCategory;
  name?: string;
  code?: string;
  snomed?: string;
  system?: string;
  modality?: string;
  findings?: string;
  impression?: string;
  dose?: string;
  gender?: string;
  mrn?: string;
  confidence?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  [key: string]: any;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  label?: string;
  confidence?: number;
  evidence?: string;
}

export interface PatientGraphResponse {
  patient_id: string;
  nodes: GraphNode[];
  links: GraphLink[];
  meta: {
    depth: number;
    node_count: number;
    link_count: number;
    storage_engine: string;
    connected_to_bolt: boolean;
  };
}

export interface GraphStatsResponse {
  mode: 'neo4j_bolt' | 'air_gapped_in_memory';
  connected: boolean;
  uri: string;
  node_count: number;
  relationship_count: number;
  engine: string;
}

export interface CypherQueryResult {
  query: string;
  record_count: number;
  records: any[];
  latency_ms: number;
  engine: string;
  connected: boolean;
}

export interface PatientRosterItem {
  id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  full_name: string;
  dob?: string;
  gender?: string;
  encounter_count: number;
  latest_encounter?: {
    id: string;
    patient_id: string;
    encounter_type: string;
    status: string;
    started_at?: string;
    ended_at?: string;
    chief_complaint?: string;
    exam_room?: string;
    vitals?: {
      bp: string;
      hr: string;
      spo2: string;
      temp: string;
      bmi: string;
    };
  };
  last_vitals?: {
    bp: string;
    hr: string;
    spo2: string;
    temp: string;
    bmi: string;
  };
}

export interface ClinicalReportItem {
  id: string;
  patient_id: string;
  encounter_id?: string;
  report_type: string;
  title: string;
  findings?: string;
  impression?: string;
  raw_content?: string;
  model_version?: string;
  provenance_hash?: string;
  created_at?: string;
}

export interface PatientDetailResponse {
  id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  full_name: string;
  dob?: string;
  gender?: string;
  encounters: any[];
  reports: ClinicalReportItem[];
}

export interface PatientCreateRequest {
  first_name: string;
  last_name: string;
  dob?: string;
  gender?: string;
  mrn?: string;
  chief_complaint?: string;
  exam_room?: string;
  vitals?: {
    bp?: string;
    hr?: string;
    spo2?: string;
    temp?: string;
    bmi?: string;
  };
}

export interface AnatomicalBreakdown {
  lungs_pleura: string;
  cardiomediastinum: string;
  bones_soft_tissues: string;
  support_devices: string;
}

export interface CriticAudit {
  consistency_score: number;
  unsupported_assertions: string[];
  negated_pathologies: string[];
  verified_pathologies: string[];
}

export interface ClinicalPathologyScore {
  name: string;
  status: 'present' | 'absent' | 'not_mentioned';
  confidence: number;
  evidence: string;
}

export interface RadiologyReport {
  report_id?: string;
  patient_id?: string;
  findings: string;
  impression: string;
  full_report?: string;
  stage1_findings?: string;
  anatomical_breakdown?: AnatomicalBreakdown;
  critic_audit?: CriticAudit;
  dicom_sr_metadata?: Record<string, any>;
  pathologies?: ClinicalPathologyScore[];
}

export interface RadiologyCaseProjection {
  filename: string;
  projection: 'Frontal' | 'Lateral' | string;
  image_url: string;
  exists: boolean;
}

export interface RadiologyCase {
  id: string;
  patient_id: string;
  study_uid: string;
  indication: string;
  findings: string;
  impression: string;
  projections: RadiologyCaseProjection[];
  created_at: string;
  is_real_case: boolean;
  customImageUrl?: string;
  pathologies?: Array<{ name: string; score: number; status: 'positive' | 'negative' }>;
}

export interface RadiologyCasesResponse {
  total: number;
  page: number;
  limit: number;
  cases: RadiologyCase[];
}



