import React from 'react';
import { ClinicVaultLogo } from './ClinicVaultLogo';
import { ShieldCheck, Cpu } from 'lucide-react';

export interface ClinicVaultLoaderProps {
  /** Loading message */
  message?: string;
  /** Secondary subtitle */
  submessage?: string;
  /** Logo size in pixels (default 80) */
  size?: number;
  /** Whether to render as full-screen overlay */
  fullScreen?: boolean;
  /** Use 3D WebGL logo or lightweight SVG */
  variant?: '3d' | 'svg';
  /** Additional container classes */
  className?: string;
}

export const ClinicVaultLoader: React.FC<ClinicVaultLoaderProps> = ({
  message = "Processing clinical inference...",
  submessage = "Air-Gapped Local Hardware • Zero Cloud Egress",
  size = 72,
  fullScreen = false,
  variant = '3d',
  className = ''
}) => {
  const content = (
    <div className={`flex flex-col items-center justify-center text-center p-6 select-none ${className}`}>
      {/* 3D / SVG Animated Logo with Active Loading Laser Ring */}
      <div className="relative mb-4 flex items-center justify-center">
        <div className="absolute inset-0 bg-sky-500/10 dark:bg-sky-500/20 rounded-full blur-2xl animate-pulse" />
        <ClinicVaultLogo
          variant={variant}
          size={size}
          isLoading={true}
          interactive={false}
          enablePulseOnClick={false}
        />
      </div>

      {/* Primary Message */}
      <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
        <Cpu className="w-4 h-4 text-sky-500 animate-spin" />
        <span>{message}</span>
      </div>

      {/* Submessage */}
      {submessage && (
        <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>{submessage}</span>
        </div>
      )}

      {/* Subtle Progress Scanner Line */}
      <div className="w-48 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-4 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-sky-400 via-teal-400 to-indigo-500 rounded-full animate-[progress_1.8s_ease-in-out_infinite]" />
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md">
        <div className="bg-white/90 dark:bg-slate-900/90 border border-white/80 dark:border-slate-800 rounded-3xl p-8 shadow-2xl max-w-sm w-full mx-4">
          {content}
        </div>
      </div>
    );
  }

  return content;
};

export default ClinicVaultLoader;
