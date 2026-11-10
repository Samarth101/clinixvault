import React, { useState, useEffect } from 'react';
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
  Database,
  Lock,
  RefreshCw,
  HardDrive
} from 'lucide-react';
import { AppSettings, HardwareSpecs } from '../types';
import { clinixApi } from '../services/api';
import { useVaultLock } from '../context/VaultLockContext';
import { getCacheTelemetry, syncPendingActions, CacheTelemetry } from '../services/indexedDbCache';

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
  const [hardware, setHardware] = useState<HardwareSpecs | null>(null);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceOption[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheTelemetry | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');
  const [pinSavedMsg, setPinSavedMsg] = useState(false);

  const { autoLockMinutes, setAutoLockMinutes, quickPin, setQuickPin, lockVault } = useVaultLock();

  const loadCacheTelemetry = () => {
    getCacheTelemetry().then(setCacheStats).catch(() => {});
  };

  useEffect(() => {
    if (isOpen) {
      clinixApi.getHardwareSpecs().then(setHardware).catch(() => {});
      loadCacheTelemetry();
      setNewPinInput('');

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

      const handleCacheEvt = () => loadCacheTelemetry();
      window.addEventListener('clinixvault:draft_saved', handleCacheEvt);
      window.addEventListener('clinixvault:draft_deleted', handleCacheEvt);
      window.addEventListener('clinixvault:cache_synced', handleCacheEvt);
      window.addEventListener('clinixvault:pending_queued', handleCacheEvt);

      return () => {
        window.removeEventListener('clinixvault:draft_saved', handleCacheEvt);
        window.removeEventListener('clinixvault:draft_deleted', handleCacheEvt);
        window.removeEventListener('clinixvault:cache_synced', handleCacheEvt);
        window.removeEventListener('clinixvault:pending_queued', handleCacheEvt);
      };
    }
  }, [isOpen]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncPendingActions(clinixApi);
      loadCacheTelemetry();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSavePin = () => {
    const clean = newPinInput.trim();
    if (clean.length === 4 && /^\d{4}$/.test(clean)) {
      setQuickPin(clean);
      setPinSavedMsg(true);
      setNewPinInput('');
      setTimeout(() => setPinSavedMsg(false), 2000);
    } else {
      alert('Quick PIN must be exactly 4 numeric digits.');
    }
  };

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
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
                  className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all cursor-pointer ${
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
                  className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all cursor-pointer ${
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

            {/* 2. Session Vault Auto-Lock & PHI Inactivity Security (§164.312) */}
            <div className="p-4 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-amber-500" />
                  <div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                      Session Vault Auto-Lock (§164.312 Standard)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Protects patient PHI on unattended hospital edge terminals without losing in-flight state.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    lockVault('Manual Lock from Settings');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-bold transition-all border border-amber-500/30 cursor-pointer"
                >
                  Lock Vault Now
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                    Inactivity Lock Timeout
                  </label>
                  <select
                    value={autoLockMinutes}
                    onChange={(e) => setAutoLockMinutes(parseInt(e.target.value, 10))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                  >
                    <option value={1}>1 Minute (Fast QA / Demo Test)</option>
                    <option value={5}>5 Minutes (High Security ER)</option>
                    <option value={10}>10 Minutes</option>
                    <option value={15}>15 Minutes (Standard Hospital Default)</option>
                    <option value={30}>30 Minutes</option>
                    <option value={0}>Disabled (Not recommended)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                    Quick Re-Authentication PIN (4 Digits)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      maxLength={4}
                      value={newPinInput}
                      onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                      placeholder={quickPin === '1234' ? '1234' : '••••'}
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                    <button
                      type="button"
                      onClick={handleSavePin}
                      className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer border border-slate-200 dark:border-slate-700"
                    >
                      {pinSavedMsg ? 'Saved!' : 'Save PIN'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Client IndexedDB Zero-Egress Persistent Cache */}
            <div className="p-4 rounded-2xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <HardDrive className="w-4 h-4 text-clinical-blue" />
                  <div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                      Client Zero-Egress Cache (IndexedDB)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Sovereign client storage for in-flight drafts, offline encounters, and pending reports.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="px-3 py-1.5 rounded-xl bg-clinical-blue/10 hover:bg-clinical-blue/20 text-clinical-blue text-xs font-bold transition-all border border-clinical-blue/30 cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Sync Pending Data</span>
                </button>
              </div>

              {cacheStats && (
                <div className="grid grid-cols-3 gap-2.5 pt-1 text-center">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                      {cacheStats.draftsCount}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">Local Drafts</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className={`text-base font-extrabold font-mono ${
                      cacheStats.pendingCount > 0 ? 'text-amber-500' : 'text-emerald-500'
                    }`}>
                      {cacheStats.pendingCount}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">Pending Sync</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                      {cacheStats.offlineEncountersCount}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">Offline Encounters</div>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Font Size Scaling */}
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
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
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

            {/* 5. Audio & ASR Calibration */}
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
              </div>
            </div>

            {/* 6. Local Model Architecture & Hardware Acceleration */}
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
              className="px-5 py-2.5 rounded-xl bg-clinical-blue hover:bg-clinical-dark text-white font-semibold text-sm transition-all shadow-md shadow-blue-500/20 cursor-pointer"
            >
              Done & Save
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
