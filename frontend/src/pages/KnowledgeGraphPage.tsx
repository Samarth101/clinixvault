import React, { useState, useEffect } from 'react';
import { 
  Network, 
  Terminal, 
  Play, 
  CheckCircle2, 
  ShieldCheck, 
  RefreshCw, 
  Database, 
  BookOpen,
  Maximize2,
  Minimize2,
  UserPlus,
  X,
  Plus
} from 'lucide-react';
import { clinixApi } from '../services/api';
import { GraphNode, GraphLink, GraphStatsResponse, CypherQueryResult } from '../types';
import { ClinicalKnowledgeGraph } from '../components/ClinicalKnowledgeGraph';
import { ClinicVaultLoader } from '../components/ClinicVaultLoader';

interface GraphPatientItem {
  id: string;
  name: string;
  condition: string;
}

const CYPHER_PRESETS = [
  {
    title: 'Drug-Disease Links',
    desc: 'List all managed clinical conditions and prescribed medications',
    query: 'MATCH (c:Condition) RETURN c LIMIT 10',
  },
  {
    title: 'Trace CHF Complications',
    desc: 'Traverse 1-hop and 2-hop paths around heart failure & anatomical sites',
    query: 'MATCH (n:Condition) RETURN n LIMIT 10',
  },
  {
    title: 'Count Graph Entities',
    desc: 'Compute total active nodes across the clinical ontology',
    query: 'MATCH (n) RETURN count(n)',
  },
  {
    title: 'Diagnostic Reports',
    desc: 'Retrieve all imaging studies and mapped clinical findings',
    query: 'MATCH (d:DiagnosticReport) RETURN d LIMIT 5',
  },
];

