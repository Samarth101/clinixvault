import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Activity, 
  Binary, 
  Scan, 
  Server, 
  Cpu, 
  Users, 
  Sparkles, 
  Moon, 
  Sun, 
  ShieldAlert, 
  Settings, 
  ArrowRight,
  User,
  Network
} from 'lucide-react';
import { PageId, PatientRosterItem } from '../types';
import { clinixApi } from '../services/api';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPage: (page: PageId) => void;
  onToggleTheme: () => void;
  isDarkMode: boolean;
  onOpenSettings: () => void;
  onOpenSafetyModal: () => void;
  onOpenModelManager?: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onSelectPage,
  onToggleTheme,
  isDarkMode,
  onOpenSettings,
  onOpenSafetyModal,
  onOpenModelManager,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [patients, setPatients] = useState<PatientRosterItem[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    clinixApi.getPatients().then((list) => {
      if (list && list.length > 0) setPatients(list);
    }).catch(() => {});
  }, [isOpen]);

  const items = useMemo(() => {
    return [
      {
        category: 'Navigation',
        items: [
          { id: 'landing', label: 'ClinixVault Executive Landing Showcase', icon: <Sparkles className="w-4 h-4 text-amber-500" />, action: () => { onSelectPage('landing'); onClose(); } },
          { id: 'overview', label: 'Overview & Ambient Clinical Scribe', icon: <Activity className="w-4 h-4 text-clinical-blue" />, action: () => { onSelectPage('overview'); onClose(); } },
          { id: 'patients', label: 'Patient Directory & Sovereign EMR Records', icon: <Users className="w-4 h-4 text-sky-500" />, action: () => { onSelectPage('patients'); onClose(); } },
          { id: 'provenance', label: 'Bi-Directional Provenance & FHIR Hub', icon: <Binary className="w-4 h-4 text-emerald-500" />, action: () => { onSelectPage('provenance'); onClose(); } },
          { id: 'graph', label: 'Clinical Knowledge Graph & Neo4j Ontological Mesh', icon: <Network className="w-4 h-4 text-indigo-500" />, action: () => { onSelectPage('graph'); onClose(); } },
          { id: 'radiology', label: 'Radiology VLM Multi-Modal Studio', icon: <Scan className="w-4 h-4 text-purple-500" />, action: () => { onSelectPage('radiology'); onClose(); } },
          { id: 'microservices', label: 'Microservices & K3s Pod Telemetry', icon: <Server className="w-4 h-4 text-sky-500" />, action: () => { onSelectPage('microservices'); onClose(); } },
          { id: 'hardware', label: 'Hardware Sizing & Turnkey Appliance', icon: <Cpu className="w-4 h-4 text-indigo-500" />, action: () => { onSelectPage('hardware'); onClose(); } },
          { id: 'staff', label: 'Staff & Providers Directory (RBAC)', icon: <Users className="w-4 h-4 text-blue-500" />, action: () => { onSelectPage('staff'); onClose(); } },
        ]
      },
      {
        category: 'Quick Actions',
        items: [
          { id: 'models', label: 'Open Model Manager & Local Inference Hub', icon: <Cpu className="w-4 h-4 text-indigo-500" />, action: () => { if (onOpenModelManager) onOpenModelManager(); onClose(); } },
          { id: 'theme', label: isDarkMode ? 'Switch to Light Theme' : 'Switch to Obsidian Dark Theme', icon: isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />, action: () => { onToggleTheme(); onClose(); } },
          { id: 'settings', label: 'Open Appliance Settings & Calibration', icon: <Settings className="w-4 h-4 text-slate-400" />, action: () => { onOpenSettings(); onClose(); } },
          { id: 'safety', label: 'Vault Safety & Protocol Zero Emergency Override', icon: <ShieldAlert className="w-4 h-4 text-rose-500" />, action: () => { onOpenSafetyModal(); onClose(); } },
        ]
      },
      {
        category: 'Recent Patient Encounters',
        items: patients.map((p) => {
          const enc = p.latest_encounter;
          return {
            id: enc?.id || `ENC-${p.id}`,
            label: `${p.full_name || `${p.first_name} ${p.last_name}`} (${p.mrn}) — ${enc?.chief_complaint || 'Clinical evaluation'}`,
            icon: <User className="w-4 h-4 text-slate-400" />,
            action: () => { onSelectPage('overview'); onClose(); },
          };
        }),
      }
    ];
  }, [onSelectPage, onClose, onToggleTheme, isDarkMode, onOpenSettings, onOpenSafetyModal, onOpenModelManager, patients]);

  const filteredCategories = useMemo(() => {
    if (!query.trim()) return items;
    const lower = query.toLowerCase();
    return items.map(cat => ({
      ...cat,
      items: cat.items.filter(item => item.label.toLowerCase().includes(lower))
    })).filter(cat => cat.items.length > 0);
  }, [items, query]);

  const flatItems = useMemo(() => {
    return filteredCategories.flatMap(cat => cat.items);
  }, [filteredCategories]);

  // Keyboard shortcut listener for Cmd+K, Esc, Arrow Up/Down, Enter
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (flatItems.length ? (prev + 1) % flatItems.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (flatItems.length ? (prev - 1 + flatItems.length) % flatItems.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatItems[selectedIndex]) {
          flatItems[selectedIndex].action();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, flatItems, selectedIndex]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -20 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10"
        >
          {/* Search Input Bar */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
            <Search className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Jump to page, patient encounter, provider, or action... (Cmd+K)"
              className="w-full bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-base focus:outline-none"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  setSelectedIndex(0);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-2 py-1"
              >
                Clear
              </button>
            )}
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-[11px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
              ESC
            </kbd>
          </div>

          {/* Results List */}
          <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4">
            {filteredCategories.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                No matching results found for "{query}".
              </div>
            ) : (
              filteredCategories.map((cat, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {cat.category}
                  </div>
                  {cat.items.map((item) => {
                    const itemFlatIndex = flatItems.indexOf(item);
                    const isSelected = itemFlatIndex === selectedIndex;
                    return (
                      <button
                        key={item.id}
                        onClick={item.action}
                        onMouseEnter={() => setSelectedIndex(itemFlatIndex)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-clinical-blue/15 text-clinical-blue dark:bg-clinical-blue/25 ring-1 ring-clinical-blue/40 font-medium'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                            isSelected ? 'bg-clinical-blue/20 dark:bg-clinical-blue/30' : 'bg-slate-100 dark:bg-slate-800'
                          }`}>
                            {item.icon}
                          </div>
                          <span className={`text-sm truncate ${
                            isSelected ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-700 dark:text-slate-200'
                          }`}>
                            {item.label}
                          </span>
                        </div>
                        <ArrowRight className={`w-4 h-4 transition-all shrink-0 ${
                          isSelected ? 'text-clinical-blue translate-x-1' : 'text-slate-300 dark:text-slate-600'
                        }`} />
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer Info */}
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 flex items-center justify-between text-[11px] text-slate-400">
            <span>Air-Gapped Node #CV-09</span>
            <div className="flex items-center gap-3">
              <span>↑↓ to navigate</span>
              <span>↵ to execute</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
