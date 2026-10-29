import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Lock, 
  AlertTriangle, 
  Flame, 
  CheckCircle2, 
  Key, 
  FileText,
  RefreshCw,
  HardDrive
} from 'lucide-react';
import { ClinicVaultLogo3D } from './ClinicVaultLogo3D';

interface ProtocolZeroModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProtocolZeroModal: React.FC<ProtocolZeroModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [overrideKey, setOverrideKey] = useState('');
  const [isSealed, setIsSealed] = useState(true);
  const [wipeStatus, setWipeStatus] = useState<string | null>(null);

  const handleSimulateProtocolZero = () => {
    setWipeStatus('executing');
    setTimeout(() => {
      setWipeStatus('success');
    }, 1800);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
          {/* Backdrop Click */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            onClick={onClose}
          />

          <motion.div 
            initial={{ opacity: 0, scale: 0.94, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 15 }}
            transition={{ type: "spring", stiffness: 450, damping: 30 }}
            className="bg-white rounded-[32px] max-w-2xl w-full border border-rose-200 shadow-[0_30px_90px_rgba(244,63,94,0.22)] overflow-hidden relative z-10"
          >
            {/* Header with High-Visibility Emergency Badge */}
            <div className="bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 px-8 py-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 flex items-center justify-center shrink-0">
                  <ClinicVaultLogo3D 
                    size={48} 
                    interactive={true} 
                    enablePulseOnClick={true} 
                    enableBloom={false} 
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-extrabold tracking-tight">Air-Gap Vault Safety</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-white text-rose-700 tracking-wider shadow-sm">
                      Protocol Zero
                    </span>
                  </div>
                  <p className="text-xs text-rose-100 font-medium mt-0.5">
                    Hardware Tamper Evident & Zero-Egress Physical Guard
                  </p>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-white" />
              </motion.button>
            </div>

            {/* Content Body */}
            <div className="p-8 space-y-6">
              {/* Status Matrix */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 shadow-sm">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    WAN Physical Cut
                  </div>
                  <div className="text-[11px] text-emerald-700 font-mono">
                    Port 0: Disconnected (0 outbound)
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200/90 shadow-sm">
                  <div className="flex items-center gap-2 text-blue-800 text-xs font-bold mb-1">
                    <Lock className="w-4 h-4 text-blue-600" />
                    AES-256 NVMe Lock
                  </div>
                  <div className="text-[11px] text-blue-700 font-mono">
                    Hardware FIPS 140-3 Sealed
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/90 shadow-sm">
                  <div className="flex items-center gap-2 text-amber-800 text-xs font-bold mb-1">
                    <HardDrive className="w-4 h-4 text-amber-600" />
                    Ledger Sync
                  </div>
                  <div className="text-[11px] text-amber-700 font-mono">
                    Block #8841 SHA-256 Valid
                  </div>
                </div>
              </div>

              {/* Explanation */}
              <div className="p-4.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
                <strong className="text-slate-900 block mb-1">Emergency Protocol Description:</strong>
                Protocol Zero immediately halts all vLLM token synthesizers, unmounts the encrypted temporary memory ramdisks, flushes uncommitted patient audio buffers to zero-fill, and writes an immutable cryptographic audit record to the physical local flash.
              </div>

              {/* Execution Box */}
              <div className="p-6 rounded-[24px] border-2 border-dashed border-rose-200 bg-rose-50/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-rose-900 flex items-center gap-2">
                      <Flame className="w-4 h-4 text-rose-600" />
                      Trigger Protocol Zero Override
                    </h3>
                    <p className="text-xs text-rose-700/80 mt-0.5">
                      Requires CMIO authorization key or emergency physical dongle
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-rose-800">VAULT LOCK</span>
                    <button
                      onClick={() => setIsSealed(!isSealed)}
                      className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                        isSealed ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                          isSealed ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      placeholder="Enter CMIO HSM Emergency Key (e.g., CV-ZERO-AUTH)"
                      value={overrideKey}
                      onChange={(e) => setOverrideKey(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white rounded-xl border border-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono shadow-inner"
                    />
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    disabled={wipeStatus === 'executing'}
                    onClick={handleSimulateProtocolZero}
                    className="px-4.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-md shadow-rose-600/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {wipeStatus === 'executing' ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Zeroizing...
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Execute Wipe
                      </>
                    )}
                  </motion.button>
                </div>

                {wipeStatus === 'success' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Protocol Zero Complete: Volatile buffers sanitized. Hardware audit block #8842 written to local flash.
                  </motion.div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-8 py-4 border-t border-slate-100 flex items-center justify-between">
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-mono">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Compliance: HIPAA §164.312(a)(2)(iv) Emergency Access Mode
              </div>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={onClose}
                className="px-5 py-2 text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Dismiss Panel
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
