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
  Activity
} from 'lucide-react';
import { getApiBaseUrl, setApiBaseUrl } from '../services/api';
import { failoverAgent, FailoverState } from '../services/nodeFailoverAgent';

interface BackendNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: (url: string) => void;
}

const ACTIVE_COLAB_URL = 'https://barry-cake-sugar-elizabeth.trycloudflare.com';
const LOCAL_NODE_URL = 'http://127.0.0.1:8000';

export const BackendNodeModal: React.FC<BackendNodeModalProps> = ({
  isOpen,
  onClose,
  onConnected,
}) => {
  const [failoverState, setFailoverState] = useState<FailoverState>(() => failoverAgent.getState());
  const [currentUrl, setCurrentUrl] = useState<string>(() => getApiBaseUrl());
  const [inputUrl, setInputUrl] = useState<string>(() => getApiBaseUrl());
  const [pingStatus, setPingStatus] = useState<{
    testing: boolean;
    success?: boolean;
    latencyMs?: number;
    message?: string;
    details?: any;
  }>({ testing: false });
  const [copied, setCopied] = useState(false);
  const [showHeartbeatLogs, setShowHeartbeatLogs] = useState(false);

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
      setInputUrl(active);
      void testPing(active);
    }
  }, [isOpen]);

  const testPing = async (urlToTest: string) => {
    const target = (urlToTest || '').trim().replace(/\/+$/, '');
    if (!target) {
      setPingStatus({ testing: false, success: false, message: 'URL cannot be empty' });
      return;
    }
    setPingStatus({ testing: true });
    const t0 = performance.now();
    try {
      const res = await fetch(`${target}/api/v1/health`, {
        headers: { Authorization: 'Bearer vault-local-admin-token' },
      });
      const latency = Math.round(performance.now() - t0);
      if (res.ok) {
        const data = await res.json();
        const accel = data?.telemetry?.accelerator || data?.hardware?.accelerator || 'Online';
        setPingStatus({
          testing: false,
          success: true,
          latencyMs: latency,
          message: `Connected (${latency}ms) • ${accel}`,
          details: data,
        });
      } else {
        setPingStatus({
          testing: false,
          success: false,
          message: `Gateway responded with HTTP ${res.status}`,
        });
      }
    } catch (err: any) {
      setPingStatus({
        testing: false,
        success: false,
        message: err?.message || 'Connection refused or tunnel offline',
      });
    }
  };

  const handleApply = (url: string) => {
    const clean = url.trim().replace(/\/+$/, '');
    setApiBaseUrl(clean);
    setCurrentUrl(clean);
    if (clean.includes('127.0.0.1') || clean.includes('localhost')) {
      failoverAgent.setLocalUrl(clean);
    } else {
      failoverAgent.setColabUrl(clean);
    }
    onConnected?.(clean);
    onClose();
  };

  const handleCopyCurrent = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const isColabActive = currentUrl.includes('trycloudflare.com') || currentUrl.includes('colab');

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200/80 dark:border-slate-800 shadow-2xl p-6 sm:p-7 text-slate-800 dark:text-slate-100 overflow-hidden my-8"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                isColabActive ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-600'
              }`}>
                {isColabActive ? <Cloud className="w-5 h-5" /> : <Server className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Dual-Node Backend Telemetry</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    failoverState.activeNode === 'colab'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      : failoverState.activeNode === 'local'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}>
                    {failoverState.activeNode === 'colab' ? 'COLAB GPU ONLINE' : failoverState.activeNode === 'local' ? 'LOCAL EDGE ACTIVE' : 'OFFLINE'}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Automated failover between Google Colab GPU cloud tunnel and local edge inference.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="py-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Current Active Connection Status Card */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Active Gateway Endpoint
                </span>
                <button
                  onClick={handleCopyCurrent}
                  className="flex items-center gap-1 text-[11px] font-semibold text-clinical-blue hover:underline cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy URL'}</span>
                </button>
              </div>
              <div className="font-mono text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 break-all select-all flex items-center justify-between">
                <span>{currentUrl}</span>
                <span className={`ml-2 px-2 py-0.5 text-[10px] rounded font-bold shrink-0 ${
                  isColabActive ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                }`}>
                  {isColabActive ? 'Colab Cloudflare' : 'Local Edge Node'}
                </span>
              </div>
              {/* Ping output badge */}
              <div className="flex items-center justify-between pt-1 text-xs">
                {pingStatus.testing ? (
                  <span className="flex items-center gap-1.5 text-slate-500 text-[11px] font-mono">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-clinical-blue" />
                    Pinging endpoint...
                  </span>
                ) : pingStatus.success ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    {pingStatus.message}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-[11px] font-mono font-semibold">
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                    {pingStatus.message}
                  </span>
                )}

                <span className="text-[11px] font-mono text-slate-400">
                  Pulse Latency: {failoverState.latencyMs}ms
                </span>
              </div>
            </div>

            {/* Automated Failover Control Toggle */}
            <div className="p-3.5 rounded-2xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-clinical-blue/10 dark:bg-clinical-blue/20 text-clinical-blue flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Automated Seamless Failover Agent</span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 dark:bg-blue-900 text-clinical-blue">
                      Active
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Triggers local edge fallback if Colab latency &gt;1,200ms or drops 3 heartbeats.
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

            {/* Quick Preset Buttons */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
                Seamless Dual-Node Selector:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setInputUrl(LOCAL_NODE_URL);
                    void testPing(LOCAL_NODE_URL);
                    void failoverAgent.executeFailoverToLocal('Manual Clinician Node Switch');
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    currentUrl === LOCAL_NODE_URL
                      ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-500 shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <Laptop className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                      <span>Local Edge Node</span>
                      {currentUrl === LOCAL_NODE_URL && (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900 px-1.5 py-0.2 rounded">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">{LOCAL_NODE_URL}</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setInputUrl(ACTIVE_COLAB_URL);
                    void testPing(ACTIVE_COLAB_URL);
                    void failoverAgent.switchToColab('Manual Clinician Node Switch', ACTIVE_COLAB_URL);
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    currentUrl.includes('trycloudflare.com')
                      ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-500 shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <Cloud className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                      <span>Colab GPU Cloud Tunnel</span>
                      {currentUrl.includes('trycloudflare.com') && (
                        <span className="text-[9px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900 px-1.5 py-0.2 rounded">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-[180px]">
                      {ACTIVE_COLAB_URL}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Manual URL Input Field */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
                Paste Custom Remote Backend / Cloudflare URL:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://xxxx.trycloudflare.com"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue/50"
                />
                <button
                  type="button"
                  onClick={() => testPing(inputUrl)}
                  disabled={pingStatus.testing}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 border border-slate-200/70 dark:border-slate-700"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${pingStatus.testing ? 'animate-spin' : ''}`} />
                  <span>Test Ping</span>
                </button>
              </div>
            </div>

            {/* Continuous Heartbeat Diagnostics Collapsible */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowHeartbeatLogs(!showHeartbeatLogs)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-clinical-blue" />
                  <span>Continuous Heartbeat Monitor Logs ({failoverState.recentHeartbeats.length})</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {showHeartbeatLogs ? 'Hide ▲' : 'Show ▼'}
                </span>
              </button>

              {showHeartbeatLogs && (
                <div className="p-3 bg-white dark:bg-slate-900 space-y-1.5 max-h-40 overflow-y-auto font-mono text-[10px]">
                  {failoverState.recentHeartbeats.length === 0 ? (
                    <div className="text-slate-400 py-2 text-center">No heartbeats logged yet</div>
                  ) : (
                    failoverState.recentHeartbeats.map((hb, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-1 px-2 rounded bg-slate-50 dark:bg-slate-800/50"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            hb.status === 'optimal'
                              ? 'bg-emerald-500'
                              : hb.status === 'degraded'
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`} />
                          <span className="font-bold uppercase text-slate-700 dark:text-slate-300">
                            {hb.node}
                          </span>
                          <span className="text-slate-400 truncate max-w-[180px]">{hb.url}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-600 dark:text-slate-400">{hb.latencyMs}ms</span>
                          <span className="text-[9px] text-slate-400">
                            {new Date(hb.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => handleApply(inputUrl)}
              className="px-5 py-2.5 rounded-xl bg-clinical-blue hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-2"
            >
              <span>Save & Connect</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
