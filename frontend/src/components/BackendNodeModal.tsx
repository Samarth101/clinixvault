import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Server, 
  Wifi, 
  WifiOff, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ArrowRight, 
  Zap, 
  ExternalLink,
  Laptop,
  Cloud,
  X,
  Copy,
  Check
} from 'lucide-react';
import { getApiBaseUrl, setApiBaseUrl } from '../services/api';

interface BackendNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: (url: string) => void;
}

export const BackendNodeModal: React.FC<BackendNodeModalProps> = ({
  isOpen,
  onClose,
  onConnected,
}) => {
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200/80 dark:border-slate-800 shadow-2xl p-7 text-slate-800 dark:text-slate-100 overflow-hidden"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                isColabActive ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-clinical-blue'
              }`}>
                {isColabActive ? <Cloud className="w-5 h-5" /> : <Server className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Backend Gateway Connection</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    pingStatus.success
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}>
                    {pingStatus.success ? 'ONLINE' : pingStatus.testing ? 'PINGING...' : 'DISCONNECTED'}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Dynamically route all frontend clinical APIs, DICOM VLM, and Whisper WebSocket stream.
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

          <div className="py-5 space-y-5">
            {/* Current Active Connection Status Card */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Active Endpoint (localStorage & runtime)
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
                <span className="ml-2 px-2 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-800 font-bold text-slate-500 shrink-0">
                  {isColabActive ? 'Colab Cloudflare' : 'Local Node'}
                </span>
              </div>
              {/* Ping output badge */}
              <div className="flex items-center gap-2 pt-1 text-xs">
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
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
                Quick Select Backend Runtime:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setInputUrl('http://127.0.0.1:8000');
                    void testPing('http://127.0.0.1:8000');
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    inputUrl === 'http://127.0.0.1:8000'
                      ? 'bg-blue-50/90 dark:bg-blue-950/40 border-clinical-blue shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <Laptop className="w-4 h-4 text-clinical-blue mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">Local Monolith</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">http://127.0.0.1:8000</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const colabUrl = 'https://consistent-testimonials-will-subscribers.trycloudflare.com';
                    setInputUrl(colabUrl);
                    void testPing(colabUrl);
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    inputUrl.includes('trycloudflare.com')
                      ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-500 shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <Cloud className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">Active Colab GPU Node</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-[180px]">
                      Tesla T4 • Cloudflare
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Manual URL Input Field */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
                Paste New Cloudflare / Remote Backend URL:
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
              <p className="text-[10px] text-slate-400">
                Paste any new Cloudflare URL generated by Google Colab. The frontend will immediately reconnect and update WebSocket streaming.
              </p>
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
