import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, 
  Lock, 
  ArrowRight, 
  Activity, 
  CheckCircle2, 
  Sparkles,
  Hash,
  Send,
  Paperclip,
  Mic,
  ExternalLink,
  Check
} from 'lucide-react';
import { PageId } from '../types';
import { ClinicVaultLogo3D } from '../components/ClinicVaultLogo3D';
import { ClinicVaultLogoSVG } from '../components/ClinicVaultLogoSVG';

interface LandingPageProps {
  onLaunchWorkstation: (targetPage?: PageId) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

// =========================================================
// Official 4-Color Slack Icon SVG (WorkOS Atlas Exact)
// =========================================================
const SlackIcon: React.FC<{ className?: string }> = ({ className = "size-5" }) => (
  <svg className={className} viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M3.64104 10.7086C3.64104 11.6857 2.85127 12.4755 1.87411 12.4755C0.896941 12.4755 0.107178 11.6857 0.107178 10.7086C0.107178 9.73141 0.896941 8.94165 1.87411 8.94165H3.64104V10.7086ZM4.5245 10.7086C4.5245 9.73141 5.31426 8.94165 6.29143 8.94165C7.26859 8.94165 8.05836 9.73141 8.05836 10.7086V15.1259C8.05836 16.1031 7.26859 16.8928 6.29143 16.8928C5.31426 16.8928 4.5245 16.1031 4.5245 15.1259V10.7086Z" fill="#E01E5A" />
    <path d="M6.29139 3.61418C5.31422 3.61418 4.52446 2.82442 4.52446 1.84725C4.52446 0.870086 5.31422 0.0803223 6.29139 0.0803223C7.26855 0.0803223 8.05832 0.870086 8.05832 1.84725V3.61418H6.29139ZM6.29139 4.51103C7.26855 4.51103 8.05832 5.3008 8.05832 6.27796C8.05832 7.25513 7.26855 8.04489 6.29139 8.04489H1.86068C0.883514 8.04489 0.09375 7.25513 0.09375 6.27796C0.09375 5.3008 0.883514 4.51103 1.86068 4.51103H6.29139Z" fill="#36C5F0" />
    <path d="M13.3724 6.27796C13.3724 5.3008 14.1622 4.51103 15.1393 4.51103C16.1165 4.51103 16.9063 5.3008 16.9063 6.27796C16.9063 7.25513 16.1165 8.04489 15.1393 8.04489H13.3724V6.27796ZM12.4889 6.27796C12.4889 7.25513 11.6992 8.04489 10.722 8.04489C9.74484 8.04489 8.95508 7.25513 8.95508 6.27796V1.84725C8.95508 0.870086 9.74484 0.0803223 10.722 0.0803223C11.6992 0.0803223 12.4889 0.870086 12.4889 1.84725V6.27796Z" fill="#2EB67D" />
    <path d="M10.722 13.359C11.6992 13.359 12.4889 14.1487 12.4889 15.1259C12.4889 16.1031 11.6992 16.8928 10.722 16.8928C9.74484 16.8928 8.95508 16.1031 8.95508 15.1259V13.359H10.722ZM10.722 12.4755C9.74484 12.4755 8.95508 11.6857 8.95508 10.7086C8.95508 9.73141 9.74484 8.94165 10.722 8.94165H15.1527C16.1299 8.94165 16.9196 9.73141 16.9196 10.7086C16.9196 11.6857 16.1299 12.4755 15.1527 12.4755H10.722Z" fill="#ECB22E" />
  </svg>
);

// =========================================================
// ClinixVault Atlas Brand Wordmark
// =========================================================
const ClinixVaultLogo: React.FC<{ className?: string; size?: number; variant?: '3d' | 'svg' }> = ({ 
  className = "",
  size = 38,
  variant = '3d'
}) => (
  <div className={`flex items-center gap-2.5 ${className}`}>
    <div className="relative flex items-center justify-center shrink-0">
      {variant === '3d' ? (
        <ClinicVaultLogo3D 
          size={size} 
          interactive={true} 
          enablePulseOnClick={true}
          enableBloom={false} 
        />
      ) : (
        <ClinicVaultLogoSVG size={size} />
      )}
    </div>
    <div className="flex items-baseline gap-1.5">
      <span className="font-display text-[22px] font-bold tracking-tight text-[#1d1c1d]">ClinixVault</span>
      <span className="text-[10px] font-bold tracking-widest text-[#1d1c1d]/60 uppercase bg-black/5 px-1.5 py-0.5 rounded">ATLAS</span>
    </div>
  </div>
);

// =========================================================
// 1. Interactive 3D Robot Head Mascot (AtlasBotHead)
// Authentic dimension, eye tracking, baseline blink, and click interaction
// =========================================================
const AtlasBotHead: React.FC<{ 
  onLaunchWorkstation: (targetPage?: PageId) => void;
  size?: number;
  showBubble?: boolean;
  initialBubble?: string;
}> = ({ 
  onLaunchWorkstation, 
  size = 400, 
  showBubble = true,
  initialBubble
}) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);
  const [speechBubble, setSpeechBubble] = useState<string | null>(
    initialBubble || "Sovereign AI coworker online • 0 bps WAN"
  );
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check image memory decoding asynchronously to prevent cascading renders
  useEffect(() => {
    let isMounted = true;
    const img = new Image();
    img.src = '/atlas/bot.png';
    img.decode()
      .then(() => {
        if (isMounted) setImgLoaded(true);
      })
      .catch(() => {
        if (isMounted && img.complete && img.naturalWidth > 0) {
          setImgLoaded(true);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const updateTarget = (clientX: number, clientY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const headCenterX = rect.left + rect.width / 2;
      const headCenterY = rect.top + rect.height / 2;

      const deltaX = (clientX - headCenterX) / (window.innerWidth / 2);
      const deltaY = (clientY - headCenterY) / (window.innerHeight / 2);

      const clampedX = Math.max(-1, Math.min(1, deltaX));
      const clampedY = Math.max(-1, Math.min(1, deltaY));

      setMousePos({ x: clampedX, y: clampedY });
    };

    const handleMouseMove = (e: MouseEvent) => {
      updateTarget(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        updateTarget(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 160);
    }, 4500);

    return () => clearInterval(blinkInterval);
  }, []);

  useEffect(() => {
    if (!showBubble) return;
    const bubbles = [
      "Sovereign AI coworker online • 0 bps WAN",
      "Ready to synthesize morning ICU rounds...",
      "FHIR R4 & Cerner connected on localhost",
      "Air-gapped verification: 100% Pass"
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % bubbles.length;
      setSpeechBubble(bubbles[i]);
    }, 6000);
    return () => clearInterval(interval);
  }, [showBubble]);

  // Scale pupil offset proportionally with robot size
  const scaleFactor = Math.min(1, Math.max(0.4, size / 400));
  const pupilX = mousePos.x * (9 * scaleFactor);
  const pupilY = mousePos.y * (6 * scaleFactor);

  const handleMascotClick = () => {
    setIsBlinking(true);
    setSpeechBubble("Clinical workstation ready • Opening overview!");
    setTimeout(() => {
      setIsBlinking(false);
      onLaunchWorkstation('overview');
    }, 400);
  };

  return (
    <div ref={containerRef} className="relative flex flex-col items-center justify-center select-none">
      {showBubble && (
        <AnimatePresence mode="wait">
          {speechBubble && (
            <motion.div
              key={speechBubble}
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              className="mb-2 px-3.5 py-1 rounded-full bg-white/95 text-[#1d1c1d] border border-black/10 text-xs font-medium flex items-center gap-2 shadow-[0_4px_16px_rgba(0,0,0,0.08)] backdrop-blur-md cursor-pointer hover:border-black/25 transition-all z-30"
              onClick={handleMascotClick}
            >
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{speechBubble}</span>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <div 
        className="relative aspect-square max-w-full cursor-pointer" 
        style={{ width: `${size}px`, transformOrigin: 'bottom center' }}
        onClick={handleMascotClick}
      >
        {imgError ? (
          <div className="size-full flex flex-col items-center justify-center rounded-3xl bg-neutral-900 border border-black/10 shadow-xl p-6 relative overflow-hidden select-none">
            <div 
              className="absolute inset-0 opacity-80 pointer-events-none"
              style={{ background: 'radial-gradient(circle at center, rgba(56, 189, 248, 0.2) 0%, transparent 70%)' }}
            />
            <svg viewBox="0 0 120 120" className="size-3/4 drop-shadow-md">
              <rect x="20" y="25" width="80" height="70" rx="20" fill="#1d1c1d" stroke="#38bdf8" strokeWidth="2.5" />
              <rect x="30" y="38" width="60" height="42" rx="12" fill="#0c1017" />
              <circle cx="48" cy="59" r="6" fill="#38bdf8" style={{ transformOrigin: '48px 59px', transform: isBlinking ? 'scaleY(0.1)' : 'none' }} />
              <circle cx="72" cy="59" r="6" fill="#38bdf8" style={{ transformOrigin: '72px 59px', transform: isBlinking ? 'scaleY(0.1)' : 'none' }} />
              <line x1="60" y1="25" x2="60" y2="12" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
              <circle cx="60" cy="10" r="4" fill="#38bdf8" />
            </svg>
            <span className="text-[10px] font-bold text-sky-400 mt-1 uppercase tracking-wider">ClinixVault Atlas</span>
          </div>
        ) : (
          <div className="relative size-full">
            {/* Shimmer pulse skeleton while loading */}
            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/5 animate-pulse">
                <div className="size-16 rounded-full bg-sky-400/20 animate-ping" />
              </div>
            )}

            <img
              alt="ClinixVault Atlas Robot"
              draggable={false}
              loading="eager"
              width={size}
              height={size}
              className={`size-full object-contain pointer-events-none transition-opacity duration-300 ${
                imgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              src="/atlas/bot.png"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />

            {/* Face mask and glowing tracking eyes rendered smoothly once imgLoaded */}
            {imgLoaded && (
              <>
                <div
                  className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-300"
                  style={{
                    WebkitMaskImage: 'url(/atlas/bot-face-mask.png)',
                    maskImage: 'url(/atlas/bot-face-mask.png)',
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center'
                  }}
                >
                  <div className="absolute inset-0">
                    <div className="bot-face absolute top-[30%] left-[25%] z-[2] flex h-[33%] w-[50%] items-center justify-center gap-[25%]">
                      <div
                        className="bot-face-gradient absolute inset-0"
                        style={{
                          background: 'radial-gradient(ellipse 92% 88% at 50% 60%, #117AAE 0%, #003B90 40%, #002555 72%, transparent 100%)',
                          opacity: 0.85
                        }}
                      />

                      {/* Left Eye */}
                      <div className="bot-eye-slot">
                        <div
                          className="bot-eye-track"
                          style={{
                            transform: `translate(${pupilX}px, ${pupilY}px)`
                          }}
                        >
                          <div 
                            className={`bot-eye transition-transform duration-100 ${isBlinking ? 'scale-y-[0.1]' : 'scale-y-100'}`}
                            style={{ transformOrigin: 'center 78%' }}
                          >
                            <div className="bot-eye-glow" />
                            <div className="bot-eye-core">
                              <div className="bot-eye-core-body" />
                              <div className="bot-eye-core-pupil" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Eye */}
                      <div className="bot-eye-slot">
                        <div
                          className="bot-eye-track"
                          style={{
                            transform: `translate(${pupilX}px, ${pupilY}px)`
                          }}
                        >
                          <div 
                            className={`bot-eye transition-transform duration-100 ${isBlinking ? 'scale-y-[0.1]' : 'scale-y-100'}`}
                            style={{ transformOrigin: 'center 78%' }}
                          >
                            <div className="bot-eye-glow" />
                            <div className="bot-eye-core">
                              <div className="bot-eye-core-body" />
                              <div className="bot-eye-core-pupil" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <img
                  alt=""
                  draggable={false}
                  width={size}
                  height={size}
                  className="absolute inset-0 size-full pointer-events-none object-contain transition-opacity duration-300"
                  src="/atlas/bot-face-shadow.png"
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// =========================================================
// Conversation Demo Data Types
// =========================================================
interface DemoAction {
  label: string;
  targetPage?: PageId;
  variant?: 'primary' | 'secondary' | 'danger';
}

interface DemoMessage {
  id: string;
  kind: 'user' | 'bot';
  author?: string;
  initials?: string;
  avatarColor?: string;
  time: string;
  statuses?: string[];
  content: React.ReactNode;
  actions?: DemoAction[];
}

interface DemoScenario {
  id: string;
  tabLabel: string;
  channel: string;
  memberCount: number;
  messages: DemoMessage[];
}

// ---------------------------------------------------------
// 4 Rich Clinical Demo Scenarios Matching Atlas Tabs
// ---------------------------------------------------------
const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'icu-rounds',
    tabLabel: 'Prep for morning rounds',
    channel: 'icu-rounds',
    memberCount: 9,
    messages: [
      {
        id: 'msg-1',
        kind: 'user',
        author: 'Dr. Jordan Miller',
        initials: 'JM',
        avatarColor: '#4f46e5',
        time: '8:52 AM',
        content: (
          <span>
            <span className="font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mr-1">@ClinixVault</span>
            I’m rounding on Bed 402 (Evelyn Reed, 68F, CHF post-CABG) at 9:00. Give me the full picture — latest lab vitals, telemetry alerts across the shift, and current fluid balance.
          </span>
        )
      },
      {
        id: 'msg-2',
        kind: 'bot',
        time: '8:52 AM',
        statuses: [
          'Connecting to local Cerner & Epic FHIR stores...',
          'Aggregating 12h Philips telemetry stream...',
          'Zero-egress verification: Verified'
        ],
        content: (
          <div className="space-y-3">
            <p className="font-semibold text-[#1d1c1d]">
              Here is the pre-rounds synthesis for <span className="underline decoration-sky-400">Evelyn Reed (MRN #94821)</span>:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-neutral-50 rounded-xl border border-black/6 text-xs">
              <div>
                <span className="text-black/50 block font-medium">B-type Natriuretic (BNP)</span>
                <span className="font-bold text-amber-600 text-sm">480 pg/mL (↓ from 720)</span>
              </div>
              <div>
                <span className="text-black/50 block font-medium">Serum Potassium</span>
                <span className="font-bold text-[#1d1c1d] text-sm">4.3 mEq/L (Stable)</span>
              </div>
              <div>
                <span className="text-black/50 block font-medium">Net 24h Fluid Balance</span>
                <span className="font-bold text-emerald-600 text-sm">-850 mL (Negative)</span>
              </div>
            </div>

            <div className="p-3 bg-sky-50/70 border border-sky-200/60 rounded-xl text-xs space-y-1">
              <div className="font-bold text-sky-900 flex items-center gap-1.5">
                <Activity className="size-3.5 text-sky-600" />
                <span>Overnight Telemetry Summary (00:00 - 08:30)</span>
              </div>
              <p className="text-sky-950/80 leading-relaxed">
                Sinus rhythm (HR 68-82 bpm). 1 isolated 4-beat run of non-sustained VT at 03:14 AM, self-terminating in 1.8s. No patient chest discomfort reported.
              </p>
            </div>

            <p className="text-xs text-black/60 italic">
              Provenance: Cerner Inpatient Flowsheet + Philips IntelliVue Telemetry + Epic FHIR R4 Bundle #BND-7712.
            </p>
          </div>
        ),
        actions: [
          { label: 'View Full FHIR Chart', targetPage: 'provenance', variant: 'primary' },
          { label: 'Open Radiology Studio', targetPage: 'radiology', variant: 'secondary' }
        ]
      }
    ]
  },
  {
    id: 'telemetry-regression',
    tabLabel: 'Debug telemetry regression',
    channel: 'telemetry-icu',
    memberCount: 7,
    messages: [
      {
        id: 'msg-3',
        kind: 'user',
        author: 'Nurse Sarah Lin, BSN',
        initials: 'SL',
        avatarColor: '#059669',
        time: '9:14 AM',
        content: (
          <span>
            <span className="font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mr-1">@ClinixVault</span>
            Bed 308 central monitor fired 4 false apnea alarms in the last 40 minutes. Is this a sensor lead displacement or genuine respiratory depression?
          </span>
        )
      },
      {
        id: 'msg-4',
        kind: 'bot',
        time: '9:14 AM',
        statuses: [
          'Analyzing high-frequency Dante audio and acoustic impedance...',
          'Cross-referencing capnography CO2 waveforms...'
        ],
        content: (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs font-semibold">
              <span className="size-2 rounded-full bg-amber-500" />
              <span>Artifact Detected: Lead II Baseline Wander (98.4% Confidence)</span>
            </div>

            <p className="text-xs text-[#1d1c1d] leading-relaxed">
              Real-time capnography (EtCO2) confirms rhythmic tidal respirations at 14 breaths/min with normal waveform plateau. The acoustic ceiling sensor records active patient repositioning matching the alarm timestamps.
            </p>

            <div className="p-3 bg-neutral-50 rounded-xl border border-black/6 text-xs">
              <span className="font-bold text-[#1d1c1d] block mb-1">Recommended Bedside Action:</span>
              <p className="text-black/70">
                Check and re-gel RL / RA electrodes. No naloxone or airway intervention indicated.
              </p>
            </div>
          </div>
        ),
        actions: [
          { label: 'Inspect Telemetry Microservice', targetPage: 'microservices', variant: 'primary' },
          { label: 'Acknowledge Alarm in Audit Log', targetPage: 'overview', variant: 'secondary' }
        ]
      }
    ]
  },
  {
    id: 'onboard-resident',
    tabLabel: 'Onboard clinical resident',
    channel: 'residency-onboarding',
    memberCount: 14,
    messages: [
      {
        id: 'msg-5',
        kind: 'user',
        author: 'Dr. Carlos Mendoza, PGY-1',
        initials: 'CM',
        avatarColor: '#d97706',
        time: '10:05 AM',
        content: (
          <span>
            <span className="font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mr-1">@ClinixVault</span>
            First day covering Pulmonary Stepdown. What is our institution’s sepsis bundle protocol for refractory lactic acidosis?
          </span>
        )
      },
      {
        id: 'msg-6',
        kind: 'bot',
        time: '10:05 AM',
        statuses: [
          'Loading local Clinical Practice Guideline #CPG-SEP-04...',
          'Air-gapped verification: 0 bps egress'
        ],
        content: (
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-[#1d1c1d]">
              Protocol Zero Guidelines for Stepdown Sepsis (Updated 2026):
            </p>
            <ol className="list-decimal pl-4 space-y-1.5 text-xs text-[#1d1c1d]/90">
              <li>
                <strong>Repeat Lactate:</strong> Re-draw serum lactate within 2 hours if baseline &gt; 2.0 mmol/L.
              </li>
              <li>
                <strong>Crystalloid Bolus:</strong> 30 mL/kg balanced crystalloid (Plasmalyte preferred over Normal Saline) within 3 hours.
              </li>
              <li>
                <strong>Vasopressor Escalation:</strong> If MAP &lt; 65 mmHg post-fluid challenge, initiate Norepinephrine via central line and page ICU Fellow immediately.
              </li>
            </ol>
            <div className="p-2.5 bg-emerald-50 border border-emerald-200/70 rounded-xl text-xs text-emerald-900 font-medium">
              💡 Tip: Type <code className="bg-emerald-100 px-1 py-0.5 rounded font-mono">/order-sepsis-bundle [Bed#]</code> to pre-populate standard Epic CPOE order sets.
            </div>
          </div>
        ),
        actions: [
          { label: 'View Staff Roster & Attending On-Call', targetPage: 'staff', variant: 'primary' },
          { label: 'Review Hardware Kernel Specs', targetPage: 'hardware', variant: 'secondary' }
        ]
      }
    ]
  },
  {
    id: 'shift-handover',
    tabLabel: 'Catch up after shift off',
    channel: 'charge-nurse-handover',
    memberCount: 8,
    messages: [
      {
        id: 'msg-7',
        kind: 'user',
        author: 'Nurse Marcus Vance, RN',
        initials: 'MV',
        avatarColor: '#7c3aed',
        time: '6:58 PM',
        content: (
          <span>
            <span className="font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mr-1">@ClinixVault</span>
            I’ve been off for 3 days. Give me a 60-second delta of ICU Pod B — discharges, critical admissions, and any open pending blood cultures.
          </span>
        )
      },
      {
        id: 'msg-8',
        kind: 'bot',
        time: '6:58 PM',
        statuses: [
          'Synthesizing past 72h inpatient admission logs...',
          'Cross-referencing microbiology lab releases...'
        ],
        content: (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[#1d1c1d]">
              ICU Pod B Handover Brief (Last 72 Hours):
            </p>
            <div className="space-y-2 text-xs">
              <div className="p-2 bg-neutral-50 rounded-lg border border-black/6">
                <span className="font-bold text-[#1d1c1d]">Bed 401 (New Adm):</span> 54M post severe pancreatitis. On CVVHDF day 2. MAP target stable on low-dose vasopressin.
              </div>
              <div className="p-2 bg-neutral-50 rounded-lg border border-black/6">
                <span className="font-bold text-[#1d1c1d]">Bed 405 (Discharged):</span> Successfully stepped down to Floor 3 telemetry this morning.
              </div>
              <div className="p-2 bg-rose-50 border border-rose-200/70 rounded-lg text-rose-950">
                <span className="font-bold text-rose-700">⚠️ Pending Lab Alert (Bed 404):</span> Blood culture bottle #2 flagged positive at 17:40 for Gram-positive cocci in clusters. ID consult pending.
              </div>
            </div>
          </div>
        ),
        actions: [
          { label: 'View Bed 404 Lab Culture in FHIR', targetPage: 'provenance', variant: 'primary' },
          { label: 'Review Antibiotic Durations', targetPage: 'provenance', variant: 'secondary' }
        ]
      }
    ]
  }
];

// =========================================================
// Main Hero Slack Demo Component with Circular Progress Tabs
// =========================================================
const AtlasHeroDemo: React.FC<{ onLaunchWorkstation: (targetPage?: PageId) => void }> = ({ onLaunchWorkstation }) => {
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const activeScenario = DEMO_SCENARIOS[activeTabIdx];

  // Auto-progress tab timer with smooth interval
  useEffect(() => {
    if (isPaused) return;

    const DURATION = 9000;
    const INTERVAL = 50;
    const step = 100 / (DURATION / INTERVAL);

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setActiveTabIdx((idx) => (idx + 1) % DEMO_SCENARIOS.length);
          return 0;
        }
        return prev + step;
      });
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [isPaused, activeTabIdx]);

  const handleSelectTab = (idx: number) => {
    setActiveTabIdx(idx);
    setProgress(0);
  };

  return (
    <div 
      className="w-full relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="relative cursor-default overflow-hidden rounded-[36px] sm:rounded-[42px] p-4 sm:p-6 shadow-2xl">
        {/* Background Wallpaper Image */}
        <img
          alt="Atlas Wallpaper"
          loading="lazy"
          className="object-cover absolute inset-0 size-full pointer-events-none"
          src="/atlas/wallpaper-bg.jpg"
        />

        {/* Tab Selector Pill Slider with Circular Progress Indicators */}
        <div className="relative mb-5 rounded-full bg-black/15 ring-1 ring-black/10 backdrop-blur-xl ring-inset p-1.5 max-sm:mb-3">
          <div className="overflow-x-auto overscroll-x-contain rounded-full [scrollbar-width:none] flex items-center justify-between gap-1">
            {DEMO_SCENARIOS.map((scenario, idx) => {
              const isActive = idx === activeTabIdx;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => handleSelectTab(idx)}
                  className={`relative z-10 flex flex-1 min-w-max items-center justify-center gap-2 rounded-full px-3.5 sm:px-4 py-2.5 text-center text-sm font-semibold tracking-[-0.01em] transition-colors duration-150 ${
                    isActive ? 'text-[#1d1c1d]' : 'text-white/80 hover:text-white'
                  }`}
                >
                  {/* Active Pill Background Slide */}
                  {isActive && (
                    <motion.div
                      layoutId="activeTabPill"
                      className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(15,10,20,0.1),0_6px_16px_-8px_rgba(15,10,20,0.28)]"
                      transition={{ type: 'spring', bounce: 0.18, duration: 0.4 }}
                    />
                  )}

                  {/* Circular Progress Ring */}
                  <span className="relative z-10 flex items-center justify-center size-3.5 shrink-0 -rotate-90">
                    <svg viewBox="0 0 24 24" className="size-full" fill="none" aria-hidden="true">
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        strokeWidth="3"
                        className={isActive ? 'stroke-black/15' : 'stroke-white/35'}
                      />
                      {isActive && (
                        <circle
                          cx="12"
                          cy="12"
                          r="9"
                          strokeWidth="3"
                          strokeLinecap="round"
                          pathLength="1"
                          strokeDasharray="1"
                          strokeDashoffset={1 - progress / 100}
                          className="stroke-[#1d1c1d] transition-[stroke-dashoffset] duration-75 ease-linear"
                        />
                      )}
                    </svg>
                  </span>

                  <span className="relative z-10 whitespace-nowrap">{scenario.tabLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Authentic macOS Light Slack Window */}
        <div className="font-slack relative overflow-hidden rounded-3xl bg-white text-[15px] leading-normal text-[#1d1c1d] shadow-[0_1px_1px_rgba(15,10,20,0.08),0_24px_50px_-24px_rgba(15,10,20,0.55)] ring-1 ring-black/10">
          {/* macOS Light Title Bar */}
          <div className="flex h-11 items-center justify-between border-b border-black/6 bg-white/80 px-4 pr-3 backdrop-blur-2xl">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#1d1c1d]/60">
              <span>Memorial Health System</span>
              <span className="text-black/20">•</span>
              <span className="text-emerald-600 flex items-center gap-1 font-mono">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Air-Gapped Sovereign Node
              </span>
            </div>
            <button
              type="button"
              onClick={() => onLaunchWorkstation('overview')}
              className="flex items-center gap-1.5 rounded-full bg-black/5 hover:bg-black/10 px-3 py-1 text-xs font-medium text-[#1d1c1d] transition-colors"
            >
              <SlackIcon className="size-3.5" />
              <span>Launch Workstation</span>
              <ExternalLink className="size-3 opacity-60" />
            </button>
          </div>

          <div className="flex h-138 max-sm:h-112">
            {/* Slack Left Sidebar */}
            <aside className="flex w-52 shrink-0 flex-col overflow-hidden border-r border-black/6 bg-[#f8f8f8]/90 text-[#43414a] backdrop-blur-2xl max-sm:hidden">
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/6 px-4">
                <span className="flex items-center gap-1 text-sm font-black text-[#1d1c1d]">
                  Memorial Health
                </span>
                <span className="flex items-center gap-1 text-[#7a797c]">
                  <span className="size-2 rounded-full bg-emerald-500" />
                </span>
              </div>

              <div className="flex flex-col gap-0.5 px-2 py-2 text-[13px] text-[#43414a] overflow-y-auto">
                <div className="mt-1 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-[#767577]">
                  Care Unit Channels
                </div>

                {DEMO_SCENARIOS.map((sc, i) => {
                  const isCurrent = i === activeTabIdx;
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => handleSelectTab(i)}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                        isCurrent
                          ? 'bg-white font-semibold text-[#1d1c1d] shadow-[0_1px_2px_rgba(15,10,20,0.09),0_0_0_1px_rgba(15,10,20,0.04)]'
                          : 'hover:bg-black/5 text-[#43414a]'
                      }`}
                    >
                      <Hash className="size-3.5 opacity-60 shrink-0" />
                      <span className="truncate">{sc.channel}</span>
                    </button>
                  );
                })}

                <div className="mt-3 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-[#767577]">
                  Direct AI Coworker
                </div>

                <div className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-black/5 text-[#1d1c1d] font-semibold text-[13px]">
                  <div className="relative flex">
                    <div className="size-5 rounded-md bg-[#1d1c1d] flex items-center justify-center text-white text-[10px] font-bold">
                      CV
                    </div>
                    <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-[#2bac76] ring-1 ring-white" />
                  </div>
                  <span>ClinixVault AI</span>
                </div>
              </div>
            </aside>

            {/* Slack Main Chat Area */}
            <div className="flex min-w-0 flex-1 flex-col bg-white">
              {/* Channel Header Bar */}
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/6 px-5 bg-white/80">
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex items-center gap-1 font-black text-[#1d1c1d]">
                    <Hash className="size-4 opacity-70" />
                    <span>{activeScenario.channel}</span>
                  </span>
                  <span className="text-xs text-black/40 font-medium">
                    {activeScenario.memberCount} clinicians
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck className="size-3" />
                    <span>Protocol Zero Verified</span>
                  </span>
                </div>
              </div>

              {/* Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeScenario.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-4"
                  >
                    {activeScenario.messages.map((msg) => (
                      <div key={msg.id} className="flex gap-3 text-left">
                        {/* Avatar */}
                        {msg.kind === 'user' ? (
                          <div
                            className="size-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
                            style={{ backgroundColor: msg.avatarColor || '#4f46e5' }}
                          >
                            {msg.initials || 'DR'}
                          </div>
                        ) : (
                          <div className="size-9 rounded-lg bg-[#1d1c1d] flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm ring-1 ring-black/10">
                            <Activity className="size-5 text-sky-400 stroke-[2.5]" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 mb-0.5">
                            <span className="text-sm font-bold text-[#1d1c1d]">
                              {msg.kind === 'user' ? msg.author : 'ClinixVault'}
                            </span>
                            {msg.kind === 'bot' && (
                              <span className="bg-[#1d1c1d] text-white text-[10px] font-bold px-1.5 py-0.2 rounded uppercase">
                                APP
                              </span>
                            )}
                            <span className="text-xs text-black/40 font-normal">{msg.time}</span>
                          </div>

                          {/* Thinking / Shimmer Statuses */}
                          {msg.statuses && msg.statuses.length > 0 && (
                            <div className="my-1.5 space-y-1">
                              {msg.statuses.map((status, sIdx) => (
                                <div key={sIdx} className="text-xs font-medium text-black/60 flex items-center gap-1.5">
                                  <span className="size-1.5 rounded-full bg-sky-500 animate-ping" />
                                  <span className="slack-demo-shimmer">{status}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="text-[14px] leading-relaxed text-[#1d1c1d]/90">
                            {msg.content}
                          </div>

                          {/* Action Buttons */}
                          {msg.actions && msg.actions.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              {msg.actions.map((act, aIdx) => (
                                <button
                                  key={aIdx}
                                  type="button"
                                  onClick={() => onLaunchWorkstation(act.targetPage)}
                                  className={`px-3 py-1 rounded-md text-xs font-semibold tracking-tight transition-all active:scale-[0.98] ${
                                    act.variant === 'primary'
                                      ? 'bg-[#1d1c1d] hover:bg-[#1d1c1d]/85 text-white shadow-sm'
                                      : act.variant === 'danger'
                                      ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
                                      : 'bg-black/5 hover:bg-black/10 text-[#1d1c1d] border border-black/8'
                                  }`}
                                >
                                  {act.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Slack Rich Bottom Input Bar */}
              <div className="px-4 pb-3.5 pt-1">
                <div className="overflow-hidden rounded-lg border border-black/15 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  {/* Toolbar */}
                  <div className="flex items-center gap-1 border-b border-black/6 bg-[#f8f8f8] px-2.5 py-1.5 text-black/60 text-xs">
                    <span className="font-bold px-1.5 py-0.5 rounded hover:bg-black/5 cursor-pointer">B</span>
                    <span className="italic px-1.5 py-0.5 rounded hover:bg-black/5 cursor-pointer">I</span>
                    <span className="line-through px-1.5 py-0.5 rounded hover:bg-black/5 cursor-pointer">S</span>
                    <span className="mx-1 h-3.5 w-px bg-black/15" />
                    <Paperclip className="size-3.5 hover:text-black cursor-pointer" />
                    <Mic className="size-3.5 hover:text-black cursor-pointer" />
                  </div>
                  {/* Text Field */}
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs text-black/40">
                      Message #{activeScenario.channel} or ask @ClinixVault...
                    </span>
                    <button
                      type="button"
                      onClick={() => onLaunchWorkstation('overview')}
                      className="p-1.5 rounded bg-black/10 hover:bg-[#1d1c1d] hover:text-white text-black/60 transition-colors"
                      title="Send prompt to workstation"
                    >
                      <Send className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================
// 2. Section: Connected to all your tools (Signal Dome)
// Exact WorkOS Atlas Signal Dome layout & orbiting clinical tools
// =========================================================
const AtlasConnectedTools: React.FC<{ onLaunchWorkstation: (targetPage?: PageId) => void }> = ({ onLaunchWorkstation }) => {
  const [selectedTool, setSelectedTool] = useState<number | null>(null);

  const tools = [
    { name: 'Epic Systems', category: 'EHR / MyChart', badge: 'EPIC', color: '#c026d3', page: 'provenance' as PageId },
    { name: 'Cerner Millennium', category: 'Inpatient CPOE', badge: 'CRN', color: '#0284c7', page: 'overview' as PageId },
    { name: 'FHIR R4 Store', category: 'Local Provenance', badge: 'FHIR', color: '#ea580c', page: 'provenance' as PageId },
    { name: 'PACS / DICOM', category: 'Orthanc Radiology', badge: 'DCM', color: '#059669', page: 'radiology' as PageId },
    { name: 'PyTorch / CUDA', category: 'On-Prem Inference', badge: 'TORCH', color: '#e11d48', page: 'microservices' as PageId },
    { name: 'vLLM Kernel', category: 'AWQ 4-Bit Acceleration', badge: 'VLLM', color: '#4f46e5', page: 'hardware' as PageId },
    { name: 'PostgreSQL Timescale', category: 'Encrypted Vitals Audit', badge: 'PG', color: '#2563eb', page: 'microservices' as PageId },
    { name: 'Dante IP Audio', category: 'Ceiling Array Transcripts', badge: 'DNT', color: '#0d9488', page: 'staff' as PageId }
  ];

  return (
    <section className="overflow-hidden pt-12 pb-16 max-md:bg-neutral-50 max-md:pt-16 max-md:pb-20">
      <div className="w-full px-6 sm:px-10 max-w-[1080px] mx-auto">
        <div className="grid grid-cols-[minmax(0,26rem)_minmax(0,1fr)] items-center gap-12 max-lg:gap-8 max-md:grid-cols-1 max-md:gap-10">
          {/* Left Text */}
          <motion.div 
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-md max-md:mx-auto max-md:text-center"
          >
            <h2 className="font-display text-5xl font-semibold tracking-[-.02em] text-balance max-sm:text-[40px] text-[#1d1c1d]">
              Connected to all your tools.
            </h2>
            <p className="text-[#1d1c1d]/70 mt-5 text-lg font-medium tracking-[-.01em] text-pretty max-sm:mt-4 max-sm:text-base leading-relaxed">
              ClinixVault connects to 300+ clinical and enterprise systems out of the box — Epic, Cerner, FHIR R4, PACS/DICOM, PyTorch CUDA, and PostgreSQL. It works across all of them at once, so a clinical inquiry that spans multiple medical silos comes back as one unified, auditable answer.
            </p>
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={{
                visible: {
                  transition: { staggerChildren: 0.08 }
                }
              }}
              className="mt-8 flex flex-wrap gap-2 max-md:justify-center"
            >
              {['Zero-Egress Proxy', 'HL7 v2 & FHIR R4', 'DICOM C-MOVE', 'Dante IP Audio'].map((badge) => (
                <motion.span
                  key={badge}
                  variants={{
                    hidden: { opacity: 0, scale: 0.9, y: 8 },
                    visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }
                  }}
                  className="px-3 py-1 rounded-full bg-white border border-black/8 text-xs font-semibold text-[#1d1c1d] shadow-sm hover:border-black/20 transition-colors"
                >
                  {badge}
                </motion.span>
              ))}
            </motion.div>
          </motion.div>

          {/* Right Signal Dome Graphic */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex items-center justify-center min-h-[480px] select-none"
          >
            {/* Concentric Signal Radar Rings */}
            <div className="absolute size-[440px] rounded-full border border-black/[0.06] pointer-events-none" />
            <div className="absolute size-[340px] rounded-full border border-black/[0.08] pointer-events-none" />
            <div className="absolute size-[230px] rounded-full border border-black/[0.10] pointer-events-none" />
            <div className="absolute size-[160px] rounded-full bg-sky-500/10 animate-ping pointer-events-none" />

            {/* Central Robot Core Node */}
            <div 
              onClick={() => onLaunchWorkstation('microservices')}
              className="relative z-10 size-28 rounded-full bg-white shadow-[0_12px_36px_rgba(0,0,0,0.12)] border border-black/10 flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-transform group"
            >
              <img
                alt="ClinixVault Node"
                src="/atlas/bot.png"
                className="size-16 object-contain pointer-events-none"
              />
              <span className="absolute -bottom-2 bg-[#1d1c1d] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                Local Kernel
              </span>
            </div>

            {/* Orbiting Tool Chips Arranged around the dome */}
            <div className="absolute inset-0 pointer-events-auto">
              {tools.map((t, idx) => {
                const angle = (idx / tools.length) * 2 * Math.PI - Math.PI / 2;
                const radius = 185;
                const x = Math.round(Math.cos(angle) * radius);
                const y = Math.round(Math.sin(angle) * radius);
                const isHovered = selectedTool === idx;

                return (
                  <motion.div
                    key={t.name}
                    initial={{ opacity: 0, scale: 0.75, y: 12 }}
                    whileInView={{ opacity: 1, scale: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ delay: 0.15 + idx * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    whileHover={{ scale: 1.08, y: -4 }}
                    onMouseEnter={() => setSelectedTool(idx)}
                    onMouseLeave={() => setSelectedTool(null)}
                    onClick={() => onLaunchWorkstation(t.page)}
                    style={{
                      position: 'absolute',
                      left: `calc(50% + ${x}px - 58px)`,
                      top: `calc(50% + ${y}px - 24px)`
                    }}
                    className={`w-[116px] p-2 rounded-xl bg-white transition-all cursor-pointer text-center group ${
                      isHovered
                        ? 'shadow-xl border-black/25 ring-2 ring-sky-400'
                        : 'shadow-[0_2px_12px_rgba(15,10,20,0.06)] border border-black/8 hover:shadow-lg'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5 mb-0.5">
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="text-[11px] font-bold text-[#1d1c1d] truncate">
                        {t.name}
                      </span>
                    </div>
                    <div className="text-[9px] text-black/50 font-medium truncate">
                      {t.category}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

// =========================================================
// 3. Section: A coworker for the whole team
// Stacked Interactive Slack Consultation Cards
// =========================================================
const AtlasTeamCoworker: React.FC<{ onLaunchWorkstation: (targetPage?: PageId) => void }> = ({ onLaunchWorkstation }) => {
  const [activeCard, setActiveCard] = useState(0);

  const teamThreads = [
    {
      id: 'thread-1',
      channel: 'icu-morning-standup',
      header: 'Morning Handover',
      doctor: 'Dr. Marcus Vance, Attending Intensivist',
      doctorInitials: 'MV',
      color: '#4f46e5',
      time: '07:15 AM',
      doctorMsg: 'Morning team — Room 304 extubated successfully at 06:30. Post-op telemetry and gas levels?',
      botMsg: 'Documented extubation time to FHIR. SpO2 98% on 2L NC. ABG drawn 07:05: pH 7.39, PaCO2 41, PaO2 88. Fluid balance is -400mL.',
      replyDoctor: 'Dr. Sarah Lin, Clinical Pharmacist',
      replyColor: '#059669',
      replyMsg: 'Looks clean. Weaning oxygen protocol initiated and oral swallowing consult placed.'
    },
    {
      id: 'thread-2',
      channel: 'cardiology-consult',
      header: 'ECG Comparison',
      doctor: 'Dr. Arthur Chen, Cardiologist',
      doctorInitials: 'AC',
      color: '#0284c7',
      time: '08:30 AM',
      doctorMsg: 'Need quick delta on Bed 201 12-lead ECG from this morning vs yesterday.',
      botMsg: 'Normal sinus rhythm at 74 bpm. PR interval 162 ms. Compared to 14:00 baseline yesterday: T-wave inversions in V1-V3 have fully resolved.',
      replyDoctor: 'Dr. Elena Morales, Fellow',
      replyColor: '#d97706',
      replyMsg: 'Agreed, ischemic changes cleared. Patient ready for floor transfer.'
    },
    {
      id: 'thread-3',
      channel: 'er-admissions',
      header: 'Trauma Bay Triage',
      doctor: 'Nurse Kelly, Charge Nurse',
      doctorInitials: 'NK',
      color: '#e11d48',
      time: '09:12 AM',
      doctorMsg: 'Incoming multi-trauma transfer from Highway 101 via EMS. ETA 8 minutes.',
      botMsg: 'Trauma Bay 1 pre-allocated. O-negative uncrossmatched blood on standby in Blood Bank. Orthopedic on-call alerted via Dante audio pager.',
      replyDoctor: 'Dr. Jordan Miller, Trauma Surgeon',
      replyColor: '#7c3aed',
      replyMsg: 'Trauma team scrubbed and assembled in Bay 1.'
    }
  ];

  return (
    <section className="overflow-hidden pt-16 pb-16 bg-white">
      <div className="w-full px-6 sm:px-10 max-w-[1080px] mx-auto">
        <div className="grid grid-cols-2 items-center gap-8 max-lg:gap-x-16 max-md:grid-cols-1">
          {/* Left: Stacked Slack Thread Cards */}
          <motion.div 
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="order-1 max-md:order-none max-md:justify-self-center w-full"
          >
            <div className="font-slack relative w-full max-w-md mx-auto min-h-[380px] select-none">
              {teamThreads.map((thr, idx) => {
                const isSelected = idx === activeCard;
                const offset = (idx - activeCard) * 16;
                const zIndex = isSelected ? 20 : 10 - idx;

                return (
                  <motion.div
                    key={thr.id}
                    onClick={() => setActiveCard(idx)}
                    animate={{
                      y: isSelected ? 0 : offset + 20,
                      scale: isSelected ? 1 : 0.95,
                      opacity: isSelected ? 1 : 0.75
                    }}
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                    style={{ zIndex, position: idx === 0 ? 'relative' : 'absolute', top: 0, left: 0, right: 0 }}
                    className="w-full overflow-hidden rounded-2xl bg-white text-[15px] leading-normal text-[#1d1c1d] shadow-[0_1px_2px_rgba(15,10,20,0.08),0_22px_45px_-28px_rgba(15,10,20,0.5)] ring-1 ring-black/[0.08] cursor-pointer"
                  >
                    <div className="flex items-center justify-between border-b border-black/6 bg-[#f8f8f8]/80 px-4 py-2.5 text-[13px] font-semibold text-[#616061]">
                      <span className="flex items-center gap-1.5 text-[#1d1c1d]">
                        <Hash className="size-3.5 opacity-60" />
                        <span>{thr.channel}</span>
                      </span>
                      <span className="text-black/40 text-xs font-normal">{thr.time}</span>
                    </div>

                    <div className="p-4 sm:p-5 space-y-3 text-[13px]">
                      {/* Doctor initial message */}
                      <div className="flex gap-2.5">
                        <div
                          className="size-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: thr.color }}
                        >
                          {thr.doctorInitials}
                        </div>
                        <div>
                          <div className="font-bold text-[#1d1c1d]">{thr.doctor}</div>
                          <div className="text-black/75 mt-0.5">{thr.doctorMsg}</div>
                        </div>
                      </div>

                      {/* ClinixVault Reply */}
                      <div className="flex gap-2.5 pl-3 border-l-2 border-sky-400 bg-sky-50/40 p-2 rounded-r-lg">
                        <div className="size-7 rounded-lg bg-[#1d1c1d] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          CV
                        </div>
                        <div>
                          <div className="font-bold text-[#1d1c1d] flex items-center gap-1">
                            <span>ClinixVault</span>
                            <span className="bg-[#1d1c1d] text-white text-[9px] px-1 py-0.2 rounded">APP</span>
                          </div>
                          <div className="text-black/85 mt-0.5">{thr.botMsg}</div>
                        </div>
                      </div>

                      {/* Reply Colleague */}
                      <div className="flex gap-2.5 pt-1">
                        <div
                          className="size-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: thr.replyColor }}
                        >
                          MD
                        </div>
                        <div>
                          <div className="font-bold text-[#1d1c1d] text-xs">{thr.replyDoctor}</div>
                          <div className="text-black/75 mt-0.5 text-xs">{thr.replyMsg}</div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Right Text */}
          <motion.div 
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="order-2 max-w-md -translate-x-8 justify-self-end max-lg:translate-x-0 max-md:order-none max-md:mx-auto max-md:justify-self-auto max-md:text-center"
          >
            <h2 className="font-display text-5xl font-semibold tracking-[-.02em] text-balance max-sm:text-[40px] text-[#1d1c1d]">
              A coworker for the whole team.
            </h2>
            <p className="text-[#1d1c1d]/70 mt-5 text-lg font-medium tracking-[-.01em] text-pretty max-sm:mt-4 max-sm:text-base leading-relaxed">
              Most AI lives in a private chat only you can see. ClinixVault works out in the open, in the shared hospital channels and nurse station terminals your team already uses. Anyone can jump into a consultation thread, add what they know, or pick up where a colleague left off.
            </p>
            <div className="mt-8 max-md:flex max-md:justify-center">
              <button
                type="button"
                onClick={() => onLaunchWorkstation('overview')}
                className="px-5 py-2.5 rounded-full bg-[#1d1c1d] hover:bg-[#1d1c1d]/85 text-white text-sm font-semibold tracking-tight shadow-sm transition-all"
              >
                Explore Hospital Channels
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

// =========================================================
// 4. Section: Always learning, never guessing
// =========================================================
const AtlasAlwaysLearning: React.FC<{ onLaunchWorkstation: (targetPage?: PageId) => void }> = ({ onLaunchWorkstation }) => {
  return (
    <section className="overflow-hidden pt-16 pb-20 bg-neutral-50 max-md:bg-white">
      <div className="w-full px-6 sm:px-10 max-w-[1080px] mx-auto">
        <div className="grid grid-cols-2 items-center gap-8 max-md:grid-cols-1 max-md:gap-0">
          {/* Left: Text */}
          <motion.div 
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-20 max-w-md max-lg:mt-0 max-md:mx-auto max-md:text-center"
          >
            <h2 className="font-display text-5xl font-semibold tracking-[-.02em] text-balance max-sm:text-[40px] text-[#1d1c1d]">
              Always learning, never guessing.
            </h2>
            <p className="text-[#1d1c1d]/70 mt-5 text-lg font-medium tracking-[-.01em] text-pretty max-sm:mt-4 max-sm:text-base leading-relaxed">
              ClinixVault learns how your clinical department actually works just from the way you already communicate: your unit shorthand, your attending doctor preferences, who to loop in for pharmacy approvals. No setup, no cloud retraining. Correct a clinical order once, and the local rule sticks.
            </p>
            <div className="mt-8 flex items-center gap-4 max-md:justify-center text-sm font-semibold text-[#1d1c1d]">
              <span className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="size-4" />
                <span>Zero Retraining Cloud Lag</span>
              </span>
              <span className="flex items-center gap-1.5 text-sky-600">
                <Lock className="size-4" />
                <span>Air-Gapped Rules Engine</span>
              </span>
            </div>
          </motion.div>

          {/* Right: Robot with Floating Learning Badges */}
          <motion.div 
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex flex-col items-center justify-center min-h-[420px] select-none"
          >
            {/* Robot Image Base with bottom mask */}
            <div 
              className="relative size-72 sm:size-80"
              style={{
                WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 65%, transparent 100%)',
                maskImage: 'linear-gradient(to bottom, #000 0%, #000 65%, transparent 100%)'
              }}
            >
              <img
                alt="Robot learning"
                src="/atlas/bot.png"
                className="size-full object-contain pointer-events-none"
              />
              <img
                alt=""
                src="/atlas/bot-face-shadow.png"
                className="absolute inset-0 size-full object-contain pointer-events-none"
              />
            </div>

            {/* Floating Learning Badges */}
            <motion.div
              initial={{ opacity: 0, x: -24, y: 12 }}
              whileInView={{ opacity: 1, x: 0, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: 0.2, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => onLaunchWorkstation('overview')}
              className="absolute top-4 -left-4 sm:left-2 p-3 rounded-xl bg-white shadow-lg border border-black/8 text-xs max-w-[240px] cursor-pointer hover:scale-105 transition-transform"
            >
              <div className="flex items-center gap-1.5 text-emerald-600 font-bold mb-1 text-[11px]">
                <Check className="size-3.5 stroke-[3]" />
                <span>Learned Preference</span>
              </div>
              <div className="text-[#1d1c1d] font-medium leading-snug">
                Dr. Vance prefers 500mg IV Cefepime over Ceftriaxone for ESRD patients.
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 24, y: 12 }}
              whileInView={{ opacity: 1, x: 0, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: 0.35, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => onLaunchWorkstation('provenance')}
              className="absolute top-1/2 -right-4 sm:right-2 p-3 rounded-xl bg-white shadow-lg border border-black/8 text-xs max-w-[250px] cursor-pointer hover:scale-105 transition-transform"
            >
              <div className="flex items-center gap-1.5 text-sky-600 font-bold mb-1 text-[11px]">
                <Sparkles className="size-3.5" />
                <span>Automated Workflow</span>
              </div>
              <div className="text-[#1d1c1d] font-medium leading-snug">
                Auto-tag <span className="text-indigo-600 font-semibold">#pharmacy-on-call</span> on all QTc interval &gt; 500ms telemetry events.
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: 0.5, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="absolute -bottom-2 p-2.5 px-4 rounded-full bg-[#1d1c1d] text-white shadow-xl text-xs font-semibold flex items-center gap-2"
            >
              <ShieldCheck className="size-4 text-emerald-400" />
              <span>Protocol Zero: Rules Anchor Locally with Ed25519 HMAC</span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

// =========================================================
// 5. Section: Build your AI team (Authentic WorkOS Atlas experience)
// Peeking robot heads, wallpaper container, Slack teammate creator, and profile card
// =========================================================
const AtlasBuildTeam: React.FC<{ onLaunchWorkstation: (targetPage?: PageId) => void }> = ({ onLaunchWorkstation }) => {
  const [selectedBotIdx, setSelectedBotIdx] = useState(0);

  const specialists = [
    {
      id: 'pharmbot',
      name: 'PharmBot',
      role: 'Medication Safety Specialist',
      handle: '@pharmbot',
      badgeColor: '#10b981',
      tools: ['Epic CPOE', 'Lexicomp DB', 'Cerner Millennium', 'FHIR R4'],
      channel: '#icu-pharmacy',
      userPrompt: '@ClinixVault can you set up a coworker named "PharmBot"? It should monitor medication orders in #icu-pharmacy, check for contraindications with Lexicomp and Epic CPOE, and notify the attending physician immediately.',
      botResponse: "I've set up @PharmBot! Here is its sovereign clinical configuration:",
      specs: [
        'Specialty: Inpatient Pharmacotherapy & Renal Dosing',
        'Integrations: Lexicomp Clinical DB, Epic CPOE, Cerner Millennium',
        'Trigger: Automatic check on physician CPOE sign with alert on GFR < 30 mL/min'
      ],
      targetPage: 'overview' as PageId
    },
    {
      id: 'radassist',
      name: 'RadAssist',
      role: 'Diagnostic Imaging Triage',
      handle: '@radassist',
      badgeColor: '#0284c7',
      tools: ['Orthanc PACS', 'DICOM C-MOVE', 'PyTorch CUDA', 'RSNA Templates'],
      channel: '#radiology-rapid-reads',
      userPrompt: '@ClinixVault create a specialist called "RadAssist". It should listen for new DICOM studies from Orthanc PACS, perform instant bounding-box anomaly checks on chest X-rays, and draft RSNA structured findings.',
      botResponse: "I've configured @RadAssist! Here is its sovereign imaging configuration:",
      specs: [
        'Specialty: DICOM Chest X-Ray & Trauma CT Triage',
        'Integrations: Orthanc PACS, DICOM C-MOVE, Local PyTorch CUDA',
        'Trigger: Listens on TCP/11112 for inbound scans; flags pneumothorax in < 400ms'
      ],
      targetPage: 'radiology' as PageId
    },
    {
      id: 'codeblue',
      name: 'CodeBlue Triage',
      role: 'ICU Telemetry & Sepsis Alert',
      handle: '@codeblue',
      badgeColor: '#ef4444',
      tools: ['Philips IntelliVue', 'Dante IP Audio', 'TimescaleDB', 'vLLM Kernel'],
      channel: '#icu-telemetry',
      userPrompt: '@ClinixVault configure a teammate named "CodeBlue Triage". Monitor 24/7 telemetry streams from Philips monitors, calculate continuous MEWS/SOFA scores, and page the rapid response team.',
      botResponse: "I've configured @CodeBlue Triage! Here is its real-time telemetry configuration:",
      specs: [
        'Specialty: Hemodynamic Deterioration & Early Sepsis Detection',
        'Integrations: Philips IntelliVue, Dante IP Audio, TimescaleDB',
        'Trigger: Continuous scoring at 100 Hz; broadcasts alert on MEWS >= 5'
      ],
      targetPage: 'microservices' as PageId
    },
    {
      id: 'handoverbot',
      name: 'HandoverBot',
      role: 'Shift Transition & SOAP Notes',
      handle: '@handoverbot',
      badgeColor: '#8b5cf6',
      tools: ['Dante IP Ceiling Mics', 'Whisper C++', 'FHIR R4 Store', 'Staff Roster'],
      channel: '#charge-nurse-handover',
      userPrompt: '@ClinixVault set up "HandoverBot". It should record bedside handover audio through Dante ceiling mics, generate structured SBAR handover summaries, and commit them directly to FHIR R4.',
      botResponse: "I've configured @HandoverBot! Here is its bedside summarization configuration:",
      specs: [
        'Specialty: Ambient Bedside SBAR & Clinical Handover Summarization',
        'Integrations: Dante IP Ceiling Arrays, Whisper C++, FHIR R4 Store',
        'Trigger: Activated at 07:00 / 19:00 shift transitions with Ed25519 hash stamps'
      ],
      targetPage: 'staff' as PageId
    }
  ];

  const currentBot = specialists[selectedBotIdx];

  return (
    <section className="relative overflow-hidden bg-neutral-50 max-md:bg-white pt-20 pb-24 border-t border-black/5">
      <div className="w-full px-6 sm:px-10 max-w-[1080px] mx-auto">
        {/* Peeking Robot Heads Mascot Row with Staggered Viewport Entrance */}
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{
            visible: {
              transition: { staggerChildren: 0.08 }
            }
          }}
          className="flex justify-center items-end gap-6 mb-2 overflow-hidden h-28 pointer-events-none select-none"
        >
          {[
            { w: 'w-20', ty: 'translate-y-6', op: 'opacity-60' },
            { w: 'w-28', ty: 'translate-y-3', op: 'opacity-90' },
            { w: 'w-32', ty: 'translate-y-2', op: 'opacity-100' },
            { w: 'w-28', ty: 'translate-y-3', op: 'opacity-90' },
            { w: 'w-20', ty: 'translate-y-6', op: 'opacity-60' }
          ].map((item, idx) => (
            <motion.div
              key={idx}
              variants={{
                hidden: { opacity: 0, y: 32 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } }
              }}
              className={`${item.w} ${item.ty} ${item.op}`}
            >
              <img src="/atlas/bot.png" alt="" className="size-full object-contain" />
            </motion.div>
          ))}
        </motion.div>

        {/* Display Title and Subtitle */}
        <motion.div 
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto text-center max-w-2xl mb-10"
        >
          <h2 className="font-display text-[60px] sm:text-[76px] lg:text-[80px] leading-none font-semibold tracking-[-.02em] text-balance text-[#1d1c1d]">
            Build your AI team.
          </h2>
          <p className="text-[#1d1c1d]/70 mx-auto mt-4 max-w-xl text-base sm:text-lg font-medium tracking-[-.01em] leading-relaxed">
            Describe the clinical teammate you need in a conversation with ClinixVault. Give it a specialty, a protocol role, and just the hospital tools it needs, then @mention it like anyone else on your staff.
          </p>
        </motion.div>

        {/* Teammate Pill Tabs */}
        <motion.div 
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-center mb-8"
        >
          <div className="inline-flex p-1.5 rounded-full bg-white border border-black/8 shadow-sm gap-1 overflow-x-auto max-w-full">
            {specialists.map((bot, bIdx) => {
              const isSelected = bIdx === selectedBotIdx;
              return (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() => setSelectedBotIdx(bIdx)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#1d1c1d] text-white shadow-sm'
                      : 'text-black/60 hover:text-black hover:bg-black/5'
                  }`}
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: bot.badgeColor }} />
                  <span>{bot.name}</span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Wallpaper Container with Side-by-Side Builder & Profile Card */}
        <motion.div 
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-[36px] sm:rounded-[42px] p-4 sm:p-6 shadow-2xl"
        >
          {/* Background Wallpaper Image */}
          <img
            alt=""
            loading="lazy"
            className="object-cover absolute inset-0 size-full pointer-events-none"
            src="/atlas/wallpaper-bg.jpg"
          />

          <div className="relative grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] items-stretch gap-5">
            {/* Left: Slack Conversation Window */}
            <div className="font-slack rounded-3xl bg-white shadow-xl ring-1 ring-black/10 overflow-hidden flex flex-col justify-between min-h-[420px]">
              <div>
                {/* Header */}
                <div className="flex h-11 items-center justify-between border-b border-black/6 px-4 bg-[#f8f8f8]">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#1d1c1d]">
                    <Hash className="size-3.5 opacity-60" />
                    <span>{currentBot.channel}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    Sovereign Builder
                  </span>
                </div>

                {/* Messages */}
                <div className="p-5 space-y-4 text-xs sm:text-[13px]">
                  {/* User message */}
                  <div className="flex gap-3 text-left">
                    <div className="size-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      DR
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-bold text-[#1d1c1d]">Dr. Jordan Miller</span>
                        <span className="text-black/40 text-[11px]">10:30 AM</span>
                      </div>
                      <p className="text-black/85 leading-relaxed bg-neutral-50 p-3 rounded-xl border border-black/6">
                        {currentBot.userPrompt}
                      </p>
                    </div>
                  </div>

                  {/* ClinixVault Response */}
                  <div className="flex gap-3 text-left">
                    <div className="size-8 rounded-lg bg-[#1d1c1d] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      CV
                    </div>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-bold text-[#1d1c1d]">ClinixVault</span>
                        <span className="bg-[#1d1c1d] text-white text-[9px] px-1 py-0.2 rounded uppercase">APP</span>
                        <span className="text-black/40 text-[11px]">10:30 AM</span>
                      </div>
                      <p className="text-black/85 font-medium mb-2">
                        {currentBot.botResponse}
                      </p>
                      <ul className="space-y-1.5 p-3 rounded-xl bg-neutral-50 border border-black/6 text-xs text-black/80">
                        {currentBot.specs.map((sp, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-sky-500" />
                            <span>{sp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Test Actions */}
              <div className="p-4 border-t border-black/6 bg-[#f8f8f8] flex items-center justify-between">
                <span className="text-xs text-black/50">
                  Ready to assist your clinical staff
                </span>
                <button
                  type="button"
                  onClick={() => onLaunchWorkstation(currentBot.targetPage)}
                  className="px-4 py-1.5 rounded-full bg-[#1d1c1d] text-white text-xs font-semibold hover:bg-[#1d1c1d]/85 transition-all shadow-sm flex items-center gap-1.5"
                >
                  <span>Test {currentBot.name}</span>
                  <ArrowRight className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Right: Teammate Profile Card */}
            <div className="font-slack rounded-3xl bg-white shadow-xl ring-1 ring-black/10 p-6 flex flex-col justify-between min-h-[420px]">
              <div>
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="size-14 rounded-2xl bg-[#1d1c1d] text-white flex items-center justify-center font-bold text-lg shadow-md ring-2 ring-black/10">
                      <span className="size-3.5 rounded-full mr-1.5" style={{ backgroundColor: currentBot.badgeColor }} />
                      {currentBot.name.slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="font-display text-2xl font-bold text-[#1d1c1d]">
                        {currentBot.name}
                      </h3>
                      <p className="text-xs font-semibold text-black/50">
                        {currentBot.role}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full border border-sky-200/60">
                    {currentBot.handle}
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-black/40 block mb-2">
                      Connected Medical Tools
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {currentBot.tools.map((tl) => (
                        <span key={tl} className="text-xs font-medium text-[#1d1c1d] bg-neutral-100 px-2.5 py-1 rounded-md border border-black/5">
                          {tl}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-black/40 block mb-1">
                      Assigned Channel
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1d1c1d] bg-white border border-black/10 px-2.5 py-1 rounded-md">
                      <Hash className="size-3 opacity-60" />
                      <span>{currentBot.channel}</span>
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-black/40 block mb-1">
                      Deployment Environment
                    </span>
                    <p className="text-xs text-black/70 leading-relaxed">
                      Sovereign bare-metal runtime • Protocol Zero air-gapped sandbox.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-5 border-t border-black/6">
                <button
                  type="button"
                  onClick={() => onLaunchWorkstation(currentBot.targetPage)}
                  className="w-full py-2.5 rounded-full bg-[#1d1c1d] hover:bg-[#1d1c1d]/85 text-white text-xs sm:text-sm font-semibold tracking-tight shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <SlackIcon className="size-4" />
                  <span>Launch {currentBot.name} in Workstation</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

// =========================================================
// 6. Section: Built on Protocol Zero. Secure by default.
// Authentic Blueprint Schematic dark section matching WorkOS Atlas
// =========================================================
const AtlasSecurityModule: React.FC<{ onLaunchWorkstation: (targetPage?: PageId) => void }> = ({ onLaunchWorkstation }) => {
  return (
    <section className="relative overflow-hidden bg-[#05070e] text-white pt-24 pb-28">
      {/* Blueprint Grid Lines Background */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: 'linear-gradient(#78beff14 1px, transparent 1px), linear-gradient(90deg, #78beff14 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />

      {/* Scanning Sheen Sweep Light */}
      <div className="absolute inset-x-0 h-40 bg-gradient-to-b from-transparent via-sky-500/10 to-transparent security-sheen-sweep pointer-events-none" />

      <div className="relative z-10 w-full px-6 sm:px-10 max-w-[1080px] mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl mx-auto text-center mb-10"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-mono font-semibold mb-4">
            <ShieldCheck className="size-3.5" />
            PROTOCOL ZERO HARDWARE SPEC
          </span>
          <h2 className="font-display text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-[-.02em] text-white">
            Sovereign on Premise. Secure by default.
          </h2>
          <p className="mt-6 text-base sm:text-lg font-medium text-white/75 max-w-2xl mx-auto leading-relaxed">
            ClinixVault runs entirely on your hospital’s bare-metal workstation or air-gapped on-premise cluster. 0 bps WAN traffic, Zero Cloud APIs, and cryptographically verified HIPAA & FHIR audit trails. Every request respects the clinical privileges your hospital already enforces.
          </p>
        </motion.div>

        {/* Interactive 3D Air-Gap Monolith Architecture Showcase */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-2xl mx-auto mb-14 p-6 sm:p-8 rounded-3xl bg-slate-900/60 border border-sky-500/20 backdrop-blur-xl flex flex-col items-center shadow-[0_20px_60px_-15px_rgba(0,242,254,0.15)]"
        >
          {/* Subtle Abstract Header */}
          <div className="w-full flex items-center justify-center mb-2 z-10">
            <span className="text-xs font-mono font-semibold text-sky-400 uppercase tracking-widest flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-400/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Air-Gap Monolith Architecture • Sovereign Core
            </span>
          </div>

          {/* 3D WebGL Canvas */}
          <div className="relative w-full h-[320px] sm:h-[360px] flex items-center justify-center">
            <ClinicVaultLogo3D
              size={320}
              interactive={true}
              enableOrbit={false}
              enablePulseOnClick={false}
              enableBloom={true}
              className="z-10"
            />
          </div>

          {/* Architecture 4-Layer Breakdown Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full mt-4 text-[11px] font-mono text-center">
            <div className="p-2 rounded-xl bg-blue-950/40 border border-blue-800/40 text-blue-300">
              <div className="font-bold text-white">Layer 1</div>
              <div>Titanium Vault Armor</div>
            </div>
            <div className="p-2 rounded-xl bg-cyan-950/40 border border-cyan-800/40 text-cyan-300">
              <div className="font-bold text-white">Layer 2</div>
              <div>Cyan Laser Air-Gap</div>
            </div>
            <div className="p-2 rounded-xl bg-teal-950/40 border border-teal-800/40 text-teal-300">
              <div className="font-bold text-white">Layer 3</div>
              <div>Sapphire Glass Cross</div>
            </div>
            <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-300">
              <div className="font-bold text-white">Layer 4</div>
              <div>Neural Singularity Core</div>
            </div>
          </div>
        </motion.div>

        {/* 4 Security Spec Metric Cards */}
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{
            visible: {
              transition: { staggerChildren: 0.1 }
            }
          }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto"
        >
          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
            }}
            className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md text-left"
          >
            <div className="text-3xl font-display font-bold text-sky-400 mb-1">0.00 bps</div>
            <div className="text-xs font-bold uppercase tracking-wider text-white/50 mb-1.5">WAN Transmit Rate</div>
            <p className="text-xs text-white/70 leading-normal">Physically air-gapped; 0 patient bytes egress outside firewall.</p>
          </motion.div>

          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
            }}
            className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md text-left"
          >
            <div className="text-3xl font-display font-bold text-emerald-400 mb-1">100% PASS</div>
            <div className="text-xs font-bold uppercase tracking-wider text-white/50 mb-1.5">Air-Gapped Audit</div>
            <p className="text-xs text-white/70 leading-normal">Network socket verification passes automated zero-egress tests.</p>
          </motion.div>

          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
            }}
            className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md text-left"
          >
            <div className="text-3xl font-display font-bold text-purple-400 mb-1">Ed25519</div>
            <div className="text-xs font-bold uppercase tracking-wider text-white/50 mb-1.5">Cryptographic Signatures</div>
            <p className="text-xs text-white/70 leading-normal">Every synthetic clinical word anchors to raw audio millisecond hashes.</p>
          </motion.div>

          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
            }}
            className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md text-left"
          >
            <div className="text-3xl font-display font-bold text-amber-400 mb-1">HIPAA BAA</div>
            <div className="text-xs font-bold uppercase tracking-wider text-white/50 mb-1.5">Role-Based Privileges</div>
            <p className="text-xs text-white/70 leading-normal">Adheres strictly to hospital Active Directory and EHR security roles.</p>
          </motion.div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="mt-12 flex justify-center"
        >
          <button
            type="button"
            onClick={() => onLaunchWorkstation('hardware')}
            className="px-6 py-3 rounded-full bg-white text-[#1d1c1d] hover:bg-white/90 font-semibold text-sm transition-all active:scale-[0.98] shadow-lg flex items-center gap-2"
          >
            <span>View Hardware Sizing & Security Specs</span>
            <ArrowRight className="size-4" />
          </button>
        </motion.div>
      </div>
    </section>
  );
};

// =========================================================
// 7. Section: Ready to meet ClinixVault?
// Authentic WorkOS Atlas 3 Step Cards with Wallpaper Background
// =========================================================
const AtlasReadyToMeet: React.FC<{ onLaunchWorkstation: (targetPage?: PageId) => void }> = ({ onLaunchWorkstation }) => {
  return (
    <section className="pt-24 pb-20 bg-white">
      <div className="w-full px-6 sm:px-10 max-w-[1080px] mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-14 text-center"
        >
          <h2 className="font-display text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-[-.02em] text-[#1d1c1d]">
            Ready to meet ClinixVault?
          </h2>
          <p className="text-[#1d1c1d]/70 mt-4 text-lg font-medium">
            Deploy in minutes on your hospital’s existing workstation.
          </p>
        </motion.div>

        {/* 3 Step Cards with Wallpaper Background matching WorkOS Atlas */}
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{
            visible: {
              transition: { staggerChildren: 0.15 }
            }
          }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {/* Card 1: Slack App Installation Modal */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 28 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
            }}
          >
            <div className="relative overflow-hidden rounded-[28px] p-3 shadow-lg select-none">
              <img
                src="/atlas/wallpaper-bg.jpg"
                alt=""
                className="object-cover absolute inset-0 size-full pointer-events-none"
              />
              <div className="relative rounded-2xl bg-white p-4 shadow-xl border border-black/10 min-h-[170px] flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2.5 border-b border-black/6 pb-2.5 mb-2.5">
                    <div className="size-8 rounded-lg bg-[#1d1c1d] flex items-center justify-center text-white">
                      <Activity className="size-4 text-sky-400 stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#1d1c1d]">ClinixVault AI</div>
                      <div className="text-[10px] text-black/50">Hospital Care Team Access</div>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px] text-black/70">
                    <div className="flex items-center gap-1.5">
                      <Check className="size-3 text-emerald-600 stroke-[3]" />
                      <span>Access clinical chat channels</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check className="size-3 text-emerald-600 stroke-[3]" />
                      <span>Post as @ClinixVault</span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-2 border-t border-black/6">
                  <button
                    type="button"
                    onClick={() => onLaunchWorkstation('overview')}
                    className="cursor-pointer rounded bg-[#007a5a] px-3 py-1 text-[12px] font-semibold text-white transition-all hover:bg-[#00644a] active:scale-95 shadow-sm"
                  >
                    Allow
                  </button>
                </div>
              </div>
            </div>

            <h3 className="mt-5 flex items-baseline gap-2 px-3 font-semibold text-base tracking-[-.01em] text-[#1d1c1d]">
              <span className="text-black/40">1.</span>
              Add ClinixVault to Slack
            </h3>
            <p className="text-[#1d1c1d]/70 mt-1.5 px-3 text-[14px] leading-relaxed font-medium">
              One click, then approve the permissions Slack shows you. Nothing to compile, nothing to configure.
            </p>
          </motion.div>

          {/* Card 2: Slack Message Mention Mockup */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 28 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
            }}
          >
            <div className="relative overflow-hidden rounded-[28px] p-3 shadow-lg select-none">
              <img
                src="/atlas/wallpaper-bg.jpg"
                alt=""
                className="object-cover absolute inset-0 size-full pointer-events-none"
              />
              <div className="relative rounded-2xl bg-white p-4 shadow-xl border border-black/10 min-h-[170px] flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-[#1d1c1d]">
                  <span className="font-bold">#icu-rounds</span>
                  <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                    Bedside Unit
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-neutral-50 border border-black/8 text-xs text-[#1d1c1d]">
                  <span className="text-indigo-600 font-bold bg-indigo-50 px-1 py-0.5 rounded">@ClinixVault</span>
                  <span> what were the latest blood gas levels for Bed 402?</span>
                </div>
                <div className="flex items-center justify-between text-xs text-black/50">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Instant sovereign answer</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLaunchWorkstation('overview')}
                    className="size-6 rounded bg-[#1d1c1d] flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                  >
                    <Send className="size-3" />
                  </button>
                </div>
              </div>
            </div>

            <h3 className="mt-5 flex items-baseline gap-2 px-3 font-semibold text-base tracking-[-.01em] text-[#1d1c1d]">
              <span className="text-black/40">2.</span>
              @mention it anywhere
            </h3>
            <p className="text-[#1d1c1d]/70 mt-1.5 px-3 text-[14px] leading-relaxed font-medium">
              Any clinical channel, thread, or DM — ClinixVault answers from its first message, with the context of your hospital unit.
            </p>
          </motion.div>

          {/* Card 3: Connected Tools Cluster */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 28 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
            }}
          >
            <div className="relative overflow-hidden rounded-[28px] p-3 shadow-lg select-none">
              <img
                src="/atlas/wallpaper-bg.jpg"
                alt=""
                className="object-cover absolute inset-0 size-full pointer-events-none"
              />
              <div className="relative rounded-2xl bg-white p-4 shadow-xl border border-black/10 min-h-[170px] flex flex-col justify-between">
                <div className="text-xs font-bold text-[#1d1c1d] mb-2">
                  Integrated Clinical Stack
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <div className="flex flex-col items-center p-1.5 rounded-lg bg-neutral-50 border border-black/6">
                    <span className="size-2 rounded-full bg-purple-600 mb-1" />
                    <span className="text-[9px] font-bold text-[#1d1c1d]">EPIC</span>
                  </div>
                  <div className="flex flex-col items-center p-1.5 rounded-lg bg-neutral-50 border border-black/6">
                    <span className="size-2 rounded-full bg-blue-600 mb-1" />
                    <span className="text-[9px] font-bold text-[#1d1c1d]">CERNER</span>
                  </div>
                  <div className="flex flex-col items-center p-1.5 rounded-lg bg-neutral-50 border border-black/6">
                    <span className="size-2 rounded-full bg-orange-600 mb-1" />
                    <span className="text-[9px] font-bold text-[#1d1c1d]">FHIR</span>
                  </div>
                  <div className="flex flex-col items-center p-1.5 rounded-lg bg-neutral-50 border border-black/6">
                    <span className="size-2 rounded-full bg-emerald-600 mb-1" />
                    <span className="text-[9px] font-bold text-[#1d1c1d]">PACS</span>
                  </div>
                </div>
                <div className="mt-2 text-center text-[10px] font-semibold text-black/50">
                  300+ Medical Systems Supported
                </div>
              </div>
            </div>

            <h3 className="mt-5 flex items-baseline gap-2 px-3 font-semibold text-base tracking-[-.01em] text-[#1d1c1d]">
              <span className="text-black/40">3.</span>
              Connect tools when you're ready
            </h3>
            <p className="text-[#1d1c1d]/70 mt-1.5 px-3 text-[14px] leading-relaxed font-medium">
              ClinixVault is useful with chat and audio alone. Bring in your EHR, PACS, and lab telemetry whenever you want it to do more.
            </p>
          </motion.div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-14 flex justify-center"
        >
          <button
            type="button"
            onClick={() => onLaunchWorkstation('overview')}
            className="px-8 py-3.5 rounded-full bg-[#1d1c1d] hover:bg-[#1d1c1d]/85 text-white text-base font-semibold tracking-tight shadow-md transition-all active:scale-[0.98] flex items-center gap-2"
          >
            <SlackIcon className="size-5" />
            <span>Launch Sovereign Clinical Workstation</span>
          </button>
        </motion.div>
      </div>
    </section>
  );
};

// =========================================================
// 8. Section: Clean White Footer with Spacious Mascot Stage
// =========================================================
const AtlasFooter: React.FC<{ onLaunchWorkstation: (targetPage?: PageId) => void }> = ({ onLaunchWorkstation }) => {
  const footerLinks: { label: string; page: PageId }[] = [
    { label: 'Workstation Overview', page: 'overview' },
    { label: 'FHIR Provenance', page: 'provenance' },
    { label: 'Radiology DICOM', page: 'radiology' },
    { label: 'Microservices Health', page: 'microservices' },
    { label: 'Hardware Sizing', page: 'hardware' },
    { label: 'Staff Roster', page: 'staff' },
  ];

  return (
    <footer className="relative overflow-hidden bg-white border-t border-black/8 pt-16 pb-12 select-none">
      {/* Background ambient subtle gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FAFAFA] to-white" />

      {/* Mascot Stage: Dedicated spacious stage with clean overflow, proper relative height, zero text collision */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full flex flex-col items-center justify-center mb-10 px-4"
      >
        <div className="relative flex flex-col items-center justify-center p-2 rounded-3xl transition-transform duration-300 hover:scale-[1.02]">
          {/* Subtle soft backdrop radial glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-72 bg-sky-400/10 rounded-full blur-3xl pointer-events-none" />

          <AtlasBotHead
            onLaunchWorkstation={onLaunchWorkstation}
            size={240}
            showBubble={true}
            initialBubble="ClinixVault Atlas ready • Launch workstation"
          />
        </div>
        <p className="mt-3 text-xs font-semibold tracking-wider uppercase text-black/45 text-center">
          Click Atlas to launch clinical workstation
        </p>
      </motion.div>

      {/* Footer Navigation Bar with pristine vertical rhythm, ample breathing room, and high-contrast styling */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-20 w-full px-6 sm:px-10 max-w-[1080px] mx-auto"
      >
        <div className="border-t border-black/8 pt-8 flex flex-col lg:flex-row items-center justify-between gap-6">
          {/* Brand Logo & Copyright Notice */}
          <div className="flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
            <ClinixVaultLogo />
            <span className="text-xs sm:text-[13px] text-black/70 font-medium tracking-tight">
              © 2026 ClinixVault Systems, Inc. Sovereign Clinical AI coworker.
            </span>
          </div>

          {/* Workstation Navigation Quick Links */}
          <nav aria-label="Workstation Navigation" className="flex flex-wrap items-center justify-center lg:justify-end gap-1.5 sm:gap-2 text-xs sm:text-[13px] font-semibold text-black/75">
            {footerLinks.map((link) => (
              <button
                key={link.page}
                type="button"
                onClick={() => onLaunchWorkstation(link.page)}
                className="hover:text-[#1d1c1d] hover:bg-black/5 active:bg-black/10 transition-all cursor-pointer rounded-lg px-2.5 sm:px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
              >
                {link.label}
              </button>
            ))}
          </nav>
        </div>
      </motion.div>
    </footer>
  );
};

// =========================================================
// Top-Level LandingPage Component
// Pure Light Theme, Exact WorkOS Atlas Visual Design, Spacing & Animations
// =========================================================
export const LandingPage: React.FC<LandingPageProps> = ({ 
  onLaunchWorkstation 
}) => {
  return (
    <div className="landing-page min-h-screen bg-white text-[#1d1c1d] font-sans antialiased selection:bg-[#1d1c1d] selection:text-white relative w-full overflow-x-hidden [color-scheme:light]">
      {/* Top Fixed/Absolute Navbar matching WorkOS Atlas */}
      <nav className="hero-intro-fade absolute top-0 right-0 left-0 z-50 py-6 max-md:pt-7">
        <div className="w-full px-6 sm:px-10 max-w-[1080px] mx-auto flex items-center justify-between">
          <ClinixVaultLogo />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onLaunchWorkstation('overview')}
              className="inline-flex items-center justify-center rounded-full font-medium tracking-[-.01em] transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] bg-[#1d1c1d] hover:bg-[#1d1c1d]/85 gap-2 py-2 pr-4 pl-3 text-sm sm:text-base text-white shadow-sm max-md:hidden"
            >
              <SlackIcon className="size-4.5" />
              <span>Launch Workstation</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Hero Header */}
      <header className="overflow-hidden pt-24 pb-16 sm:pt-32 sm:pb-20">
        <div className="w-full px-6 sm:px-10 max-w-[1080px] mx-auto">
          {/* Hero Typography & CTA */}
          <div className="flex flex-col items-center text-center mb-8 sm:mb-12">
            <h1 className="hero-intro-rise font-display text-[50px] sm:text-[72px] lg:text-[84px] leading-[1.02] font-semibold tracking-[-.02em] text-[#1d1c1d] text-balance">
              Meet ClinixVault, <br /> your clinical AI coworker.
            </h1>
            <p className="hero-intro-rise text-[#1d1c1d]/80 mt-6 max-w-[560px] text-base sm:text-lg lg:text-xl font-medium tracking-[-.01em] text-balance leading-relaxed">
              ClinixVault works alongside your hospital team in Slack and EHR to answer clinical questions, automate documentation, and help everyone deliver their best patient care.
            </p>

            {/* Mobile Hero CTA Button */}
            <div className="hero-intro-rise mt-6 hidden max-md:block">
              <button
                type="button"
                onClick={() => onLaunchWorkstation('overview')}
                className="inline-flex items-center justify-center rounded-full font-medium tracking-[-.01em] transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] bg-[#1d1c1d] hover:bg-[#1d1c1d]/85 gap-2 py-2.5 pr-5 pl-4 text-base text-white shadow-sm"
              >
                <SlackIcon className="size-5" />
                <span>Launch Workstation</span>
              </button>
            </div>
          </div>

          {/* Interactive Robot Head Mascot */}
          <div className="hero-intro-rise flex justify-center -mb-6 sm:-mb-8 relative z-20">
            <AtlasBotHead onLaunchWorkstation={onLaunchWorkstation} />
          </div>

          {/* Wallpaper Container with Tabs and Slack Demo Window */}
          <motion.div 
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10"
          >
            <AtlasHeroDemo onLaunchWorkstation={onLaunchWorkstation} />
          </motion.div>

          {/* 3 Column Feature Cards Directly Below Demo (WorkOS Atlas Exact) */}
          <h2 className="sr-only">How teams use ClinixVault</h2>
          <motion.ul 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={{
              visible: {
                transition: { staggerChildren: 0.15 }
              }
            }}
            className="mx-auto mt-16 grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-10 text-left"
          >
            <motion.li 
              variants={{
                hidden: { opacity: 0, y: 24 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
              }}
              className="max-w-75 max-md:mx-auto max-md:flex max-md:flex-col max-md:items-center max-md:text-center"
            >
              <div className="text-[#1d1c1d] mb-4 flex size-7 items-center max-md:mb-2" aria-hidden="true">
                <SlackIcon className="size-4.5" />
              </div>
              <h3 className="text-base font-semibold tracking-[-.01em] text-balance text-[#1d1c1d]">
                Right where your team works
              </h3>
              <p className="text-[#1d1c1d]/70 mt-1.5 text-[15px] font-medium tracking-[-.01em] text-pretty max-md:mt-1 leading-relaxed">
                ClinixVault lives in Slack and nurse stations — ready in any DM, channel, or bedside terminal the moment you need it.
              </p>
            </motion.li>

            <motion.li 
              variants={{
                hidden: { opacity: 0, y: 24 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
              }}
              className="max-w-75 max-md:mx-auto max-md:flex max-md:flex-col max-md:items-center max-md:text-center"
            >
              <div className="text-[#1d1c1d] mb-4 flex size-7 items-center max-md:mb-2" aria-hidden="true">
                {/* Authentic Double Chat Bubble SVG */}
                <svg className="size-5 text-[#1d1c1d]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20" aria-hidden="true">
                  <path fill="currentColor" d="M10.52 16.4q-.97 0-1.65-.35a2.3 2.3 0 0 1-1-1q-.35-.68-.35-1.64V9.7q0-.98.35-1.64.34-.67 1-1.01.68-.35 1.65-.35h6.36q.98 0 1.64.35.68.34 1.01 1.01.35.68.35 1.64v3.7q0 .98-.35 1.64-.33.66-1 1-.67.35-1.66.35h-.14v1.64q0 .39-.19.63a.7.7 0 0 1-.55.23 1 1 0 0 1-.45-.14l-.52-.4-2.28-1.96zM.24 11.63V6.4q0-1 .36-1.7.37-.7 1.06-1.06a3.6 3.6 0 0 1 1.71-.37h8.8q1.34 0 2.1.62.8.62.97 1.76v.14h-4.72q-1.24 0-2.12.47-.88.48-1.35 1.36-.46.88-.46 2.1v3.7q0 1.17.43 2.04l-1.59 1.41q-.3.27-.52.4-.21.15-.46.14a.7.7 0 0 1-.56-.23 1 1 0 0 1-.19-.63v-1.78h-.33q-1.02 0-1.71-.37-.7-.36-1.06-1.06a4 4 0 0 1-.36-1.7" />
                </svg>
              </div>
              <h3 className="text-base font-semibold tracking-[-.01em] text-balance text-[#1d1c1d]">
                Talk it through
              </h3>
              <p className="text-[#1d1c1d]/70 mt-1.5 text-[15px] font-medium tracking-[-.01em] text-pretty max-md:mt-1 leading-relaxed">
                Ask a question, add patient vitals, and dig deeper. ClinixVault keeps up with clinical context as the bedside discussion unfolds.
              </p>
            </motion.li>

            <motion.li 
              variants={{
                hidden: { opacity: 0, y: 24 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
              }}
              className="max-w-75 max-md:mx-auto max-md:flex max-md:flex-col max-md:items-center max-md:text-center"
            >
              <div className="text-[#1d1c1d] mb-4 flex size-7 items-center max-md:mb-2" aria-hidden="true">
                {/* Authentic Lightning Action SVG */}
                <svg className="size-4.5 text-[#1d1c1d]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 17 17" aria-hidden="true">
                  <path fill="currentColor" d="M2 9.89q0-.22.24-.46l8.39-8.13a1 1 0 0 1 .5-.28 1 1 0 0 1 .48.04q.22.08.3.29.1.2-.04.47l-2.75 5.8h5.22q.3 0 .48.15.18.13.18.34t-.24.46L6.37 16.7a1 1 0 0 1-.5.27 1 1 0 0 1-.5-.04.6.6 0 0 1-.3-.28q-.08-.21.06-.48l2.75-5.8H2.66a1 1 0 0 1-.48-.14.4.4 0 0 1-.18-.35" />
                </svg>
              </div>
              <h3 className="text-base font-semibold tracking-[-.01em] text-balance text-[#1d1c1d]">
                Turn questions into action
              </h3>
              <p className="text-[#1d1c1d]/70 mt-1.5 text-[15px] font-medium tracking-[-.01em] text-pretty max-md:mt-1 leading-relaxed">
                Have ClinixVault draft a clinical brief, handle the order follow-up, or set recurring shift handover briefs to run on their own.
              </p>
            </motion.li>
          </motion.ul>
        </div>
      </header>

      {/* Section 1: Connected to all your tools */}
      <AtlasConnectedTools onLaunchWorkstation={onLaunchWorkstation} />

      {/* Section 2: A coworker for the whole team */}
      <AtlasTeamCoworker onLaunchWorkstation={onLaunchWorkstation} />

      {/* Section 3: Always learning, never guessing */}
      <AtlasAlwaysLearning onLaunchWorkstation={onLaunchWorkstation} />

      {/* Section 4: Build your AI team */}
      <AtlasBuildTeam onLaunchWorkstation={onLaunchWorkstation} />

      {/* Section 5: Sovereign on Premise. Secure by default. */}
      <AtlasSecurityModule onLaunchWorkstation={onLaunchWorkstation} />

      {/* Section 6: Ready to meet ClinixVault? */}
      <AtlasReadyToMeet onLaunchWorkstation={onLaunchWorkstation} />

      {/* Section 7: Footer */}
      <AtlasFooter onLaunchWorkstation={onLaunchWorkstation} />
    </div>
  );
};
