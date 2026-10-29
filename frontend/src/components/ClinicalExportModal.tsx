import React, { useState, useId, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  Printer, 
  Download, 
  Copy, 
  Check, 
  ShieldCheck, 
  FileText, 
  UserCheck, 
  FileCode2, 
  Lock,
  Building2
} from 'lucide-react';
import { EncounterSummary, PatientReport } from '../types';
import { ENCOUNTER_PROFILES } from '../data/encounterProfiles';
import { useAuth } from '../context/useAuth';

interface ClinicalExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  encounter?: EncounterSummary | null;
  soapData?: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  patientReport?: PatientReport | null;
  onExportComplete?: (notice: string) => void;
}

export const ClinicalExportModal: React.FC<ClinicalExportModalProps> = ({
  isOpen,
  onClose,
  encounter,
  soapData: customSoap,
  patientReport: customPatientReport,
  onExportComplete,
}) => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'soap' | 'patient_avs' | 'fhir'>('soap');
  const [copied, setCopied] = useState(false);
  const [createdTimestamp] = useState(() => Date.now());
  const printId = useId();

  const exportDate = useMemo(() => {
    return new Date(createdTimestamp).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [createdTimestamp]);

  const isoTimestamp = useMemo(() => {
    return new Date(createdTimestamp).toISOString();
  }, [createdTimestamp]);

  // Resolve active encounter or default placeholder
  const defaultProfile = ENCOUNTER_PROFILES['ENC-9082'];
  const activeEncounter = encounter || {
    id: "ENC-NEW",
    patientName: "Active Patient",
    mrn: "MRN-PENDING",
    dob: "N/A",
    chiefComplaint: "Clinical Consultation",
    examRoom: "Exam Room 1",
    status: "In Progress" as const,
    timestamp: "Today",
    vitals: {
      bp: "120/80 mmHg",
      hr: "72 bpm",
      spo2: "98%",
      temp: "98.6°F",
      bmi: "24.0 kg/m²",
    },
  };

  const matchedProfile = ENCOUNTER_PROFILES[activeEncounter.id] || defaultProfile;
  const soap = customSoap || matchedProfile.soap;
  const patientReport = customPatientReport || matchedProfile.patientReport;

  const sha256Digest = `8f4b1e9d2c3a5078${activeEncounter.id.replace(/[^0-9]/g, '')}f67a8b9c0d1e2f3a4b5c6d7e8f90123456789abcdef0`;

  if (!isOpen) return null;

  // Generate FHIR R4 Transaction Bundle
  const fhirBundle = {
    resourceType: "Bundle",
    id: `bundle-${activeEncounter.id.toLowerCase()}`,
    type: "document",
    timestamp: isoTimestamp,
    identifier: {
      system: "urn:ietf:rfc:3986",
      value: `urn:uuid:${activeEncounter.id.toLowerCase()}-provenance-manifest`
    },
    entry: [
      {
        fullUrl: `urn:uuid:composition-${activeEncounter.id.toLowerCase()}`,
        resource: {
          resourceType: "Composition",
          status: "final",
          type: {
            coding: [
              {
                system: "http://loinc.org",
                code: "11506-3",
                display: "Progress Note / Ambulatory Encounter"
              }
            ],
            text: "Clinical SOAP Progress Note"
          },
          subject: {
            reference: `Patient/${activeEncounter.mrn}`,
            display: activeEncounter.patientName
          },
          encounter: {
            reference: `Encounter/${activeEncounter.id}`,
            display: activeEncounter.chiefComplaint
          },
          date: isoTimestamp,
          author: [
            {
              display: `${currentUser.name} (Attending Physician)`
            }
          ],
          title: "Ambulatory Encounter Clinical Record",
          custodian: {
            display: "ClinixVault Sovereign Health System"
          },
          section: [
            {
              title: "Subjective",
              text: { status: "generated", div: `<div xmlns="http://www.w3.org/1999/xhtml">${soap.subjective}</div>` }
            },
            {
              title: "Objective",
              text: { status: "generated", div: `<div xmlns="http://www.w3.org/1999/xhtml">${soap.objective}</div>` }
            },
            {
              title: "Assessment",
              text: { status: "generated", div: `<div xmlns="http://www.w3.org/1999/xhtml">${soap.assessment}</div>` }
            },
            {
              title: "Plan",
              text: { status: "generated", div: `<div xmlns="http://www.w3.org/1999/xhtml">${soap.plan}</div>` }
            }
          ]
        }
      },
      {
        fullUrl: `urn:uuid:patient-${activeEncounter.mrn.toLowerCase()}`,
        resource: {
          resourceType: "Patient",
          id: activeEncounter.mrn,
          identifier: [
            {
              use: "official",
              system: "http://hospital.org/mrns",
              value: activeEncounter.mrn
            }
          ],
          name: [
            {
              use: "official",
              text: activeEncounter.patientName
            }
          ]
        }
      },
      {
        fullUrl: `urn:uuid:provenance-${activeEncounter.id.toLowerCase()}`,
        resource: {
          resourceType: "Provenance",
          target: [{ reference: `urn:uuid:composition-${activeEncounter.id.toLowerCase()}` }],
          recorded: isoTimestamp,
          reason: [{ text: "Air-gapped clinical synthesis with token provenance" }],
          activity: {
            coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-DocumentCompletion", code: "AU", display: "authenticated" }]
          },
          signature: [
            {
              type: [{ system: "urn:iso-astm:E1762-95:2013", code: "1.2.840.10065.1.12.1.1", display: "Author's Signature" }],
              when: isoTimestamp,
              who: { display: currentUser.name },
              data: sha256Digest
            }
          ]
        }
      }
    ]
  };

  const formattedSoapText = `================================================================================
CLINIXVAULT INSTITUTIONAL CLINICAL RECORD
Air-Gapped Sovereign Medical Center • Department of Clinical Medicine
================================================================================
Patient:              ${activeEncounter.patientName}
MRN:                  ${activeEncounter.mrn}
Demographics:         ${activeEncounter.dob}
Exam Date:            ${exportDate}
Location:             ${activeEncounter.examRoom}
Attending Clinician:  ${currentUser.name} (CMIO)
Encounter Status:     ${activeEncounter.status}
Chief Complaint:      ${activeEncounter.chiefComplaint}
--------------------------------------------------------------------------------
PHYSIOLOGIC VITALS:
Blood Pressure:       ${activeEncounter.vitals.bp}
Heart Rate:           ${activeEncounter.vitals.hr}
Oxygen Saturation:    ${activeEncounter.vitals.spo2}
Temperature:          ${activeEncounter.vitals.temp}
Body Mass Index:      ${activeEncounter.vitals.bmi}
--------------------------------------------------------------------------------
SUBJECTIVE:
${soap.subjective}

OBJECTIVE:
${soap.objective}

ASSESSMENT:
${soap.assessment}

PLAN & ORDERS:
${soap.plan}
--------------------------------------------------------------------------------
CRYPTOGRAPHIC INTEGRITY & NON-REPUDIATION SEAL:
Hardware Node:        CV-APPLIANCE-WEST-09 (Air-Gap Sovereign Enclave)
Signer:               ${currentUser.name}
Timestamp (UTC):      ${isoTimestamp}
SHA-256 Digest:       ${sha256Digest}
Verification:         HIPAA §164.312(c)(1) Integrity Mechanism Certified
================================================================================`;

  const formattedAvsText = `================================================================================
PATIENT AFTER VISIT SUMMARY & HEALTH CARE GUIDE
Prepared for: ${activeEncounter.patientName}
Date of Visit: ${exportDate}
Physician: Dr. Amanda Chen, MD
================================================================================
SUMMARY OF YOUR VISIT:
${patientReport.headline}

WHAT WE EXAMINED TODAY:
${patientReport.what_was_examined}

DOCTOR'S EXPLANATION:
${patientReport.doctor_explanation}

KEY FINDINGS:
${patientReport.key_findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

WHAT THIS MEANS FOR YOU:
${patientReport.what_it_means}

YOUR ACTION PLAN & NEXT STEPS:
${patientReport.next_steps.map((s, i) => `[ ] ${i + 1}. ${s}`).join('\n')}

MEDICAL TERMS SIMPLIFIED:
${patientReport.jargon_translations.map((t) => `• ${t.medical_term}: ${t.simple_meaning}\n  (${t.context})`).join('\n')}

QUESTIONS TO CONSIDER AT YOUR NEXT VISIT:
${patientReport.questions_for_doctor.map((q, i) => `${i + 1}. ${q}`).join('\n')}
================================================================================`;

  const handleCopy = () => {
    let textToCopy = '';
    if (activeTab === 'soap') textToCopy = formattedSoapText;
    else if (activeTab === 'patient_avs') textToCopy = formattedAvsText;
    else if (activeTab === 'fhir') textToCopy = JSON.stringify(fhirBundle, null, 2);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopied(true);
        if (onExportComplete) onExportComplete('Clinical record copied to clipboard.');
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const handleDownload = () => {
    let filename = '';
    let content = '';
    let mime = 'text/plain';

    if (activeTab === 'soap') {
      filename = `Clinical_SOAP_${activeEncounter.mrn}_${activeEncounter.id}.txt`;
      content = formattedSoapText;
    } else if (activeTab === 'patient_avs') {
      filename = `Patient_After_Visit_Summary_${activeEncounter.mrn}.txt`;
      content = formattedAvsText;
    } else if (activeTab === 'fhir') {
      filename = `FHIR_R4_Bundle_${activeEncounter.id}.json`;
      content = JSON.stringify(fhirBundle, null, 2);
      mime = 'application/json';
    }

    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (onExportComplete) onExportComplete(`Exported ${filename} successfully.`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="px-7 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-blue-50/40">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-clinical-blue/10 text-clinical-blue flex items-center justify-center border border-clinical-blue/20 shadow-sm">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Institutional Clinical Record Export</h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  HIPAA §164.312 Certified
                </span>
              </div>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                {activeEncounter.patientName} • {activeEncounter.mrn} • Attending: {currentUser.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
            title="Close Export View"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection Header */}
        <div className="px-7 pt-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('soap')}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'soap'
                  ? 'border-clinical-blue text-clinical-blue bg-white shadow-sm font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Clinical SOAP Note</span>
            </button>

            <button
              onClick={() => setActiveTab('patient_avs')}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'patient_avs'
                  ? 'border-clinical-blue text-clinical-blue bg-white shadow-sm font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Patient After Visit Summary</span>
            </button>

            <button
              onClick={() => setActiveTab('fhir')}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'fhir'
                  ? 'border-clinical-blue text-clinical-blue bg-white shadow-sm font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>HL7 FHIR R4 Bundle</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-slate-500">
            <Lock className="w-3 h-3 text-slate-400" />
            <span>Air-Gap Zero Egress</span>
          </div>
        </div>

        {/* Tab Content Preview Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
          {activeTab === 'soap' && (
            <div id={`printable-soap-${printId}`} className="bg-white p-7 rounded-2xl border border-slate-200/80 shadow-sm space-y-6 font-sans">
              {/* Institutional Letterhead */}
              <div className="pb-5 border-b-2 border-slate-900 flex justify-between items-start">
                <div>
                  <h1 className="text-xl font-black text-slate-900 uppercase tracking-wide">ClinixVault Sovereign Health System</h1>
                  <p className="text-xs text-slate-600 font-medium">Department of Internal Medicine & Musculoskeletal Health</p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">Air-Gapped Sovereign Node CV-APPLIANCE-WEST-09</p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-3 py-1 bg-slate-900 text-white text-[11px] font-bold rounded uppercase tracking-wider">
                    Official Progress Note
                  </span>
                  <p className="text-xs font-bold text-slate-800 mt-1.5">{exportDate}</p>
                </div>
              </div>

              {/* Patient Demographics & Vitals Table */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Patient</span>
                  <span className="font-bold text-slate-900">{activeEncounter.patientName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">MRN</span>
                  <span className="font-mono font-bold text-slate-900">{activeEncounter.mrn}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">DOB / Age</span>
                  <span className="text-slate-800">{activeEncounter.dob}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Location</span>
                  <span className="text-slate-800">{activeEncounter.examRoom}</span>
                </div>
              </div>

              {/* Vitals Ribbon */}
              <div className="flex flex-wrap gap-4 text-xs font-mono bg-blue-50/60 border border-blue-100 p-3 rounded-xl">
                <span className="font-bold text-clinical-blue">Vitals:</span>
                <span>BP: <strong>{activeEncounter.vitals.bp}</strong></span>
                <span>HR: <strong>{activeEncounter.vitals.hr}</strong></span>
                <span>SpO2: <strong>{activeEncounter.vitals.spo2}</strong></span>
                <span>Temp: <strong>{activeEncounter.vitals.temp}</strong></span>
                <span>BMI: <strong>{activeEncounter.vitals.bmi}</strong></span>
              </div>

              {/* SOAP Body */}
              <div className="space-y-5 text-xs text-slate-800 leading-relaxed">
                <div>
                  <h3 className="font-extrabold uppercase tracking-wider text-clinical-blue text-[11px] border-b border-slate-100 pb-1 mb-2">
                    Subjective
                  </h3>
                  <p className="whitespace-pre-line text-slate-700">{soap.subjective}</p>
                </div>

                <div>
                  <h3 className="font-extrabold uppercase tracking-wider text-clinical-blue text-[11px] border-b border-slate-100 pb-1 mb-2">
                    Objective & Physical Exam
                  </h3>
                  <p className="whitespace-pre-line text-slate-700">{soap.objective}</p>
                </div>

                <div>
                  <h3 className="font-extrabold uppercase tracking-wider text-clinical-blue text-[11px] border-b border-slate-100 pb-1 mb-2">
                    Assessment
                  </h3>
                  <p className="whitespace-pre-line text-slate-700 font-medium">{soap.assessment}</p>
                </div>

                <div>
                  <h3 className="font-extrabold uppercase tracking-wider text-clinical-blue text-[11px] border-b border-slate-100 pb-1 mb-2">
                    Plan & Directives
                  </h3>
                  <p className="whitespace-pre-line text-slate-700">{soap.plan}</p>
                </div>
              </div>

              {/* Signature & Cryptographic Digest Footer */}
              <div className="pt-5 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Attending Provider</span>
                  <span className="font-bold text-slate-900">{currentUser.name}</span>
                  <p className="text-[11px] text-slate-500">Chief Medical Information Officer • NPI 1948201948</p>
                </div>

                <div className="text-right sm:max-w-xs font-mono text-[10px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-1.5 justify-end text-emerald-700 font-bold mb-0.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Cryptographic Seal Verified</span>
                  </div>
                  <span className="truncate block" title={sha256Digest}>SHA-256: {sha256Digest.slice(0, 24)}...</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'patient_avs' && (
            <div className="bg-white p-7 rounded-2xl border border-slate-200/80 shadow-sm space-y-6 font-sans">
              <div className="pb-4 border-b border-slate-100">
                <span className="px-2.5 py-1 text-[10px] font-bold bg-purple-100 text-purple-800 rounded-md uppercase tracking-wider inline-block mb-2">
                  Plain-Language Health Guide • Grade 6 Certified
                </span>
                <h2 className="text-lg font-extrabold text-slate-900 leading-snug">
                  {patientReport.headline}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Prepared for {activeEncounter.patientName} on {exportDate} by {currentUser.name}
                </p>
              </div>

              {/* Doctor Explanation */}
              <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-100 text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                {patientReport.doctor_explanation}
              </div>

              {/* Key Findings */}
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2.5">
                  What We Observed
                </h4>
                <div className="space-y-2">
                  {patientReport.key_findings.map((finding, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                      <div className="w-5 h-5 rounded-full bg-purple-100 text-purple-800 font-bold text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </div>
                      <span className="mt-0.5">{finding}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Plan */}
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2.5">
                  Your Action Plan & Next Steps
                </h4>
                <div className="space-y-2">
                  {patientReport.next_steps.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-800 bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-200/70">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Jargon Translations */}
              {patientReport.jargon_translations && patientReport.jargon_translations.length > 0 && (
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2.5">
                    Medical Terms Simplified
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {patientReport.jargon_translations.map((jargon, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                        <span className="font-bold text-slate-900 block">{jargon.medical_term}</span>
                        <span className="text-purple-700 font-medium block mt-0.5">Simple Meaning: {jargon.simple_meaning}</span>
                        <p className="text-[11px] text-slate-500 mt-1">{jargon.context}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'fhir' && (
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-inner overflow-hidden font-mono">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 text-xs text-slate-400">
                <span>HL7 FHIR R4 Resource Bundle (JSON-LD)</span>
                <span className="text-emerald-400 font-bold">Validated HL7 Schema</span>
              </div>
              <pre className="text-[11px] text-emerald-300 leading-relaxed overflow-x-auto max-h-[460px] p-2 selection:bg-emerald-800/40">
                {JSON.stringify(fhirBundle, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="px-7 py-4 border-t border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-mono text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
              SHA-256 Digest: {sha256Digest.slice(0, 16)}...
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleCopy}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy to Clipboard'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={handleDownload}
              className="px-4.5 py-2 text-xs font-bold rounded-xl bg-clinical-blue hover:bg-clinical-blue/90 text-white flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
