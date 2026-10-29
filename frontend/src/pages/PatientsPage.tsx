import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  Filter,
  UserPlus,
  Trash2,
  ExternalLink,
  Activity,
  Heart,
  Thermometer,
  ShieldCheck,
  FileText,
  Clock,
  MapPin,
  Calendar,
  X,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  Stethoscope,
  Network,
} from 'lucide-react';
import { PageId, PatientRosterItem, PatientDetailResponse, ClinicalReportItem } from '../types';
import { clinixApi } from '../services/api';

interface PatientsPageProps {
  onNavigate: (page: PageId) => void;
}

export const PatientsPage: React.FC<PatientsPageProps> = ({ onNavigate }) => {
  const [patients, setPatients] = useState<PatientRosterItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientDetail, setPatientDetail] = useState<PatientDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);

  // New patient modal state
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState<boolean>(false);
  const [isSubmittingNewPatient, setIsSubmittingNewPatient] = useState<boolean>(false);
  const [newPatientForm, setNewPatientForm] = useState({
    firstName: '',
    lastName: '',
    mrn: '',
    dob: '1980-01-01',
    gender: 'female',
    chiefComplaint: '',
    examRoom: 'Exam Room 1',
    bp: '120/80 mmHg',
    hr: '72 bpm',
    spo2: '98%',
    temp: '98.6°F',
  });

  // Delete modal state
  const [patientToDelete, setPatientToDelete] = useState<PatientRosterItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchRoster = async () => {
    setIsLoading(true);
    try {
      const roster = await clinixApi.getPatients();
      setPatients(roster);
    } catch (e) {
      console.warn('Failed to fetch patient roster:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchRoster();
  }, []);

  const openPatientDetail = async (patientId: string) => {
    setSelectedPatientId(patientId);
    setIsLoadingDetail(true);
    try {
      const detail = await clinixApi.getPatientDetail(patientId);
      setPatientDetail(detail);
    } catch (e) {
      console.warn('Failed to fetch patient detail:', e);
      setPatientDetail(null);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleDeletePatient = async () => {
    if (!patientToDelete) return;
    setIsDeleting(true);
    try {
      const success = await clinixApi.deletePatient(patientToDelete.id);
      if (success) {
        setPatients((prev) => prev.filter((p) => p.id !== patientToDelete.id));
        if (selectedPatientId === patientToDelete.id) {
          setSelectedPatientId(null);
          setPatientDetail(null);
        }
      }
    } catch (e) {
      console.warn('Delete patient error:', e);
    } finally {
      setIsDeleting(false);
      setPatientToDelete(null);
    }
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientForm.firstName.trim() || !newPatientForm.lastName.trim()) return;

    setIsSubmittingNewPatient(true);
    try {
      const created = await clinixApi.createPatient({
        first_name: newPatientForm.firstName.trim(),
        last_name: newPatientForm.lastName.trim(),
        mrn: newPatientForm.mrn.trim() || undefined,
        dob: newPatientForm.dob,
        gender: newPatientForm.gender,
        chief_complaint: newPatientForm.chiefComplaint.trim() || 'Clinical consultation',
        exam_room: newPatientForm.examRoom.trim() || 'Exam Room 1',
        vitals: {
          bp: newPatientForm.bp,
          hr: newPatientForm.hr,
          spo2: newPatientForm.spo2,
          temp: newPatientForm.temp,
          bmi: '24.2 kg/m²',
        },
      });

      if (created) {
        await fetchRoster();
        setIsNewPatientModalOpen(false);
        setNewPatientForm({
          firstName: '',
          lastName: '',
          mrn: '',
          dob: '1980-01-01',
          gender: 'female',
          chiefComplaint: '',
          examRoom: 'Exam Room 1',
          bp: '120/80 mmHg',
          hr: '72 bpm',
          spo2: '98%',
          temp: '98.6°F',
        });
      }
    } catch (err) {
      console.warn('Create patient error:', err);
    } finally {
      setIsSubmittingNewPatient(false);
    }
  };

  // Filtered patients
  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      const fullName = (p.full_name || `${p.first_name} ${p.last_name}`).toLowerCase();
      const mrn = (p.mrn || '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || fullName.includes(q) || mrn.includes(q);

      const status = p.latest_encounter?.status || 'In Progress';
      const matchesStatus =
        statusFilter === 'all' || status.toLowerCase().replace(/\s+/g, '-') === statusFilter;

      const gender = (p.gender || '').toLowerCase();
      const matchesGender = genderFilter === 'all' || gender === genderFilter;

      return matchesSearch && matchesStatus && matchesGender;
    });
  }, [patients, searchQuery, statusFilter, genderFilter]);

  const stats = useMemo(() => {
    const total = patients.length;
    const inProgress = patients.filter((p) => p.latest_encounter?.status === 'In Progress').length;
    const readyForReview = patients.filter((p) => p.latest_encounter?.status === 'Ready for Review').length;
    const totalEncounters = patients.reduce((acc, p) => acc + (p.encounter_count || 1), 0);
    return { total, inProgress, readyForReview, totalEncounters };
  }, [patients]);

  return (
    <div className="space-y-7 pb-12 max-w-7xl mx-auto">
      {/* 1. Header & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-clinical-blue flex items-center justify-center font-bold shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
                Patient Directory & Sovereign Records
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800">
                  Air-Gapped EMR
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Inspect clinical encounter histories, vitals telemetry, signed reports, and registered patient cohorts.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchRoster}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
            title="Refresh Patient Directory"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-clinical-blue' : ''}`} />
          </button>
          <button
            onClick={() => setIsNewPatientModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-clinical-blue hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register New Patient</span>
          </button>
        </div>
      </div>

      {/* 2. Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-5 border border-white/90 dark:border-slate-800 shadow-diffuse">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-clinical-blue" />
            Total Patients
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Sovereign local vault records</div>
        </div>

        <div className="glass-card p-5 border border-white/90 dark:border-slate-800 shadow-diffuse">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-amber-500" />
            Active Encounters
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{stats.inProgress}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">In progress right now</div>
        </div>

        <div className="glass-card p-5 border border-white/90 dark:border-slate-800 shadow-diffuse">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Stethoscope className="w-3.5 h-3.5 text-emerald-500" />
            Ready for Review
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{stats.readyForReview}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Pending clinician sign-off</div>
        </div>

        <div className="glass-card p-5 border border-white/90 dark:border-slate-800 shadow-diffuse">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
            Total Encounters
          </div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{stats.totalEncounters}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Longitudinal visits recorded</div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="glass-card p-4 border border-white/90 dark:border-slate-800 shadow-diffuse flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search patients by name, MRN, or condition..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-clinical-blue"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-clinical-blue"
          >
            <option value="all">All Statuses</option>
            <option value="in-progress">In Progress</option>
            <option value="ready-for-review">Ready for Review</option>
            <option value="committed">Committed</option>
          </select>

          <select
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-clinical-blue"
          >
            <option value="all">All Genders</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </div>
      </div>

      {/* 4. Patients Cards Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-clinical-blue" />
          <span className="text-xs font-semibold">Loading sovereign patient roster...</span>
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-3">
          <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No patients found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {searchQuery
              ? `No registered patients match "${searchQuery}". Clear your search query or reset filters.`
              : 'The sovereign clinic database currently contains no registered patients. Register your first patient to begin.'}
          </p>
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setGenderFilter('all');
              }}
              className="px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPatients.map((patient) => {
            const status = patient.latest_encounter?.status || 'In Progress';
            const isCompleted = status === 'Committed';
            const isReady = status === 'Ready for Review';
            const vitals = patient.last_vitals || patient.latest_encounter?.vitals;

            return (
              <motion.div
                key={patient.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="glass-card p-5 border border-white/90 dark:border-slate-800 shadow-diffuse flex flex-col justify-between hover:shadow-lg transition-all"
              >
                <div>
                  {/* Top card header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-950 text-clinical-blue dark:text-sky-300 font-extrabold flex items-center justify-center text-sm shadow-xs">
                        {patient.first_name?.[0] || 'P'}
                        {patient.last_name?.[0] || ''}
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                          {patient.full_name || `${patient.first_name} ${patient.last_name}`}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            {patient.mrn}
                          </span>
                          <span className="text-[10px] text-slate-400">•</span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">
                            {patient.gender || 'Unknown'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono tracking-tight shrink-0 ${
                        isCompleted
                          ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                          : isReady
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                          : 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300'
                      }`}
                    >
                      {status}
                    </span>
                  </div>

                  {/* Metadata Row */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400 py-2.5 border-y border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>DOB: {patient.dob || '1980-01-01'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{patient.latest_encounter?.exam_room || 'Exam Room 1'}</span>
                    </div>
                  </div>

                  {/* Chief Complaint */}
                  <div className="my-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                      Chief Complaint
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed">
                      {patient.latest_encounter?.chief_complaint || 'Clinical evaluation and routine follow-up'}
                    </p>
                  </div>

                  {/* Vitals summary capsule */}
                  {vitals && (
                    <div className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-[11px] font-mono grid grid-cols-4 gap-1 text-center">
                      <div>
                        <span className="text-[9px] text-slate-400 block font-sans">BP</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{vitals.bp?.split(' ')[0] || '120/80'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block font-sans">HR</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{vitals.hr?.split(' ')[0] || '72'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block font-sans">SpO2</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{vitals.spo2 || '98%'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block font-sans">Temp</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{vitals.temp?.split(' ')[0] || '98.6'}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions Footer */}
                <div className="pt-4 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onNavigate('overview')}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-clinical-blue dark:text-sky-300 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      title="Open Ambient Scribe Workstation"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>Scribe</span>
                    </button>
                    <button
                      onClick={() => onNavigate('graph')}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      title="Inspect Neo4j Knowledge Graph"
                    >
                      <Network className="w-3.5 h-3.5" />
                      <span>Graph</span>
                    </button>
                    <button
                      onClick={() => openPatientDetail(patient.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
                    >
                      Details
                    </button>
                  </div>

                  <button
                    onClick={() => setPatientToDelete(patient)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                    title="Delete Patient Record"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 5. Patient Detail Modal */}
      <AnimatePresence>
        {selectedPatientId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
            >
              <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-clinical-blue flex items-center justify-center font-bold">
                    <Users className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      {patientDetail?.full_name || 'Patient Clinical Dossier'}
                    </h2>
                    <span className="text-xs font-mono text-slate-500">{patientDetail?.mrn}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const handoff = await clinixApi.generateIpassHandoff({
                          patient_id: patientDetail?.id || selectedPatientId || 'ANONYMOUS',
                        });
                        alert(`I-PASS Shift Handoff Compiled for ${patientDetail?.full_name || selectedPatientId}:\nIllness Severity: ${handoff.illness_severity?.category || handoff.severity}\nSummary: ${handoff.patient_summary?.summary || handoff.patient_summary}`);
                      } catch (e: any) {
                        alert(`I-PASS compilation notice: ${e?.message || e}`);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="Compile I-PASS Shift Handoff for this patient"
                  >
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                    <span>I-PASS Handoff</span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedPatientId(null);
                      setPatientDetail(null);
                    }}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto space-y-5">
                {isLoadingDetail ? (
                  <div className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-clinical-blue" />
                    <span className="text-xs">Fetching clinical history...</span>
                  </div>
                ) : (
                  <>
                    {/* Demographics & Vitals */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 text-xs">
                      <div>
                        <span className="text-slate-400 text-[10px] block font-bold uppercase">DOB</span>
                        <span className="font-semibold text-slate-800 dark:text-white">{patientDetail?.dob || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block font-bold uppercase">Gender</span>
                        <span className="font-semibold text-slate-800 dark:text-white capitalize">{patientDetail?.gender || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block font-bold uppercase">Total Visits</span>
                        <span className="font-semibold text-slate-800 dark:text-white">{patientDetail?.encounters?.length || 1}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block font-bold uppercase">Signed Reports</span>
                        <span className="font-semibold text-slate-800 dark:text-white">{patientDetail?.reports?.length || 0}</span>
                      </div>
                    </div>

                    {/* Signed Clinical Reports */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-clinical-blue" />
                        Signed Clinical Reports & Provenance
                      </h4>
                      {(!patientDetail?.reports || patientDetail.reports.length === 0) ? (
                        <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                          No reports synthesized yet for this patient.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {patientDetail.reports.map((report: ClinicalReportItem) => (
                            <div
                              key={report.id}
                              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 space-y-1.5"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-900 dark:text-white">{report.title}</span>
                                <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                                  {report.report_type.toUpperCase()}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                                {report.impression || report.findings || 'Clinical documentation finalized.'}
                              </p>
                              <div className="text-[10px] font-mono text-slate-400 truncate">
                                Provenance SHA-256: {report.provenance_hash || 'verified-vault-signature'}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. Register New Patient Modal */}
      <AnimatePresence>
        {isNewPatientModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950 text-clinical-blue flex items-center justify-center font-bold">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Register New Clinical Patient
                  </h3>
                </div>
                <button
                  onClick={() => setIsNewPatientModalOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreatePatient} className="p-6 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">First Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Samuel"
                      value={newPatientForm.firstName}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, firstName: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Last Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Bhandegaonkar"
                      value={newPatientForm.lastName}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, lastName: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">MRN (Optional)</label>
                    <input
                      type="text"
                      placeholder="Auto-generated if blank"
                      value={newPatientForm.mrn}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, mrn: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={newPatientForm.dob}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, dob: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Gender</label>
                    <select
                      value={newPatientForm.gender}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, gender: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Chief Complaint</label>
                  <input
                    type="text"
                    placeholder="e.g. Progressive lower back stiffness, radiating discomfort"
                    value={newPatientForm.chiefComplaint}
                    onChange={(e) => setNewPatientForm({ ...newPatientForm, chiefComplaint: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                  />
                </div>

                <div className="grid grid-cols-4 gap-2 pt-1">
                  <div>
                    <label className="font-semibold text-slate-500 block mb-1 text-[10px]">BP</label>
                    <input
                      type="text"
                      value={newPatientForm.bp}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, bp: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-500 block mb-1 text-[10px]">Heart Rate</label>
                    <input
                      type="text"
                      value={newPatientForm.hr}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, hr: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-500 block mb-1 text-[10px]">SpO2</label>
                    <input
                      type="text"
                      value={newPatientForm.spo2}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, spo2: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-500 block mb-1 text-[10px]">Temp</label>
                    <input
                      type="text"
                      value={newPatientForm.temp}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, temp: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsNewPatientModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingNewPatient}
                    className="px-5 py-2 rounded-xl bg-clinical-blue hover:bg-blue-700 text-white font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingNewPatient ? 'Registering...' : 'Register Patient'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 7. Delete Confirmation Modal */}
      <AnimatePresence>
        {patientToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 mx-auto flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Permanently Delete Patient?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Are you sure you want to delete{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {patientToDelete.full_name || `${patientToDelete.first_name} ${patientToDelete.last_name}`}
                  </strong>{' '}
                  ({patientToDelete.mrn})? This will permanently remove all associated clinical encounters, signed reports, and graph links from the sovereign vault.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setPatientToDelete(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeletePatient}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
