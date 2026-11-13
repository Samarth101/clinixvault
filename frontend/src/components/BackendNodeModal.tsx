import React, { useState, useEffect } from 'react';
import {
  Cloud,
  Laptop,
  Check,
  Copy,
  RefreshCw,
  Zap,
  Activity,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { failoverAgent, FailoverState } from '../services/nodeFailoverAgent';
import { getApiBaseUrl } from '../services/api';

interface BackendNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: (url: string) => void;
}

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
    setLocalPing({ testing: true });

    if (failoverState.colabUrl) {
      void pingSingle(failoverState.colabUrl).then((r) => setColabPing({ testing: false, ok: r.ok, latency: r.latency, accel: r.accel }));
    } else {
      setColabPing({ testing: false, ok: false, latency: 0, accel: 'Paste Colab Tunnel URL below' });
    }

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

  const handleConnect = (url: string, targetType: 'colab' | 'local') => {
    const clean = url.trim().replace(/\/+$/, '');
    if (!clean) return;

    if (targetType === 'colab') {
      failoverAgent.setColabUrl(clean);
      void failoverAgent.switchToColab('Manual Switch to Colab GPU', clean);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-5 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-clinical-blue/10 dark:bg-clinical-blue/20 text-clinical-blue flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5" />
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
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                }`}>
                  {failoverState.activeNode === 'colab' && 'COLAB GPU ACTIVE'}
                  {failoverState.activeNode === 'local' && 'LOCAL EDGE ACTIVE'}
                  {failoverState.activeNode === 'offline' && 'ALL OFFLINE'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Priority routing: Google Colab GPU (P1) → Sovereign Local Edge (P2).
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
                  Colab (P1) → Local Edge (P2). Background auto-promotes when Colab connects.
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
                          P2 Edge / Docker (127.0.0.1:8000)
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-[280px]">
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
                    {localPing.testing ? 'Pinging...' : localPing.ok ? `${localPing.latency}ms • ${localPing.accel}` : 'Offline / Unreachable'}
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
                placeholder="https://xxxx.trycloudflare.com or http://127.0.0.1:8000"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-clinical-blue"
              />
              <button
                type="button"
                onClick={testCustomPing}
                disabled={customPing.testing}
                className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                {customPing.testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                <span>Test Ping</span>
              </button>
            </div>
            {customPing.message && (
              <div className={`text-[11px] flex items-center justify-between font-mono pt-1 ${customPing.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                <span>{customPing.message}</span>
                {customPing.ok && (
                  <button
                    type="button"
                    onClick={() => {
                      const clean = customInputUrl.trim().replace(/\/+$/, '');
                      if (clean.includes('127.0.0.1') || clean.includes('localhost')) {
                        handleConnect(clean, 'local');
                      } else {
                        handleConnect(clean, 'colab');
                      }
                    }}
                    className="ml-2 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer"
                  >
                    Connect Now
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Pulse Telemetry Log Collapsible */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowHeartbeatLogs(!showHeartbeatLogs)}
              className="w-full p-3 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-clinical-blue" />
                <span>Live Continuous Pulse Logs ({failoverState.recentHeartbeats.length})</span>
              </div>
              {showHeartbeatLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showHeartbeatLogs && (
              <div className="p-3 bg-white dark:bg-slate-900 max-h-48 overflow-y-auto space-y-1.5 font-mono text-[10px]">
                {failoverState.recentHeartbeats.length === 0 ? (
                  <div className="text-slate-400 text-center py-2">No heartbeats recorded yet.</div>
                ) : (
                  failoverState.recentHeartbeats.map((hb, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-none">
                      <div className="flex items-center gap-2 truncate">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          hb.status === 'optimal' ? 'bg-emerald-500' : hb.status === 'degraded' ? 'bg-amber-500' : 'bg-rose-500'
                        }`} />
                        <span className="font-bold uppercase text-[9px] text-slate-500">[{hb.node}]</span>
                        <span className="text-slate-600 dark:text-slate-300 truncate max-w-[260px]">{hb.url}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-500">{hb.latencyMs}ms</span>
                        <span className="text-[9px] text-slate-400">{new Date(hb.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <div className="text-[11px] text-slate-500">
            {failoverState.activeNode === 'colab' && '🟢 High-Performance Tesla T4 Cloud Acceleration active.'}
            {failoverState.activeNode === 'local' && '🟢 Sovereign Local Edge Appliance active on 127.0.0.1:8000.'}
            {failoverState.activeNode === 'offline' && '🔴 All configured endpoints offline.'}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={() => {
                const clean = customInputUrl.trim().replace(/\/+$/, '');
                if (!clean) return;
                if (clean.includes('127.0.0.1') || clean.includes('localhost')) {
                  handleConnect(clean, 'local');
                } else {
                  handleConnect(clean, 'colab');
                }
              }}
              className="px-4 py-2 rounded-xl bg-clinical-blue hover:bg-clinical-blue-dark text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save & Connect</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