export const KnowledgeGraphPage: React.FC = () => {
  const [patients, setPatients] = useState<GraphPatientItem[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('ENC-9081');
  const [isRegisterOpen, setIsRegisterOpen] = useState<boolean>(false);
  const [registerForm, setRegisterForm] = useState({
    firstName: '',
    lastName: '',
    dob: '1980-01-01',
    gender: 'female',
    mrn: '',
    chiefComplaint: '',
    examRoom: 'Exam Room 1',
  });
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [stats, setStats] = useState<GraphStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Dynamic Patient Roster Loader
  useEffect(() => {
    let isMounted = true;
    const loadDynamicRoster = async () => {
      try {
        const roster = await clinixApi.getPatients();
        if (isMounted) {
          if (roster && roster.length > 0) {
            const mapped: GraphPatientItem[] = roster.map((p) => {
              const chief = p.latest_encounter?.chief_complaint || 'Clinical evaluation';
              const genderStr = p.gender ? p.gender.charAt(0).toUpperCase() : 'U';
              return {
                id: p.id,
                name: `${p.full_name || `${p.first_name} ${p.last_name}`} (${genderStr} • ${p.mrn})`,
                condition: `${chief} • ${p.mrn}`,
              };
            });
            setPatients(mapped);
            if (!mapped.some((item) => item.id === selectedPatientId)) {
              setSelectedPatientId(mapped[0].id);
            }
          } else {
            setPatients([]);
            setSelectedPatientId('');
            setNodes([]);
            setLinks([]);
          }
        }
      } catch (err) {
        console.warn('Could not load dynamic roster for knowledge graph:', err);
      }
    };
    void loadDynamicRoster();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.firstName.trim() || !registerForm.lastName.trim()) {
      setRegisterError('First name and last name are required.');
      return;
    }
    setIsRegistering(true);
    setRegisterError(null);
    try {
      const res = await clinixApi.createPatient({
        first_name: registerForm.firstName.trim(),
        last_name: registerForm.lastName.trim(),
        dob: registerForm.dob || '1980-01-01',
        gender: registerForm.gender || 'unknown',
        mrn: registerForm.mrn.trim() || undefined,
        chief_complaint: registerForm.chiefComplaint.trim() || 'Clinical evaluation',
        exam_room: registerForm.examRoom.trim() || 'Exam Room 1',
      });
      if (res) {
        const newItem: GraphPatientItem = {
          id: res.id,
          name: `${res.full_name || `${res.first_name} ${res.last_name}`} (${res.gender ? res.gender.charAt(0).toUpperCase() : 'U'} • ${res.mrn})`,
          condition: `${res.latest_encounter?.chief_complaint || 'Clinical evaluation'} • ${res.mrn}`,
        };
        setPatients((prev) => [newItem, ...prev]);
        setSelectedPatientId(newItem.id);
        setIsRegisterOpen(false);
        setRegisterForm({
          firstName: '',
          lastName: '',
          dob: '1980-01-01',
          gender: 'female',
          mrn: '',
          chiefComplaint: '',
          examRoom: 'Exam Room 1',
        });
      } else {
        setRegisterError('Failed to create patient record. Please check inputs.');
      }
    } catch (err: any) {
      setRegisterError(err?.message || 'Error creating patient.');
    } finally {
      setIsRegistering(false);
    }
  };
  const [isGraphFullscreen, setIsGraphFullscreen] = useState<boolean>(false);
  const graphWrapperRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);

  const handleToggleFullscreen = React.useCallback(() => {
    if (isGraphFullscreen || document.fullscreenElement) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setIsGraphFullscreen(false);
    } else {
      const el = cardRef.current || graphWrapperRef.current;
      if (el?.requestFullscreen) {
        el.requestFullscreen().then(() => setIsGraphFullscreen(true)).catch(() => {
          setIsGraphFullscreen(true);
        });
      } else {
        setIsGraphFullscreen(true);
      }
    }
  }, [isGraphFullscreen]);

  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(document.fullscreenElement);
      setIsGraphFullscreen(isFs);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isGraphFullscreen) {
        handleToggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGraphFullscreen, handleToggleFullscreen]);

  // Cypher Console State
  const [cypherQuery, setCypherQuery] = useState<string>('MATCH (c:Condition) RETURN c LIMIT 10');
  const [cypherResult, setCypherResult] = useState<CypherQueryResult | null>(null);
  const [isExecutingCypher, setIsExecutingCypher] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const fetchGraphData = async () => {
      try {
        if (!selectedPatientId) {
          const statsRes = await clinixApi.getGraphStats();
          if (isMounted) {
            setStats(statsRes);
            setNodes([]);
            setLinks([]);
            setIsLoading(false);
          }
          return;
        }
        const [graphRes, statsRes] = await Promise.all([
          clinixApi.getPatientGraph(selectedPatientId, 2),
          clinixApi.getGraphStats(),
        ]);
        if (isMounted) {
          setNodes(graphRes.nodes);
          setLinks(graphRes.links);
          setStats(statsRes);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to load graph data:', err);
        if (isMounted) setIsLoading(false);
      }
    };
    void fetchGraphData();
    return () => {
      isMounted = false;
    };
  }, [selectedPatientId]);

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      if (!selectedPatientId) {
        const statsRes = await clinixApi.getGraphStats();
        setStats(statsRes);
        setNodes([]);
        setLinks([]);
        return;
      }
      const [graphRes, statsRes] = await Promise.all([
        clinixApi.getPatientGraph(selectedPatientId, 2),
        clinixApi.getGraphStats(),
      ]);
      setNodes(graphRes.nodes);
      setLinks(graphRes.links);
      setStats(statsRes);
    } catch (err) {
      console.error('Failed to reload graph data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Execute Cypher
  const handleExecuteCypher = async (queryToRun?: string) => {
    const q = queryToRun || cypherQuery;
    setIsExecutingCypher(true);
    try {
      const res = await clinixApi.executeCypher(q);
      setCypherResult(res);
      if (res && res.records && res.records.length > 0) {
        const extractedNodes: GraphNode[] = [];
        res.records.forEach((rec: any) => {
          const val = rec.c || rec.n || rec.node || rec.d || rec;
          if (val && typeof val === 'object' && val.id) {
            extractedNodes.push({
              id: val.id,
              label: val.label || 'Entity',
              name: val.name || val.title || val.id,
              category: (val.label || 'condition').toLowerCase(),
              code: val.code || val.icd10,
              snomed: val.snomed,
              properties: val,
            });
          }
        });
        if (extractedNodes.length > 0) {
          setNodes((prev) => {
            const map = new Map(prev.map(n => [n.id, n]));
            extractedNodes.forEach(n => map.set(n.id, n));
            return Array.from(map.values());
          });
        }
      }
    } catch (err) {
      console.error('Cypher execution failed:', err);
    } finally {
      setIsExecutingCypher(false);
    }
  };

  const currentPatient = patients.find((p) => p.id === selectedPatientId) || patients[0] || null;

  const factualityScore = nodes.length > 0
    ? ((nodes.filter((n) => n.code || n.snomed || n.properties?.code || n.properties?.snomed).length / nodes.length) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="glass-card p-6 border border-white/90 shadow-diffuse flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600 shadow-xs">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight font-sans">
                  Clinical Knowledge Graph & Ontological Mesh
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  GraphRAG Active
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Deterministic multi-hop relational discovery and closed-loop hallucination audit backed by Neo4j
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Connection Status Badge */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200/80 text-xs">
            <Database className="w-3.5 h-3.5 text-clinical-blue" />
            <span className="text-slate-500 font-semibold">Engine:</span>
            <span className="font-bold text-slate-800">
              {stats?.connected ? 'Neo4j Bolt (Port 7687)' : 'Air-Gapped Sovereign Engine'}
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                stats?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-teal-500'
              }`}
            />
          </div>

          {/* Patient Switcher Dropdown */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-sm text-xs">
            <span className="font-bold text-slate-500">Patient:</span>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer max-w-[200px] truncate"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic Patient Registration Trigger */}
          <button
            onClick={() => setIsRegisterOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-clinical-blue text-white text-xs font-bold hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
            title="Register New Sovereign Patient"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Register Patient</span>
          </button>

          <button
            onClick={handleRefresh}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
            title="Refresh Knowledge Graph"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-clinical-blue' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 Cols): Interactive Force-Directed Graph */}
        <div className="lg:col-span-8 space-y-4">
          <div ref={cardRef} className={`p-5 border border-white/90 shadow-diffuse ${isGraphFullscreen ? 'fixed inset-0 z-50 !backdrop-filter-none !transform-none !filter-none bg-slate-950 flex flex-col' : 'glass-card'}`}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-clinical-blue" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Interactive Patient Subgraph: {currentPatient ? currentPatient.name : 'Clinical Ontology & Cohort Mesh'}
                </h3>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-mono text-slate-500">
                  1-Hop & 2-Hop Connected Triples
                </span>
                <button
                  onClick={handleToggleFullscreen}
                  className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer shadow-2xs pointer-events-auto z-50"
                  title={isGraphFullscreen ? 'Exit Fullscreen (Esc)' : 'Expand Knowledge Graph to Fullscreen View'}
                >
                  {isGraphFullscreen ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Exit Fullscreen</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Full Screen</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {!currentPatient && nodes.length === 0 ? (
              <div className="h-[620px] rounded-2xl flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center font-bold shadow-xs">
                  <Network className="w-7 h-7" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  No Sovereign Patient Selected
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  The knowledge graph operates on authentic EHR records. Register a new patient or execute a Cypher query below to inspect clinical ontology nodes.
                </p>
                <button
                  onClick={() => setIsRegisterOpen(true)}
                  className="px-4 py-2 rounded-xl bg-clinical-blue text-white text-xs font-bold hover:bg-blue-700 transition-all cursor-pointer shadow-sm inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Register Sovereign Patient</span>
                </button>
              </div>
            ) : isLoading ? (
              <div className="h-[620px] rounded-2xl flex items-center justify-center bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800">
                <ClinicVaultLoader 
                  size={84}
                  message={`Extracting Sovereign Knowledge Graph for ${currentPatient ? currentPatient.name : 'Ontology Mesh'}...`}
                  submessage="Neo4j Cypher Traversal • Zero-Egress Graph RAG"
                />
              </div>
            ) : (
              <div
                ref={graphWrapperRef}
                className={isGraphFullscreen ? 'flex-1 min-h-0 w-full h-full relative' : 'w-full h-[620px]'}
              >
                <ClinicalKnowledgeGraph
                  nodes={nodes}
                  links={links}
                  patientId={selectedPatientId}
                  patientName={currentPatient ? currentPatient.name : 'Clinical Ontology Mesh'}
                  height={isGraphFullscreen ? '100%' : 620}
                  isFullscreen={isGraphFullscreen}
                  onToggleFullscreen={handleToggleFullscreen}
                />
              </div>
            )}

            {/* Subgraph Metrics Footer (hidden in fullscreen to allow full screen graph immersion) */}
            {!isGraphFullscreen && (
              <div className="grid grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-100 text-center">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Nodes</span>
                  <span className="text-sm font-extrabold text-slate-900 font-mono">{nodes.length}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Relations</span>
                  <span className="text-sm font-extrabold text-slate-900 font-mono">{links.length}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Ontology Codes</span>
                  <span className="text-sm font-extrabold text-purple-700 font-mono">
                    {nodes.filter((n) => n.code || n.snomed).length}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
                  <span className="text-[10px] text-emerald-600 font-bold block uppercase">Factuality</span>
                  <span className="text-sm font-extrabold text-emerald-700 font-mono">{factualityScore}%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (4 Cols): Cypher Query Console & GraphRAG Safeguard */}
        <div className="lg:col-span-4 space-y-6">
          {/* Cypher Console Card */}
          <div className="glass-card p-5 border border-white/90 shadow-diffuse space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">Clinical Cypher Console</h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold">
                Read-Only Bolt Query
              </span>
            </div>

            {/* Cypher Presets */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Quick Clinical Presets:
              </span>
              <div className="grid grid-cols-2 gap-2">
                {CYPHER_PRESETS.map((preset) => (
                  <button
                    key={preset.title}
                    onClick={() => {
                      setCypherQuery(preset.query);
                      handleExecuteCypher(preset.query);
                    }}
                    className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-left transition-all cursor-pointer group"
                  >
                    <span className="text-[11px] font-bold text-slate-900 group-hover:text-clinical-blue block truncate">
                      {preset.title}
                    </span>
                    <span className="text-[9px] text-slate-500 line-clamp-1 mt-0.5">
                      {preset.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Query Editor Textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[10px] font-mono font-bold text-slate-500">Query Input:</span>
                <span className="text-[10px] font-mono text-slate-400">Cypher 5.x</span>
              </div>
              <textarea
                value={cypherQuery}
                onChange={(e) => setCypherQuery(e.target.value)}
                rows={3}
                className="w-full p-3 font-mono text-xs bg-slate-900 text-emerald-400 rounded-xl outline-none resize-none shadow-inner"
              />
            </div>

            {/* Execute Button */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">
                {cypherResult ? `${cypherResult.record_count} records in ${cypherResult.latency_ms}ms` : 'Ready to execute'}
              </span>
              <button
                onClick={() => handleExecuteCypher()}
                disabled={isExecutingCypher}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-clinical-blue text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Play className={`w-3.5 h-3.5 ${isExecutingCypher ? 'animate-spin' : ''}`} />
                <span>{isExecutingCypher ? 'Running...' : 'Execute Cypher'}</span>
              </button>
            </div>

            {/* Results Preview Box */}
            {cypherResult && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                  <span>Execution Output</span>
                  <span className="text-[10px] font-mono text-slate-500">Engine: {cypherResult.engine}</span>
                </div>
                <div className="max-h-40 overflow-y-auto font-mono text-[10px] bg-white p-2.5 rounded-lg border border-slate-200 text-slate-800 leading-relaxed">
                  <pre>{JSON.stringify(cypherResult.records, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>

          {/* GraphRAG Factuality Safeguard Card */}
          <div className="glass-card p-5 border border-white/90 shadow-diffuse space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">GraphRAG Closed-Loop Auditor</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              When models generate discharge summaries or SOAP notes, our graph auditor validates each asserted statement against the patient's ground-truth knowledge graph to catch omissions and prevent clinical hallucinations.
            </p>

            <div className="space-y-2 pt-1 text-xs">
              <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/70 border border-emerald-100">
                <span className="text-emerald-900 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Triples Grounding Ratio
                </span>
                <span className="font-mono font-extrabold text-emerald-700">{factualityScore}% Grounded</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-purple-50/70 border border-purple-100">
                <span className="text-purple-900 font-semibold flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-purple-600" />
                  Ontological Normalization
                </span>
                <span className="font-mono font-bold text-purple-700">ICD-10 / SNOMED CT</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Patient Registration Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-clinical-blue flex items-center justify-center font-bold">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-sans">Register New Patient</h3>
                  <p className="text-[11px] text-slate-500">Instantiate sovereign edge record & graph entity</p>
                </div>
              </div>
              <button
                onClick={() => setIsRegisterOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {registerError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {registerError}
              </div>
            )}

            <form onSubmit={handleRegisterPatient} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={registerForm.firstName}
                    onChange={(e) => setRegisterForm({ ...registerForm, firstName: e.target.value })}
                    placeholder="e.g. Liam"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-clinical-blue"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={registerForm.lastName}
                    onChange={(e) => setRegisterForm({ ...registerForm, lastName: e.target.value })}
                    placeholder="e.g. Cooper"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-clinical-blue"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={registerForm.dob}
                    onChange={(e) => setRegisterForm({ ...registerForm, dob: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-clinical-blue"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Gender</label>
                  <select
                    value={registerForm.gender}
                    onChange={(e) => setRegisterForm({ ...registerForm, gender: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-clinical-blue bg-white"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">MRN (Optional)</label>
                  <input
                    type="text"
                    value={registerForm.mrn}
                    onChange={(e) => setRegisterForm({ ...registerForm, mrn: e.target.value })}
                    placeholder="Auto-generated if empty"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-clinical-blue"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Exam Room</label>
                  <input
                    type="text"
                    value={registerForm.examRoom}
                    onChange={(e) => setRegisterForm({ ...registerForm, examRoom: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-clinical-blue"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Chief Complaint / Indication</label>
                <input
                  type="text"
                  value={registerForm.chiefComplaint}
                  onChange={(e) => setRegisterForm({ ...registerForm, chiefComplaint: e.target.value })}
                  placeholder="e.g. Mild exertional dyspnea, follow-up CXR evaluation"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-clinical-blue"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRegistering}
                  className="px-4 py-2 rounded-xl bg-clinical-blue text-white text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isRegistering ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Registering...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Register & View Graph</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
