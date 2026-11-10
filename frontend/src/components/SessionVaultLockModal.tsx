import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Lock, 
  ShieldCheck, 
  KeyRound, 
  Delete, 
  AlertCircle, 
  UserCheck, 
  LogOut,
  RefreshCw
} from 'lucide-react';
import { useVaultLock } from '../context/VaultLockContext';
import { useAuth } from '../context/useAuth';
import { ClinicVaultLogoSVG } from './ClinicVaultLogoSVG';

export const SessionVaultLockModal: React.FC = () => {
  const { isVaultLocked, unlockVault, lockReason, failedAttempts, quickPin } = useVaultLock();
  const { currentUser, openLoginModal } = useAuth();

  const [enteredPin, setEnteredPin] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);

  // Clear inputs whenever lock opens
  useEffect(() => {
    if (isVaultLocked) {
      setEnteredPin('');
      setErrorMessage(null);
    }
  }, [isVaultLocked]);

  const handleDigit = useCallback(
    (digit: string) => {
      setErrorMessage(null);
      if (enteredPin.length < 4) {
        const next = enteredPin + digit;
        setEnteredPin(next);

        // Auto-submit when 4th digit entered
        if (next.length === 4) {
          const ok = unlockVault(next);
          if (!ok) {
            setErrorMessage('Invalid PIN. Please try again or re-authenticate via Active Directory.');
            setIsShaking(true);
            setTimeout(() => {
              setIsShaking(false);
              setEnteredPin('');
            }, 600);
          }
        }
      }
    },
    [enteredPin, unlockVault]
  );

  const handleBackspace = useCallback(() => {
    setErrorMessage(null);
    setEnteredPin((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setErrorMessage(null);
    setEnteredPin('');
  }, []);

  // Keyboard support for digits and backspace
  useEffect(() => {
    if (!isVaultLocked) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isVaultLocked, handleDigit, handleBackspace, handleClear]);

  if (!isVaultLocked) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-3xl overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          className={`relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200/90 dark:border-slate-800 shadow-2xl p-7 text-slate-800 dark:text-slate-100 my-8 ${
            isShaking ? 'animate-shake' : ''
          }`}
        >
          {/* Top Shield Emblem */}
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-3">
              <div className="w-16 h-16 rounded-3xl bg-blue-500/10 dark:bg-blue-500/20 text-clinical-blue flex items-center justify-center border border-blue-500/30 shadow-lg shadow-blue-500/10">
                <ClinicVaultLogoSVG size={36} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-md border-2 border-white dark:border-slate-900">
                <Lock className="w-3.5 h-3.5" />
              </div>
            </div>

            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Session Vault Auto-Locked
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
              {lockReason}
            </p>

            <div className="mt-2.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              <span>In-flight notes preserved safely in IndexedDB</span>
            </div>
          </div>

          {/* Clinician Profile Badge */}
          <div className="my-5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-clinical-blue text-white flex items-center justify-center font-bold text-sm shadow-sm">
                {currentUser.avatarInitials || 'MD'}
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  {currentUser.role} • {currentUser.department}
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-mono font-bold text-clinical-blue dark:text-blue-400 block">
                {currentUser.npi}
              </span>
              <span className="text-[9px] text-slate-400">
                {currentUser.badgeId}
              </span>
            </div>
          </div>

          {/* PIN Input Dots */}
          <div className="space-y-4">
            <div className="flex justify-center items-center gap-4 py-2">
              {[0, 1, 2, 3].map((index) => {
                const filled = index < enteredPin.length;
                return (
                  <motion.div
                    key={index}
                    animate={{ scale: filled ? 1.25 : 1 }}
                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                      filled
                        ? 'bg-clinical-blue border-clinical-blue shadow-md shadow-blue-500/30'
                        : 'border-slate-300 dark:border-slate-600 bg-transparent'
                    }`}
                  />
                );
              })}
            </div>

            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-semibold text-center"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMessage}</span>
              </motion.div>
            )}

            {/* Virtual Numpad */}
            <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigit(digit)}
                  className="w-full h-12 rounded-2xl bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-lg font-bold transition-all active:scale-95 cursor-pointer border border-slate-200/60 dark:border-slate-700/60 shadow-xs"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="w-full h-12 rounded-2xl bg-slate-100/50 dark:bg-slate-800/40 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-500 dark:text-slate-400 text-xs font-bold transition-all active:scale-95 cursor-pointer border border-slate-200/40 dark:border-slate-700/40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handleDigit('0')}
                className="w-full h-12 rounded-2xl bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-lg font-bold transition-all active:scale-95 cursor-pointer border border-slate-200/60 dark:border-slate-700/60 shadow-xs"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="w-full h-12 rounded-2xl bg-slate-100/50 dark:bg-slate-800/40 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all active:scale-95 cursor-pointer border border-slate-200/40 dark:border-slate-700/40"
                title="Backspace"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 pt-1">
              {quickPin === '1234' ? (
                <>Default Quick PIN: <span className="font-mono font-bold text-slate-600 dark:text-slate-300">1234</span> (Configurable in Settings)</>
              ) : (
                <span className="font-semibold text-clinical-blue dark:text-blue-400">Custom Quick PIN Active</span>
              )}
            </p>
          </div>

          {/* Footer alternative actions */}
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                openLoginModal();
              }}
              className="flex items-center gap-1.5 text-clinical-blue hover:underline font-semibold cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Switch Identity / Active Directory</span>
            </button>

            <span className="text-[10px] font-mono text-slate-400">
              HIPAA §164.312
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
