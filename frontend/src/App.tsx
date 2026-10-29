import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageId, AppSettings } from './types';
import { Sidebar } from './components/Sidebar';
import { HeaderBar } from './components/HeaderBar';
import { ProtocolZeroModal } from './components/ProtocolZeroModal';
import { SettingsModal } from './components/SettingsModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { ModelManagerModal } from './components/ModelManagerModal';
import { ClinicalExportModal } from './components/ClinicalExportModal';
import { telemetry } from './services/telemetry';

// Pages
import { LandingPage } from './pages/LandingPage';
import { OverviewPage } from './pages/OverviewPage';
import { ProvenanceFHIRPage } from './pages/ProvenanceFHIRPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RadiologyStudioPage } from './pages/RadiologyStudioPage';
import { DocumentSummarizerPage } from './pages/DocumentSummarizerPage';
import { MicroservicesHealthPage } from './pages/MicroservicesHealthPage';
import { HardwareSizingPage } from './pages/HardwareSizingPage';
import { StaffManagementPage } from './pages/StaffManagementPage';
import { KnowledgeGraphPage } from './pages/KnowledgeGraphPage';
import { PatientsPage } from './pages/PatientsPage';

// Auth
import { AuthProvider } from './context/AuthContext';
import { LoginModal } from './components/LoginModal';

const VALID_PAGES: PageId[] = ['landing', 'overview', 'patients', 'provenance', 'radiology', 'summarizer', 'microservices', 'hardware', 'staff', 'graph'];

function getPageFromHash(): PageId {
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase() as PageId;
  return VALID_PAGES.includes(hash) ? hash : 'landing';
}

