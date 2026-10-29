import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  HeartHandshake, 
  Volume2, 
  VolumeX, 
  Printer, 
  CheckCircle2, 
  HelpCircle, 
  BookOpen, 
  Calendar, 
  Stethoscope, 
  ShieldCheck, 
  Sparkles,
  Info,
  RefreshCw
} from 'lucide-react';
import { PatientReport } from '../types';

interface PatientReportViewProps {
  report: PatientReport;
  patientName: string;
  studyTitle: string;
  doctorName?: string;
  dateStr?: string;
  onRefresh?: () => void;
  isGenerating?: boolean;
}

export const PatientReportView: React.FC<PatientReportViewProps> = ({
  report,
  patientName,
  studyTitle,
  doctorName = 'Dr. Amanda Chen, MD (CMIO)',
  dateStr = 'Today, 10:45 AM',
  onRefresh,
  isGenerating = false,
}) => {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [expandedGlossaryTerm, setExpandedGlossaryTerm] = useState<string | null>(null);

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleToggleSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert('Text-to-speech audio narration is not supported in this browser.');
      return;
    }

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }

    // Build friendly narration script
    const script = `Hello ${patientName}. This is your personalized health summary from ${doctorName}. ${report.headline}. ${report.doctor_explanation}. Here is what this means for you: ${report.what_it_means}. Next steps: ${report.next_steps.join('. ')}.`;

    const utterance = new SpeechSynthesisUtterance(script);
    utterance.rate = 0.92; // Slightly relaxed, calm doctor cadence
    utterance.pitch = 1.0;

    // Pick a natural English voice if available
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) => (v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Google US English')) && v.lang.startsWith('en')
    );
    if (naturalVoice) {
      utterance.voice = naturalVoice;
    }

    utterance.onend = () => {
      setIsPlayingAudio(false);
    };
    utterance.onerror = () => {
      setIsPlayingAudio(false);
    };

    window.speechSynthesis.speak(utterance);
    setIsPlayingAudio(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const toggleCheckStep = (index: number) => {
    setCheckedSteps((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  return (
    <div className="space-y-6 text-slate-800 font-sans print:p-0 print:space-y-4">
      {/* 1. Welcoming Hero Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-teal-50/90 via-blue-50/60 to-indigo-50/40 border border-teal-200/60 shadow-sm relative overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-teal-500 text-white flex items-center justify-center shadow-md shadow-teal-500/25 shrink-0">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-300/80">
                  Patient Health Guide
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300/80">
                  {report.reading_level || 'Grade 6 Plain Language Certified'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Your Health Summary & Care Plan
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                Prepared especially for <span className="font-bold text-slate-900">{patientName}</span> by {doctorName} • {dateStr}
              </p>
            </div>
          </div>

          {/* Action Bar (Audio Read-Aloud & Print & Re-generate) */}
          <div className="flex items-center gap-2.5 self-start sm:self-center">
            {onRefresh && (
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={onRefresh}
                className="px-3 py-2.5 rounded-2xl bg-white text-teal-800 border border-teal-200 hover:bg-teal-50 transition-colors shadow-sm cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                title="Re-synthesize patient explanation"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-teal-600 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>{isGenerating ? 'Updating...' : 'Refresh'}</span>
              </motion.button>
            )}

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleToggleSpeech}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer ${
                isPlayingAudio
                  ? 'bg-rose-500 text-white shadow-rose-500/30 animate-pulse'
                  : 'bg-white text-teal-800 border border-teal-200 hover:bg-teal-50'
              }`}
              title="Listen to your doctor explain this report out loud"
            >
              {isPlayingAudio ? (
                <>
                  <VolumeX className="w-4 h-4" />
                  <span>Pause Reading</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-teal-600" />
                  <span>Listen to Doctor</span>
                </>
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={handlePrint}
              className="p-2.5 rounded-2xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
              title="Print Take-Home Patient Summary"
            >
              <Printer className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Headline Callout */}
        <div className="mt-5 p-4 rounded-2xl bg-white/95 border border-teal-200/80 shadow-xs flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 block mb-0.5">
              Main Takeaway:
            </span>
            <p className="text-xs sm:text-sm font-bold text-slate-900 leading-relaxed">
              "{report.headline}"
            </p>
          </div>
        </div>
      </motion.div>

      {/* 2. Doctor's Personal Note Section */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-slate-900">
          <Stethoscope className="w-4.5 h-4.5 text-clinical-blue" />
          <h3 className="text-base font-extrabold">Doctor's Explanation to You</h3>
        </div>

        <div className="text-xs sm:text-[13px] text-slate-700 leading-relaxed space-y-2.5 whitespace-pre-line font-sans bg-slate-50/70 p-4.5 rounded-2xl border border-slate-200/60">
          {report.doctor_explanation}
        </div>
      </div>

      {/* 3. Two Columns: What Was Looked At & Key Findings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left: What Was Examined */}
        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-sky-600" />
            <h4 className="text-sm font-bold text-slate-900">What This Test Examined</h4>
          </div>
          <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
            {report.what_was_examined}
          </p>
          <div className="p-3 bg-sky-50/60 border border-sky-100 rounded-xl text-[11px] text-sky-900 font-medium">
            Exam Name: <span className="font-bold">{studyTitle}</span>
          </div>
        </div>

        {/* Right: What It Means For You */}
        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-bold text-slate-900">What This Means for Your Health</h4>
          </div>
          <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
            {report.what_it_means}
          </p>
        </div>
      </div>

      {/* 4. What Your Doctor Saw (Plain English Findings) */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <CheckCircle2 className="w-4.5 h-4.5 text-teal-600" />
          <span>What We Saw (In Everyday Words)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {report.key_findings.map((finding, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-teal-50/40 border border-teal-100/80 flex flex-col justify-between"
            >
              <div className="space-y-1">
                <span className="w-6 h-6 rounded-full bg-teal-500 text-white text-[11px] font-bold flex items-center justify-center mb-2">
                  {idx + 1}
                </span>
                <p className="text-xs text-slate-800 font-semibold leading-snug">
                  {finding}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Next Steps & Take-Home Care Plan Checklist */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4.5 h-4.5 text-indigo-600" />
            <h3 className="text-base font-extrabold text-slate-900">Your Action Plan & Next Steps</h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Check off items as you complete them
          </span>
        </div>

        <div className="space-y-2.5">
          {report.next_steps.map((step, idx) => {
            const isChecked = !!checkedSteps[idx];
            return (
              <motion.div
                key={idx}
                whileTap={{ scale: 0.99 }}
                onClick={() => toggleCheckStep(idx)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  isChecked
                    ? 'bg-emerald-50/60 border-emerald-200 line-through text-slate-400'
                    : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/70 text-slate-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    isChecked
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                </div>
                <span className="text-xs sm:text-[13px] font-medium leading-relaxed">
                  {step}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* 6. Medical Word Translator (Jargon Decoder Cards) */}
      {report.jargon_translations && report.jargon_translations.length > 0 && (
        <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4.5 h-4.5 text-purple-600" />
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Medical Word Translator
              </h3>
              <p className="text-xs text-slate-500">
                Translating complicated hospital jargon from your test into simple everyday language
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {report.jargon_translations.map((item, idx) => {
              const isExpanded = expandedGlossaryTerm === item.medical_term;
              return (
                <div
                  key={idx}
                  onClick={() => setExpandedGlossaryTerm(isExpanded ? null : item.medical_term)}
                  className="p-4 rounded-2xl bg-purple-50/40 border border-purple-100/80 hover:border-purple-200 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-black text-purple-900">
                      {item.medical_term}
                    </span>
                    <span className="text-[10px] font-mono text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full font-bold">
                      Translates to:
                    </span>
                  </div>

                  <p className="text-xs font-bold text-slate-900 leading-snug">
                    "{item.simple_meaning}"
                  </p>

                  <p className="text-[11px] text-slate-600 mt-2 leading-relaxed pt-2 border-t border-purple-100/60">
                    {item.context}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 7. Helpful Questions to Ask Your Doctor */}
      {report.questions_for_doctor && report.questions_for_doctor.length > 0 && (
        <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4.5 h-4.5 text-amber-600" />
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Good Questions to Ask Your Doctor
              </h3>
              <p className="text-xs text-slate-500">
                Feel free to print or bring these questions to your next appointment
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {report.questions_for_doctor.map((q, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200/60 flex items-start gap-3"
              >
                <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  Q{idx + 1}
                </span>
                <p className="text-xs sm:text-[13px] text-slate-900 font-semibold leading-relaxed">
                  "{q}"
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
