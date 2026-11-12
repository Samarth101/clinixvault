import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  ShieldCheck, 
  Cpu, 
  Clock, 
  Moon, 
  Sun, 
  Search, 
  Settings, 
  Download,
  ChevronDown,
  LogOut,
  Users,
  Layers,
  Server,
  Cloud,
  Lock,
  RefreshCw,
  WifiOff,
  Zap,
  Globe
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { useVaultLock } from '../context/VaultLockContext';
import { clinixApi } from '../services/api';
import { HardwareSpecs } from '../types';
import { ClinicVaultLogoSVG } from './ClinicVaultLogoSVG';
import { BackendNodeModal } from './BackendNodeModal';
import { formatISTTime } from '../utils/time';
import { failoverAgent, FailoverState } from '../services/nodeFailoverAgent';
import { getCacheTelemetry, syncPendingActions, CacheTelemetry } from '../services/indexedDbCache';

const HeaderClock: React.FC = React.memo(() => {
  const [time, setTime] = useState<string>(() => formatISTTime(new Date(), false));

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(formatISTTime(new Date(), false));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-mono shadow-xs shrink-0 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 text-slate-400" />
      <span className="font-bold">{time}</span>
    </div>
  );
});

interface HeaderBarProps {
  onOpenSafetyModal: () => void;
  onOpenSettings?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenModelManager?: () => void;
  onNavigateLanding?: () => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  onExportNote?: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = React.memo(({ 
  onOpenSafetyModal,
  onOpenSettings,
  onOpenCommandPalette,
  onOpenModelManager,
  onNavigateLanding,
  isDarkMode,
  onToggleTheme,
  onExportNote,
}) => {
  const [hardware, setHardware] = useState<HardwareSpecs | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isBackendModalOpen, setIsBackendModalOpen] = useState(false);
  const [failoverState, setFailoverState] = useState<FailoverState>(() => failoverAgent.getState());
  const [cacheTelemetry, setCacheTelemetry] = useState<CacheTelemetry>({
    draftsCount: 0,
    pendingCount: 0,
    offlineEncountersCount: 0,
    lastSyncedAt: null,
    isSyncing: false,
  });
  const [isSyncingCache, setIsSyncingCache] = useState(false);

  const { currentUser, availableUsers, switchUser, openLoginModal, logout } = useAuth();
  const { lockVault } = useVaultLock();

  const loadSpecs = useCallback(() => {
    clinixApi.getHardwareSpecs().then((specs) => {
      setHardware(specs);
    }).catch(() => {});
  }, []);

  const refreshCacheTelemetry = useCallback(() => {
    getCacheTelemetry().then(setCacheTelemetry).catch(() => {});
  }, []);

  useEffect(() => {
    loadSpecs();
    refreshCacheTelemetry();

    // Subscribe to failover agent updates (delivers within 500ms of state changes)
    const unsubFailover = failoverAgent.subscribe((state) => {
      setFailoverState(state);
      loadSpecs();
    });

    const handleCacheEvent = () => refreshCacheTelemetry();
    window.addEventListener('clinixvault:cache_synced', handleCacheEvent);
    window.addEventListener('clinixvault:pending_queued', handleCacheEvent);
    window.addEventListener('clinixvault:draft_saved', handleCacheEvent);
    window.addEventListener('clinixvault:draft_deleted', handleCacheEvent);

    return () => {
      unsubFailover();
      window.removeEventListener('clinixvault:cache_synced', handleCacheEvent);
      window.removeEventListener('clinixvault:pending_queued', handleCacheEvent);
      window.removeEventListener('clinixvault:draft_saved', handleCacheEvent);
      window.removeEventListener('clinixvault:draft_deleted', handleCacheEvent);
    };
  }, [loadSpecs, refreshCacheTelemetry]);

  const handleSyncPendingCache = async () => {
    setIsSyncingCache(true);
    try {
      await syncPendingActions(clinixApi);
      refreshCacheTelemetry();
    } finally {
      setIsSyncingCache(false);
    }
  };

  const isColabActive = failoverState.activeNode === 'colab';
  const isHfActive = failoverState.activeNode === 'hf_spaces';
  const isRenderActive = failoverState.activeNode === 'render';
  const isLocalActive = failoverState.activeNode === 'local';
  const isOffline = failoverState.activeNode === 'offline';

  return (
    <>
    <header className="w-full glass-card px-2.5 sm:px-4 py-2 mb-3 shrink-0 flex items-center justify-between gap-2 sm:gap-3 border border-white/90 dark:border-slate-800 shadow-diffuse z-40 backdrop-blur-3xl bg-white/85 dark:bg-slate-900/85 transition-all duration-200 min-w-0 overflow-hidden">
      {/* Brand & Clinician Session */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1 mr-2">
        <div 
          onClick={onNavigateLanding}
          className="flex items-center gap-2 cursor-pointer group shrink-0"
          title="Return to Landing Page & Showcase"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-50/80 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 shadow-xs" title="ClinixVault Sovereign Monolith">
            <ClinicVaultLogoSVG size={26} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="hidden md:block text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white font-sans whitespace-nowrap">
                ClinixVault<span className="hidden xl:inline text-clinical-blue font-black">.Enterprise</span>
              </h1>
              <span className="hidden 2xl:inline px-1.5 py-0.5 text-[9px] font-bold bg-blue-50 dark:bg-blue-900/40 text-clinical-blue dark:text-blue-300 rounded-full border border-blue-200/80 dark:border-blue-800 font-mono shadow-xs whitespace-nowrap">
                {currentUser.firmware}
              </span>
            </div>
            <p className="hidden 2xl:block text-[11px] text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
              Zero-Egress Air-Gapped Appliance • {currentUser.location}
            </p>
          </div>
        </div>

        <div className="hidden xl:block h-5 w-[1px] bg-slate-200/80 dark:bg-slate-700/80 shrink-0" />

        {/* Doctor Persona Card with Interactive Dropdown */}
        <div className="relative min-w-0 shrink">
          <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-1.5 sm:gap-2 bg-slate-50/90 dark:bg-slate-800/80 hover:bg-slate-100/90 dark:hover:bg-slate-700/80 px-2 sm:px-2.5 py-1.5 rounded-xl border border-slate-200/70 dark:border-slate-700/70 shadow-xs transition-all cursor-pointer text-left min-w-0 max-w-full"
            title="Clinician Account & Profile"
          >
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-clinical-blue text-white flex items-center justify-center font-bold text-[11px] sm:text-xs shadow-xs shrink-0">
              {currentUser.avatarInitials || 'MD'}
            </div>
            <div className="hidden md:block min-w-0 max-w-[100px] xl:max-w-[140px] 2xl:max-w-[180px] truncate">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{currentUser.name}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0 ml-0.5" />
              </div>
              <div className="hidden 2xl:flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
                <span className="text-clinical-blue dark:text-blue-400 font-semibold truncate">{currentUser.role}</span>
              </div>
            </div>
          </button>

          {/* Clinician Dropdown Menu */}
          {isUserMenuOpen && (
            <div 
              className="absolute left-0 top-full mt-2 w-80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-xl p-3.5 z-50 text-xs space-y-2.5"
              onMouseLeave={() => setIsUserMenuOpen(false)}
            >
              <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 rounded-xl border border-blue-200/60 dark:border-blue-900/40">
                <div className="font-bold text-slate-900 dark:text-white">{currentUser.name}</div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">{currentUser.department}</div>
                <div className="text-[10px] font-mono text-clinical-blue dark:text-blue-400 mt-1 flex items-center justify-between">
                  <span>{currentUser.npi}</span>
                  <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded font-semibold">
                    {currentUser.authMethod.split(' ')[0]}
                  </span>
                </div>
              </div>

              {/* Quick Persona Switcher in Dropdown */}
              <div className="space-y-1">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-1 mb-1">
                  Active Directory Clinicians ({availableUsers.length})
                </div>
                {availableUsers.length === 0 ? (
                  <div className="p-2.5 text-center text-slate-400 text-[11px] bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                    No clinicians registered yet.
                  </div>
                ) : (
                  availableUsers.map((profile) => {
                    const isCurrent = profile.id === currentUser.id;
                    return (
                      <button
                        key={profile.id}
                        onClick={() => {
                          switchUser(profile.id);
                          setIsUserMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-blue-50 dark:bg-blue-950/50 text-clinical-blue dark:text-blue-300 font-bold border border-blue-200/60 dark:border-blue-900/40'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <span className="w-6 h-6 rounded-lg bg-clinical-blue/10 dark:bg-clinical-blue/20 text-clinical-blue flex items-center justify-center font-bold text-[10px] shrink-0">
                            {profile.avatarInitials}
                          </span>
                          <div className="truncate">
                            <div className="text-xs font-semibold truncate">{profile.name}</div>
                            <div className="text-[10px] text-slate-400 truncate">{profile.role}</div>
                          </div>
                        </div>
                        {isCurrent && (
                          <span className="text-[9px] font-mono text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded shrink-0">
                            ACTIVE
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="h-[1px] bg-slate-200/80 dark:border-slate-800" />

              {/* Lock Session Vault Action */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  lockVault('Manual Clinician Lock (§164.312)');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors font-medium text-left cursor-pointer"
              >
                <Lock className="w-4 h-4 text-amber-500" />
                <div className="flex items-center justify-between w-full">
                  <span>Lock Session Vault</span>
                  <kbd className="text-[9px] font-mono bg-white dark:bg-slate-800 px-1 py-0.5 rounded border text-slate-400">
                    ⌘⌥L
                  </kbd>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  openLoginModal();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium text-left cursor-pointer"
              >
                <Users className="w-4 h-4 text-clinical-blue" />
                <span>Register / Switch Clinician Identity</span>
              </button>

              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors font-medium text-left cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-rose-500" />
                <span>Sign Out Current Session</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edge Metrics, Utility Controls & Air-Gap Telemetry */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 flex-nowrap justify-end">
        {/* Zero-Egress Offline Cache Sync Pill */}
        {cacheTelemetry.pendingCount > 0 && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleSyncPendingCache}
            disabled={isSyncingCache}
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl border bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/30 text-[11px] font-bold shadow-xs cursor-pointer shrink-0"
            title={`${cacheTelemetry.pendingCount} clinical action(s) stored in IndexedDB cache. Click to force background sync.`}
          >
            <RefreshCw className={`w-3 h-3 text-amber-500 ${isSyncingCache ? 'animate-spin' : ''}`} />
            <span className="font-mono text-[10px]">{cacheTelemetry.pendingCount} Pending</span>
          </motion.button>
        )}

        {/* Dynamic Dual-Node Failover Status Pill */}
        {/* Acceptance criteria: amber = Colab GPU, emerald = Local Node, rose = Offline (reflects within 500ms) */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setIsBackendModalOpen(true)}
          className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold shadow-xs transition-all cursor-pointer shrink-0 ${
            isColabActive
              ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/30'
              : isHfActive
              ? 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-800 dark:text-purple-200 border-purple-500/30'
              : isRenderActive
              ? 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-800 dark:text-sky-200 border-sky-500/30'
              : isLocalActive
              ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-500/30'
              : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-800 dark:text-rose-200 border-rose-500/30'
          }`}
          title={`Active Gateway: ${failoverState.currentUrl}\nLatency: ${failoverState.latencyMs}ms\nAutomated Failover: ${failoverState.isAutoFailoverEnabled ? 'Enabled' : 'Disabled'}\nClick for failover controls and diagnostic telemetry`}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isColabActive ? 'bg-amber-400' : isHfActive ? 'bg-purple-400' : isRenderActive ? 'bg-sky-400' : isLocalActive ? 'bg-emerald-400' : 'bg-rose-400'
            }`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              isColabActive ? 'bg-amber-500' : isHfActive ? 'bg-purple-500' : isRenderActive ? 'bg-sky-500' : isLocalActive ? 'bg-emerald-500' : 'bg-rose-500'
            }`}></span>
          </span>
          {isColabActive ? (
            <Cloud className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          ) : isHfActive ? (
            <Zap className="w-3.5 h-3.5 text-purple-500 shrink-0" />
          ) : isRenderActive ? (
            <Globe className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          ) : isLocalActive ? (
            <Server className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          )}
          <span className="font-extrabold text-[10px] sm:text-[11px] whitespace-nowrap">
            {isColabActive ? 'Colab GPU' : isHfActive ? 'HF Spaces' : isRenderActive ? 'Render Cloud' : isLocalActive ? 'Local Node' : 'Offline'}
          </span>
          {failoverState.latencyMs > 0 && !isOffline && (
            <span className="hidden sm:inline font-mono text-[9px] opacity-80">
              {failoverState.latencyMs}ms
            </span>
          )}
        </motion.button>

        {/* Quick Search Cmd+K Button */}
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="hidden md:flex items-center gap-1 px-1.5 sm:px-2 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold shadow-xs transition-all shrink-0 cursor-pointer"
            title="Open Quick Search & Jump Palette (Cmd+K)"
          >
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <kbd className="hidden xl:inline text-[10px] font-mono bg-white dark:bg-slate-900 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-400 font-semibold">
              ⌘K
            </kbd>
          </button>
        )}

        {/* Export Utility Button */}
        {onExportNote && (
          <button
            onClick={onExportNote}
            className="hidden lg:flex items-center gap-1 px-1.5 sm:px-2 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold shadow-xs transition-all shrink-0 cursor-pointer"
            title="Export Current Clinical Note & FHIR Bundle"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden 2xl:inline text-[11px]">FHIR</span>
          </button>
        )}

        {/* Air-Gap Vault Seal Badge */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onOpenSafetyModal}
          className="hidden lg:flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25 transition-all text-xs font-bold group cursor-pointer shadow-xs shrink-0"
          title="Air-Gapped Sovereign Execution"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="hidden 2xl:inline text-[11px] whitespace-nowrap">Air-Gapped</span>
        </motion.button>

        {/* Dynamic Hardware Auto-Detection Button -> Opens Model Manager */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onOpenModelManager}
          className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-indigo-50/90 dark:bg-indigo-950/60 hover:bg-indigo-100/90 dark:hover:bg-indigo-900/60 border border-indigo-200/80 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-xs font-semibold shadow-xs transition-all cursor-pointer shrink-0"
          title="Click to Open Model Manager & Unified Memory Dashboard"
        >
          <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="hidden 2xl:inline font-extrabold text-[11px] max-w-[120px] truncate">{hardware?.gpu_name || hardware?.chip || 'Compute'}</span>
          <span className="text-[10px] font-mono text-indigo-700 dark:text-indigo-300 bg-white/90 dark:bg-slate-900 px-1 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 font-bold whitespace-nowrap">
            {hardware ? `${hardware.total_memory_gb}GB` : 'Ready'}
          </span>
        </motion.button>

        {/* Dedicated Model Manager Button */}
        {onOpenModelManager && (
          <button
            onClick={onOpenModelManager}
            className="hidden 2xl:flex items-center gap-1 px-1.5 sm:px-2 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-xs transition-all cursor-pointer shrink-0"
            title="Manage Pretrained Medical Models & Ollama Hub"
          >
            <Layers className="w-3.5 h-3.5 text-clinical-blue" />
            <span className="text-[11px]">Models</span>
          </button>
        )}

        {/* Quick Lock Session Vault Button */}
        <button
          onClick={() => lockVault('Manual Clinician Lock')}
          className="p-1.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-amber-500 dark:hover:text-amber-400 transition-colors shadow-xs shrink-0 cursor-pointer"
          title="Lock Session Vault Immediately (Ctrl+Alt+L)"
        >
          <Lock className="w-3.5 h-3.5" />
        </button>

        {/* Theme Mode Toggle Button */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            className="p-1.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-clinical-blue transition-colors shadow-xs shrink-0 cursor-pointer"
            title={isDarkMode ? "Switch to Clinical Light Theme" : "Switch to Obsidian Dark Theme"}
          >
            {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
          </button>
        )}

        {/* Settings Modal Button */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-clinical-blue transition-colors shadow-xs shrink-0 cursor-pointer"
            title="Appliance Settings, Auto-Lock & Audio Calibration"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Isolated System Clock (IST) */}
        <div className="hidden xl:block shrink-0">
          <HeaderClock />
        </div>
      </div>
    </header>

    {/* Backend Node Switcher Modal */}
    <BackendNodeModal
      isOpen={isBackendModalOpen}
      onClose={() => setIsBackendModalOpen(false)}
      onConnected={() => {
        loadSpecs();
      }}
    />
    </>
  );
});
