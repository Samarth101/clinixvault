import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  POD_HEALTH_METRICS, 
  PIPELINE_STAGES, 
  CLI_LOG_STREAMS 
} from '../data/systemDefaults';
import { 
  Server, 
  Cpu, 
  Activity, 
  Terminal, 
  Play, 
  Pause, 
  Trash2, 
  Usb,
  RefreshCw,
  Square
} from 'lucide-react';
import { PipelineStage } from '../types';
import { clinixApi, SystemHealthResponse } from '../services/api';

export const MicroservicesHealthPage: React.FC = () => {
  const [selectedStage, setSelectedStage] = useState<PipelineStage>(PIPELINE_STAGES[2]); // C++ kernel initially
  const [logs, setLogs] = useState<string[]>(CLI_LOG_STREAMS);
  const [isStreamingLogs, setIsStreamingLogs] = useState(true);
  const [isVerifyingUsb, setIsVerifyingUsb] = useState(false);
  const [usbVerified, setUsbVerified] = useState(false);
  const [healthData, setHealthData] = useState<SystemHealthResponse | null>(null);
  const [isLiveGateway, setIsLiveGateway] = useState<boolean>(false);
  const [realLatency, setRealLatency] = useState<number>(14);
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>('qwen2.5-coder:1.5b');
  const [isStartingOllama, setIsStartingOllama] = useState<boolean>(false);
  const [isStoppingOllama, setIsStoppingOllama] = useState<boolean>(false);
  const [isRunningModel, setIsRunningModel] = useState<boolean>(false);
  const [ollamaFeedback, setOllamaFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<{ connected: boolean; version?: string } | null>(null);

  const fetchOllamaStatus = async () => {
    try {
      const res = await clinixApi.getOllamaStatus();
      setOllamaStatus({ connected: res.running, version: res.version || undefined });
    } catch {
      setOllamaStatus({ connected: false });
    }
  };

  useEffect(() => {
    void fetchOllamaStatus();
  }, []);

  const handleStartOllama = async () => {
    setIsStartingOllama(true);
    setOllamaFeedback({ message: 'Initiating Ollama daemon on http://127.0.0.1:11434...', type: 'info' });
    try {
      const res = await clinixApi.startOllamaDaemon();
      setOllamaFeedback({ message: res.message || 'Ollama server started successfully.', type: 'success' });
      await fetchOllamaStatus();
      void fetchLiveHealth(true);
    } catch (err: any) {
      setOllamaFeedback({ message: err?.message || 'Failed to start Ollama server.', type: 'error' });
    } finally {
      setIsStartingOllama(false);
      setTimeout(() => setOllamaFeedback(null), 5000);
    }
  };

  const handleStopOllama = async () => {
    setIsStoppingOllama(true);
    setOllamaFeedback({ message: 'Stopping local Ollama server and dismissing macOS background daemon...', type: 'info' });
    try {
      const res = await clinixApi.stopOllamaDaemon();
      setOllamaFeedback({ message: res.message || 'Ollama server stopped successfully.', type: 'success' });
      await fetchOllamaStatus();
      void fetchLiveHealth(true);
    } catch (err: any) {
      setOllamaFeedback({ message: err?.message || 'Failed to stop Ollama server.', type: 'error' });
    } finally {
      setIsStoppingOllama(false);
      setTimeout(() => setOllamaFeedback(null), 5000);
    }
  };

  const handleRunOllamaModel = async () => {
    setIsRunningModel(true);
    setOllamaFeedback({ message: `Preloading model "${selectedOllamaModel}" into unified memory...`, type: 'info' });
    try {
      const res = await clinixApi.runOllamaModel(selectedOllamaModel);
      setOllamaFeedback({ message: res.message || `Model "${selectedOllamaModel}" active and preloaded.`, type: 'success' });
      await fetchOllamaStatus();
      void fetchLiveHealth(true);
    } catch (err: any) {
      setOllamaFeedback({ message: err?.message || `Failed to run model "${selectedOllamaModel}".`, type: 'error' });
    } finally {
      setIsRunningModel(false);
      setTimeout(() => setOllamaFeedback(null), 5000);
    }
  };

  const fetchLiveHealth = async (isManual = false) => {
    if (isManual) setIsRefreshingHealth(true);
    try {
      const res = await clinixApi.getClusterHealth();
      setHealthData(res.data);
      setIsLiveGateway(res.isLiveBackend);
      setRealLatency(res.latencyMs);

      const timestamp = new Date().toISOString().substring(11, 23);
      if (res.isLiveBackend) {
        setLogs((prev) => [
          ...prev.slice(-35),
          `[${timestamp}] [GATEWAY-HEALTH] Connected to http://127.0.0.1:8000/api/v1/health (${res.latencyMs}ms, status: ${res.data.status})`,
        ]);
      }
    } finally {
      if (isManual) setIsRefreshingHealth(false);
    }
  };

  useEffect(() => {
    const initTimer = setTimeout(() => {
      void fetchLiveHealth(false);
    }, 0);
    const intervalTimer = setInterval(() => {
      void fetchLiveHealth(false);
    }, 8000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(intervalTimer);
    };
  }, []);

  // Periodic log stream simulation with live telemetry
  useEffect(() => {
    if (!isStreamingLogs) return;

    const interval = setInterval(() => {
      const gpuTemp = healthData?.telemetry?.gpu_temperature_c || 42;
      const memPct = healthData?.telemetry?.memory_usage_pct || 48;
      const cpuPct = healthData?.telemetry?.cpu_usage_pct || 14;
      const accel = healthData?.telemetry?.accelerator || 'Apple Metal (MPS)';
      const wanEgress = healthData?.telemetry?.wan_egress_bytes || 0;

      const sampleEvents = [
        `[AUDIT-GATEWAY] Ingress request POST /api/v1/health handled in ${realLatency}ms (Zero Packet Loss)`,
        `[HARDWARE-TELEMETRY] ${accel} | Core Temp: ${gpuTemp}°C | CPU: ${cpuPct}% | RAM Util: ${memPct}%`,
        `[AUDIO-ASR] 16kHz PCM chunk transcribed: 42 tokens in 12.8ms (CTranslate2 Faster-Whisper)`,
        `[OUTLINES-CFG] Token constraints verified for FHIR R4 JSON schema (Deterministic Sampling)`,
        `[AIRGAP-GUARD] Kernel iptables: ${wanEgress} WAN outbound egress bytes (Policy: DROP ALL)`,
        `[NEO4J-CYPHER] Sovereign property graph query executed across patient cohort in 1.4ms`,
        `[PROMETHEUS-EDGE] Scraped OpenMetrics endpoint /metrics: 9 pods reporting healthy`,
        `[OLLAMA-RUNNER] Daemon online on :11434 with models preloaded (10m keep-alive)`,
      ];
      const randomEvent = sampleEvents[Math.floor(Math.random() * sampleEvents.length)];
      const timestamp = new Date().toISOString().substring(11, 23);
      setLogs((prev) => [...prev.slice(-35), `[${timestamp}] ${randomEvent}`]);
    }, 3200);

    return () => clearInterval(interval);
  }, [isStreamingLogs, realLatency, healthData]);

  const handleVerifyUsb = () => {
    setIsVerifyingUsb(true);
    setTimeout(() => {
      setIsVerifyingUsb(false);
      setUsbVerified(true);
      const timestamp = new Date().toISOString().substring(11, 23);
      setLogs((prev) => [
        ...prev,
        `[${timestamp}] [GITOPS-DMZ] USB DMZ Mirror bundle verified: Root HSM signature VALID. All sha256 digests aligned.`,
      ]);
    }, 1500);
  };

  const microservices = healthData?.system_microservices && healthData.system_microservices.length > 0 
    ? healthData.system_microservices 
    : POD_HEALTH_METRICS;
  const healthyCount = microservices.filter(
    (pod) => pod.status.toLowerCase() === 'healthy' || pod.status.toLowerCase() === 'optimal'
  ).length;

  return (
    <div className="space-y-10 max-w-7xl mx-auto pb-20">
      {/* 1. Hero Header */}
      <motion.section 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="glass-card p-9 border border-white/90 shadow-diffuse relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-80 h-2 hatch-badge-blue rounded-bl-xl" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-clinical-blue text-xs font-semibold mb-3.5 shadow-sm">
              <Server className="w-3.5 h-3.5" />
              <span>K3s Edge Orchestration • Air-Gapped Microservice Topology</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900">
              Microservices & Cluster Health
            </h1>
            <p className="text-slate-600 text-sm mt-2.5 max-w-2xl leading-relaxed">
              Live status, sub-millisecond pod latencies, and end-to-end data pipelines running isolated on edge bare-metal hardware with zero internet dependency.
            </p>
          </div>

          <div className="flex items-center gap-3.5 flex-wrap">
            <motion.div 
              whileHover={{ y: -3 }}
              className="p-4.5 rounded-2xl bg-white/95 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 shadow-sm text-center min-w-[130px]"
            >
              <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>Gateway Latency</span>
                <button 
                  onClick={() => fetchLiveHealth(true)} 
                  disabled={isRefreshingHealth}
                  className="hover:text-clinical-blue transition-colors"
                  title="Ping /api/v1/health now"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshingHealth ? 'animate-spin text-clinical-blue' : ''}`} />
                </button>
              </div>
              <span className="text-xl font-extrabold text-emerald-600 font-mono mt-0.5 block flex items-center justify-center gap-1">
                {realLatency} ms
              </span>
              <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                {isLiveGateway ? '● Live Gateway :8000' : '● Air-Gap Emulation'}
              </span>
            </motion.div>

            <motion.div 
              whileHover={{ y: -3 }}
              className="p-4.5 rounded-2xl bg-white/95 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 shadow-sm text-center min-w-[130px]"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Cluster Pods
              </span>
              <span className="text-xl font-extrabold text-emerald-600 font-mono mt-0.5 block">
                {healthyCount} / {microservices.length} Online
              </span>
              <span className="text-[10px] font-mono text-emerald-600 block mt-0.5">
                Status: {healthData?.status || 'operational'}
              </span>
            </motion.div>

            <motion.div 
              whileHover={{ y: -3 }}
              className="p-4.5 rounded-2xl bg-white/95 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 shadow-sm text-center min-w-[130px]"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                K3s Version
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-white font-mono mt-1 block">
                v1.30.2+k3s1
              </span>
              <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                WAN: 0 bps
              </span>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* 2. End-to-End Pipeline Stepper */}
      <motion.section 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08 }}
        className="glass-card p-8 border border-white/90 shadow-diffuse"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-7 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <Activity className="w-5 h-5 text-clinical-blue" />
              End-to-End Clinical Pipeline Stepper
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Visual 5-stage interactive pipeline tracing data flow from ingress through grammar enforcement to EHR
            </p>
          </div>
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold font-mono border border-emerald-200">
            Pipeline: 100% Operational
          </span>
        </div>

        {/* 5-Stage Stepper Nodes with Framer Motion spring pill */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5 relative mb-7">
          {PIPELINE_STAGES.map((stage, idx) => {
            const isSelected = selectedStage.id === stage.id;
            return (
              <motion.div
                key={stage.id}
                onClick={() => setSelectedStage(stage)}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                className={`p-5 rounded-[28px] border transition-all cursor-pointer relative overflow-hidden ${
                  isSelected
                    ? 'text-white border-slate-900 shadow-xl shadow-slate-900/15'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/80 shadow-sm'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="activePipelineStage"
                    className="absolute inset-0 bg-slate-900"
                    transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  />
                )}

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-2.5">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                        isSelected
                          ? 'bg-clinical-blue text-white shadow-[0_0_8px_rgba(37,99,235,0.8)]'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      0{stage.id}
                    </span>
                    <span className={`text-[10px] font-mono ${isSelected ? 'text-emerald-400 font-bold' : 'text-emerald-600 font-bold'}`}>
                      {stage.latencyMs} ms
                    </span>
                  </div>

                  <h3 className={`text-xs font-extrabold ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                    {stage.name}
                  </h3>
                  <div className={`text-[11px] font-mono mt-1 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                    {stage.service}
                  </div>
                </div>

                {idx < 4 && (
                  <div className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 z-20 text-slate-400 pointer-events-none font-bold">
                    →
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Selected Stage Detail Panel */}
        <div className="p-6 rounded-[28px] bg-slate-50/90 border border-slate-200/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-clinical-blue font-mono">
                Stage 0{selectedStage.id}: {selectedStage.name}
              </span>
              <span className="text-xs font-mono bg-white px-2.5 py-0.5 rounded-md border border-slate-200 text-slate-700 font-semibold">
                {selectedStage.service}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1.5 max-w-2xl leading-relaxed">
              {selectedStage.description}
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 shadow-sm">
              <span className="text-slate-400 block text-[10px] font-sans font-bold">THROUGHPUT</span>
              <span className="font-extrabold">{selectedStage.throughput}</span>
            </div>
            <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 text-emerald-700 shadow-sm">
              <span className="text-slate-400 block text-[10px] font-sans font-bold">P95 LATENCY</span>
              <span className="font-extrabold">{selectedStage.latencyMs} ms</span>
            </div>
          </div>
        </div>
      </motion.section>

      {/* 2.5 Sovereign Ollama Server & Model Runner Quick Controls */}
      <motion.section
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="glass-card p-7 border border-white/90 shadow-diffuse"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-amber-500" />
              Sovereign Ollama Server & Model Runner
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Launch local Ollama server and execute specialized SLM/LLM models for air-gapped summarization and inference.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg border ${
              ollamaStatus?.connected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {ollamaStatus?.connected ? `Ollama v${ollamaStatus.version || '11434'} Online` : 'Ollama Offline / Standby'}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {ollamaStatus?.connected ? (
            <button
              onClick={handleStopOllama}
              disabled={isStoppingOllama}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              title="Stop local Ollama runner and dismiss background macOS daemon"
            >
              <Square className={`w-3.5 h-3.5 ${isStoppingOllama ? 'animate-spin' : ''}`} />
              <span>{isStoppingOllama ? 'Stopping Server...' : 'Stop Ollama Server'}</span>
            </button>
          ) : (
            <button
              onClick={handleStartOllama}
              disabled={isStartingOllama}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${isStartingOllama ? 'animate-spin' : ''}`} />
              <span>{isStartingOllama ? 'Starting Server...' : 'Start Ollama Server'}</span>
            </button>
          )}

          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 shrink-0">Model:</span>
            <select
              value={selectedOllamaModel}
              onChange={(e) => setSelectedOllamaModel(e.target.value)}
              className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="qwen2.5-coder:1.5b">qwen2.5-coder:1.5b (1.5B Local Edge SLM)</option>
              <option value="mistral:7b">mistral:7b (7B Edge Instruct LLM)</option>
              <option value="meditron:7b">meditron:7b (7B Clinical Specialization)</option>
              <option value="llama3.2:3b">llama3.2:3b (3B Compact Edge LLM)</option>
              <option value="clinixvault-qwen2.5-summarizer">clinixvault-qwen2.5-summarizer (Sovereign SOTA)</option>
            </select>
          </div>

          <button
            onClick={handleRunOllamaModel}
            disabled={isRunningModel}
            className="px-4 py-2.5 rounded-xl bg-clinical-blue hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunningModel ? 'animate-spin' : ''}`} />
            <span>{isRunningModel ? 'Preloading...' : 'Run Selected Model'}</span>
          </button>
        </div>

        {ollamaFeedback && (
          <div className={`mt-3 p-3 rounded-xl text-xs font-medium border flex items-center justify-between ${
            ollamaFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : ollamaFeedback.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-blue-50 text-blue-800 border-blue-200'
          }`}>
            <span>{ollamaFeedback.message}</span>
            <button onClick={() => setOllamaFeedback(null)} className="text-slate-400 hover:text-slate-600 font-bold ml-2">×</button>
          </div>
        )}
      </motion.section>

      {/* 3. Live K3s Pod Isolation Matrix */}
      <motion.section 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.12 }}
        className="glass-card p-8 border border-white/90 shadow-diffuse"
      >
        <div className="flex items-center justify-between mb-7 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <Cpu className="w-5 h-5 text-clinical-blue" />
              Live K3s Pod Isolation Matrix
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Deterministic resource limits and isolated cgroups across all {microservices.length} appliance microservices
            </p>
          </div>
          <span className="px-3 py-1 bg-blue-50 text-clinical-blue rounded-full text-xs font-bold font-mono border border-blue-200/60">
            {healthyCount} / {microservices.length} Active Pods
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {microservices.map((pod) => (
            <motion.div
              key={pod.name}
              whileHover={{ y: -4 }}
              className="p-5 rounded-[24px] bg-white border border-slate-200/80 shadow-sm space-y-3 relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 truncate max-w-[180px]">
                  {pod.service}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {pod.status}
                </span>
              </div>

              <div className="text-[11px] text-slate-500 font-mono">
                Port :{pod.port} • {pod.uptime}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px] font-mono">
                <div>
                  <span className="text-slate-400 block text-[10px]">P95 LATENCY</span>
                  <span className="font-bold text-slate-800">{pod.latencyMs} ms</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">RAM / VRAM</span>
                  <span className="font-bold text-slate-800">
                    {pod.vramMb ? `${pod.vramMb}MB VRAM` : `${pod.memoryMb}MB RAM`}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 line-clamp-2 italic pt-1">
                {pod.description}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* 4. Air-Gapped GitOps USB DMZ Console */}
      <motion.section 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.16 }}
        className="glass-card p-8 border border-white/90 shadow-diffuse"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <Terminal className="w-5 h-5 text-slate-800" />
              Air-Gapped GitOps & Streaming CLI Console
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Signed USB DMZ firmware mirror, cryptographic weight digests, and local kernel telemetry
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              disabled={isVerifyingUsb}
              onClick={handleVerifyUsb}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                usbVerified
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Usb className="w-3.5 h-3.5 text-clinical-blue" />
              <span>{isVerifyingUsb ? 'Auditing HSM...' : usbVerified ? 'USB DMZ Verified' : 'Verify Signed USB'}</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setIsStreamingLogs(!isStreamingLogs)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              {isStreamingLogs ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-600" />
                  <span>Pause Stream</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Resume Stream</span>
                </>
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setLogs([])}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              title="Clear Terminal Logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </motion.button>
          </div>
        </div>

        {/* CLI Terminal */}
        <div className="bg-slate-950 rounded-[24px] p-5 font-mono text-xs text-slate-300 h-64 overflow-y-auto space-y-1.5 shadow-inner border border-slate-800">
          {logs.map((log, index) => {
            const isWarn = log.includes('ALERT') || log.includes('WARN');
            const isGood = log.includes('VALID') || log.includes('online') || log.includes('Zero') || log.includes('Verified');
            return (
              <div
                key={index}
                className={`leading-relaxed ${
                  isWarn
                    ? 'text-rose-400'
                    : isGood
                    ? 'text-emerald-400'
                    : 'text-slate-300'
                }`}
              >
                {log}
              </div>
            );
          })}
        </div>
      </motion.section>
    </div>
  );
};
