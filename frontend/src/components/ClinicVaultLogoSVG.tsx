import React, { useId } from 'react';

export interface ClinicVaultLogoSVGProps {
  size?: number | string;
  className?: string;
  isLoading?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export const ClinicVaultLogoSVG: React.FC<ClinicVaultLogoSVGProps> = ({
  size = 40,
  className = '',
  isLoading = false,
  style = {},
  onClick
}) => {
  const uid = useId().replace(/:/g, '');
  const vaultArmorId = `vaultArmor_${uid}`;
  const clinicalCoreId = `clinicalCore_${uid}`;
  const aiPulseId = `aiPulse_${uid}`;
  const glowId = `glow_${uid}`;

  const dimension = typeof size === 'number' ? `${size}px` : size;

  return (
    <svg
      viewBox="0 0 240 240"
      width={dimension}
      height={dimension}
      xmlns="http://www.w3.org/2000/svg"
      className={`clinicvault-logo-svg select-none shrink-0 ${isLoading ? 'animate-pulse' : ''} ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        overflow: 'visible',
        ...style
      }}
      onClick={onClick}
    >
      <defs>
        <linearGradient id={vaultArmorId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#1e40af" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>

        <linearGradient id={clinicalCoreId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>

        <radialGradient id={aiPulseId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="45%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" stopOpacity="0" />
        </radialGradient>

        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* 1. OUTER ZERO-EGRESS VAULT PERIMETER (Heavy Sealed Hexagon) */}
      <polygon
        points="120,14 212,67 212,173 120,226 28,173 28,67"
        fill="none"
        stroke={`url(#${vaultArmorId})`}
        strokeWidth="14"
        strokeLinejoin="round"
      />

      {/* Inward-Locking Zero-Egress Bolts */}
      <g strokeWidth="4" strokeLinecap="round">
        <line x1="120" y1="21" x2="120" y2="35" stroke="#38bdf8" />
        <line x1="120" y1="219" x2="120" y2="205" stroke="#1e40af" />
        <line x1="34" y1="70" x2="46" y2="77" stroke="#38bdf8" />
        <line x1="206" y1="170" x2="194" y2="163" stroke="#1e40af" />
        <line x1="206" y1="70" x2="194" y2="77" stroke="#38bdf8" />
        <line x1="34" y1="170" x2="46" y2="163" stroke="#1e40af" />
      </g>

      {/* 2. THE AIR-GAP (Rotating Cyan Dashed Isolation Boundary) */}
      <g
        style={{
          transformOrigin: '120px 120px',
          animation: isLoading 
            ? 'airgap-spin 3s linear infinite' 
            : 'airgap-spin 20s linear infinite'
        }}
      >
        <polygon
          points="120,42 188,81 188,159 120,198 52,159 52,81"
          fill="none"
          stroke="#00f2fe"
          strokeWidth="1.8"
          strokeDasharray="6 6"
          opacity={isLoading ? 0.9 : 0.65}
        />
      </g>

      {/* 3. INNER CLINICAL CROSS SANCTUARY (Medical Care + Appliance Chassis) */}
      <path
        d="M98,62 H142 V98 H178 V142 H142 V178 H98 V142 H62 V98 H98 Z"
        fill="#0b1524"
        stroke={`url(#${clinicalCoreId})`}
        strokeWidth="5"
        strokeLinejoin="round"
      />

      {/* 4. ENCAPSULATED NEURAL AI CORE (Self-Contained Compute Graph) */}
      <g filter={`url(#${glowId})`}>
        {/* Internal Neural Connections */}
        <line x1="120" y1="80" x2="120" y2="160" stroke="#2dd4bf" strokeWidth="2" opacity="0.75" />
        <line x1="80" y1="120" x2="160" y2="120" stroke="#2dd4bf" strokeWidth="2" opacity="0.75" />
        <line x1="120" y1="80" x2="80" y2="120" stroke="#38bdf8" strokeWidth="1.5" opacity="0.55" />
        <line x1="120" y1="80" x2="160" y2="120" stroke="#38bdf8" strokeWidth="1.5" opacity="0.55" />
        <line x1="120" y1="160" x2="80" y2="120" stroke="#38bdf8" strokeWidth="1.5" opacity="0.55" />
        <line x1="120" y1="160" x2="160" y2="120" stroke="#38bdf8" strokeWidth="1.5" opacity="0.55" />

        {/* Outer Synapse Nodes */}
        <circle 
          cx="120" cy="80" r="5" fill="#00f2fe" 
          className={isLoading ? 'animate-ping' : ''} 
          style={{ transformOrigin: '120px 80px', animationDuration: '2s' }}
        />
        <circle cx="120" cy="80" r="5" fill="#00f2fe" />
        <circle cx="120" cy="160" r="5" fill="#00f2fe" />
        <circle cx="80" cy="120" r="5" fill="#00f2fe" />
        <circle cx="160" cy="120" r="5" fill="#00f2fe" />

        {/* Central Singularity AI Brain with Dynamic Pulse */}
        <circle
          cx="120"
          cy="120"
          r="22"
          fill={`url(#${aiPulseId})`}
          style={{
            transformOrigin: '120px 120px',
            animation: isLoading 
              ? 'core-pulse 0.9s ease-in-out infinite alternate' 
              : 'core-pulse 2.4s ease-in-out infinite alternate'
          }}
        />
        <circle
          cx="120"
          cy="120"
          r="9"
          fill="#ffffff"
          stroke="#10b981"
          strokeWidth="3"
        />
      </g>
    </svg>
  );
};

export default ClinicVaultLogoSVG;
