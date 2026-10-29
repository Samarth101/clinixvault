import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Cpu, 
  Sliders, 
  CheckCircle2, 
  Server, 
  Shield
} from 'lucide-react';
import { clinixApi } from '../services/api';
import { HardwareSpecs } from '../types';

export const HardwareSizingPage: React.FC = () => {
  // Calculator state
  const [examRooms, setExamRooms] = useState<number>(6);
  const [encountersPerDay, setEncountersPerDay] = useState<number>(120);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [hardware, setHardware] = useState<HardwareSpecs | null>(null);

  useEffect(() => {
    clinixApi.getHardwareSpecs().then(setHardware).catch(() => {});
  }, []);

  // Compute sizing dynamics
  const vramNeeded = Math.min(320, Math.max(16, Math.round(18 + (examRooms * 1.8) + (encountersPerDay * 0.05))));
  const recommendedSku = examRooms <= 12 && encountersPerDay <= 250 ? 'SKU-1' : 'SKU-2';
  const estimatedLatencyMs = examRooms <= 12 ? Math.round(18 + examRooms * 0.4) : Math.round(12 + examRooms * 0.2);
  const throughputTokens = examRooms <= 12 ? '85 tok/s' : '380 tok/s';

  const provisioningSteps = [
    {
      step: 1,
      title: "Physical Rackmount & Secure Perimeter Ingress",
      desc: "Install into 2U/4U standard 19-inch rack. Connect redundant dual 80+ Platinum PSUs to isolated hospital UPS feed. Physical tamper-evident chassis seals are inspected.",
    },
    {
      step: 2,
      title: "Hardware Root-of-Trust & Key Ingestion",
      desc: "Insert CMIO cryptographic HSM physical smart card into front chassis slot. Air-gapped AES-256 NVMe root volume mounts automatically with zero network dependency.",
    },
    {
      step: 3,
      title: "Local PACS / EHR Network Bridge",
      desc: "Connect isolated VLAN port to internal Epic/Cerner HL7 FHIR R4 endpoint and local PACS SQLite/DICOM node. Zero outbound WAN route configured via iptables kernel drop.",
    },
    {
      step: 4,
      title: "Clinician Smart Badge Onboarding",
      desc: "Enroll attending physicians via Keycloak local FIDO2/NFC badges. Ambient room microphone array pairs with designated exam room ID.",
    },
  ];

  const complianceBadges = [
    {
      title: "HIPAA §164.312",
      subtitle: "Technical Safeguards",
      desc: "Zero external network egress, append-only SHA-256 audit logs, AES-256 data at rest.",
    },
    {
      title: "GDPR Article 9",
      subtitle: "Special Category Data",
      desc: "100% On-Premises EU Data Residency, strict boundary sovereignty.",
    },
    {
      title: "DPDP Act 2023",
      subtitle: "Health Data Fiduciary",
      desc: "Local sovereign processing without cross-border transfer requirements.",
    },
    {
      title: "ISO 27001 / 13485",
      subtitle: "Medical Device Quality",
      desc: "Rigorous firmware verification, hardware lifecycle management, air-gap integrity.",
    },
  ];

  return (
    <div className="space-y-10 max-w-7xl mx-auto pb-20">
      {/* 1. Header Hero */}
      <motion.section 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="glass-card p-9 border border-white/90 shadow-diffuse relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-80 h-2 hatch-badge-amber rounded-bl-xl" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold mb-3.5 shadow-sm">
              <Cpu className="w-3.5 h-3.5 text-amber-600" />
              <span>Turnkey On-Prem Edge Appliances • Zero Cloud Infrastructure</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900">
              Hardware Appliances & Turnkey Sizing
            </h1>
            <p className="text-slate-600 text-sm mt-2.5 max-w-2xl leading-relaxed">
              Industrial rackmount clinical appliances engineered for whisper-quiet clinic deployment or high-throughput hospital wing multi-room clusters.
            </p>
          </div>

          <div className="flex items-center gap-3.5">
            <motion.div 
              whileHover={{ y: -3 }}
              className="p-4.5 rounded-2xl bg-white/95 border border-slate-200/80 shadow-sm text-center min-w-[130px]"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Form Factor
              </span>
              <span className="text-sm font-extrabold text-slate-800 font-mono mt-1 block">
                2U / 4U Rackmount
              </span>
            </motion.div>
            <motion.div 
              whileHover={{ y: -3 }}
              className="p-4.5 rounded-2xl bg-white/95 border border-slate-200/80 shadow-sm text-center min-w-[140px]"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Hardware Warranty
              </span>
              <span className="text-xs font-bold text-emerald-700 font-mono mt-1 block">
                5-Yr 24/7 On-Site
              </span>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* 2. Interactive Sizing Calculator */}
      <motion.section 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08 }}
        className="glass-card p-9 border border-white/90 shadow-diffuse"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-7 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <Sliders className="w-5 h-5 text-clinical-blue" />
              Interactive Clinical Sizing Calculator
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Adjust your clinic's physical layout and patient encounter throughput to compute hardware targets
            </p>
          </div>
          <span className="px-3 py-1 bg-blue-50 text-clinical-blue rounded-full text-xs font-bold font-mono border border-blue-200/60">
            Live Hardware Spec Engine
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Sliders */}
          <div className="lg:col-span-7 space-y-6">
            {/* Slider 1: Exam Rooms */}
            <div className="p-6 rounded-[28px] bg-white border border-slate-200/80 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-extrabold text-slate-900 block">
                    Simultaneous Active Exam Rooms
                  </span>
                  <span className="text-xs text-slate-500 mt-0.5">
                    Concurrent physician-patient acoustic scribe channels
                  </span>
                </div>
                <span className="text-xl font-extrabold text-clinical-blue font-mono bg-blue-50 px-3.5 py-1 rounded-xl border border-blue-200 shadow-sm">
                  {examRooms} Rooms
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                value={examRooms}
                onChange={(e) => setExamRooms(parseInt(e.target.value))}
                className="w-full accent-clinical-blue cursor-pointer h-2 bg-slate-100 rounded-lg"
              />
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>1 Room (Solo Clinic)</span>
                <span>25 Rooms (Specialty Wing)</span>
                <span>50 Rooms (Regional Hospital)</span>
              </div>
            </div>

            {/* Slider 2: Daily Encounter Volume */}
            <div className="p-6 rounded-[28px] bg-white border border-slate-200/80 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-extrabold text-slate-900 block">
                    Daily Encounter Volume
                  </span>
                  <span className="text-xs text-slate-500 mt-0.5">
                    Estimated 24-hour synthesized patient visits & reports
                  </span>
                </div>
                <span className="text-xl font-extrabold text-indigo-700 font-mono bg-indigo-50 px-3.5 py-1 rounded-xl border border-indigo-200 shadow-sm">
                  {encountersPerDay} Encounters/Day
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="1000"
                step="10"
                value={encountersPerDay}
                onChange={(e) => setEncountersPerDay(parseInt(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-100 rounded-lg"
              />
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>10 Visits (Private Practice)</span>
                <span>500 Visits (Hospital Outpatient)</span>
                <span>1,000 Visits (Emergency Dept)</span>
              </div>
            </div>
          </div>

          {/* Right Column: Computed Hardware Target Card */}
          <motion.div 
            layout
            className="lg:col-span-5 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white rounded-[32px] p-8 shadow-2xl relative overflow-hidden space-y-5"
          >
            <div className="absolute top-0 right-0 w-36 h-36 bg-clinical-blue/20 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                Computed Recommendation
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                {recommendedSku === 'SKU-1' ? 'SKU 1: CLINIC NODE' : 'SKU 2: HOSPITAL WING'}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-xs text-slate-400 block font-mono">REQUIRED GPU VRAM</span>
                <span className="text-3xl font-extrabold text-white font-mono mt-0.5 block">
                  {vramNeeded} GB VRAM
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3.5 border-t border-slate-800 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block text-[10px] font-sans">EXPECTED P95 LATENCY</span>
                  <span className="text-emerald-400 font-bold text-sm mt-0.5 block">{estimatedLatencyMs} ms</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-sans">TOTAL THROUGHPUT</span>
                  <span className="text-sky-400 font-bold text-sm mt-0.5 block">{throughputTokens}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 text-xs text-slate-300 space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Outlines CFG schema guaranteed without latency penalty</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Dual redundant power supply & ECC memory validated</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* 3. SKU Comparison Breakdown Cards */}
      <motion.section 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.12 }}
        className="glass-card p-9 border border-white/90 shadow-diffuse"
      >
        <div className="flex items-center justify-between mb-7 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <Server className="w-5 h-5 text-clinical-blue" />
              Turnkey Appliance SKU Breakdown
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Engineered hardware appliances designed specifically for zero-cloud clinical environments
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* SKU 1: The Clinic Node */}
          <motion.div 
            whileHover={{ y: -4 }}
            className={`p-7 rounded-[30px] transition-all relative ${
              recommendedSku === 'SKU-1'
                ? 'bg-white border-2 border-clinical-blue shadow-[0_20px_50px_rgba(37,99,235,0.1)]'
                : 'bg-white/80 border border-slate-200/80 shadow-sm'
            }`}
          >
            {recommendedSku === 'SKU-1' && (
              <span className="absolute top-5 right-5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-clinical-blue border border-blue-200">
                RECOMMENDED
              </span>
            )}

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-clinical-blue flex items-center justify-center font-bold">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">SKU 1: The 'Clinic' Node</h3>
                <span className="text-xs font-mono text-slate-500">Form: 2U Desktop / Whisper-Quiet</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Designed for individual medical practices, outpatient surgical centers, and specialty clinics with 1 to 12 active exam rooms.
            </p>

            <div className="space-y-2.5 text-xs font-mono bg-slate-50 p-4.5 rounded-2xl border border-slate-200/70">
              <div className="flex justify-between">
                <span className="text-slate-500">GPU / Accelerator:</span>
                <span className="font-bold text-slate-800">
                  {hardware?.is_apple_silicon
                    ? `${hardware.chip} (${hardware.total_memory_gb}GB Unified Memory)`
                    : hardware?.accelerator || hardware?.gpu_name || 'Host GPU Accelerator (24GB+)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Acoustics:</span>
                <span className="font-bold text-emerald-600">&lt; 32 dB (Exam Room Quiet)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Throughput:</span>
                <span className="font-bold text-slate-800">Up to 12 Concurrent Scribe Streams</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Storage:</span>
                <span className="font-bold text-slate-800">2x 4TB NVMe RAID-1 (FIPS 140-3)</span>
              </div>
            </div>
          </motion.div>

          {/* SKU 2: The Hospital Wing Node */}
          <motion.div 
            whileHover={{ y: -4 }}
            className={`p-7 rounded-[30px] transition-all relative ${
              recommendedSku === 'SKU-2'
                ? 'bg-white border-2 border-indigo-600 shadow-[0_20px_50px_rgba(79,70,229,0.1)]'
                : 'bg-white/80 border border-slate-200/80 shadow-sm'
            }`}
          >
            {recommendedSku === 'SKU-2' && (
              <span className="absolute top-5 right-5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200">
                RECOMMENDED
              </span>
            )}

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Server className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">SKU 2: The 'Hospital Wing' Node</h3>
                <span className="text-xs font-mono text-slate-500">Form: 4U Enterprise Rackmount</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Engineered for large acute hospital departments, multi-specialty regional centers, and high-throughput emergency units up to 50 exam rooms.
            </p>

            <div className="space-y-2.5 text-xs font-mono bg-slate-50 p-4.5 rounded-2xl border border-slate-200/70">
              <div className="flex justify-between">
                <span className="text-slate-500">GPU:</span>
                <span className="font-bold text-slate-800">4x NVIDIA L40S or H100 (80GB VRAM ea)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Redundancy:</span>
                <span className="font-bold text-emerald-600">Dual 2400W 80+ Platinum Hot-Swap</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Throughput:</span>
                <span className="font-bold text-slate-800">Up to 64 Concurrent Streams</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Storage:</span>
                <span className="font-bold text-slate-800">8x 8TB Enterprise NVMe RAID-10</span>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* 4. Turnkey Provisioning Walkthrough & Trust Badges */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left (7 Cols): 4-Step Provisioning Guide */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.16 }}
          className="lg:col-span-7 glass-card p-8 border border-white/90 shadow-diffuse space-y-5"
        >
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Turnkey Physical Deployment Walkthrough
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              4-step physical installation process guaranteed to be production-ready in under 60 minutes
            </p>
          </div>

          <div className="space-y-3">
            {provisioningSteps.map((step) => {
              const isActive = activeStep === step.step;
              return (
                <div
                  key={step.step}
                  onClick={() => setActiveStep(step.step)}
                  className={`p-4.5 rounded-24 transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-blue-50/70 border-clinical-blue/50 shadow-sm'
                      : 'bg-white hover:bg-slate-50 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                        isActive
                          ? 'bg-clinical-blue text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {step.step}
                    </span>
                    <h4 className="text-xs font-extrabold text-slate-900">{step.title}</h4>
                  </div>
                  <p className="text-xs text-slate-600 pl-9 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Right (5 Cols): Regulatory Compliance Seals */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          className="lg:col-span-5 glass-card p-8 border border-white/90 shadow-diffuse space-y-5"
        >
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              Regulatory Compliance Seals
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Independently audited air-gap guarantees satisfying strict healthcare mandates
            </p>
          </div>

          <div className="space-y-3.5">
            {complianceBadges.map((badge) => (
              <div
                key={badge.title}
                className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900">
                    {badge.title}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    {badge.subtitle}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-normal">
                  {badge.desc}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};
