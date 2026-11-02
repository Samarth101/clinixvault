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
  Cloud
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { clinixApi, getApiBaseUrl } from '../services/api';
import { HardwareSpecs } from '../types';
import { ClinicVaultLogoSVG } from './ClinicVaultLogoSVG';
import { BackendNodeModal } from './BackendNodeModal';
import { formatISTTime } from '../utils/time';

const HeaderClock: React.FC = React.memo(() => {
  const [time, setTime] = useState<string>(() => formatISTTime(new Date()));

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(formatISTTime(new Date()));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-mono shadow-sm shrink-0">
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
  const [backendUrl, setBackendUrl] = useState<string>(() => getApiBaseUrl());
  const [isBackendOnline, setIsBackendOnline] = useState<boolean>(true);
  const { currentUser, availableUsers, switchUser, openLoginModal, logout } = useAuth();

  const loadSpecs = useCallback(() => {
    clinixApi.getHardwareSpecs().then((specs) => {
      setHardware(specs);
      setIsBackendOnline(true);
    }).catch(() => {
      setIsBackendOnline(false);
    });
  }, []);

  useEffect(() => {
    loadSpecs();
    const handleBackendChange = () => {
      const active = getApiBaseUrl();
      setBackendUrl(active);
      loadSpecs();
    };
    window.addEventListener('clinixvault:backend_changed', handleBackendChange);
    return () => {
      window.removeEventListener('clinixvault:backend_changed', handleBackendChange);
    };
  }, [loadSpecs]);

  const isColabNode = backendUrl.includes('trycloudflare.com') || backendUrl.includes('colab');

  return (
    <>
    <header className="w-full glass-card px-4 sm:px-6 py-2.5 mb-3 shrink-0 flex items-center justify-between gap-3 border border-white/90 dark:border-slate-800 shadow-diffuse z-40 backdrop-blur-3xl bg-white/85 dark:bg-slate-900/85 transition-all duration-200 overflow-x-auto scrollbar-hide">
      {/* Brand & Clinician Session */}
      <div className="flex items-center gap-5">
        <div 
          onClick={onNavigateLanding}
          className="flex items-center gap-3.5 cursor-pointer group"
          title="Return to Landing Page & Showcase"
        >
          <div className="w-11 h-11 rounded-2xl bg-blue-50/80 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 shadow-xs" title="ClinixVault Sovereign Monolith">
            <ClinicVaultLogoSVG size={34} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
                ClinixVault<span className="text-clinical-blue font-black">.Enterprise</span>
              </h1>
              <span className="px-2.5 py-0.5 text-[11px] font-bold bg-blue-50 dark:bg-blue-900/40 text-clinical-blue dark:text-blue-300 rounded-full border border-blue-200/80 dark:border-blue-800 font-mono shadow-sm">
                {currentUser.firmware}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Zero-Egress Air-Gapped Clinical AI Appliance • {currentUser.location}
            </p>
          </div>
        </div>

        <div className="hidden lg:block h-8 w-[1px] bg-slate-200/80 dark:bg-slate-700/80" />

        {/* Doctor Persona Card with Interactive Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="hidden sm:flex items-center gap-3 bg-slate-50/90 dark:bg-slate-800/80 hover:bg-slate-100/90 dark:hover:bg-slate-700/80 px-4 py-2 rounded-2xl border border-slate-200/70 dark:border-slate-700/70 shadow-sm transition-all cursor-pointer text-left"
            title="Clinician Account & Profile"
          >
            <div className="w-8 h-8 rounded-xl bg-clinical-blue text-white flex items-center justify-center font-bold text-xs shadow-sm">
              {currentUser.avatarInitials || 'MD'}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white">{currentUser.name}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                <span className="text-clinical-blue dark:text-blue-400 font-semibold">{currentUser.role}</span>
                <span>•</span>
                <span className="font-mono">{currentUser.npi}</span>
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
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Dynamic Backend Connection Node Pill */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setIsBackendModalOpen(true)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border text-xs font-semibold shadow-sm transition-all cursor-pointer shrink-0 ${
            isColabNode
              ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/30'
              : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-800 dark:text-blue-200 border-blue-500/30'
          }`}
          title={`Active Backend: ${backendUrl}\nClick to switch or paste new Colab Cloudflare URL`}
        >
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isBackendOnline ? (isColabNode ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-rose-400'
            }`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              isBackendOnline ? (isColabNode ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-rose-500'
            }`}></span>
          </span>
          {isColabNode ? <Cloud className="w-3.5 h-3.5 text-amber-500" /> : <Server className="w-3.5 h-3.5 text-clinical-blue" />}
          <span className="font-extrabold text-[11px]">{isColabNode ? 'Colab GPU' : 'Local Node'}</span>
          <span className="hidden xl:inline text-[10px] font-mono text-slate-500 dark:text-slate-400 font-bold bg-white/80 dark:bg-slate-800 px-1.5 py-0.2 rounded border border-slate-200/60 dark:border-slate-700 max-w-[120px] truncate">
            {isColabNode ? backendUrl.replace('https://', '').split('.')[0] : ':8000'}
          </span>
        </motion.button>

        {/* Quick Search Cmd+K Button */}
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold shadow-sm transition-all shrink-0"
            title="Open Quick Search & Jump Palette (Cmd+K)"
          >
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden lg:inline text-[11px]">Jump</span>
            <kbd className="text-[10px] font-mono bg-white dark:bg-slate-900 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-400">
              ⌘K
            </kbd>
          </button>
        )}

        {/* Export Utility Button */}
        {onExportNote && (
          <button
            onClick={onExportNote}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold shadow-sm transition-all shrink-0"
            title="Export Current Clinical Note & FHIR Bundle"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden xl:inline text-[11px]">FHIR</span>
          </button>
        )}

        {/* Air-Gap Vault Seal Badge */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onOpenSafetyModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25 transition-all text-xs font-bold group cursor-pointer shadow-sm shrink-0"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-[11px]">Air-Gapped</span>
        </motion.button>

        {/* Dynamic Hardware Auto-Detection Button -> Opens Model Manager */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onOpenModelManager}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/60 hover:bg-indigo-100/90 dark:hover:bg-indigo-900/60 border border-indigo-200/80 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-xs font-semibold shadow-sm transition-all cursor-pointer shrink-0"
          title="Click to Open Model Manager & Unified Memory Dashboard"
        >
          <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span className="font-extrabold text-[11px]">{hardware?.gpu_name || hardware?.chip || 'Compute Node'}</span>
          <span className="text-[10px] font-mono text-indigo-700 dark:text-indigo-300 bg-white/90 dark:bg-slate-900 px-1 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 font-bold">
            {hardware ? (hardware.is_apple_silicon ? `${hardware.total_memory_gb}GB Unified` : `${hardware.total_memory_gb}GB RAM/VRAM`) : 'Awaiting Link'}
          </span>
        </motion.button>

        {/* Dedicated Model Manager Button */}
        {onOpenModelManager && (
          <button
            onClick={onOpenModelManager}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0"
            title="Manage Pretrained Medical Models & Ollama Hub"
          >
            <Layers className="w-3.5 h-3.5 text-clinical-blue" />
            <span className="hidden 2xl:inline text-[11px]">Models</span>
          </button>
        )}

        {/* Theme Mode Toggle Button */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            className="p-1.5 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-clinical-blue transition-colors shadow-sm shrink-0"
            title={isDarkMode ? "Switch to Clinical Light Theme" : "Switch to Obsidian Dark Theme"}
          >
            {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
          </button>
        )}

        {/* Settings Modal Button */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-clinical-blue transition-colors shadow-sm shrink-0"
            title="Appliance Settings, Font Size & Audio Calibration"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Isolated System Clock (IST) */}
        <HeaderClock />
      </div>
    </header>

    {/* Backend Node Switcher Modal */}
    <BackendNodeModal
      isOpen={isBackendModalOpen}
      onClose={() => setIsBackendModalOpen(false)}
      onConnected={(newUrl) => {
        setBackendUrl(newUrl);
        loadSpecs();
      }}
    />
    </>
  );
});

