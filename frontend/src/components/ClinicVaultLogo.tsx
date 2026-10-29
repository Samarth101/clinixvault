import React, { forwardRef } from 'react';
import { ClinicVaultLogo3D, ClinicVaultLogo3DHandle } from './ClinicVaultLogo3D';
import { ClinicVaultLogoSVG } from './ClinicVaultLogoSVG';

export interface ClinicVaultLogoProps {
  /** Logo display variant: '3d' (WebGL), 'svg' (vector), or 'auto' */
  variant?: '3d' | 'svg' | 'auto';
  /** Size in pixels (e.g. 32, 44, 48, 64, 120, 500) */
  size?: number | string;
  /** Whether to show "ClinixVault" brand text next to the emblem */
  showWordmark?: boolean;
  /** Optional secondary subtitle / tag e.g. "ATLAS" or "ENTERPRISE" */
  wordmarkTag?: string;
  /** Wordmark styling overrides */
  wordmarkClassName?: string;
  /** Active loading animation mode */
  isLoading?: boolean;
  /** Whether mouse parallax is active */
  interactive?: boolean;
  /** Trigger AI pulse on click */
  enablePulseOnClick?: boolean;
  /** Enable 3D Orbit controls (user can drag/rotate) */
  enableOrbit?: boolean;
  /** Additional CSS class for the container */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /** Click callback */
  onClick?: () => void;
}

export const ClinicVaultLogo = forwardRef<ClinicVaultLogo3DHandle, ClinicVaultLogoProps>(({
  variant = '3d',
  size = 40,
  showWordmark = false,
  wordmarkTag,
  wordmarkClassName = '',
  isLoading = false,
  interactive = true,
  enablePulseOnClick = true,
  enableOrbit = false,
  className = '',
  style = {},
  onClick
}, ref) => {
  const numSize = typeof size === 'number' ? size : parseInt(String(size), 10) || 40;
  
  // Decide variant
  const effectiveVariant = variant === 'auto' 
    ? (numSize >= 44 ? '3d' : 'svg')
    : variant;

  return (
    <div 
      className={`clinicvault-brand-unit inline-flex items-center gap-3 select-none ${className}`}
      style={style}
      onClick={onClick}
    >
      {effectiveVariant === '3d' ? (
        <ClinicVaultLogo3D
          ref={ref}
          size={size}
          interactive={interactive}
          enableOrbit={enableOrbit}
          enablePulseOnClick={enablePulseOnClick}
          isLoading={isLoading}
          onClick={onClick}
        />
      ) : (
        <ClinicVaultLogoSVG
          size={size}
          isLoading={isLoading}
          onClick={onClick}
        />
      )}

      {showWordmark && (
        <div className="flex items-baseline gap-1.5 leading-none">
          <span className={`font-display text-[22px] font-bold tracking-tight text-[#1d1c1d] dark:text-white ${wordmarkClassName}`}>
            ClinixVault
          </span>
          {wordmarkTag && (
            <span className="text-[10px] font-bold tracking-widest text-[#1d1c1d]/60 dark:text-white/60 uppercase bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
              {wordmarkTag}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

ClinicVaultLogo.displayName = 'ClinicVaultLogo';

export default ClinicVaultLogo;
