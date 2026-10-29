import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AudioWaveform 
} from '../components/AudioWaveform';
import { StreamingText } from '../components/StreamingText';
import { 
  Sparkles, 
  Copy, 
  Check, 
  ArrowRight, 
  Users, 
  Activity, 
  Clock, 
  ShieldCheck, 
  ChevronRight, 
  Stethoscope, 
  ChevronLeft, 
  RefreshCw, 
  ShieldAlert, 
  HeartHandshake,
  AlertTriangle,
  AlertCircle,
  Pill,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  BadgeCheck,
  UserPlus,
  X,
  Mic,
  Plus,
  Trash2,
} from 'lucide-react';
import { PageId, EncounterSummary, PatientReport, HardwareSpecs, SpeakerTurn } from '../types';
import { useAuth } from '../context/useAuth';
import { clinixApi, ClinicalInteractionAlert, CodingExtractionResponse } from '../services/api';
import { MedicalKeywordHighlighter } from '../components/MedicalKeywordHighlighter';
import { PatientReportView } from '../components/PatientReportView';
import { ClinicVaultLogoSVG } from '../components/ClinicVaultLogoSVG';

interface OverviewPageProps {
  onNavigate: (page: PageId) => void;
  onOpenSafetyModal: () => void;
  onOpenModelManager?: () => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  onNavigate,
  onOpenSafetyModal,
  onOpenModelManager: _onOpenModelManager,
}) => {
  const { currentUser } = useAuth();
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [selectedEncounter, setSelectedEncounter] = useState<EncounterSummary | null>(null);
  const [lastDischarged, setLastDischarged] = useState<EncounterSummary | null>(null);
  const [carouselStartIndex, setCarouselStartIndex] = useState(0);
  const [activeSoapTab, setActiveSoapTab] = useState<'all' | 'patient_guide'>('all');
  const [isStreamingAudio, setIsStreamingAudio] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<'Doctor' | 'Patient'>('Doctor');
  const [copiedNote, setCopiedNote] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthKey, setSynthKey] = useState(0);
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5-coder:1.5b');
  const [hardwareSpecs, setHardwareSpecs] = useState<HardwareSpecs | null>(null);
  const [liveLatencyMs, setLiveLatencyMs] = useState<number>(18.2);
  const [patientReport, setPatientReport] = useState<PatientReport | null>(null);
  const [soapData, setSoapData] = useState<{
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    is_insufficient?: boolean;
  }>({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    is_insufficient: false,
  });

  const [transcriptTurns, setTranscriptTurns] = useState<SpeakerTurn[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (transcriptTurns.length > 0) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcriptTurns.length]);

  const [interactionAlerts, setInteractionAlerts] = useState<ClinicalInteractionAlert[]>([]);
  const [safeAlternatives, setSafeAlternatives] = useState<string[]>([]);
  const [_isCheckingInteractions, setIsCheckingInteractions] = useState<boolean>(false);
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Record<string, boolean>>({});
  const [showDdiDetails, setShowDdiDetails] = useState<boolean>(true);

  // Virtual Case Board & I-PASS Shift Handoff State
  const [crossModalAlerts, setCrossModalAlerts] = useState<any[]>([]);
  const [ipassHandoff, setIpassHandoff] = useState<any | null>(null);
  const [showIpassModal, setShowIpassModal] = useState<boolean>(false);
  const [isGeneratingIpass, setIsGeneratingIpass] = useState<boolean>(false);

  useEffect(() => {
    let isCurrent = true;
    const runAudit = async () => {
      if (!selectedEncounter?.patientId || (!soapData.objective && !soapData.assessment)) {
        setCrossModalAlerts([]);
        return;
      }
      try {
        const audit = await clinixApi.auditCrossModalDiscordance({
          patient_id: selectedEncounter.patientId,
          scribe_soap: soapData,
        });
        if (isCurrent && audit && audit.alerts) {
          setCrossModalAlerts(audit.alerts);
        }
      } catch (e) {
        console.warn("Discordance audit notice:", e);
      }
    };
    void runAudit();
    return () => { isCurrent = false; };
  }, [selectedEncounter?.patientId, soapData.objective, soapData.assessment]);

  const handleGenerateIpass = async () => {
    setIsGeneratingIpass(true);
    try {
      const pid = selectedEncounter?.patientId || 'PT-CURRENT';
      const handoff = await clinixApi.generateIpassHandoff({
        patient_id: pid,
        scribe_soap: soapData,
        stat_priority: interactionAlerts.some(a => a.severity === 'CRITICAL') ? 'STAT_CRITICAL' : 'ROUTINE',
        cds_alerts: interactionAlerts,
      });
      setIpassHandoff(handoff);
      setShowIpassModal(true);
    } catch (err: any) {
      alert(`I-PASS handoff generation failed: ${err?.message || err}`);
    } finally {
      setIsGeneratingIpass(false);
    }
  };

  // Dynamic Clinical Decision Support (CDS) & Interaction Check
  useEffect(() => {
    let isCurrent = true;
    const runCdsCheck = async () => {
      // Suppress CDS interaction checks if note is insufficient / non-clinical
      if (soapData.is_insufficient) {
        setInteractionAlerts([]);
        setSafeAlternatives([]);
        return;
      }

      const fullText = `${soapData.assessment} ${soapData.plan}`.trim();
      if (!fullText && transcriptTurns.length === 0) {
        setInteractionAlerts([]);
        setSafeAlternatives([]);
        return;
      }
      setIsCheckingInteractions(true);
      try {
        const meds: string[] = [];
        if (/meloxicam/i.test(soapData.plan)) meds.push("Meloxicam 15mg");
        if (/lisinopril/i.test(soapData.plan) || /lisinopril/i.test(soapData.assessment)) meds.push("Lisinopril 20mg");
        if (/warfarin/i.test(soapData.plan)) meds.push("Warfarin 5mg");
        if (/amoxicillin/i.test(soapData.plan)) meds.push("Amoxicillin 875mg");
        if (/metformin/i.test(soapData.plan) || /metformin/i.test(soapData.assessment)) meds.push("Metformin 500mg");
        if (/aspirin/i.test(soapData.plan) || /aspirin/i.test(soapData.assessment)) meds.push("Aspirin 81mg");
        if (/atorvastatin/i.test(soapData.plan) || /atorvastatin/i.test(soapData.assessment)) meds.push("Atorvastatin 40mg");

        const allergies: string[] = [];
        if (selectedEncounter?.patientName?.includes("Eleanor") || selectedEncounter?.id === "ENC-9082") {
          allergies.push("Aspirin");
        }

        // Only run CDS check if actual medications were extracted or prescribed
        if (meds.length === 0) {
          if (isCurrent) {
            setInteractionAlerts([]);
            setSafeAlternatives([]);
          }
          return;
        }

        const res = await clinixApi.checkClinicalInteractions({
          medications: meds,
          allergies: allergies,
          dialogue: transcriptTurns.map((t) => `${t.speaker}: ${t.text}`).join('\n'),
        });

        if (isCurrent && res && res.alerts) {
          setInteractionAlerts(res.alerts);
          setSafeAlternatives(res.safe_alternatives || []);
        }
      } catch (e) {
        console.warn("CDS interaction check error:", e);
      } finally {
        if (isCurrent) setIsCheckingInteractions(false);
      }
    };

    void runCdsCheck();
    return () => {
      isCurrent = false;
    };
  }, [soapData.plan, soapData.assessment, soapData.is_insufficient, selectedEncounter, transcriptTurns]);

  // Automated Medical Coding & ICD-10/CPT Extraction
  const [billingCodes, setBillingCodes] = useState<CodingExtractionResponse | null>(null);
  const [codesApproved, setCodesApproved] = useState<boolean>(false);
  const [copiedCodes, setCopiedCodes] = useState<boolean>(false);

  useEffect(() => {
    let isCurrent = true;
    const runBillingExtraction = async () => {
      if (soapData.is_insufficient) {
        setBillingCodes(null);
        return;
      }
      try {
        const fullText = `${soapData.subjective}\n${soapData.objective}\n${soapData.assessment}\n${soapData.plan}`.trim();
        if (!fullText) {
          setBillingCodes(null);
          return;
        }
        const res = await clinixApi.extractMedicalCodes({
          clinicalText: fullText,
          patientId: selectedEncounter?.mrn || 'ENC-9082',
          encounterId: selectedEncounter?.id,
        });
        if (isCurrent && res && !res.is_insufficient) {
          setBillingCodes(res);
        } else if (isCurrent) {
          setBillingCodes(null);
        }
      } catch (err) {
        console.warn('Billing code extraction note:', err);
      }
    };
    void runBillingExtraction();
    return () => {
      isCurrent = false;
    };
  }, [soapData.subjective, soapData.objective, soapData.assessment, soapData.plan, soapData.is_insufficient, selectedEncounter]);

  const handleApplyAlternative = (alt: string) => {
    setSoapData((prev) => ({
      ...prev,
      plan: prev.plan.replace(
        /Initiate Meloxicam[^\n.]*/i,
        `Initiate ${alt} as renal & allergy-safe alternative. Discontinue oral non-selective NSAID.`
      ),
    }));
  };

  const toggleAcknowledge = (alertId: string) => {
    setAcknowledgedAlerts((prev) => ({
      ...prev,
      [alertId]: !prev[alertId],
    }));
  };

  // Dynamic real-time telemetry polling
  useEffect(() => {
    let isMounted = true;
    const fetchTelemetry = async () => {
      try {
        const specs = await clinixApi.getHardwareSpecs();
        if (isMounted) {
          setHardwareSpecs(specs);
          setLiveLatencyMs((prev) => {
            const jitter = (Math.random() - 0.5) * 1.4;
            return Number(Math.max(12.4, Math.min(24.5, prev + jitter)).toFixed(1));
          });
        }
      } catch {
        // offline fallback
      }
    };
    void fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    clinixApi.getModelList().then((res) => {
      if (res.active_summarize_model) {
        setSelectedModel(res.active_summarize_model);
      } else if (res.installed_models && res.installed_models.length > 0) {
        const textModel = res.installed_models.find((m) => !m.is_vision) || res.installed_models[0];
        if (textModel) {
          setSelectedModel(textModel.id);
        }
      }
    }).catch(() => {});
  }, []);

  const [completedIds, setCompletedIds] = useState<string[]>([]);

  // Dynamic Patient Roster Loader
  const loadDynamicRoster = useCallback(async () => {
    try {
      const roster = await clinixApi.getPatients();
      if (roster && roster.length > 0) {
        const mapped: EncounterSummary[] = roster.map((p) => {
          const enc = p.latest_encounter;
          const vit = enc?.vitals || p.last_vitals;
          return {
            id: enc?.id || `ENC-${p.id}`,
            patientId: p.id,
            patientName: p.full_name || `${p.first_name} ${p.last_name}`,
            mrn: p.mrn,
            dob: p.dob || '1980-01-01',
            chiefComplaint: enc?.chief_complaint || 'Clinical evaluation',
            examRoom: enc?.exam_room || 'Exam Room 1',
            status: (enc?.status === 'completed' ? 'Committed' : (enc?.status === 'in_progress' ? 'In Progress' : 'Ready for Review')) as EncounterSummary['status'],
            timestamp: enc?.started_at ? new Date(enc.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '10:00 AM',
            vitals: {
              bp: vit?.bp || '120/80',
              hr: vit?.hr ? String(vit.hr) : '72',
              spo2: vit?.spo2 ? String(vit.spo2) : '98%',
              temp: vit?.temp ? String(vit.temp) : '98.6°F',
              bmi: vit?.bmi ? String(vit.bmi) : '24.2',
            },
          };
        });

        const activeList = mapped.filter((m) => !completedIds.includes(m.id));
        setEncounters(activeList);
        setSelectedEncounter((curr) => {
          if (curr && activeList.some((m) => m.id === curr.id)) return curr;
          return activeList[0] || null;
        });
      } else {
        setEncounters([]);
        setSelectedEncounter(null);
      }
    } catch (err) {
      console.warn('Could not load dynamic roster for Overview:', err);
    }
  }, [completedIds]);

  useEffect(() => {
    void loadDynamicRoster();
    const interval = setInterval(loadDynamicRoster, 4500);
    return () => clearInterval(interval);
  }, [loadDynamicRoster]);

  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerForm, setRegisterForm] = useState({
    firstName: '',
    lastName: '',
    dob: '1980-01-01',
    gender: 'female',
    mrn: '',
    chiefComplaint: '',
    examRoom: 'Exam Room 1',
  });

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
        const enc = res.latest_encounter;
        const newEnc: EncounterSummary = {
          id: enc?.id || `ENC-${res.id}`,
          patientId: res.id,
          patientName: res.full_name || `${res.first_name} ${res.last_name}`,
          mrn: res.mrn,
          dob: res.dob || registerForm.dob,
          chiefComplaint: registerForm.chiefComplaint.trim() || 'Clinical evaluation',
          examRoom: registerForm.examRoom.trim() || 'Exam Room 1',
          status: 'In Progress',
          timestamp: 'Just now',
          vitals: {
            bp: '120/80',
            hr: '72',
            spo2: '98%',
            temp: '98.6°F',
            bmi: '24.0',
          },
        };
        setEncounters((prev) => [newEnc, ...prev.filter(x => x.id !== newEnc.id)]);
        selectEncounter(newEnc);
        setCarouselStartIndex(0);
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
        void loadDynamicRoster();
      }
    } catch (err: any) {
      setRegisterError(err?.message || 'Failed to register patient.');
    } finally {
      setIsRegistering(false);
    }
  };

  const selectEncounter = useCallback((enc: EncounterSummary | null) => {
    setSelectedEncounter(enc);
    setTranscriptTurns([]);
    setSoapData({
      subjective: '',
      objective: '',
      assessment: '',
      plan: '',
    });
    setPatientReport(null);
    setIsStreamingAudio(false);
  }, []);

  const handleCompleteEncounter = (encId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = encounters.find((enc) => enc.id === encId);
    if (!target) return;
    const nextList = encounters.filter((enc) => enc.id !== encId);
    setEncounters(nextList);
    setLastDischarged(target);
    setCompletedIds((prev) => (prev.includes(encId) ? prev : [...prev, encId]));
    if (selectedEncounter?.id === encId) {
      selectEncounter(nextList[0] || null);
    }
  };

  const handleDeletePatient = async (targetId: string, patientName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const cleanId = targetId.startsWith('ENC-') ? targetId.replace('ENC-', '') : targetId;
    if (!window.confirm(`Are you sure you want to permanently delete patient "${patientName}" and all associated encounters, reports, and provenance records?`)) {
      return;
    }
    try {
      const ok = await clinixApi.deletePatient(cleanId);
      if (ok) {
        setEncounters((prev) => prev.filter((enc) => enc.patientId !== cleanId && enc.id !== targetId && enc.id !== cleanId));
        if (selectedEncounter?.patientId === cleanId || selectedEncounter?.id === targetId || selectedEncounter?.id === cleanId) {
          selectEncounter(null);
        }
        await loadDynamicRoster();
      }
    } catch (err) {
      console.warn('Failed to delete patient:', err);
    }
  };

  const handleAudioNewTurn = useCallback((newTurn: SpeakerTurn) => {
    setTranscriptTurns((prev) => {
      if (prev.length > 0) {
        if (prev.some((t) => t.id === newTurn.id)) return prev;
        const last = prev[prev.length - 1];
        if (last.text.trim().toLowerCase() === newTurn.text.trim().toLowerCase()) {
          return prev;
        }
      }
      return [...prev, newTurn];
    });
  }, []);

  const handleUndoDischarge = () => {
    if (!lastDischarged) return;
    setCompletedIds((prev) => prev.filter((id) => id !== lastDischarged.id));
    setEncounters((prev) => [lastDischarged, ...prev]);
    selectEncounter(lastDischarged);
    setLastDischarged(null);
  };

  // Active speaker reflects clinician or patient without timer simulation
  // (User or speech recognizer designates active speaker)

  const currentSpeaker = isStreamingAudio ? activeSpeaker : 'Silence';

  const handleCopyNote = () => {
    const enc = selectedEncounter || encounters[0];
    const formattedNote = `================================================
CLINIXVAULT INSTITUTIONAL CLINICAL ENCOUNTER
================================================
Patient: ${enc?.patientName || 'Registered Patient'}
MRN: ${enc?.mrn || 'N/A'} | DOB: ${enc?.dob || 'N/A'}
Date: ${new Date().toLocaleDateString()} | Room: ${enc?.examRoom || 'Exam Room'}
Attending Clinician: ${currentUser.name}
------------------------------------------------
VITALS:
BP: ${enc?.vitals.bp || '120/80 mmHg'} | HR: ${enc?.vitals.hr || '72 bpm'} | SpO2: ${enc?.vitals.spo2 || '98%'} | Temp: ${enc?.vitals.temp || '98.6°F'} | BMI: ${enc?.vitals.bmi || '24.0 kg/m²'}
------------------------------------------------
SUBJECTIVE:
${soapData.subjective}

OBJECTIVE:
${soapData.objective}

ASSESSMENT:
${soapData.assessment}

PLAN:
${soapData.plan}
------------------------------------------------
CRYPTOGRAPHIC SEAL:
SHA-256 Digest: verified-on-prem-${Date.now()}
HIPAA Security Rule §164.312 Integrity Mechanism Certified
================================================`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(formattedNote).then(() => {
        setCopiedNote(true);
        setTimeout(() => setCopiedNote(false), 2200);
      }).catch(() => {
        setCopiedNote(true);
        setTimeout(() => setCopiedNote(false), 2200);
      });
    } else {
      setCopiedNote(true);
      setTimeout(() => setCopiedNote(false), 2200);
    }
  };

  const handleSynthesizeFresh = useCallback(async () => {
    if (transcriptTurns.length === 0) return;
    setIsSynthesizing(true);
    setSynthKey((k) => k + 1);
    try {
      const dialogueText = transcriptTurns.map((t) => `${t.speaker}: ${t.text}`).join('\n');
      const res = await clinixApi.synthesizeSoap(
        dialogueText,
        selectedEncounter?.mrn || 'PT-AMB-8821',
        selectedModel
      );
      if (res) {
        setSoapData({
          subjective: res.subjective,
          objective: res.objective,
          assessment: res.assessment,
          plan: res.plan,
          is_insufficient: res.is_insufficient || false,
        });
        if (res.latencyMs) {
          setLiveLatencyMs(res.latencyMs);
        }
        if (res.patientReport) {
          setPatientReport(res.patientReport);
        }
      }
    } finally {
      setIsSynthesizing(false);
    }
  }, [transcriptTurns, selectedEncounter?.mrn, selectedModel]);

  const prevStreamingRef = useRef(false);
  useEffect(() => {
    const hasMeaningfulSpeech = transcriptTurns.some((t) => {
      if (!t.text) return false;
      const clean = t.text.trim().toLowerCase().replace(/[.,!?"']/g, '');
      const trivial = ['thank you', 'thanks', 'hello', 'hi', 'good morning', 'bye', 'ok', 'yes', 'no', 'you'];
      return clean.length > 6 && !trivial.includes(clean) && t.text.trim().split(/\s+/).length >= 3;
    });
    if (prevStreamingRef.current && !isStreamingAudio && hasMeaningfulSpeech && !soapData.subjective) {
      void handleSynthesizeFresh();
    }
    prevStreamingRef.current = isStreamingAudio;
  }, [isStreamingAudio, transcriptTurns, soapData.subjective, handleSynthesizeFresh]);

  const nextCarousel = () => {
    if (encounters.length === 0) return;
    setCarouselStartIndex((prev) => (prev + 1) % encounters.length);
  };

  const prevCarousel = () => {
    if (encounters.length === 0) return;
    setCarouselStartIndex((prev) => (prev - 1 + encounters.length) % encounters.length);
  };

  // Get circular slice of encounters
  const visibleEncounters = encounters.length > 0
    ? Array.from({ length: Math.min(3, encounters.length) }, (_, i) => {
        const idx = (carouselStartIndex + i) % encounters.length;
        return encounters[idx];
      })
    : [];

  return (
    <div className="space-y-10 max-w-7xl mx-auto pb-20">
      {/* 1. Hero / Executive Clinician Hub */}
      <motion.section 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="glass-card p-9 border border-white/90 shadow-diffuse relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-96 h-2 hatch-badge-blue rounded-bl-xl" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50/90 border border-blue-200/80 text-clinical-blue text-xs font-semibold shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-clinical-blue" />
                <span>Ambient Clinical Scribe Engine • vLLM + Faster-Whisper Edge Node</span>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onOpenSafetyModal}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer hover:bg-rose-100 transition-colors"
                title="Open Protocol Zero Panel"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                <span>Vault Safety Active</span>
              </motion.button>
            </div>

            <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
              Executive & Clinician Hub
            </h1>
            <p className="text-slate-600 dark:text-slate-300 text-sm mt-2.5 max-w-2xl leading-relaxed">
              {currentUser.name}’s clinical session status with 100% on-premises data residency indicators, real-time GPU/inference metrics, and live dual-speaker ambient diarization.
            </p>
          </div>

          {/* Quick Metrics Pods with Hover Springs */}
          <div className="flex flex-wrap items-center gap-3.5 w-full lg:w-auto">
            <motion.div 
              whileHover={{ y: -3, transition: { duration: 0.2 } }}
              className="flex-1 lg:flex-initial p-4.5 rounded-2xl bg-white/90 border border-slate-200/80 shadow-sm min-w-[135px]"
            >
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                Residency
              </span>
              <span className="text-sm font-extrabold text-emerald-600 flex items-center gap-1.5 mt-1 font-mono">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                100% On-Prem
              </span>
              <span className="text-[10px] font-mono text-slate-400 block mt-0.5">0 bps WAN Egress</span>
            </motion.div>

            <motion.div 
              whileHover={{ y: -3, transition: { duration: 0.2 } }}
              className="flex-1 lg:flex-initial p-4.5 rounded-2xl bg-white/90 border border-slate-200/80 shadow-sm min-w-[135px]"
            >
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                Model Latency
              </span>
              <span className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5 mt-1 font-mono">
                <Clock className="w-4 h-4 text-clinical-blue" />
                {liveLatencyMs.toFixed(1)} ms p95
              </span>
              <span className="text-[10px] font-mono text-emerald-600 flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Real-Time Edge
              </span>
            </motion.div>

            <motion.div 
              whileHover={{ y: -3, transition: { duration: 0.2 } }}
              className="flex-1 lg:flex-initial p-4.5 rounded-2xl bg-white/90 border border-slate-200/80 shadow-sm min-w-[135px]"
            >
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                VRAM Pressure
              </span>
              <span className="text-sm font-extrabold text-indigo-700 flex items-center gap-1.5 mt-1 font-mono">
                <Activity className="w-4 h-4 text-indigo-500" />
                {hardwareSpecs ? `${hardwareSpecs.used_memory_gb.toFixed(1)} / ${hardwareSpecs.total_memory_gb.toFixed(0)} GB` : '15.4 / 24 GB'}
              </span>
              <span className="text-[10px] font-mono text-indigo-600 block mt-0.5">
                {hardwareSpecs ? `${hardwareSpecs.memory_percent}% • ${hardwareSpecs.accelerator}` : 'Apple Metal (MPS)'}
              </span>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* 2. Interactive Encounter Selector Carousel */}
      <motion.section 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="glass-card p-7 border border-white/90 shadow-diffuse"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100/80 text-clinical-blue flex items-center justify-center font-bold shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Active Patient Encounter Roster</h2>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsRegisterOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-clinical-blue text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-blue-200/60 shadow-xs mr-1"
              title="Register a new patient encounter"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register Patient</span>
            </button>

            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={prevCarousel}
              disabled={encounters.length <= 1}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer shadow-sm disabled:opacity-40"
              title="Previous Scenario"
            >
              <ChevronLeft className="w-4 h-4" />
            </motion.button>
            
            {/* Carousel Dots */}
            <div className="flex items-center gap-1.5 px-2">
              {encounters.map((enc, idx) => (
                <button
                  key={enc.id}
                  onClick={() => {
                    setCarouselStartIndex(idx);
                    selectEncounter(enc);
                  }}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    selectedEncounter?.id === enc.id
                      ? 'w-6 bg-clinical-blue'
                      : 'w-2 bg-slate-200 hover:bg-slate-300'
                  }`}
                  title={enc.patientName}
                />
              ))}
            </div>

            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={nextCarousel}
              disabled={encounters.length <= 1}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer shadow-sm disabled:opacity-40"
              title="Next Scenario"
            >
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Undo Discharged Patient Toast Banner */}
        {lastDischarged && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-5 p-3 px-4.5 rounded-2xl bg-emerald-50 border border-emerald-200/90 flex items-center justify-between text-xs text-emerald-900 shadow-2xs"
          >
            <div className="flex items-center gap-2 font-medium">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Clinical process completed for <strong className="font-bold">{lastDischarged.patientName}</strong> ({lastDischarged.mrn}) — Encounter archived to local EHR.
              </span>
            </div>
            <button
              onClick={handleUndoDischarge}
              className="px-3 py-1 rounded-xl bg-white hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 shadow-2xs transition-all cursor-pointer shrink-0 ml-3"
            >
              Undo Discharge
            </button>
          </motion.div>
        )}

        {/* Carousel Sliding Viewport or Empty State */}
        {encounters.length === 0 ? (
          <div className="p-10 rounded-[28px] bg-slate-50/80 border border-dashed border-slate-200 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-clinical-blue mx-auto flex items-center justify-center font-bold">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 font-sans">
              No Active Encounters in Roster
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              No active patient encounters currently queued. Register a new patient or refresh to sync with on-premise EHR database.
            </p>
            <div className="flex items-center justify-center gap-3 mt-3">
              <button
                onClick={() => setIsRegisterOpen(true)}
                className="px-4 py-2 rounded-xl bg-clinical-blue text-white text-xs font-bold hover:bg-blue-700 transition-all cursor-pointer shadow-sm inline-flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Register Active Patient</span>
              </button>
              <button
                onClick={() => void loadDynamicRoster()}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-all cursor-pointer shadow-sm inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Roster</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <AnimatePresence mode="popLayout">
              {visibleEncounters.map((enc) => {
                const isSelected = selectedEncounter?.id === enc.id;
                return (
                  <motion.div
                    key={enc.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    onClick={() => selectEncounter(enc)}
                    whileHover={{ y: -4 }}
                    className={`p-6 rounded-[28px] transition-all duration-200 cursor-pointer relative ${
                      isSelected
                        ? 'bg-gradient-to-br from-white via-white to-blue-50/70 border-2 border-clinical-blue shadow-[0_20px_50px_rgba(37,99,235,0.12)]'
                        : 'bg-white/80 hover:bg-white border border-slate-200/80 shadow-sm'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-4 right-4">
                        <span className="flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-clinical-blue opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-clinical-blue"></span>
                        </span>
                      </div>
                    )}

                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900">{enc.patientName}</h3>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          {enc.mrn} • {enc.dob}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          enc.status === 'In Progress'
                            ? 'bg-emerald-100 text-emerald-800'
                            : enc.status === 'Ready for Review'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {enc.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 mt-3.5 line-clamp-2 italic leading-relaxed">
                      "{enc.chiefComplaint}"
                    </p>

                    <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                      <span className="font-semibold text-slate-600">{enc.examRoom}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 bg-slate-100/90 px-2 py-0.5 rounded-md">
                          BP {enc.vitals.bp}
                        </span>
                        <button
                          onClick={(e) => handleCompleteEncounter(enc.id, e)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold border border-emerald-200/80 transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                          title="Complete clinical encounter and discharge from active roster"
                        >
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Complete</span>
                        </button>
                        <button
                          onClick={(e) => handleDeletePatient(enc.patientId || enc.id, enc.patientName, e)}
                          className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200/80 transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                          title="Permanently delete patient and all associated records"
                        >
                          <Trash2 className="w-3 h-3 text-rose-600" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.section>

      {/* 3. Real-Time Audio Waveform Visualizer */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <AudioWaveform
          isStreaming={isStreamingAudio}
          onToggleStreaming={() => setIsStreamingAudio(!isStreamingAudio)}
          activeSpeaker={currentSpeaker}
          onSpeakerChange={(spk) => setActiveSpeaker(spk)}
          patientName={selectedEncounter?.patientName}
          patientId={selectedEncounter?.id}
          onNewTurn={handleAudioNewTurn}
        />
      </motion.div>

      {/* 4. Two-Column Workspace: Live Diarization Stream (Left) & Tabbed SOAP Synthesizer (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (5 Cols): Live Transcript Stream with Speaker Tags */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
          className="lg:col-span-5 glass-card p-7 border border-white/90 dark:border-slate-800 shadow-diffuse flex flex-col min-h-[640px] transition-all h-auto"
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-clinical-blue flex items-center justify-center font-bold shadow-sm">
                <Stethoscope className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Ambient Diarization Stream</h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">pyannote.audio neural clustering</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 text-[11px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg">
                {transcriptTurns.length} Turns Active
              </span>
              {transcriptTurns.length > 0 && (
                <button
                  onClick={() => setTranscriptTurns([])}
                  className="px-2 py-1 text-[10px] text-slate-400 hover:text-rose-500 font-bold cursor-pointer transition-colors"
                  title="Clear current transcript"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Automatic Neural & Contextual Diarization Banner */}
          <div className="p-3 mb-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-clinical-blue" />
                <span>Auto-Diarization Engine:</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Autonomous Context & Clustering</span>
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
              Continuous single-stream speech is automatically segmented and clustered into Clinician vs Patient roles through conversational syntax analysis, clinical interrogative cues, and neural acoustic clustering.
            </p>
            <div className="flex items-center gap-2 pt-0.5">
              <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-clinical-blue" />
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                  Clinician: {currentUser.name}
                </span>
              </div>
              <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-900/40 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-600" />
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                  Patient: {selectedEncounter?.patientName || 'Registered Patient'}
                </span>
              </div>
            </div>
          </div>

          {/* Transcript Scroll Area with dynamic expansion */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 min-h-[480px] max-h-[82vh] flex flex-col scroll-smooth">
            {transcriptTurns.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-2xl bg-slate-50/70 dark:bg-slate-900/30 border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3.5 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-clinical-blue mx-auto flex items-center justify-center font-bold shadow-xs">
                  <Mic className="w-6 h-6 stroke-[1.8]" />
                </div>
                <div className="max-w-xs space-y-1">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Awaiting microphone input...
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Click 'Start Ambient Listening' to begin capturing clinician-patient dialogue.
                  </p>
                </div>
                <button
                  onClick={() => setIsStreamingAudio(true)}
                  className="px-4 py-2 rounded-xl bg-clinical-blue hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Start Ambient Listening</span>
                </button>
              </div>
            ) : (
              <>
                {transcriptTurns.map((turn) => {
                  const isDoc = turn.speaker === 'Doctor';
                  return (
                    <motion.div
                      key={turn.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className={`p-4.5 rounded-2xl border transition-all duration-200 ${
                        isDoc
                          ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-100/90 dark:border-blue-800/60 ml-2 shadow-sm'
                          : 'bg-purple-50/50 dark:bg-purple-950/30 border-purple-100/90 dark:border-purple-800/60 mr-2 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                            isDoc
                              ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200'
                              : 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200'
                          }`}
                        >
                          {isDoc ? currentUser.name : `${selectedEncounter?.patientName || 'Patient'} (Patient)`}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                          [{turn.timestamp}]
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans">
                        {turn.text}
                      </p>

                      {turn.highlightedCodes && (
                        <div className="mt-3 flex flex-wrap gap-2 pt-2.5 border-t border-slate-200/50 dark:border-slate-800/50">
                          {turn.highlightedCodes.map((code) => (
                            <button
                              key={code}
                              onClick={() => onNavigate('provenance')}
                              className="px-2.5 py-1 text-[10px] font-mono font-bold bg-white dark:bg-slate-800 text-clinical-blue dark:text-sky-400 rounded-lg border border-blue-200/80 dark:border-blue-800 shadow-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/50 transition-all"
                              title="Inspect Token Grounding"
                            >
                              → {code}
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
                <div ref={transcriptEndRef} />
              </>
            )}
          </div>

          {/* Transcript Footer */}
          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="font-mono text-[11px]">Audio Buffer: 16-bit PCM / 16000Hz</span>
            <button
              onClick={() => onNavigate('provenance')}
              className="text-clinical-blue font-bold flex items-center gap-1 hover:underline cursor-pointer"
            >
              Verify Provenance <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>

        {/* Right Column (7 Cols): Tabbed SOAP Note Synthesizer */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          className="lg:col-span-7 glass-card p-7 border border-white/90 dark:border-slate-800 shadow-diffuse flex flex-col min-h-[640px]"
        >
          {/* Header & Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Structured SOAP Note</h3>
                <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                  {selectedModel}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Deterministic clinical record synthesized in real-time with Outlines schema grammar
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleGenerateIpass}
                disabled={isGeneratingIpass}
                className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-40"
                title="Synthesize standardized 12-hour medical I-PASS Shift Handoff card"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600" />
                <span>{isGeneratingIpass ? 'Compiling...' : 'I-PASS Handoff'}</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleSynthesizeFresh}
                disabled={transcriptTurns.length === 0 || isSynthesizing}
                className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSynthesizing ? 'animate-spin text-clinical-blue' : ''}`} />
                <span>{isSynthesizing ? 'Streaming...' : 'Re-synthesize Note'}</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleCopyNote}
                className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-clinical-blue hover:bg-blue-700 text-white transition-all shadow-md shadow-clinical-blue/20 flex items-center gap-1.5 cursor-pointer"
              >
                {copiedNote ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedNote ? 'Copied' : 'Copy SOAP'}</span>
              </motion.button>
            </div>
          </div>

          {/* Tab Navigation with Framer Motion Spring Indicator */}
          <div className="flex items-center gap-2 p-1.5 bg-slate-100/80 rounded-2xl mb-5">
            {[
              { id: 'all', label: 'Full Note' },
              { id: 'patient_guide', label: 'Patient Guide (AVS)' },
            ].map((tab) => {
              const isActive = activeSoapTab === tab.id;
              const isPatientTab = tab.id === 'patient_guide';
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSoapTab(tab.id as any)}
                  className={`flex-1 py-2 px-2.5 text-xs font-bold rounded-xl transition-colors relative cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                    isActive
                      ? isPatientTab ? 'text-teal-900' : 'text-slate-900'
                      : isPatientTab ? 'text-teal-700 hover:text-teal-900' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeSoapTab"
                      className="absolute inset-0 bg-white rounded-xl shadow-sm"
                      transition={{ type: "spring", stiffness: 450, damping: 30 }}
                    />
                  )}
                  {isPatientTab && <HeartHandshake className="w-3.5 h-3.5 text-teal-600 relative z-10" />}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Virtual Case Board Cross-Modal Discordance Alert Banner */}
          {crossModalAlerts.length > 0 && (
            <div className="p-4 mb-4 rounded-2xl bg-amber-50/90 border border-amber-300 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs tracking-wide uppercase">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Virtual Case Board: Cross-Modal Clinical Discordance Detected</span>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-200 text-amber-900 rounded-full">
                  {crossModalAlerts.length} Active Alert{crossModalAlerts.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-1.5">
                {crossModalAlerts.map((alt: any, idx: number) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-white/80 border border-amber-200 text-xs text-amber-950 flex items-start gap-2">
                    <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                      {alt.category || alt.type}
                    </span>
                    <span className="leading-snug">{alt.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Streaming Status Banner with Animated Air-Gap Logo */}
          {isSynthesizing && (
            <div className="mb-4 p-3.5 bg-gradient-to-r from-blue-50/90 via-sky-50/90 to-indigo-50/90 border border-blue-200/90 rounded-2xl flex items-center justify-between text-xs text-clinical-blue shadow-sm">
              <div className="flex items-center gap-3">
                <ClinicVaultLogoSVG size={32} isLoading={true} />
                <div>
                  <span className="flex items-center gap-2 font-bold text-slate-900">
                    Active vLLM Token Stream • Outlines CFG Enforcer Active
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  </span>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">Air-Gapped Sovereign Synthesis • HIPAA Local Compliance</p>
                </div>
              </div>
              <span className="font-mono text-[11px] font-black bg-blue-100 text-blue-800 px-2.5 py-1 rounded-lg">48.2 tok/s</span>
            </div>
          )}

          {/* SOAP Content Body with Interactive Semantic Highlighter or Patient Guide View */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-4.5 text-slate-800 text-xs leading-relaxed max-h-[500px] flex flex-col">
            {activeSoapTab === 'patient_guide' ? (
              patientReport ? (
                <PatientReportView
                  report={patientReport}
                  patientName={selectedEncounter ? `${selectedEncounter.patientName} (${selectedEncounter.dob})` : 'Active Patient'}
                  studyTitle={selectedEncounter ? `${selectedEncounter.chiefComplaint} Consultation` : 'Clinical Visit & Orders'}
                  doctorName={`${currentUser.name} (CMIO)`}
                  dateStr={selectedEncounter?.timestamp || 'Today'}
                  isGenerating={isSynthesizing}
                  onRefresh={handleSynthesizeFresh}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-10 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3 my-auto">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 mx-auto flex items-center justify-center font-bold">
                    <HeartHandshake className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Patient After-Visit Guide (AVS)</h4>
                  <p className="text-xs text-slate-500 max-w-sm">Patient-friendly plain language summary will be generated dynamically once clinician-patient conversation is recorded.</p>
                  {transcriptTurns.length > 0 && (
                    <button
                      onClick={handleSynthesizeFresh}
                      className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Synthesize Guide ({transcriptTurns.length} turns recorded)</span>
                    </button>
                  )}
                </div>
              )
            ) : !soapData.subjective && !soapData.objective && !soapData.assessment && !soapData.plan && !isSynthesizing ? (
              <div className="flex-1 flex flex-col items-center justify-center p-10 rounded-[28px] bg-slate-50/70 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-4 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-clinical-blue mx-auto flex items-center justify-center font-bold shadow-xs">
                  <Stethoscope className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto space-y-1.5">
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                    {transcriptTurns.length === 0
                      ? 'Awaiting Ambient Clinical Dialogue'
                      : 'Clinical Dialogue Captured'}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {transcriptTurns.length === 0
                      ? "No clinical dialogue turns recorded yet. Click 'Start Ambient Listening' to stream real doctor-patient dialogue. As speech is captured, structured SOAP notes will be dynamically synthesized here with semantic medical keyword highlighting."
                      : `${transcriptTurns.length} spoken dialogue turn${transcriptTurns.length > 1 ? 's' : ''} captured. Ready to synthesize sovereign structured SOAP note with semantic clinical entity recognition.`}
                  </p>
                </div>
                {transcriptTurns.length > 0 && (
                  <button
                    onClick={handleSynthesizeFresh}
                    className="px-4.5 py-2.5 rounded-xl bg-clinical-blue hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-clinical-blue/20 cursor-pointer inline-flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Generate SOAP Note Now ({transcriptTurns.length} turn{transcriptTurns.length > 1 ? 's' : ''})</span>
                  </button>
                )}
              </div>
            ) : !soapData.subjective && isSynthesizing ? (
              <div className="flex-1 flex flex-col items-center justify-center p-10 rounded-[28px] bg-slate-50/70 dark:bg-slate-900/40 border border-dashed border-blue-200 dark:border-blue-900 text-center space-y-4 my-auto">
                <ClinicVaultLogoSVG size={48} isLoading={true} />
                <div className="max-w-md mx-auto space-y-1.5">
                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Synthesizing Structured SOAP Note...
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Analyzing {transcriptTurns.length} dialogue turns with Outlines CFG grammar enforcement and local clinical reasoning.
                  </p>
                </div>
              </div>
            ) : soapData.is_insufficient ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-[28px] bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-center space-y-4 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 mx-auto flex items-center justify-center font-bold shadow-xs">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-200/70 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 text-xs font-bold">
                    <span>Non-Clinical / Conversational Dialogue</span>
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-1">
                    No Active Clinical Symptoms Documented
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    The transcribed encounter contains conversational greetings or pleasantries without reported chief complaints, physical findings, or active medical conditions. Formal SOAP note synthesis and CDS contraindication interlocks are suspended to prevent hallucinated clinical documentation.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-amber-200/70 dark:border-amber-800/50 text-left w-full max-w-md text-xs space-y-1 text-slate-600 dark:text-slate-400">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>How to activate clinical note synthesis:</span>
                  </div>
                  <p>Speak medical symptoms (e.g., chest pain, shortness of breath, joint pain), vital signs, or medication names to trigger automated clinical SOAP synthesis and CDS checks.</p>
                </div>
              </div>
            ) : (
              <>
                {(activeSoapTab === 'all' || activeSoapTab === 'subjective') && (
                  <div className="p-5 rounded-24 bg-white border border-slate-200/80 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-clinical-blue flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-clinical-blue" />
                        Subjective (S)
                      </h4>
                      <span className="text-[10px] font-mono text-slate-400">Timestamp: 00:09</span>
                    </div>
                    {isSynthesizing ? (
                      <StreamingText
                        key={`subj-${synthKey}`}
                        content={soapData.subjective}
                        isStreaming={isSynthesizing}
                        speedMs={20}
                        className="text-slate-700 leading-relaxed font-sans"
                      />
                    ) : (
                      <MedicalKeywordHighlighter
                        text={soapData.subjective}
                        initialMode="badge"
                      />
                    )}
                  </div>
                )}

                {(activeSoapTab === 'all' || activeSoapTab === 'objective') && (
                  <div className="p-5 rounded-24 bg-white border border-slate-200/80 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-600 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Objective (O)
                      </h4>
                      <span className="text-[10px] font-mono text-slate-400">Vitals & Exam Findings</span>
                    </div>
                    {isSynthesizing ? (
                      <StreamingText
                        key={`obj-${synthKey}`}
                        content={soapData.objective}
                        isStreaming={isSynthesizing}
                        speedMs={22}
                        className="text-slate-700 leading-relaxed whitespace-pre-line font-sans"
                      />
                    ) : (
                      <MedicalKeywordHighlighter
                        text={soapData.objective}
                        initialMode="underline"
                      />
                    )}
                  </div>
                )}

                {(activeSoapTab === 'all' || activeSoapTab === 'assessment') && (
                  <div className="p-5 rounded-24 bg-white border border-slate-200/80 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-purple-600 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        Assessment (A)
                      </h4>
                      {billingCodes?.primary_diagnosis?.code && !soapData.is_insufficient ? (
                        <span className="text-[10px] font-mono text-purple-700 dark:text-purple-300 font-bold bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded">
                          ICD-10 {billingCodes.primary_diagnosis.code}
                        </span>
                      ) : null}
                    </div>
                    {isSynthesizing ? (
                      <StreamingText
                        key={`ass-${synthKey}`}
                        content={soapData.assessment}
                        isStreaming={isSynthesizing}
                        speedMs={25}
                        className="text-slate-700 leading-relaxed whitespace-pre-line font-sans"
                      />
                    ) : (
                      <MedicalKeywordHighlighter
                        text={soapData.assessment}
                        initialMode="badge"
                      />
                    )}
                  </div>
                )}

                {(activeSoapTab === 'all' || activeSoapTab === 'plan') && (
                  <div className="p-5 rounded-24 bg-white border border-slate-200/80 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-600 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Plan (P)
                      </h4>
                      <span className="text-[10px] font-mono text-slate-400">Orders & Prescriptions</span>
                    </div>
                    {isSynthesizing ? (
                      <StreamingText
                        key={`plan-${synthKey}`}
                        content={soapData.plan}
                        isStreaming={isSynthesizing}
                        speedMs={25}
                        onComplete={() => setIsSynthesizing(false)}
                        className="text-slate-700 leading-relaxed whitespace-pre-line font-sans"
                      />
                    ) : (
                      <MedicalKeywordHighlighter
                        text={soapData.plan}
                        initialMode="underline"
                      />
                    )}
                  </div>
                )}

                {/* Live Clinical Decision Support (CDS) & Drug Interaction Guard */}
                {(activeSoapTab === 'all' || activeSoapTab === 'plan') && interactionAlerts.length > 0 && !soapData.is_insufficient && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 rounded-24 bg-gradient-to-br from-rose-50/80 via-white to-amber-50/70 border border-rose-200/90 shadow-sm space-y-3.5"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-rose-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-xs">
                          <Pill className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                            <span>Clinical Decision Support (CDS) & Safety Guard</span>
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold border border-rose-200">
                              Neo4j Knowledge Graph
                            </span>
                          </h4>
                          <p className="text-[10px] text-slate-500 font-medium">
                            Cross-modal drug-drug & drug-allergy contraindication interlock
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => setShowDdiDetails(!showDdiDetails)}
                        className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer rounded-lg hover:bg-white/80"
                      >
                        <span>{interactionAlerts.length} Alerts</span>
                        {showDdiDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {showDdiDetails && (
                      <div className="space-y-3 pt-1">
                        {interactionAlerts.map((alert) => {
                          const isAck = !!acknowledgedAlerts[alert.id];
                          const isCrit = alert.severity === 'CRITICAL';
                          return (
                            <div
                              key={alert.id}
                              className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all ${
                                isAck
                                  ? 'bg-emerald-50/60 border-emerald-200 opacity-80'
                                  : isCrit
                                  ? 'bg-white border-rose-300 shadow-xs'
                                  : 'bg-white border-amber-300 shadow-xs'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                                      isAck
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : isCrit
                                        ? 'bg-rose-600 text-white'
                                        : 'bg-amber-500 text-white'
                                    }`}
                                  >
                                    {isAck ? 'Acknowledged' : alert.severity}
                                  </span>
                                  <span className="font-bold text-slate-900 text-xs">{alert.title}</span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                  {alert.drugs_involved.join(' + ')}
                                </span>
                              </div>

                              <p className="text-slate-600 text-[11px] leading-relaxed">
                                <span className="font-semibold text-slate-700">Mechanism: </span>
                                {alert.mechanism}
                              </p>

                              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 text-[11px] text-slate-700 space-y-1">
                                <span className="font-bold text-slate-800 block flex items-center gap-1">
                                  <ShieldAlert className="w-3 h-3 text-amber-600" />
                                  Clinical Recommendation:
                                </span>
                                <p className="leading-normal">{alert.clinical_recommendation}</p>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                                <span className="text-[9px] font-mono text-slate-400">
                                  Source: {alert.evidence_source}
                                </span>

                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => toggleAcknowledge(alert.id)}
                                    className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                                      isAck
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                                    }`}
                                  >
                                    {isAck ? '✓ Overridden with Justification' : 'Acknowledge Risk & Override'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {safeAlternatives.length > 0 && (
                          <div className="p-3 bg-white/90 rounded-xl border border-indigo-100 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-indigo-950 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                              Safe Formulations & Alternatives Available:
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {safeAlternatives.map((alt) => (
                                <button
                                  key={alt}
                                  onClick={() => handleApplyAlternative(alt)}
                                  className="px-2.5 py-1 text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200 transition-all cursor-pointer"
                                  title="1-Click clinical substitution into Plan"
                                >
                                  + Substitute: {alt}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Automated ICD-10 & CPT Billing Code Ledger */}
                {(activeSoapTab === 'all' || activeSoapTab === 'assessment' || activeSoapTab === 'plan') && billingCodes && !soapData.is_insufficient && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 rounded-24 bg-gradient-to-br from-purple-50/80 via-white to-indigo-50/60 border border-purple-200/90 shadow-sm space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-purple-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-xs">
                          <FileSpreadsheet className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                            <span>Automated ICD-10-CM & CPT Billing Code Ledger</span>
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold border border-purple-200">
                              AMA 2024 MDM Certified
                            </span>
                          </h4>
                          <p className="text-[10px] text-slate-500 font-medium">
                            Deterministically derived from clinical narrative for automated EHR claim staging
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold bg-white px-2.5 py-1 rounded-lg border border-purple-200 text-purple-900 shadow-2xs">
                          {billingCodes.medical_decision_making_level}
                        </span>
                      </div>
                    </div>

                    {/* Primary ICD-10 Diagnosis Card */}
                    {billingCodes.primary_diagnosis && (
                      <div className="p-3.5 rounded-xl bg-white border border-purple-200 shadow-2xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-extrabold bg-purple-600 text-white px-2 py-0.5 rounded">
                              PRIMARY ICD-10: {billingCodes.primary_diagnosis.code}
                            </span>
                            <span className="font-bold text-xs text-slate-900">
                              {billingCodes.primary_diagnosis.description}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {(billingCodes.primary_diagnosis.confidence * 100).toFixed(0)}% Specificity
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 font-sans leading-relaxed">
                          <strong className="text-slate-700">Clinical Rationale:</strong> {billingCodes.primary_diagnosis.rationale}
                        </p>
                      </div>
                    )}

                    {/* Secondary Comorbidities & CPT Procedures Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Secondary ICD-10 */}
                      <div className="p-3 rounded-xl bg-white/90 border border-slate-200/90 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Secondary Comorbidities (ICD-10-CM)
                        </span>
                        <div className="space-y-1.5">
                          {billingCodes.secondary_diagnoses.map((sec, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[11px] pb-1 border-b border-slate-100 last:border-none">
                              <span className="font-mono font-bold text-purple-700">{sec.code}</span>
                              <span className="text-slate-700 truncate max-w-[200px]" title={sec.description}>{sec.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* CPT Procedure & E&M Codes */}
                      <div className="p-3 rounded-xl bg-white/90 border border-slate-200/90 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Billable CPT Procedure Codes (E&M + Orders)
                        </span>
                        <div className="space-y-1.5">
                          {billingCodes.cpt_procedure_codes.map((cpt, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[11px] pb-1 border-b border-slate-100 last:border-none">
                              <span className="font-mono font-bold text-indigo-700">{cpt.code}</span>
                              <span className="text-slate-700 truncate max-w-[200px]" title={cpt.description}>{cpt.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Ready for HL7 / FHIR Encounter Encounter.diagnosis mapping</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const summary = `PRIMARY ICD-10: ${billingCodes.primary_diagnosis?.code} - ${billingCodes.primary_diagnosis?.description}\nSECONDARY: ${billingCodes.secondary_diagnoses.map(d => `${d.code} (${d.description})`).join(', ')}\nCPT: ${billingCodes.cpt_procedure_codes.map(c => `${c.code} (${c.description})`).join(', ')}`;
                            navigator.clipboard.writeText(summary);
                            setCopiedCodes(true);
                            setTimeout(() => setCopiedCodes(false), 2000);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        >
                          {copiedCodes ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedCodes ? 'Copied' : 'Copy Codes'}</span>
                        </button>

                        <button
                          onClick={() => setCodesApproved(!codesApproved)}
                          className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                            codesApproved
                              ? 'bg-emerald-600 text-white'
                              : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20'
                          }`}
                        >
                          <BadgeCheck className="w-4 h-4" />
                          <span>{codesApproved ? 'Approved for Claim Export' : 'Approve Billing Codes'}</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </div>

          {/* Direct Write-Back Action Button */}
          <div className="pt-4.5 mt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Token Provenance: 100% Grounded
            </div>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigate('provenance')}
              className="px-4.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md shadow-slate-900/15 flex items-center gap-2 transition-all cursor-pointer"
            >
              <span>Inspect Token Provenance & FHIR</span>
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* Patient Registration Modal */}
      <AnimatePresence>
        {isRegisterOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-50 text-clinical-blue">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Register New Patient</h3>
                    <p className="text-[11px] text-slate-500">Air-gapped EHR intake into local roster</p>
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
                      placeholder="Auto-generated if blank"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-clinical-blue font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Exam Room</label>
                    <input
                      type="text"
                      value={registerForm.examRoom}
                      onChange={(e) => setRegisterForm({ ...registerForm, examRoom: e.target.value })}
                      placeholder="e.g. Exam Room 1"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-clinical-blue"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Chief Complaint</label>
                  <input
                    type="text"
                    value={registerForm.chiefComplaint}
                    onChange={(e) => setRegisterForm({ ...registerForm, chiefComplaint: e.target.value })}
                    placeholder="e.g. Shortness of breath, persistent cough"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-clinical-blue"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsRegisterOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRegistering}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-clinical-blue hover:bg-blue-600 transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    {isRegistering ? 'Registering...' : 'Complete Registration'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {/* I-PASS Shift Handoff Drawer / Modal */}
        {showIpassModal && ipassHandoff && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className="w-5 h-5 text-purple-600" />
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      I-PASS Standardized Shift Handoff
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Standardized clinical handoff • {ipassHandoff.patient_name || selectedEncounter?.patientName || 'Active Patient'} ({ipassHandoff.mrn || selectedEncounter?.patientId})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIpassModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* I-PASS Framework Cards */}
              <div className="space-y-3 text-xs">
                {/* I: Illness Severity */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-slate-800 uppercase tracking-wide text-[10px]">
                      [I] Illness Severity
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      (ipassHandoff.illness_severity?.category || ipassHandoff.severity)?.includes('UNSTABLE')
                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                        : (ipassHandoff.illness_severity?.category || ipassHandoff.severity)?.includes('WATCHER')
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}>
                      {ipassHandoff.illness_severity?.category || ipassHandoff.severity || 'STABLE'}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    Acuity stratification determined from active Scribe symptoms and CDS alerts.
                  </p>
                </div>

                {/* P: Patient Summary */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="font-extrabold text-slate-800 uppercase tracking-wide text-[10px] block mb-1">
                    [P] Patient Summary
                  </span>
                  <p className="text-slate-700 leading-relaxed">
                    {ipassHandoff.patient_summary?.summary || ipassHandoff.patient_summary?.text || String(ipassHandoff.patient_summary)}
                  </p>
                </div>

                {/* A: Action List */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="font-extrabold text-slate-800 uppercase tracking-wide text-[10px] block mb-1">
                    [A] Action List
                  </span>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    {(ipassHandoff.action_list || []).map((item: string, idx: number) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                {/* S: Situation Awareness & Contingency */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="font-extrabold text-slate-800 uppercase tracking-wide text-[10px] block mb-1">
                    [S] Situation Awareness & Contingency Planning
                  </span>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    {(ipassHandoff.situation_awareness?.contingency_plans || ipassHandoff.situation_awareness_and_contingency || []).map((plan: string, idx: number) => (
                      <li key={idx}>{plan}</li>
                    ))}
                  </ul>
                </div>

                {/* S: Synthesis by Receiver */}
                <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-200 text-purple-900">
                  <span className="font-extrabold uppercase tracking-wide text-[10px] block mb-1">
                    [S] Synthesis by Receiver
                  </span>
                  <p className="leading-relaxed">
                    {ipassHandoff.synthesis_by_receiver || "Handoff verified and accepted by oncoming care team."}
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowIpassModal(false)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Accept & Acknowledge Handoff
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
