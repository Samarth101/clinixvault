import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Cpu, 
  HardDrive, 
  Download, 
  CheckCircle2, 
  Check, 
  RefreshCw, 
  Sparkles, 
  Scan, 
  FileText, 
  Wifi, 
  WifiOff, 
  Info,
  Server,
  Award,
  Zap,
  ShieldCheck,
  Play,
  Square,
  Database
} from 'lucide-react';
import { clinixApi } from '../services/api';
import { HardwareSpecs, ModelListResponse, PretrainedCatalogModel, InstalledModel, ModelPullStatus, FineTunedModel } from '../types';
import { ClinicVaultLogo3D } from './ClinicVaultLogo3D';
import { ClinicVaultLogoSVG } from './ClinicVaultLogoSVG';

interface ModelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onModelChanged?: (task: 'radiology' | 'summarize', model: string) => void;
  selectedVllmModel?: string;
  onSelectVllmModel?: (model: string) => void;
}

export const ModelManagerModal: React.FC<ModelManagerModalProps> = ({
  isOpen,
  onClose,
  onModelChanged,
  selectedVllmModel,
  onSelectVllmModel,
}) => {
  const [hardware, setHardware] = useState<HardwareSpecs | null>(null);
  const [modelsData, setModelsData] = useState<ModelListResponse | null>(null);
  const [activeCategory, setActiveCategory] = useState<'All' | 'Vision' | 'Medical' | 'Lightweight'>('All');
  const [isLoading, setIsLoading] = useState(false);
  const [pullStatus, setPullStatus] = useState<ModelPullStatus | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [selectedRadModel, setSelectedRadModel] = useState<string>('llava:latest');
  const [selectedSumModel, setSelectedSumModel] = useState<string>('qwen2.5-coder:1.5b');
  const [activeSaveMsg, setActiveSaveMsg] = useState<string | null>(null);
  const [dropdownDownloadModel, setDropdownDownloadModel] = useState<string>('llama3.2-vision:11b');
  const [isCustomModel, setIsCustomModel] = useState<boolean>(false);
  const [customModelInput, setCustomModelInput] = useState<string>('');
  const [isStartingOllama, setIsStartingOllama] = useState<boolean>(false);
  const [isStoppingOllama, setIsStoppingOllama] = useState<boolean>(false);
  const [currentVllmModel, setCurrentVllmModel] = useState<string>(
    () => selectedVllmModel || localStorage.getItem('clinixvault_vllm_model') || 'Mistral-7B-Instruct (AWQ 4-bit) + Outlines CFG'
  );
  const [preloadStatus, setPreloadStatus] = useState<{ [modelId: string]: 'idle' | 'preloading' | 'ready' | 'failed' }>({});

  useEffect(() => {
    if (selectedVllmModel) {
      setCurrentVllmModel(selectedVllmModel);
    }
  }, [selectedVllmModel]);

  const handleVllmSelect = (modelId: string) => {
    setCurrentVllmModel(modelId);
    localStorage.setItem('clinixvault_vllm_model', modelId);
    if (onSelectVllmModel) {
      onSelectVllmModel(modelId);
    }
  };

  // Load hardware and models on mount or when opened
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [hw, models] = await Promise.all([
        clinixApi.getHardwareSpecs(),
        clinixApi.getModelList(),
      ]);
      setHardware(hw);
      setModelsData(models);
      if (models.active_radiology_model) {
        setSelectedRadModel(models.active_radiology_model);
      }
      if (models.active_summarize_model) {
        setSelectedSumModel(models.active_summarize_model);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    (async () => {
      try {
        const [hw, models] = await Promise.all([
          clinixApi.getHardwareSpecs(),
          clinixApi.getModelList(),
        ]);
        if (!isCancelled) {
          setHardware(hw);
          setModelsData(models);
          if (models.active_radiology_model) setSelectedRadModel(models.active_radiology_model);
          if (models.active_summarize_model) setSelectedSumModel(models.active_summarize_model);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  // Poll download progress when a download is in progress
  useEffect(() => {
    if (!isPulling) return;
    const interval = setInterval(async () => {
      try {
        const st = await clinixApi.getModelPullStatus();
        setPullStatus(st);
        if (st.status === 'completed') {
          setIsPulling(false);
          await loadData();
        } else if (st.status === 'failed') {
          setIsPulling(false);
        }
      } catch {
        // ignore polling errors
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [isPulling]);

  const handleStartDownload = async (modelTag: string) => {
    try {
      setIsPulling(true);
      setPullStatus({
        status: 'downloading',
        model: modelTag,
        progress_pct: 0,
        completed_bytes: 0,
        total_bytes: 0,
        message: `Initiating download of ${modelTag}...`,
      });
      await clinixApi.pullModel(modelTag);
    } catch (err: unknown) {
      setIsPulling(false);
      setPullStatus({
        status: 'failed',
        model: modelTag,
        progress_pct: 0,
        completed_bytes: 0,
        total_bytes: 0,
        message: err instanceof Error ? err.message : 'Download failed to start',
      });
    }
  };

  const handleSaveActiveModels = async () => {
    try {
      await clinixApi.setActiveModel('radiology', selectedRadModel);
      await clinixApi.setActiveModel('summarize', selectedSumModel);
      setActiveSaveMsg('Active models updated successfully!');
      if (onModelChanged) {
        onModelChanged('radiology', selectedRadModel);
        onModelChanged('summarize', selectedSumModel);
      }
      setTimeout(() => setActiveSaveMsg(null), 3000);
      await loadData();
    } catch (err: unknown) {
      setActiveSaveMsg(err instanceof Error ? err.message : 'Failed to update active models');
      setTimeout(() => setActiveSaveMsg(null), 4000);
    }
  };

  const handleStartOllama = async () => {
    setIsStartingOllama(true);
    try {
      const res = await clinixApi.startOllamaDaemon();
      setActiveSaveMsg(res.message);
      await loadData();
    } catch (err: unknown) {
      setActiveSaveMsg(err instanceof Error ? err.message : 'Failed to start Ollama runner');
    } finally {
      setIsStartingOllama(false);
      setTimeout(() => setActiveSaveMsg(null), 4000);
    }
  };

  const handleStopOllama = async () => {
    setIsStoppingOllama(true);
    try {
      const res = await clinixApi.stopOllamaDaemon();
      setActiveSaveMsg(res.message);
      await loadData();
    } catch (err: unknown) {
      setActiveSaveMsg(err instanceof Error ? err.message : 'Failed to stop Ollama runner');
    } finally {
      setIsStoppingOllama(false);
      setTimeout(() => setActiveSaveMsg(null), 4000);
    }
  };

  const handlePreloadModel = async (modelId: string) => {
    setPreloadStatus((prev) => ({ ...prev, [modelId]: 'preloading' }));
    try {
      const res = await clinixApi.runOllamaModel(modelId);
      setPreloadStatus((prev) => ({ ...prev, [modelId]: 'ready' }));
      setActiveSaveMsg(res.message);
    } catch (err: unknown) {
      setPreloadStatus((prev) => ({ ...prev, [modelId]: 'failed' }));
      setActiveSaveMsg(err instanceof Error ? err.message : `Failed to preload ${modelId}`);
    } finally {
      setTimeout(() => setActiveSaveMsg(null), 4000);
    }
  };

  if (!isOpen) return null;

  const catalog = modelsData?.available_models || [];
  const installed = modelsData?.installed_models || [];
  const fineTunedModels = modelsData?.fine_tuned_models || [];

  const filteredCatalog = catalog.filter((item: PretrainedCatalogModel) => {
    if (activeCategory === 'Vision') return item.is_vision;
    if (activeCategory === 'Medical') return item.category.includes('Medical') || item.category.includes('Clinical');
    if (activeCategory === 'Lightweight') return item.category.includes('Lightweight');
    return true;
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-900/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 flex items-center justify-center shrink-0">
                <ClinicVaultLogo3D 
                  size={44} 
                  interactive={true} 
                  enablePulseOnClick={true} 
                  enableBloom={false} 
                />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  Model Manager & Pretrained Hub
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800">
                    Air-Gapped Local
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Manage local Ollama models, download medical VLMs/LLMs, and monitor Mac Unified Memory
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadData}
                disabled={isLoading}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Refresh Model List & Telemetry"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-clinical-blue' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-7 space-y-7">
            {/* 1. Hardware Auto-Detection & Ollama Telemetry Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Chip Specs */}
              <div className="p-4.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-indigo-500" />
                    Host Architecture
                  </span>
                  <span className="font-mono text-[10px] uppercase bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded font-bold">
                    {hardware?.platform || 'darwin'}
                  </span>
                </div>
                <div className="text-base font-extrabold text-slate-900 dark:text-white">
                  {hardware?.chip || 'Apple Silicon M-Series'}
                </div>
                <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                  {hardware?.accelerator || 'Apple Metal (MPS)'} • {hardware?.cpu_cores_physical || 8} Cores
                </div>
              </div>

              {/* Memory Specs with Live Meter */}
              <div className="p-4.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-emerald-500" />
                    {hardware?.memory_type || 'Unified Memory'}
                  </span>
                  <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    {hardware?.memory_percent || 0}% Used
                  </span>
                </div>
                <div className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                  {hardware?.used_memory_gb || 0} GB <span className="text-xs font-normal text-slate-500">/ {hardware?.total_memory_gb || 16} GB</span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-indigo-600 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, hardware?.memory_percent || 0)}%` }}
                  />
                </div>
              </div>

              {/* Ollama Daemon Status */}
              <div className="p-4.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-amber-500" />
                    Local Model Runner
                  </span>
                  {modelsData?.ollama_status?.connected ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold">
                      <Wifi className="w-3.5 h-3.5" /> Online
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-rose-500 font-bold">
                      <WifiOff className="w-3.5 h-3.5" /> Offline
                    </span>
                  )}
                </div>
                <div className="text-base font-extrabold text-slate-900 dark:text-white flex items-center justify-between">
                  <span>Ollama {modelsData?.ollama_status?.version ? `v${modelsData.ollama_status.version}` : 'Local Server'}</span>
                  {!modelsData?.ollama_status?.connected ? (
                    <button
                      onClick={handleStartOllama}
                      disabled={isStartingOllama}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-clinical-blue hover:bg-blue-700 text-white flex items-center gap-1 cursor-pointer transition-all shadow-sm disabled:opacity-50"
                      title="Launch 'ollama serve' in background"
                    >
                      <Play className={`w-3 h-3 ${isStartingOllama ? 'animate-spin' : ''}`} />
                      <span>{isStartingOllama ? 'Starting...' : 'Start Ollama'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleStopOllama}
                      disabled={isStoppingOllama}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1 cursor-pointer transition-all shadow-sm disabled:opacity-50"
                      title="Stop background Ollama daemon and dismiss macOS top bar icon"
                    >
                      <Square className={`w-3 h-3 ${isStoppingOllama ? 'animate-spin' : ''}`} />
                      <span>{isStoppingOllama ? 'Stopping...' : 'Stop Ollama'}</span>
                    </button>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-mono truncate">
                  {modelsData?.ollama_status?.host || 'http://127.0.0.1:11434'}
                </div>
              </div>
            </div>

            {/* Quick Download Model from Dropdown Section */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-slate-800/80 dark:to-indigo-950/40 border border-blue-200/80 dark:border-indigo-800/60 space-y-3.5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Download className="w-4 h-4 text-clinical-blue" />
                    Download Model from Dropdown
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Select any pretrained medical or general model from the dropdown to download into local Ollama runtime
                  </p>
                </div>
                {pullStatus && pullStatus.status === 'downloading' && (
                  <span className="text-xs font-mono font-bold text-clinical-blue flex items-center gap-1.5 self-start sm:self-auto bg-white/90 dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Downloading: {pullStatus.progress_pct}%
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="flex-1 flex gap-2">
                  <select
                    value={dropdownDownloadModel}
                    onChange={(e) => {
                      setDropdownDownloadModel(e.target.value);
                      setIsCustomModel(e.target.value === 'custom');
                    }}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-medium focus:ring-2 focus:ring-clinical-blue outline-none shadow-sm cursor-pointer"
                  >
                    <optgroup label="Vision-Language Models (Radiology)">
                      {catalog.filter((m: PretrainedCatalogModel) => m.is_vision).map((m: PretrainedCatalogModel) => {
                        const isInst = installed.some((i: InstalledModel) => i.id === m.tag);
                        return (
                          <option key={m.tag} value={m.tag}>
                            {m.displayName} ({m.size}) {isInst ? '✓ Installed' : ''}
                          </option>
                        );
                      })}
                    </optgroup>
                    <optgroup label="Medical & Clinical LLMs (Summarization & Scribe)">
                      {catalog.filter((m: PretrainedCatalogModel) => !m.is_vision && (m.category.includes('Medical') || m.category.includes('Clinical'))).map((m: PretrainedCatalogModel) => {
                        const isInst = installed.some((i: InstalledModel) => i.id === m.tag);
                        return (
                          <option key={m.tag} value={m.tag}>
                            {m.displayName} ({m.size}) {isInst ? '✓ Installed' : ''}
                          </option>
                        );
                      })}
                    </optgroup>
                    <optgroup label="Lightweight Edge SLMs">
                      {catalog.filter((m: PretrainedCatalogModel) => !m.is_vision && m.category.includes('Lightweight')).map((m: PretrainedCatalogModel) => {
                        const isInst = installed.some((i: InstalledModel) => i.id === m.tag);
                        return (
                          <option key={m.tag} value={m.tag}>
                            {m.displayName} ({m.size}) {isInst ? '✓ Installed' : ''}
                          </option>
                        );
                      })}
                    </optgroup>
                    <option value="custom">Other / Custom Model Name...</option>
                  </select>

                  {isCustomModel && (
                    <input
                      type="text"
                      placeholder="e.g. gemma2:9b"
                      value={customModelInput}
                      onChange={(e) => setCustomModelInput(e.target.value)}
                      className="w-48 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-clinical-blue font-mono"
                    />
                  )}
                </div>

                <button
                  onClick={() => {
                    const target = isCustomModel ? customModelInput.trim() : dropdownDownloadModel;
                    if (target) handleStartDownload(target);
                  }}
                  disabled={isPulling || (isCustomModel && !customModelInput.trim())}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white hover:bg-clinical-blue dark:hover:bg-clinical-blue text-white dark:text-slate-900 dark:hover:text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {isPulling && pullStatus?.model === (isCustomModel ? customModelInput : dropdownDownloadModel)
                      ? 'Downloading...'
                      : installed.some((i: InstalledModel) => i.id === (isCustomModel ? customModelInput : dropdownDownloadModel))
                      ? 'Re-download'
                      : 'Download Model'}
                  </span>
                </button>
              </div>
            </div>

            {/* 2. Download In-Progress Banner */}
            {pullStatus && pullStatus.status === 'downloading' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 rounded-2xl bg-blue-50/90 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 space-y-2.5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ClinicVaultLogoSVG size={26} isLoading={true} />
                    <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-2">
                      Downloading Model: <span className="font-mono text-clinical-blue">{pullStatus.model}</span>
                    </span>
                  </div>
                  <span className="text-xs font-mono font-extrabold text-clinical-blue">
                    {pullStatus.progress_pct}%
                  </span>
                </div>
                <div className="w-full bg-blue-200/80 dark:bg-blue-900 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-clinical-blue rounded-full transition-all duration-300"
                    style={{ width: `${pullStatus.progress_pct}%` }}
                  />
                </div>
                <div className="text-[11px] text-blue-700 dark:text-blue-300 font-mono flex items-center justify-between">
                  <span>{pullStatus.message}</span>
                  {pullStatus.total_bytes > 0 && (
                    <span>
                      {(pullStatus.completed_bytes / (1024 * 1024)).toFixed(0)} MB / {(pullStatus.total_bytes / (1024 * 1024)).toFixed(0)} MB
                    </span>
                  )}
                </div>
              </motion.div>
            )}

            {/* Download Failed Banner */}
            {pullStatus && pullStatus.status === 'failed' && (
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between">
                <span>Download error: {pullStatus.message}</span>
                <button
                  onClick={() => setPullStatus(null)}
                  className="font-bold underline cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* 3. Active Model Configuration Selectors */}
            <div className="p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-clinical-blue" />
                    Active Pipeline Configuration
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Select which local model executes radiology vision interpretation and clinical text summarization
                  </p>
                </div>
                <button
                  onClick={handleSaveActiveModels}
                  className="px-4 py-2 rounded-xl bg-clinical-blue hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-clinical-blue/20 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Active Pipeline</span>
                </button>
              </div>

              {activeSaveMsg && (
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {activeSaveMsg}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Active Radiology VLM */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Scan className="w-3.5 h-3.5 text-indigo-500" />
                    Active Radiology VLM (Image Interpretation)
                  </label>
                  <select
                    value={selectedRadModel}
                    onChange={(e) => setSelectedRadModel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-medium focus:ring-2 focus:ring-clinical-blue outline-none"
                  >
                    {fineTunedModels.length > 0 && (
                      <optgroup label="⭐ Sovereign Fine-Tuned Research Models (Local Checkpoints)">
                        {fineTunedModels.map((m: FineTunedModel) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName} (F1: {(m.benchmark_scores.clinical_f1 * 100).toFixed(1)}% | Halluc: {m.benchmark_scores.hallucination_rate})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Edge & General Models">
                      {installed.map((m: InstalledModel) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.size_formatted}) {m.is_vision ? '• Vision Capable' : ''}
                        </option>
                      ))}
                      {!installed.some((i) => i.id === 'llava:latest') && (
                        <option value="llava:latest">llava:latest (Fallback VLM)</option>
                      )}
                    </optgroup>
                  </select>
                </div>

                {/* Active Summarize LLM */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-500" />
                    Active Summarizer & Scribe LLM
                  </label>
                  <select
                    value={selectedSumModel}
                    onChange={(e) => setSelectedSumModel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-medium focus:ring-2 focus:ring-clinical-blue outline-none"
                  >
                    {installed.length === 0 ? (
                      <option value="qwen2.5-coder:1.5b">qwen2.5-coder:1.5b (Default LLM)</option>
                    ) : (
                      installed.map((m: InstalledModel) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.size_formatted}) {m.parameter_size ? `• ${m.parameter_size}` : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* 3.1 Local vLLM Foundation Weights & Accelerated Engine */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-slate-50 dark:from-indigo-950/40 dark:via-purple-950/20 dark:to-slate-900 border border-indigo-200/80 dark:border-indigo-800/60 space-y-3.5 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-500" />
                    Local vLLM Foundation Weights & Accelerated Engine
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    High-throughput batched vLLM inference backend with Outlines CFG JSON Schema validation
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                  <Zap className="w-3.5 h-3.5 text-indigo-500" />
                  Kernel: AWQ 4-Bit SIMD
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    id: 'Mistral-7B-Instruct (AWQ 4-bit) + Outlines CFG',
                    name: 'Mistral-7B-Instruct (AWQ 4-bit) + Outlines CFG',
                    desc: 'Sub-20ms token latency • Deterministic JSON Schema Outlines enforcer',
                    badge: 'Production Default',
                    vram: '4.8 GB VRAM',
                  },
                  {
                    id: 'BioMistral-7B-Q8',
                    name: 'BioMistral-7B-Q8',
                    desc: 'Full 8-bit Quantized • Pretrained on PubMed Central clinical texts',
                    badge: 'Clinical Scribe',
                    vram: '7.6 GB VRAM',
                  },
                  {
                    id: 'Meditron-70B-AWQ',
                    name: 'Meditron-70B-AWQ',
                    desc: 'Clinical benchmark leader • High-precision multi-specialty diagnostic reasoning',
                    badge: 'High Reasoning',
                    vram: '38 GB VRAM',
                  },
                  {
                    id: 'Qwen2-VL-7B-Instruct',
                    name: 'Qwen2-VL-7B-Instruct',
                    desc: 'Native high-resolution radiology vision-language multimodal foundation model',
                    badge: 'Multimodal VLM',
                    vram: '9.4 GB VRAM',
                  },
                ].map((m) => {
                  const isSelected = currentVllmModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleVllmSelect(m.id)}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-indigo-600 bg-white dark:bg-slate-800 ring-2 ring-indigo-500/30 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700/80 bg-white/70 dark:bg-slate-800/50 hover:border-indigo-300 dark:hover:border-indigo-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                          {m.name}
                        </span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          {m.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">{m.desc}</p>
                      <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 font-semibold">{m.vram}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3.5 Sovereign Fine-Tuned Research Models (ICLR 2026 Champion Series) */}
            <div className="space-y-4 pt-1">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    Sovereign Fine-Tuned Research Models (ICLR 2026 SOTA Series)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Trained & validated on MIMIC-CXR test cohort. Stored locally in <code className="font-mono text-indigo-600 dark:text-indigo-400">clinixvault/checkpoints/</code> — zero cloud egress or HuggingFace downloads needed.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                  Air-Gapped Sovereign Weights
                </div>
              </div>

              {fineTunedModels.length === 0 ? (
                <div className="p-5 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 text-center">
                  Loading fine-tuned research models from local checkpoints...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fineTunedModels.map((m: FineTunedModel) => {
                    const isRadActive = selectedRadModel === m.id;
                    const f1Pct = (m.benchmark_scores.clinical_f1 * 100).toFixed(1);
                    return (
                      <div
                        key={m.id}
                        className={`p-5 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                          isRadActive
                            ? 'bg-gradient-to-br from-indigo-50/90 via-blue-50/40 to-white dark:from-indigo-950/40 dark:via-slate-800/80 dark:to-slate-900 border-clinical-blue shadow-lg ring-2 ring-clinical-blue/20'
                            : 'bg-white dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <div>
                          {/* Header row */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="font-bold text-sm text-slate-900 dark:text-white">
                                  {m.name}
                                </span>
                                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                                  {m.parameter_size}
                                </span>
                              </div>
                              <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                {m.technique}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap">
                              {m.highlight}
                            </span>
                          </div>

                          <p className="text-xs text-slate-600 dark:text-slate-400 mb-3.5 line-clamp-2">
                            {m.description}
                          </p>

                          {/* Benchmark Metrics Grid */}
                          <div className="grid grid-cols-4 gap-2 mb-4 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-center font-mono">
                            <div>
                              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-sans font-bold">Clinical F1</div>
                              <div className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">{f1Pct}%</div>
                            </div>
                            <div>
                              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-sans font-bold">Recall</div>
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">{m.benchmark_scores.chexpert_recall}</div>
                            </div>
                            <div>
                              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-sans font-bold">Halluc.</div>
                              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{m.benchmark_scores.hallucination_rate}</div>
                            </div>
                            <div>
                              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-sans font-bold">Latency</div>
                              <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-0.5">{m.benchmark_scores.latency_ms}ms</div>
                            </div>
                          </div>
                        </div>

                        {/* Card Footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700/80 text-xs">
                          <span className="text-[10px] text-slate-400 font-mono truncate max-w-[170px]" title={m.adapter_path}>
                            {m.adapter_path.split('/').pop()}
                          </span>
                          <button
                            onClick={async () => {
                              setSelectedRadModel(m.id);
                              try {
                                await clinixApi.setActiveModels(m.id, selectedSumModel);
                                if (onModelChanged) onModelChanged('radiology', m.id);
                                setActiveSaveMsg(`Active radiology model set to ${m.name}`);
                                setTimeout(() => setActiveSaveMsg(null), 3000);
                              } catch {
                                // fallback
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                              isRadActive
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                                : 'bg-slate-100 dark:bg-slate-700 hover:bg-clinical-blue hover:text-white text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {isRadActive ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Active VLM</span>
                              </>
                            ) : (
                              <>
                                <Zap className="w-3.5 h-3.5" />
                                <span>Select Model</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Installed Models List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-indigo-500" />
                  Currently Installed Edge Models ({installed.length})
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  Local Storage: Ollama + models/
                </span>
              </div>

              {installed.length === 0 ? (
                <div className="p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500">
                  No local models detected. Select a model below to download.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {installed.map((m: InstalledModel) => {
                    const isRadActive = selectedRadModel === m.id;
                    const isSumActive = selectedSumModel === m.id;
                    return (
                      <div
                        key={m.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          isRadActive || isSumActive
                            ? 'bg-blue-50/50 dark:bg-blue-950/40 border-clinical-blue/60 shadow-sm'
                            : 'bg-white dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate max-w-[170px]" title={m.name}>
                            {m.name}
                          </span>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {m.size_formatted}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mb-3">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 font-mono">
                            {m.parameter_size}
                          </span>
                          {m.is_vision && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 font-bold">
                              Vision VLM
                            </span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 font-mono uppercase">
                            {m.format}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700 text-[11px]">
                          <div className="flex items-center gap-1">
                            {isRadActive && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold">
                                Rad Active
                              </span>
                            )}
                            {isSumActive && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[9px] font-bold">
                                Scribe Active
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handlePreloadModel(m.id)}
                              disabled={preloadStatus[m.id] === 'preloading'}
                              className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Preload weights into active RAM/VRAM with 10-minute keep-alive"
                            >
                              <Play className={`w-2.5 h-2.5 ${preloadStatus[m.id] === 'preloading' ? 'animate-spin' : 'text-emerald-600'}`} />
                              <span>
                                {preloadStatus[m.id] === 'preloading'
                                  ? 'Preloading...'
                                  : preloadStatus[m.id] === 'ready'
                                  ? 'Preloaded'
                                  : 'Preload'}
                              </span>
                            </button>
                            <button
                              onClick={() => {
                                if (m.is_vision) setSelectedRadModel(m.id);
                                else setSelectedSumModel(m.id);
                              }}
                              className="text-clinical-blue hover:underline font-bold cursor-pointer"
                            >
                              Set Pipeline
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 5. Curated Pretrained Model Catalog for 1-Click Download */}
            <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Download className="w-4 h-4 text-clinical-blue" />
                    Pretrained Medical & General Catalog (1-Click Local Download)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    High-accuracy models curated for radiology imaging, clinical summarization, and ambient scribing
                  </p>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                  {(['All', 'Vision', 'Medical', 'Lightweight'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        activeCategory === cat
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCatalog.map((model: PretrainedCatalogModel) => {
                  const isInstalled = model.is_installed || installed.some((i: InstalledModel) => i.id === model.tag);
                  const isCurrentlyDownloading = pullStatus?.status === 'downloading' && pullStatus?.model === model.tag;

                  return (
                    <div
                      key={model.id}
                      className="p-5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 shadow-sm flex flex-col justify-between space-y-3.5 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div>
                            <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                              {model.displayName}
                            </h4>
                            <span className="font-mono text-[11px] text-slate-400">
                              {model.tag}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {model.size}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-2 leading-relaxed">
                          {model.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5 mt-3">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-clinical-blue font-bold">
                            {model.category}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 font-mono">
                            {model.parameter_size}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold">
                            For {model.recommended_for.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between">
                        {isInstalled ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Installed</span>
                          </div>
                        ) : isCurrentlyDownloading ? (
                          <div className="flex items-center gap-1.5 text-xs text-clinical-blue font-bold">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>{pullStatus?.progress_pct}%</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleStartDownload(model.tag)}
                            disabled={isPulling}
                            className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:bg-clinical-blue dark:hover:bg-clinical-blue dark:hover:text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download ({model.size})</span>
                          </button>
                        )}

                        {isInstalled && (
                          <button
                            onClick={() => {
                              if (model.is_vision) {
                                setSelectedRadModel(model.tag);
                              } else {
                                setSelectedSumModel(model.tag);
                              }
                            }}
                            className="text-xs font-bold text-clinical-blue hover:underline cursor-pointer"
                          >
                            Set Active
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-7 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              Models download directly into local Ollama storage for zero cloud latency and zero egress.
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold transition-all cursor-pointer"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
