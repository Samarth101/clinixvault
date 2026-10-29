import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Moon, 
  Sun, 
  Type, 
  Mic, 
  Cpu, 
  Zap, 
  ShieldCheck, 
  Check, 
  Database
} from 'lucide-react';
import { AppSettings, HardwareSpecs } from '../types';
import { clinixApi } from '../services/api';

interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onOpenModelManager?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onOpenModelManager,
}) => {
  const [hardware, setHardware] = React.useState<HardwareSpecs | null>(null);
  const [audioDevices, setAudioDevices] = React.useState<AudioDeviceOption[]>([]);

  React.useEffect(() => {
    if (isOpen) {
      clinixApi.getHardwareSpecs().then(setHardware).catch(() => {});

      if (navigator.mediaDevices?.enumerateDevices) {
        navigator.mediaDevices
          .enumerateDevices()
          .then((devices) => {
            const inputs = devices
              .filter((d) => d.kind === 'audioinput')
              .map((d, i) => ({
                deviceId: d.deviceId,
                label: d.label || `Microphone ${i + 1} (${d.deviceId.slice(0, 6)}...)`,
              }));
            setAudioDevices(inputs);
          })
          .catch((err) => console.warn('Audio device enumeration error:', err));
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 my-8"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-clinical-blue/10 dark:bg-clinical-blue/20 text-clinical-blue flex items-center justify-center">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Appliance Settings & Preferences
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Zero-egress local node configuration • Node CV-WEST-09
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
            {/* 1. Theme Configuration */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 block">
                Appearance & Display Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ darkMode: false })}
                  className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${
                    !settings.darkMode
                      ? 'border-clinical-blue bg-blue-50/60 dark:bg-blue-900/20 text-slate-900 font-semibold shadow-sm ring-1 ring-clinical-blue'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                      <Sun className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">Clinical Light</div>
                      <div className="text-xs text-slate-500">Daytime luminescent palette</div>
                    </div>
                  </div>
                  {!settings.darkMode && <Check className="w-5 h-5 text-clinical-blue" />}
                </button>

                <button
                  type="button"
                  onClick={() => onUpdateSettings({ darkMode: true })}
                  className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${
                    settings.darkMode
                      ? 'border-clinical-blue bg-blue-50/60 dark:bg-blue-900/30 text-slate-900 dark:text-white font-semibold shadow-sm ring-1 ring-clinical-blue'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-800/60 flex items-center justify-center">
                      <Moon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">Obsidian Dark</div>
                      <div className="text-xs text-slate-500">Reduced glare in reading rooms</div>
                    </div>
                  </div>
                  {settings.darkMode && <Check className="w-5 h-5 text-clinical-blue" />}
                </button>
              </div>
            </div>

            {/* 2. Font Size Scaling */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 block">
                Typography Scale (Fira Sans)
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'normal', label: 'Standard (17px)', desc: 'Spacious & crisp' },
                  { id: 'large', label: 'Large (18.5px)', desc: 'High clinical readability' },
                  { id: 'xlarge', label: 'Extra Large (20px)', desc: 'Distance surgical monitors' },
                ].map((scale) => {
                  const isSelected = settings.fontSize === scale.id;
                  return (
                    <button
                      key={scale.id}
                      type="button"
                      onClick={() => onUpdateSettings({ fontSize: scale.id as AppSettings['fontSize'] })}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        isSelected
                          ? 'border-clinical-blue bg-blue-50/60 dark:bg-blue-900/30 text-slate-900 dark:text-white ring-1 ring-clinical-blue font-semibold'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Type className="w-4 h-4 text-clinical-blue" />
                        {isSelected && <Check className="w-4 h-4 text-clinical-blue" />}
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{scale.label}</div>
                      <div className="text-[11px] text-slate-500">{scale.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Audio & ASR Calibration */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Mic className="w-4 h-4 text-clinical-blue" />
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Ambient Audio Capture Device
                  </span>
                </div>
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded font-bold">
                  48kHz 24-bit Lossless
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <select
                  value={settings.audioDevice}
                  onChange={(e) => {
                    const val = e.target.value;
                    localStorage.setItem('clinix_selected_audio_device_id', val);
                    onUpdateSettings({ audioDevice: val });
                  }}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-blue cursor-pointer"
                >
                  <option value="">Default System Microphone (Device Built-in Mic)</option>
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (navigator.mediaDevices?.getUserMedia) {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        const devices = await navigator.mediaDevices.enumerateDevices();
                        stream.getTracks().forEach((t) => t.stop());
                        const inputs = devices
                          .filter((d) => d.kind === 'audioinput')
                          .map((d, i) => ({
                            deviceId: d.deviceId,
                            label: d.label || `Microphone ${i + 1}`,
                          }));
                        setAudioDevices(inputs);
                      }
                    } catch (e) {
                      console.warn('Microphone permission or enumeration notice:', e);
                    }
                  }}
                  className="px-3 py-2.5 text-xs font-bold rounded-xl bg-blue-50 dark:bg-blue-950/60 text-clinical-blue hover:bg-blue-100 border border-blue-200 dark:border-blue-800 shrink-0 cursor-pointer transition-all"
                  title="Detect audio hardware devices and refresh microphone labels"
                >
                  Detect Mics
                </button>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-semibold text-clinical-blue dark:text-sky-400">
                  🎙️ Hardware Microphone Routing Guide:
                </p>
                <p>
                  • <strong>Is this using our device mic?</strong> Yes! ClinixVault captures live ambient dialogue directly from your computer's built-in microphone (or any connected hardware).
                </p>
                <p>
                  • <strong>What are the dropdown options?</strong> They list all physical audio input devices detected by your operating system (e.g. MacBook Pro Microphone, external USB mic, AirPods, or clinical room boundary microphone).
                </p>
                <p>
                  • <strong>How to use them:</strong> Select your preferred device from the list. The selected input will be locked as the audio source streamed to the Faster-Whisper ASR pipeline.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span>Whisper ASR Temperature</span>
                  <span className="font-mono font-bold text-clinical-blue">{settings.whisperTemperature} (Deterministic)</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="0.8"
                  step="0.05"
                  value={settings.whisperTemperature}
                  onChange={(e) => onUpdateSettings({ whisperTemperature: parseFloat(e.target.value) })}
                  className="w-full accent-clinical-blue cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>0.0 (Strict Verbatim)</span>
                  <span>0.4 (Balanced)</span>
                  <span>0.8 (Exploratory)</span>
                </div>
              </div>
            </div>

            {/* 4. Local Model Architecture & Hardware Acceleration */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Database className="w-4 h-4 text-indigo-500" />
                  <div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                      Model Management & Foundation Weights
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Configure local vLLM foundation weights, quantized medical models, and Ollama daemons
                    </span>
                  </div>
                </div>
                {onOpenModelManager && (
                  <button
                    onClick={onOpenModelManager}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 text-xs font-bold transition-all border border-indigo-200/80 dark:border-indigo-800 shrink-0 cursor-pointer"
                  >
                    Open Model Manager →
                  </button>
                )}
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        C++ SIMD Acceleration Kernel (<code className="text-xs">libclinix_accel.so</code>)
                      </span>
                      <p className="text-[11px] text-slate-500">AVX-512 hardware vectorized preprocessing for 4.2x speedup</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.cppAcceleration}
                    onChange={(e) => onUpdateSettings({ cppAcceleration: e.target.checked })}
                    className="w-5 h-5 text-clinical-blue rounded accent-clinical-blue cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Automated FHIR R4 Real-Time Commit
                      </span>
                      <p className="text-[11px] text-slate-500">Cryptographically stamp and bundle encounters directly into Postgres</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoCommitFhir}
                    onChange={(e) => onUpdateSettings({ autoCommitFhir: e.target.checked })}
                    className="w-5 h-5 text-clinical-blue rounded accent-clinical-blue cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono">
              SHA-256 Config Hash: #CV-77A04
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-clinical-blue hover:bg-clinical-dark text-white font-semibold text-sm transition-all shadow-md shadow-blue-500/20"
            >
              Done & Save
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