export const App: React.FC = () => {
  const [activePage, setActivePage] = useState<PageId>(() => getPageFromHash());
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isModelManagerOpen, setIsModelManagerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [isDockVisible, setIsDockVisible] = useState<boolean>(true);

  // URL Hash Synchronizer for deep linking, browser back/forward, and persistent refresh
  useEffect(() => {
    const handleHashChange = () => {
      const page = getPageFromHash();
      setActivePage(page);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateToPage = useCallback((page: PageId) => {
    setActivePage(page);
    telemetry.trackPageView(page);
    if (page === 'landing') {
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname);
      }
    } else {
      window.location.hash = page;
    }
  }, []);

  // App Settings State (Theme, Font Scale, Hardware Kernel)
  const [settings, setSettings] = useState<AppSettings>(() => {
    const savedDark = localStorage.getItem('clinixvault_dark_mode');
    const savedFont = (localStorage.getItem('clinixvault_font_size') as AppSettings['fontSize']) || 'normal';
    return {
      darkMode: savedDark !== null ? savedDark === 'true' : false,
      fontSize: savedFont,
      audioDevice: 'Sennheiser TeamConnect Ceiling 2 (Dante IP)',
      whisperTemperature: 0.0,
      selectedVllmModel: 'Mistral-7B-Instruct (AWQ 4-bit) + Outlines CFG',
      cppAcceleration: true,
      autoCommitFhir: true,
      redactPiiRealtime: true,
    };
  });

  // Dark Mode DOM Sync - Landing page is always pure light theme matching WorkOS Atlas
  useEffect(() => {
    if (settings.darkMode && activePage !== 'landing') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('clinixvault_dark_mode', String(settings.darkMode));
  }, [settings.darkMode, activePage]);

  // Font Scaling DOM Sync
  useEffect(() => {
    document.documentElement.classList.remove('font-scale-large', 'font-scale-xl');
    if (settings.fontSize === 'large') {
      document.documentElement.classList.add('font-scale-large');
    } else if (settings.fontSize === 'xlarge') {
      document.documentElement.classList.add('font-scale-xl');
    }
    localStorage.setItem('clinixvault_font_size', settings.fontSize);
  }, [settings.fontSize]);

  // Global Keyboard Shortcuts (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleUpdateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  const toggleTheme = useCallback(() => {
    setSettings((prev) => ({ ...prev, darkMode: !prev.darkMode }));
  }, []);

  const handleOpenSafetyModal = useCallback(() => setIsSafetyModalOpen(true), []);
  const handleOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
  const handleOpenCommandPalette = useCallback(() => setIsCommandPaletteOpen(true), []);
  const handleOpenModelManager = useCallback(() => setIsModelManagerOpen(true), []);
  const handleNavigateLanding = useCallback(() => navigateToPage('landing'), [navigateToPage]);

  const handleExportNote = useCallback(() => {
    setIsExportModalOpen(true);
  }, []);

  return (
    <AuthProvider>
      <div className="min-h-screen relative font-sans text-slate-800 dark:text-slate-100 antialiased selection:bg-clinical-blue/20 selection:text-clinical-blue transition-colors duration-300">
        {/* Toast Notification */}
        <AnimatePresence>
          {exportNotice && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed top-6 right-6 z-50 px-4 py-3 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-2.5 text-xs sm:text-sm font-semibold"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{exportNotice}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* When on Landing Page: render full width high-impact landing with pinned scroll */}
        {activePage === 'landing' ? (
          <LandingPage
            onLaunchWorkstation={(page) => navigateToPage(page || 'overview')}
            isDarkMode={settings.darkMode}
            onToggleTheme={toggleTheme}
          />
        ) : (
          <>
            {/* Floating Left Navigation Sidebar with Inactivity Auto-Hide & Spring Pop-Up */}
            <Sidebar
              activePage={activePage}
              onSelectPage={(page) => navigateToPage(page)}
              onOpenSafetyModal={() => setIsSafetyModalOpen(true)}
              onVisibilityChange={setIsDockVisible}
            />

            {/* Main Content Area: Smooth responsive padding transition based on sidebar visibility */}
            <div className={`transition-all duration-300 ease-out pr-6 sm:pr-12 pt-3 max-w-[1640px] w-full mx-auto flex flex-col h-screen overflow-hidden ${
              isDockVisible ? 'pl-24 sm:pl-32' : 'pl-8 sm:pl-14'
            }`}>
              {/* Global Executive Clinical Header Bar */}
              <HeaderBar
                onOpenSafetyModal={handleOpenSafetyModal}
                onOpenSettings={handleOpenSettings}
                onOpenCommandPalette={handleOpenCommandPalette}
                onOpenModelManager={handleOpenModelManager}
                onNavigateLanding={handleNavigateLanding}
                isDarkMode={settings.darkMode}
                onToggleTheme={toggleTheme}
                onExportNote={handleExportNote}
              />

              {/* Dynamic Page Routing with Framer Motion Page Transition */}
              <main className="flex-1 overflow-y-auto pb-16 pr-1 custom-scrollbar">
                <ErrorBoundary onReset={() => navigateToPage('overview')}>
                  <AnimatePresence mode="wait">
                  {activePage === 'overview' && (
                    <motion.div
                      key="overview"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <OverviewPage
                        onNavigate={(page) => navigateToPage(page)}
                        onOpenSafetyModal={() => setIsSafetyModalOpen(true)}
                        onOpenModelManager={() => setIsModelManagerOpen(true)}
                      />
                    </motion.div>
                  )}

                  {activePage === 'patients' && (
                    <motion.div
                      key="patients"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <PatientsPage onNavigate={(page) => navigateToPage(page)} />
                    </motion.div>
                  )}

                  {activePage === 'provenance' && (
                    <motion.div
                      key="provenance"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <ProvenanceFHIRPage onNavigate={(page) => navigateToPage(page)} />
                    </motion.div>
                  )}

                  {activePage === 'graph' && (
                    <motion.div
                      key="graph"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <KnowledgeGraphPage />
                    </motion.div>
                  )}

                  {activePage === 'radiology' && (
                    <motion.div
                      key="radiology"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <RadiologyStudioPage
                        onOpenModelManager={() => setIsModelManagerOpen(true)}
                        onNavigate={(page) => navigateToPage(page)}
                      />
                    </motion.div>
                  )}

                  {activePage === 'summarizer' && (
                    <motion.div
                      key="summarizer"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <DocumentSummarizerPage />
                    </motion.div>
                  )}

                  {activePage === 'microservices' && (
                    <motion.div
                      key="microservices"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <MicroservicesHealthPage />
                    </motion.div>
                  )}

                  {activePage === 'hardware' && (
                    <motion.div
                      key="hardware"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <HardwareSizingPage />
                    </motion.div>
                  )}

                  {activePage === 'staff' && (
                    <motion.div
                      key="staff"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <StaffManagementPage />
                    </motion.div>
                  )}
                </AnimatePresence>
              </ErrorBoundary>
            </main>
            </div>
          </>
        )}

        {/* Global Modals */}
        <ProtocolZeroModal
          isOpen={isSafetyModalOpen}
          onClose={() => setIsSafetyModalOpen(false)}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
        />

        <CommandPaletteModal
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onSelectPage={(page) => navigateToPage(page)}
          onToggleTheme={toggleTheme}
          isDarkMode={settings.darkMode}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSafetyModal={() => setIsSafetyModalOpen(true)}
          onOpenModelManager={() => setIsModelManagerOpen(true)}
        />

        <ModelManagerModal
          isOpen={isModelManagerOpen}
          onClose={() => setIsModelManagerOpen(false)}
          selectedVllmModel={settings.selectedVllmModel}
          onSelectVllmModel={(model) => handleUpdateSettings({ selectedVllmModel: model })}
        />

        <ClinicalExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          onExportComplete={(notice) => {
            setExportNotice(notice);
            setTimeout(() => setExportNotice(null), 3000);
          }}
        />

        <LoginModal />
      </div>
    </AuthProvider>
  );
};

export default App;

