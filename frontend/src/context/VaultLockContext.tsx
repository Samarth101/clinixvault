import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { hashSha256, DEFAULT_PIN_HASH } from '../services/vaultSecurity';

export interface VaultLockContextType {
  isVaultLocked: boolean;
  autoLockMinutes: number;
  quickPin: string;
  failedAttempts: number;
  lastLockedAt: number | null;
  lockVault: (reason?: string) => void;
  unlockVault: (pin: string) => boolean;
  setAutoLockMinutes: (minutes: number) => void;
  setQuickPin: (newPin: string) => void;
  lockReason: string;
}

const VaultLockContext = createContext<VaultLockContextType | undefined>(undefined);

const VAULT_LOCK_TIMEOUT_KEY = 'clinixvault_vault_lock_timeout_min';
const VAULT_QUICK_PIN_KEY = 'clinixvault_vault_quick_pin'; // legacy plaintext
const VAULT_PIN_HASH_KEY = 'clinixvault_vault_pin_hash';
const VAULT_LOCKED_STATE_KEY = 'clinixvault_vault_locked_state';
const DEFAULT_AUTO_LOCK_MINUTES = 15;

export const VaultLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  const [autoLockMinutes, setAutoLockMinutesState] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_AUTO_LOCK_MINUTES;
    const saved = localStorage.getItem(VAULT_LOCK_TIMEOUT_KEY);
    return saved !== null ? parseInt(saved, 10) : DEFAULT_AUTO_LOCK_MINUTES;
  });

  const [pinHash, setPinHash] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_PIN_HASH;
    const savedHash = localStorage.getItem(VAULT_PIN_HASH_KEY);
    if (savedHash && savedHash.length === 64) return savedHash;

    // Migrate legacy plaintext PIN if present
    const legacyPlain = localStorage.getItem(VAULT_QUICK_PIN_KEY);
    if (legacyPlain && legacyPlain.trim()) {
      const migrated = hashSha256(legacyPlain.trim());
      localStorage.setItem(VAULT_PIN_HASH_KEY, migrated);
      localStorage.removeItem(VAULT_QUICK_PIN_KEY);
      return migrated;
    }

    return DEFAULT_PIN_HASH;
  });

  const [isVaultLocked, setIsVaultLocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(VAULT_LOCKED_STATE_KEY) === 'true';
  });

  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lastLockedAt, setLastLockedAt] = useState<number | null>(null);
  const [lockReason, setLockReason] = useState<string>('Terminal Inactivity Auto-Lock (§164.312 Protection)');

  const inactivityTimerRef = useRef<any>(null);
  const lastActivityTimeRef = useRef<number>(Date.now());

  const lockVault = useCallback((reason?: string) => {
    setIsVaultLocked(true);
    setLockReason(reason || 'Terminal Inactivity Auto-Lock (§164.312 Protection)');
    setLastLockedAt(Date.now());
    if (typeof window !== 'undefined') {
      localStorage.setItem(VAULT_LOCKED_STATE_KEY, 'true');
      window.dispatchEvent(
        new CustomEvent('clinixvault:vault_locked', {
          detail: { reason: reason || 'Inactivity', timestamp: Date.now() },
        })
      );
    }
  }, []);

  const unlockVault = useCallback(
    (pinAttempt: string): boolean => {
      const clean = pinAttempt.trim();
      const attemptHash = hashSha256(clean);

      // Authenticate against SHA-256 hash
      if (attemptHash === pinHash) {
        setIsVaultLocked(false);
        setFailedAttempts(0);
        lastActivityTimeRef.current = Date.now();
        if (typeof window !== 'undefined') {
          localStorage.removeItem(VAULT_LOCKED_STATE_KEY);
          window.dispatchEvent(new CustomEvent('clinixvault:vault_unlocked'));
        }
        return true;
      }

      setFailedAttempts((prev) => prev + 1);
      return false;
    },
    [pinHash]
  );

  const setAutoLockMinutes = useCallback((minutes: number) => {
    setAutoLockMinutesState(minutes);
    if (typeof window !== 'undefined') {
      localStorage.setItem(VAULT_LOCK_TIMEOUT_KEY, String(minutes));
    }
  }, []);

  const setQuickPin = useCallback((newPin: string) => {
    const clean = newPin.trim();
    if (!clean) return;
    const newHash = hashSha256(clean);
    setPinHash(newHash);
    if (typeof window !== 'undefined') {
      localStorage.setItem(VAULT_PIN_HASH_KEY, newHash);
      localStorage.removeItem(VAULT_QUICK_PIN_KEY); // purge plaintext
    }
  }, []);

  // Inactivity tracking with race-condition prevention & visibilitychange check
  useEffect(() => {
    if (autoLockMinutes <= 0 || isVaultLocked) {
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    const timeoutMs = autoLockMinutes * 60 * 1000;

    const handleActivity = () => {
      if (isVaultLocked) return;
      const now = Date.now();
      const elapsed = now - lastActivityTimeRef.current;
      // If inactivity threshold was already reached while unattended, lock immediately!
      if (elapsed >= timeoutMs) {
        lockVault(`Inactivity Timeout (${autoLockMinutes} minutes exceeded)`);
      } else {
        lastActivityTimeRef.current = now;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isVaultLocked) {
        const elapsed = Date.now() - lastActivityTimeRef.current;
        if (elapsed >= timeoutMs) {
          lockVault(`Inactivity Timeout (${autoLockMinutes} minutes exceeded)`);
        }
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, handleActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);

    inactivityTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityTimeRef.current;
      if (elapsed >= timeoutMs && !isVaultLocked) {
        lockVault(`Inactivity Timeout (${autoLockMinutes} minutes exceeded)`);
      }
    }, 5000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [autoLockMinutes, isVaultLocked, lockVault]);

  // Global keyboard shortcut to instantly lock: Ctrl+Alt+L or Cmd+Alt+L
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        lockVault('Manual Clinician Lock (Hotkey shortcut)');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lockVault]);

  return (
    <VaultLockContext.Provider
      value={{
        isVaultLocked,
        autoLockMinutes,
        quickPin: pinHash === DEFAULT_PIN_HASH ? '1234' : '••••',
        failedAttempts,
        lastLockedAt,
        lockVault,
        unlockVault,
        setAutoLockMinutes,
        setQuickPin,
        lockReason,
      }}
    >
      {children}
    </VaultLockContext.Provider>
  );
};

export function useVaultLock(): VaultLockContextType {
  const context = useContext(VaultLockContext);
  if (!context) {
    throw new Error('useVaultLock must be used within a VaultLockProvider');
  }
  return context;
}
