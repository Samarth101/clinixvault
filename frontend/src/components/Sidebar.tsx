import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
   Activity, 
   Binary, 
   Scan, 
   FileText, 
   Server, 
   Cpu, 
   SlidersHorizontal,
   Users,
   Network,
   Pin,
   PinOff,
   ChevronRight
} from 'lucide-react';
import { PageId } from '../types';
import { ClinicVaultLogo3D } from './ClinicVaultLogo3D';
import { telemetry } from '../services/telemetry';

export interface SidebarProps {
  activePage: PageId;
  onSelectPage: (page: PageId) => void;
  onOpenSafetyModal: () => void;
  onVisibilityChange?: (visible: boolean) => void;
}

/* ── Stagger-in variants for each nav icon row ── */
const navContainerVariants = {
  show: {
    transition: { staggerChildren: 0.045, delayChildren: 0.08 },
  },
  hide: {},
};

const navItemVariants = {
  show: { 
    opacity: 1, 
    y: 0, 
    scale: 1, 
    transition: { type: 'spring' as const, stiffness: 380, damping: 24, mass: 0.6 } 
  },
  hide: { 
    opacity: 0, 
    y: 10, 
    scale: 0.92 
  },
};

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onSelectPage,
  onOpenSafetyModal,
  onVisibilityChange,
}) => {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    return localStorage.getItem('clinixvault_dock_pinned') === 'true';
  });

  const hideTimerRef = useRef<number | null>(null);
  const isHoveredOnSidebarRef = useRef<boolean>(false);

  // Notify parent of visibility changes for layout padding animation
  useEffect(() => {
    onVisibilityChange?.(isVisible);
  }, [isVisible, onVisibilityChange]);

  const revealSidebar = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setIsVisible(true);
  }, []);

  const scheduleAutoHide = useCallback((delayMs: number = 3000) => {
    if (isPinned) return;
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      // Do not hide if pointer is actively resting inside the sidebar
      if (!isHoveredOnSidebarRef.current && !isPinned) {
        setIsVisible(false);
      }
    }, delayMs);
  }, [isPinned]);

  // Initial auto-hide timer on mount
  useEffect(() => {
    scheduleAutoHide(3500);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [scheduleAutoHide]);

  // Global cursor tracking & screen-edge trigger detection
  // <30px from left screen edge immediately triggers fluid slide out
  // Inactivity auto-hide collapses after idle or after moving cursor away
  useEffect(() => {
    let idleTimer: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      // Screen edge trigger zone (< 30px) immediately triggers fluid slide out
      if (e.clientX <= 30) {
        revealSidebar();
        return;
      }

      // If sidebar is visible, unpinned, and not hovered
      if (isVisible && !isPinned && !isHoveredOnSidebarRef.current) {
        // If cursor moved away into main app area (>100px), start countdown if not already ticking
        if (e.clientX > 100 && !hideTimerRef.current) {
          scheduleAutoHide(2500);
        }

        // Inactivity timeout: if user stops moving mouse for 3.5s, auto-hide
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
          if (!isHoveredOnSidebarRef.current && !isPinned) {
            setIsVisible(false);
          }
        }, 3500);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [isVisible, isPinned, revealSidebar, scheduleAutoHide]);

  const handleMouseEnterSidebar = () => {
    isHoveredOnSidebarRef.current = true;
    revealSidebar();
  };

  const handleMouseLeaveSidebar = () => {
    isHoveredOnSidebarRef.current = false;
    setHoveredItem(null);
    scheduleAutoHide(2500);
  };

  const handleTogglePin = () => {
    const nextPinned = !isPinned;
    setIsPinned(nextPinned);
    localStorage.setItem('clinixvault_dock_pinned', String(nextPinned));
    telemetry.trackButtonClick('Sidebar', nextPinned ? 'pin_locked' : 'pin_unlocked', activePage);
    if (!nextPinned) {
      scheduleAutoHide(2500);
    } else {
      revealSidebar();
    }
  };

  const navItems: { id: PageId; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'overview',
      label: 'Overview & Ambient Scribe',
      icon: <Activity className="w-4 h-4" />,
      badge: 'LIVE',
    },
    {
      id: 'patients',
      label: 'Patient Directory & Records',
      icon: <Users className="w-4 h-4 text-sky-500" />,
      badge: 'EMR',
    },
    {
      id: 'provenance',
      label: 'Provenance & FHIR Hub',
      icon: <Binary className="w-4 h-4" />,
    },
    {
      id: 'graph',
      label: 'Knowledge Graph & Neo4j',
      icon: <Network className="w-4 h-4 text-indigo-500" />,
      badge: 'NEO4J',
    },
    {
      id: 'radiology',
      label: 'Radiology VLM Studio',
      icon: <Scan className="w-4 h-4" />,
    },
    {
      id: 'summarizer',
      label: 'Document Summarizer Studio',
      icon: <FileText className="w-4 h-4 text-emerald-500" />,
      badge: 'DOC-AI',
    },
    {
      id: 'microservices',
      label: 'Microservices & Health',
      icon: <Server className="w-4 h-4" />,
    },
    {
      id: 'hardware',
      label: 'Hardware & Turnkey Sizing',
      icon: <Cpu className="w-4 h-4" />,
    },
    {
      id: 'staff',
      label: 'Staff & Providers Directory (RBAC)',
      icon: <Users className="w-4 h-4 text-blue-500" />,
    },
  ];

  const handleItemClick = (id: PageId) => {
    telemetry.trackButtonClick('Sidebar', id, activePage);
    onSelectPage(id);
    if (!isPinned) {
      scheduleAutoHide(2000);
    }
  };

  const handleSafetyClick = () => {
    telemetry.trackButtonClick('Sidebar', 'safety_protocol_zero', activePage);
    onOpenSafetyModal();
  };

  return (
    <>
      {/* Invisible & Responsive Edge Sensor Zone (<30px left screen margin) */}
      <div 
        className="fixed left-0 top-0 bottom-0 w-[30px] z-40 cursor-pointer pointer-events-auto"
        onMouseEnter={revealSidebar}
        onClick={revealSidebar}
        title="Move cursor to edge to reveal sidebar"
      />

      {/* Sleek Luxury Ambient Trigger Strip when Sidebar is Collapsed */}
      <AnimatePresence>
        {!isVisible && (
          <motion.div
            initial={{ opacity: 0, x: -20, scaleY: 0.8 }}
            animate={{ opacity: 1, x: 0, scaleY: 1 }}
            exit={{ opacity: 0, x: -20, scaleY: 0.8 }}
            transition={{ type: "spring", stiffness: 450, damping: 28 }}
            onMouseEnter={revealSidebar}
            onClick={revealSidebar}
            className="fixed left-1.5 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center cursor-pointer group select-none"
            title="Reveal ClinixVault Sidebar Navigation"
          >
            <div className="w-2.5 h-36 rounded-full bg-gradient-to-b from-clinical-blue/70 via-emerald-400/90 to-clinical-blue/70 backdrop-blur-md shadow-[0_0_18px_rgba(37,99,235,0.65)] group-hover:w-3.5 group-hover:shadow-[0_0_28px_rgba(16,185,129,0.85)] transition-all duration-300 flex items-center justify-center">
              <ChevronRight className="w-3 h-3 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 animate-ping" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Luxury Floating Sidebar ──
           Uses top/bottom inset positioning so it never overflows the viewport.
           Inner container scrolls when content exceeds available height. */}
      <motion.aside
        initial="visible"
        animate={isVisible ? "visible" : "hidden"}
        variants={{
          visible: {
            x: 0,
            opacity: 1,
            scale: 1,
            pointerEvents: 'auto' as const,
            filter: 'blur(0px)',
            transition: {
              type: "spring",
              stiffness: 420,
              damping: 26,
              mass: 0.75,
            }
          },
          hidden: {
            x: -115,
            opacity: 0,
            scale: 0.90,
            pointerEvents: 'none' as const,
            filter: 'blur(10px)',
            transition: {
              type: "spring",
              stiffness: 350,
              damping: 28,
              mass: 0.8,
            }
          }
        }}
        onMouseEnter={handleMouseEnterSidebar}
        onMouseLeave={handleMouseLeaveSidebar}
        className="fixed left-4 top-4 bottom-4 z-50 flex items-center"
      >
        <div className="relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-3xl p-2.5 rounded-[28px] border border-white/80 dark:border-slate-800/90 shadow-[0_30px_70px_-15px_rgba(15,23,42,0.25)] dark:shadow-[0_30px_70px_-15px_rgba(0,0,0,0.7)] ring-1 ring-slate-900/5 dark:ring-white/10 flex flex-col items-center max-h-full overflow-y-auto overflow-x-hidden scrollbar-hide">
          
          {/* Top Pin / Auto-Hide Lock Toggle */}
          <button
            onClick={handleTogglePin}
            className={`w-7 h-5 rounded-full flex items-center justify-center transition-colors duration-200 shrink-0 mb-1.5 ${
              isPinned
                ? 'bg-clinical-blue/20 text-clinical-blue dark:text-blue-400'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
            title={isPinned ? "Sidebar is Pinned (Click to enable auto-hide)" : "Sidebar Auto-Hides on Inactivity (Click to Pin Open)"}
          >
            {isPinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
          </button>

          {/* ClinixVault Brand Emblem - Redirects to Landing Page */}
          <motion.div 
            onClick={() => handleItemClick('landing')}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            className="w-11 h-11 rounded-2xl flex items-center justify-center cursor-pointer relative group overflow-hidden shrink-0"
            title="ClinixVault 3D Air-Gap Monolith • Click to Return to Landing Page"
            onMouseEnter={() => setHoveredItem('brand')}
            onMouseLeave={() => setHoveredItem(null)}
          >
            <div className="relative flex items-center justify-center">
              <ClinicVaultLogo3D 
                size={38} 
                interactive={true} 
                enablePulseOnClick={true} 
                enableBloom={false} 
                onClick={() => handleItemClick('landing')}
              />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border-2 border-white dark:border-slate-900 animate-pulse pointer-events-none" />
            </div>
            
            {/* Tooltip */}
            <AnimatePresence>
              {hoveredItem === 'brand' && (
                <motion.div 
                  initial={{ opacity: 0, x: -8, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-14 px-3.5 py-1.5 bg-slate-900/95 text-white text-xs font-semibold rounded-xl whitespace-nowrap pointer-events-none shadow-xl border border-slate-700/80 backdrop-blur-md z-50"
                >
                  ClinixVault • Return to Landing Page
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <div className="w-7 h-[1px] bg-slate-200/80 dark:bg-slate-700/80 my-1 shrink-0" />

          {/* Navigation Buttons – staggered reveal */}
          <motion.div
            className="flex flex-col gap-1.5"
            variants={navContainerVariants}
            initial="hide"
            animate={isVisible ? "show" : "hide"}
          >
            {navItems.map((item) => {
              const isActive = activePage === item.id;
              return (
                <motion.div 
                  key={item.id} 
                  className="relative"
                  variants={navItemVariants}
                  onMouseEnter={() => setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <motion.button
                    onClick={() => handleItemClick(item.id)}
                    aria-label={item.label}
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.94 }}
                    className={`w-10 h-10 rounded-[18px] flex items-center justify-center transition-colors duration-200 relative ${
                      isActive
                        ? 'text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-clinical-blue dark:hover:text-blue-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    {/* Framer Motion Active Indicator Pill */}
                    {isActive && (
                      <motion.div
                        layoutId="activeDockIndicator"
                        className="absolute inset-0 bg-slate-900 dark:bg-clinical-blue rounded-[18px] shadow-lg shadow-slate-900/25 dark:shadow-blue-500/25"
                        transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      />
                    )}

                    <span className="relative z-10">{item.icon}</span>

                    {/* Active Indicator Accent Line */}
                    {isActive && (
                      <motion.span
                        layoutId="activeDockAccent"
                        className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-4 bg-clinical-blue dark:bg-white rounded-r-full z-20 shadow-[0_0_8px_rgba(37,99,235,0.8)]"
                        transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      />
                    )}

                    {/* Unselected Badge */}
                    {item.badge && !isActive && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping z-10" />
                    )}
                  </motion.button>

                  {/* Floating Tooltip Label */}
                  <AnimatePresence>
                    {hoveredItem === item.id && (
                      <motion.div 
                        initial={{ opacity: 0, x: -8, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-14 top-1/2 -translate-y-1/2 px-3.5 py-1.5 bg-slate-900/95 text-white text-xs font-medium rounded-xl whitespace-nowrap pointer-events-none shadow-xl border border-slate-700/80 backdrop-blur-md z-50 flex items-center gap-1.5"
                      >
                        <span>{item.label}</span>
                        {item.badge && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                            {item.badge}
                          </span>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </motion.div>

          <div className="w-7 h-[1px] bg-slate-200/80 dark:bg-slate-700/80 my-1 shrink-0" />

          {/* Safety & Protocol Zero Trigger */}
          <div 
            className="relative shrink-0"
            onMouseEnter={() => setHoveredItem('safety')}
            onMouseLeave={() => setHoveredItem(null)}
          >
            <motion.button
              onClick={handleSafetyClick}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              className="w-10 h-10 rounded-[18px] bg-rose-50/90 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 hover:text-rose-700 transition-colors flex items-center justify-center border border-rose-200/70 dark:border-rose-800/60 shadow-sm"
              title="Air-Gap Vault Safety & Protocol Zero"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </motion.button>
            
            <AnimatePresence>
              {hoveredItem === 'safety' && (
                <motion.div 
                  initial={{ opacity: 0, x: -8, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-14 top-1/2 -translate-y-1/2 px-3.5 py-1.5 bg-rose-950/95 text-rose-100 text-xs font-semibold rounded-xl whitespace-nowrap pointer-events-none shadow-xl border border-rose-800 backdrop-blur-md z-50"
                >
                  Vault Safety & Protocol Zero
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.aside>
    </>
  );
};

// Aliased export for backwards compatibility
export { Sidebar as NavigationDock };
