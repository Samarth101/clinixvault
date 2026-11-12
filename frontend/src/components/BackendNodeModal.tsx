import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Server, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ArrowRight, 
  Zap, 
  Laptop,
  Cloud,
  X,
  Copy,
  Check,
  Globe,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { getApiBaseUrl } from '../services/api';
import { failoverAgent, FailoverState } from '../services/nodeFailoverAgent';

interface BackendNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: (url: string) => void;
}

const DEFAULT_RENDER_URL = 'https://clinixvault-backend.onrender.com';
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:8000';

export const BackendNodeModal: React.FC<BackendNodeModalProps> = ({
  isOpen,
  onClose,
  onConnected,
}) => {
  const [failoverState, setFailoverState] = useState<FailoverState>(() => failoverAgent.getState());
  const [currentUrl, setCurrentUrl] = useState<string>(() => getApiBaseUrl());
  const [customInputUrl, setCustomInputUrl] = useState<string>(() => getApiBaseUrl());
  const [copied, setCopied] = useState(false);
  const [showHeartbeatLogs, setShowHeartbeatLogs] = useState(false);

  // Per-node ping states
  const [colabPing, setColabPing] = useState<{ testing: boolean; latency?: number; ok?: boolean; accel?: string }>({ testing: false });
  const [renderPing, setRenderPing] = useState<{ testing: boolean; latency?: number; ok?: boolean; accel?: string }>({ testing: false });
  const [localPing, setLocalPing] = useState<{ testing: boolean; latency?: number; ok?: boolean; accel?: string }>({ testing: false });

  // Custom ping
  const [customPing, setCustomPing] = useState<{ testing: boolean; latency?: number; ok?: boolean; message?: string }>({ testing: false });

  useEffect(() => {
    const unsub = failoverAgent.subscribe((state) => {
      setFailoverState(state);
      setCurrentUrl(state.currentUrl);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (isOpen) {
      const active = getApiBaseUrl();
      setCurrentUrl(active);
      setCustomInputUrl(active);
      void pingAllNodes();
    }
  }, [isOpen]);

  const pingSingle = async (url: string) => {
    const target = (url || '').trim().replace(/\/+$/, '');
    if (!target) return { ok: false, latency: 0, accel: 'No URL configured' };
    const t0 = performance.now();
    try {
      const res = await fetch(`${target}/api/v1/health`, {
        headers: { Authorization: 'Bearer vault-local-admin-token' },
      });
      const latency = Math.round(performance.now() - t0);
      if (res.ok) {
        const data = await res.json();
        const accel = data?.telemetry?.accelerator || data?.hardware?.accelerator || 'Online';
        return { ok: true, latency, accel };
      }
      return { ok: false, latency, accel: `HTTP ${res.status}` };
    } catch {
      return { ok: false, latency: 0, accel: 'Unreachable' };
    }
  };

  const pingAllNodes = async () => {
    setColabPing({ testing: true });
    setRenderPing({ testing: true });
    setLocalPing({ testing: true });

    if (failoverState.colabUrl) {
      void pingSingle(failoverState.colabUrl).then((r) => setColabPing({ testing: false, ok: r.ok, latency: r.latency, accel: r.accel }));
    } else {
      setColabPing({ testing: false, ok: false, latency: 0, accel: 'Paste Colab Tunnel URL below' });
    }

    void pingSingle(failoverState.renderUrl).then((r) => setRenderPing({ testing: false, ok: r.ok, latency: r.latency, accel: r.accel }));
    void pingSingle(failoverState.localUrl).then((r) => setLocalPing({ testing: false, ok: r.ok, latency: r.latency, accel: r.accel }));
  };

  const testCustomPing = async () => {
    setCustomPing({ testing: true });
    const clean = customInputUrl.trim().replace(/\/+$/, '');
    const r = await pingSingle(clean);
    setCustomPing({
      testing: false,
      ok: r.ok,
      latency: r.latency,
      message: r.ok ? `Connected (${r.latency}ms) • ${r.accel}` : `Connection failed: ${r.accel}`,
    });
    if (r.ok && clean.includes('trycloudflare.com')) {
      failoverAgent.setColabUrl(clean);
      setColabPing({ testing: false, ok: true, latency: r.latency, accel: r.accel });
    }
  };

  const handleConnect = (url: string, targetType: 'colab' | 'render' | 'local') => {
    const clean = url.trim().replace(/\/+$/, '');
    if (!clean) return;

    if (targetType === 'colab') {
      failoverAgent.setColabUrl(clean);
      void failoverAgent.switchToColab('Manual Switch to Colab GPU', clean);
    } else if (targetType === 'render') {
      failoverAgent.switchToRender('Manual Switch to Render Cloud Gateway', clean);
    } else {
      failoverAgent.switchToLocal('Manual Switch to Local Edge Node');
    }

    setCurrentUrl(clean);
    onConnected?.(clean);
    onClose();
  };

  const handleCopyCurrent = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-6 flex flex-col gap-4 max-h-[92vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-start justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-clinical-blue/10 dark:bg-clinical-blue/20 text-clinical-blue">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Multi-Node Backend & Inference Telemetry
                  </h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    failoverState.activeNode === 'colab'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'
                      : failoverState.activeNode === 'local'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                      : failoverState.activeNode === 'render'
                      ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                  }`}>
                    {failoverState.activeNode === 'colab' && 'COLAB GPU ACTIVE'}
                    {failoverState.activeNode === 'local' && 'LOCAL EDGE ACTIVE'}
                    {failoverState.activeNode === 'render' && 'RENDER CLOUD ACTIVE'}
                    {failoverState.activeNode === 'offline' && 'ALL OFFLINE'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Priority routing: Google Colab GPU (P1) → Sovereign Local Edge (P2) → Render Cloud Gateway (P3).
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 [scrollbar-width:thin]">
            {/* Active Gateway Bar */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>Active Gateway Endpoint</span>
                <button
                  type="button"
                  onClick={handleCopyCurrent}
                  className="flex items-center gap-1 text-[11px] font-semibold text-clinical-blue hover:underline cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy URL'}</span>
                </button>
              </div>
              <div className="font-mono text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 break-all select-all flex items-center justify-between">
                <span>{currentUrl}</span>
                <span className="ml-2 font-mono text-[10px] text-slate-500 shrink-0">
                  Latency: {failoverState.latencyMs}ms
                </span>
              </div>
            </div>

            {/* Automated Failover Toggle */}
            <div className="p-3 rounded-2xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-clinical-blue/10 dark:bg-clinical-blue/20 text-clinical-blue flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Tiered Dynamic Failover Agent</span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 dark:bg-blue-900 text-clinical-blue">
                      Active
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Colab (P1) → Local Edge (P2) → Render Gateway (P3). Background auto-promotes when higher tier connects.
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={failoverState.isAutoFailoverEnabled}
                onChange={(e) => failoverAgent.setAutoFailoverEnabled(e.target.checked)}
                className="w-5 h-5 text-clinical-blue rounded accent-clinical-blue cursor-pointer"
              />
            </div>

            {/* Provider Nodes Cards Matrix */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
                  Configured Compute & Gateway Nodes:
                </span>
                <button
                  type="button"
                  onClick={pingAllNodes}
                  className="text-[11px] text-clinical-blue hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh All Latencies</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {/* 1. Colab GPU Cloud Tunnel (P1) */}
                <div className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 ${
                  failoverState.activeNode === 'colab'
                    ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-500 shadow-xs'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300">
                        <Cloud className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                          <span>Google Colab GPU Tunnel</span>
                          <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 px-1.5 py-0.2 rounded">
                            P1 High-Perf GPU (Tesla T4)
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate max-w-[280px]" title={failoverState.colabUrl || 'Not configured'}>
                          {failoverState.colabUrl ? failoverState.colabUrl : 'No tunnel configured. Paste trycloudflare URL below.'}
                        </div>
                      </div>
                    </div>
                    {failoverState.activeNode === 'colab' && (
                      <span className="text-[9px] font-black text-amber-600 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded-full uppercase">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] gap-2">
                    {failoverState.colabUrl ? (
                      <>
                        <span className="font-mono text-[10px] text-slate-500 truncate max-w-[200px]">
                          {colabPing.testing ? 'Pinging...' : colabPing.ok ? `${colabPing.latency}ms • ${colabPing.accel}` : 'Offline / Tunnel closed'}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              failoverAgent.setColabUrl('');
                              setColabPing({ testing: false });
                            }}
                            className="px-2 py-1 rounded-lg text-slate-400 hover:text-rose-500 text-[10px] font-semibold transition-colors cursor-pointer"
                            title="Clear Colab Tunnel"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConnect(failoverState.colabUrl, 'colab')}
                            className={`px-3 py-1 rounded-lg text-white text-[11px] font-bold transition-all cursor-pointer shadow-xs ${
                              failoverState.activeNode === 'colab'
                                ? 'bg-emerald-600 hover:bg-emerald-700'
                                : 'bg-amber-500 hover:bg-amber-600'
                            }`}
                          >
                            {failoverState.activeNode === 'colab' ? 'Active' : 'Use Colab GPU'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="w-full flex items-center gap-2">
                        <input
                          type="text"
                          value={customInputUrl}
                          onChange={(e) => setCustomInputUrl(e.target.value)}
                          placeholder="Paste https://*.trycloudflare.com here..."
                          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const clean = customInputUrl.trim().replace(/\/+$/, '');
                            if (!clean) return;
                            handleConnect(clean, 'colab');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-xs flex items-center gap-1"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Connect</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* 2. Sovereign Local Edge Node (P2) */}
                  <div className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 ${
                    failoverState.activeNode === 'local'
                      ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-500 shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300">
                          <Laptop className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                            <span>Local Edge Node</span>
                            <span className="text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 rounded">
                              P2 Edge / MPS
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate max-w-[150px]">
                            {failoverState.localUrl}
                          </div>
                        </div>
                      </div>
                      {failoverState.activeNode === 'local' && (
                        <span className="text-[9px] font-black text-emerald-600 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-full uppercase">
                          Active
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                      <span className="font-mono text-[10px] text-slate-500">
                        {localPing.testing ? 'Pinging...' : localPing.ok ? `${localPing.latency}ms • MPS/CPU` : 'Offline / Unreachable'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleConnect(failoverState.localUrl, 'local')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-all cursor-pointer shadow-xs"
                      >
                        Use Local
                      </button>
                    </div>
                  </div>

                  {/* 3. Render Cloud Gateway (P3) */}
                  <div className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 ${
                    failoverState.activeNode === 'render'
                      ? 'bg-sky-50/90 dark:bg-sky-950/40 border-sky-500 shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-300">
                          <Globe className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                            <span>Render Cloud Gateway</span>
                            <span className="text-[9px] font-bold bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 px-1.5 py-0.2 rounded">
                              P3 Hosted Gateway
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate max-w-[150px]" title={failoverState.renderUrl}>
                            {failoverState.renderUrl}
                          </div>
                        </div>
                      </div>
                      {failoverState.activeNode === 'render' && (
                        <span className="text-[9px] font-black text-sky-600 bg-sky-100 dark:bg-sky-950 px-2 py-0.5 rounded-full uppercase">
                          Active
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                      <span className="font-mono text-[10px] text-slate-500">
                        {renderPing.testing ? 'Pinging...' : renderPing.ok ? `${renderPing.latency}ms • Live` : 'Standby'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleConnect(failoverState.renderUrl, 'render')}
                        className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold transition-all cursor-pointer shadow-xs"
                      >
                        Use Render
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Custom URL Input & Ping Tester */}
            <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200 block">
                Paste Colab Cloudflare Tunnel or Custom Gateway URL:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInputUrl}
                  onChange={(e) => setCustomInputUrl(e.target.value)}
                  placeholder="https://xxxx.trycloudflare.com or https://clinixvault-backend.onrender.com"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-clinical-blue"
                />
                <button
                  type="button"
                  onClick={testCustomPing}
                  disabled={customPing.testing}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {customPing.testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-500" />}
                  <span>Test Ping</span>
                </button>
              </div>

              {customPing.message && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-1 gap-2">
                  <div className={`text-[11px] font-mono flex items-center gap-1.5 ${
                    customPing.ok ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-rose-500'
                  }`}>
                    {customPing.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                    <span>{customPing.message}</span>
                  </div>
                  {customPing.ok && (
                    <button
                      type="button"
                      onClick={() => {
                        const clean = customInputUrl.trim().replace(/\/+$/, '');
                        if (clean.includes('onrender.com')) {
                          handleConnect(clean, 'render');
                        } else if (clean.includes('127.0.0.1') || clean.includes('localhost')) {
                          handleConnect(clean, 'local');
                        } else {
                          handleConnect(clean, 'colab');
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-300" />
                      <span>Connect & Activate Node Now</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Live Heartbeat Logs Toggle */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowHeartbeatLogs(!showHeartbeatLogs)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              >
                <span>Live Continuous Pulse Logs ({failoverState.recentHeartbeats.length})</span>
                {showHeartbeatLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showHeartbeatLogs && (
                <div className="p-3 bg-white dark:bg-slate-900 space-y-1.5 max-h-40 overflow-y-auto font-mono text-[10px]">
                  {failoverState.recentHeartbeats.length === 0 ? (
                    <div className="text-slate-400 italic">No heartbeats logged yet...</div>
                  ) : (
                    failoverState.recentHeartbeats.map((log, i) => (
                      <div key={i} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            log.status === 'optimal' ? 'bg-emerald-500' : log.status === 'degraded' ? 'bg-amber-500' : 'bg-rose-500'
                          }`} />
                          <span className="uppercase font-bold text-slate-600 dark:text-slate-400">[{log.node}]</span>
                          <span className="text-slate-500 truncate max-w-[200px]">{log.url}</span>
                        </div>
                        <div className="text-right">
                          <span className={`font-bold ${
                            log.latencyMs > 1200 ? 'text-amber-600' : 'text-emerald-600'
                          }`}>
                            {log.latencyMs}ms
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const clean = customInputUrl.trim().replace(/\/+$/, '');
                if (!clean) return;
                if (clean.includes('onrender.com')) {
                  handleConnect(clean, 'render');
                } else if (clean.includes('127.0.0.1') || clean.includes('localhost')) {
                  handleConnect(clean, 'local');
                } else {
                  handleConnect(clean, 'colab');
                }
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-clinical-blue hover:bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
            >
              <span>Save & Connect Custom Node</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
