import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Sparkles, 
  ShieldCheck, 
  X,
  Maximize2,
  Minimize2,
  Network
} from 'lucide-react';
import { GraphNode, GraphLink, GraphNodeCategory } from '../types';
import { ClinicalKnowledgeGraph3D } from './ClinicalKnowledgeGraph3D';

interface ClinicalKnowledgeGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  patientId: string;
  patientName?: string;
  className?: string;
  height?: number | string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  initialViewMode?: '2d' | '3d';
  onNodeSelect?: (node: GraphNode | null) => void;
}

interface VisualCategory {
  gradientStart: string;
  gradientEnd: string;
  stroke: string;
  shadow: string;
  text: string;
  bg: string;
  badge: string;
  symbol: string;
}

const CATEGORY_STYLES: Record<GraphNodeCategory, VisualCategory> = {
  Patient: {
    gradientStart: '#1e293b',
    gradientEnd: '#0f172a',
    stroke: '#475569',
    shadow: 'rgba(15, 23, 42, 0.45)',
    text: '#ffffff',
    bg: 'bg-slate-900 text-white',
    badge: 'Patient',
    symbol: 'PT',
  },
  Condition: {
    gradientStart: '#fb7185',
    gradientEnd: '#e11d48',
    stroke: '#be123c',
    shadow: 'rgba(225, 29, 72, 0.4)',
    text: '#ffffff',
    bg: 'bg-rose-50 text-rose-700 border-rose-200',
    badge: 'Condition',
    symbol: 'CD',
  },
  Anatomy: {
    gradientStart: '#38bdf8',
    gradientEnd: '#0284c7',
    stroke: '#0369a1',
    shadow: 'rgba(2, 132, 199, 0.4)',
    text: '#ffffff',
    bg: 'bg-sky-50 text-sky-700 border-sky-200',
    badge: 'Anatomy',
    symbol: 'AN',
  },
  Medication: {
    gradientStart: '#34d399',
    gradientEnd: '#059669',
    stroke: '#047857',
    shadow: 'rgba(5, 150, 105, 0.4)',
    text: '#ffffff',
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    badge: 'Medication',
    symbol: 'RX',
  },
  Observation: {
    gradientStart: '#fbbf24',
    gradientEnd: '#d97706',
    stroke: '#b45309',
    shadow: 'rgba(217, 119, 6, 0.4)',
    text: '#ffffff',
    bg: 'bg-amber-50 text-amber-700 border-amber-200',
    badge: 'Observation',
    symbol: 'OB',
  },
  DiagnosticReport: {
    gradientStart: '#a78bfa',
    gradientEnd: '#7c3aed',
    stroke: '#6d28d9',
    shadow: 'rgba(124, 58, 237, 0.4)',
    text: '#ffffff',
    bg: 'bg-purple-50 text-purple-700 border-purple-200',
    badge: 'DiagnosticReport',
    symbol: 'DX',
  },
  Encounter: {
    gradientStart: '#818cf8',
    gradientEnd: '#4f46e5',
    stroke: '#4338ca',
    shadow: 'rgba(79, 70, 229, 0.4)',
    text: '#ffffff',
    bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    badge: 'Encounter',
    symbol: 'EN',
  },
  ProvenanceNode: {
    gradientStart: '#22d3ee',
    gradientEnd: '#0891b2',
    stroke: '#0e7490',
    shadow: 'rgba(8, 145, 178, 0.4)',
    text: '#ffffff',
    bg: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    badge: 'ProvenanceNode',
    symbol: 'PR',
  },
  Entity: {
    gradientStart: '#94a3b8',
    gradientEnd: '#475569',
    stroke: '#334155',
    shadow: 'rgba(71, 85, 105, 0.35)',
    text: '#ffffff',
    bg: 'bg-slate-100 text-slate-700 border-slate-300',
    badge: 'Entity',
    symbol: 'EN',
  },
};

interface SimPos {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  targetRadius: number;
}

export const ClinicalKnowledgeGraph: React.FC<ClinicalKnowledgeGraphProps> = ({
  nodes: rawNodes,
  links: rawLinks,
  patientId,
  patientName = 'Clinical Patient',
  className = '',
  height = 620,
  isFullscreen: externalFullscreen,
  onToggleFullscreen,
  initialViewMode = '3d',
  onNodeSelect,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fullscreen & 2D/3D Mode Management
  const [internalFullscreen, setInternalFullscreen] = useState<boolean>(false);
  const isFullscreen = externalFullscreen !== undefined ? externalFullscreen : internalFullscreen;

  const toggleFullscreen = useCallback(() => {
    if (onToggleFullscreen) {
      onToggleFullscreen();
    } else if (isFullscreen || document.fullscreenElement) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setInternalFullscreen(false);
    } else {
      const el = rootRef.current?.parentElement || rootRef.current;
      if (el && el.requestFullscreen) {
        el.requestFullscreen().catch(() => {
          setInternalFullscreen(true);
        });
      } else {
        setInternalFullscreen(true);
      }
    }
  }, [isFullscreen, onToggleFullscreen]);

  // Sync internal fullscreen state only when unmanaged
  useEffect(() => {
    if (onToggleFullscreen) return;
    const handleFsChange = () => {
      setInternalFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [onToggleFullscreen]);

  const [viewMode, setViewMode] = useState<'2d' | '3d'>(initialViewMode);

  // ESC key listener for exiting fullscreen in unmanaged mode
  useEffect(() => {
    if (onToggleFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && internalFullscreen) {
        setInternalFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [internalFullscreen, onToggleFullscreen]);

  // Lock body scroll during fullscreen
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  const numericHeight = typeof height === 'number' ? height : 620;
  const effectiveHeight = isFullscreen
    ? (typeof window !== 'undefined' ? Math.max(500, window.innerHeight - 80) : 620)
    : numericHeight;

  // Active Category Filters
  const [activeFilters, setActiveFilters] = useState<Record<GraphNodeCategory, boolean>>({
    Patient: true,
    Condition: true,
    Anatomy: true,
    Medication: true,
    Observation: true,
    DiagnosticReport: true,
    Encounter: true,
    ProvenanceNode: true,
    Entity: true,
  });

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState<boolean>(false);
  const [draggedNode, setDraggedNode] = useState<GraphNode | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Filtered nodes and quick lookup
  const filteredNodes = useMemo(() => {
    return rawNodes.filter((n) => activeFilters[n.label] !== false);
  }, [rawNodes, activeFilters]);

  const filteredNodeIds = useMemo(() => {
    return new Set(filteredNodes.map((n) => n.id));
  }, [filteredNodes]);

  // Filtered links
  const filteredLinks = useMemo(() => {
    return rawLinks.filter((l) => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      return filteredNodeIds.has(srcId) && filteredNodeIds.has(tgtId);
    });
  }, [rawLinks, filteredNodeIds]);

  // Connected nodes map for hover highlighting
  const connectedMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    filteredLinks.forEach((link) => {
      const srcId = typeof link.source === 'object' ? link.source.id : link.source;
      const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
      if (!map.has(srcId)) map.set(srcId, new Set());
      if (!map.has(tgtId)) map.set(tgtId, new Set());
      map.get(srcId)!.add(tgtId);
      map.get(tgtId)!.add(srcId);
    });
    return map;
  }, [filteredLinks]);

  // Physical positions simulation cache
  const positionsRef = useRef<Map<string, SimPos>>(new Map());

  // Radial Stratified Position Initializer
  const initializeSpaciousLayout = useCallback(() => {
    const container = containerRef.current;
    const w = container ? container.clientWidth : 860;
    const h = container?.clientHeight || effectiveHeight;
    const cx = w / 2;
    const cy = h / 2;

    const current = positionsRef.current;
    current.clear();

    // 1. Patient root at absolute center
    const patientNode = filteredNodes.find((n) => n.id === patientId || n.label === 'Patient');
    if (patientNode) {
      current.set(patientNode.id, {
        x: cx,
        y: cy,
        vx: 0,
        vy: 0,
        radius: 32,
        targetRadius: 32,
      });
    }

    // 2. Primary Clinical Ring (Conditions, Reports, Encounters) -> Orbit R = 210px
    const primaryNodes = filteredNodes.filter(
      (n) => n.id !== patientId && (n.label === 'Condition' || n.label === 'DiagnosticReport' || n.label === 'Encounter')
    );
    const pCount = Math.max(1, primaryNodes.length);
    primaryNodes.forEach((node, i) => {
      const angle = (i / pCount) * 2 * Math.PI - Math.PI / 2;
      const orbit = 210 + (i % 2) * 25;
      current.set(node.id, {
        x: cx + Math.cos(angle) * orbit,
        y: cy + Math.sin(angle) * orbit,
        vx: 0,
        vy: 0,
        radius: node.label === 'Condition' ? 24 : 22,
        targetRadius: node.label === 'Condition' ? 24 : 22,
      });
    });

    // 3. Secondary Clinical Ring (Anatomy, Medication, Observation, Provenance) -> Orbit R = 370px
    const secondaryNodes = filteredNodes.filter(
      (n) => n.id !== patientId && n.label !== 'Condition' && n.label !== 'DiagnosticReport' && n.label !== 'Encounter'
    );
    const sCount = Math.max(1, secondaryNodes.length);
    secondaryNodes.forEach((node, i) => {
      const angle = (i / sCount) * 2 * Math.PI + Math.PI / 4;
      const orbit = 360 + (i % 3) * 35;
      current.set(node.id, {
        x: cx + Math.cos(angle) * orbit,
        y: cy + Math.sin(angle) * orbit,
        vx: 0,
        vy: 0,
        radius: 19,
        targetRadius: 19,
      });
    });
  }, [filteredNodes, patientId, effectiveHeight]);

  // Auto-fit Graph into Viewport
  const handleFitToScreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight || effectiveHeight;

    if (filteredNodes.length === 0) {
      setPan({ x: 0, y: 0 });
      setZoom(1.0);
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    positionsRef.current.forEach((pos) => {
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    });

    const graphWidth = Math.max(300, (maxX - minX) + 240);
    const graphHeight = Math.max(300, (maxY - minY) + 220);
    const scaleX = w / graphWidth;
    const scaleY = h / graphHeight;
    const targetZoom = Math.max(0.6, Math.min(1.15, Math.min(scaleX, scaleY)));

    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;

    setZoom(Number(targetZoom.toFixed(2)));
    setPan({
      x: Math.round(w / 2 - graphCenterX * targetZoom),
      y: Math.round(h / 2 - graphCenterY * targetZoom),
    });
  }, [filteredNodes, effectiveHeight]);

  // Trigger layout on node updates or viewMode switch to 2d
  useEffect(() => {
    if (viewMode === '2d') {
      initializeSpaciousLayout();
      const timer = setTimeout(() => {
        handleFitToScreen();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [viewMode, initializeSpaciousLayout, handleFitToScreen]);

  // Main HiDPI Canvas Physics & Render Loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // HiDPI DevicePixelRatio Scaling
    const dpr = Math.max(1, window.devicePixelRatio || 2);
    const cssWidth = container.clientWidth || 860;
    const canvasParent = canvas.parentElement;
    const cssHeight = canvasParent?.clientHeight || effectiveHeight;

    if (canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }

    const simulateAndRender = () => {
      const positions = positionsRef.current;
      const nodeArray = filteredNodes.map((n) => ({
        node: n,
        pos: positions.get(n.id) || {
          x: cssWidth / 2,
          y: cssHeight / 2,
          vx: 0,
          vy: 0,
          radius: 20,
          targetRadius: 20,
        },
      }));

      // 1. Spacious Physics Simulation
      // Pairwise Repulsion (Strong Coulomb repulsion to prevent any clumping)
      const nLen = nodeArray.length;
      for (let i = 0; i < nLen; i++) {
        for (let j = i + 1; j < nLen; j++) {
          const a = nodeArray[i];
          const b = nodeArray[j];
          const dx = b.pos.x - a.pos.x;
          const dy = b.pos.y - a.pos.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);

          const minDist = a.pos.radius + b.pos.radius + 85;
          const force = (minDist * minDist * 80) / Math.max(120, distSq);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (a.node !== draggedNode) {
            a.pos.vx -= fx * 0.007;
            a.pos.vy -= fy * 0.007;
          }
          if (b.node !== draggedNode) {
            b.pos.vx += fx * 0.007;
            b.pos.vy += fy * 0.007;
          }

          // Hard collision resolution pass to guarantee ZERO node overlapping
          const hardOverlap = (a.pos.radius + b.pos.radius + 40) - dist;
          if (hardOverlap > 0) {
            const pushX = (dx / dist) * hardOverlap * 0.45;
            const pushY = (dy / dist) * hardOverlap * 0.45;
            if (a.node !== draggedNode) {
              a.pos.x -= pushX;
              a.pos.y -= pushY;
            }
            if (b.node !== draggedNode) {
              b.pos.x += pushX;
              b.pos.y += pushY;
            }
          }
        }
      }

      // Link Spring Forces (Long rest length: 220px)
      filteredLinks.forEach((link) => {
        const srcId = typeof link.source === 'object' ? link.source.id : link.source;
        const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
        const srcPos = positions.get(srcId);
        const tgtPos = positions.get(tgtId);

        if (srcPos && tgtPos) {
          const dx = tgtPos.x - srcPos.x;
          const dy = tgtPos.y - srcPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const desiredDist = 220;
          const springForce = (dist - desiredDist) * 0.025;

          const fx = (dx / dist) * springForce;
          const fy = (dy / dist) * springForce;

          if (srcId !== draggedNode?.id) {
            srcPos.vx += fx;
            srcPos.vy += fy;
          }
          if (tgtId !== draggedNode?.id) {
            tgtPos.vx -= fx;
            tgtPos.vy -= fy;
          }
        }
      });

      // Ultra-gentle centering gravity & damping
      const cx = cssWidth / 2;
      const cy = cssHeight / 2;
      nodeArray.forEach(({ node, pos }) => {
        if (node === draggedNode) return;
        const gx = (cx - pos.x) * 0.0007;
        const gy = (cy - pos.y) * 0.0007;
        pos.vx = (pos.vx + gx) * 0.88;
        pos.vy = (pos.vy + gy) * 0.88;

        pos.x += pos.vx;
        pos.y += pos.vy;
      });

      // 2. High-Definition Canvas Rendering
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      
      // Clean high-tech canvas background
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      // Subtle Dot-Matrix Coordinate Grid
      ctx.save();
      ctx.translate(pan.x % 32, pan.y % 32);
      ctx.fillStyle = '#e2e8f0';
      const gridStep = 32;
      for (let x = -gridStep; x < cssWidth + gridStep; x += gridStep) {
        for (let y = -gridStep; y < cssHeight + gridStep; y += gridStep) {
          ctx.beginPath();
          ctx.arc(x, y, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // Pan & Zoom Coordinate Space
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // Determine active highlight focus
      const activeFocusId = hoveredNodeId || selectedNode?.id || null;
      const activeNeighbors = activeFocusId ? connectedMap.get(activeFocusId) : null;

      // 3. Render Directed Edges
      filteredLinks.forEach((link) => {
        const srcId = typeof link.source === 'object' ? link.source.id : link.source;
        const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
        const src = positions.get(srcId);
        const tgt = positions.get(tgtId);

        if (src && tgt) {
          const isEdgeActive = activeFocusId && (srcId === activeFocusId || tgtId === activeFocusId);
          const isDimmed = activeFocusId && !isEdgeActive;

          ctx.save();
          ctx.globalAlpha = isDimmed ? 0.12 : 1.0;

          // Draw edge line
          ctx.beginPath();
          ctx.moveTo(src.x, src.y);
          ctx.lineTo(tgt.x, tgt.y);
          ctx.strokeStyle = isEdgeActive ? '#2563eb' : (activeFocusId ? '#cbd5e1' : '#94a3b8');
          ctx.lineWidth = isEdgeActive ? 3.5 : 1.4;
          if (isEdgeActive) {
            ctx.shadowColor = 'rgba(37, 99, 235, 0.65)';
            ctx.shadowBlur = 12;
          }
          ctx.stroke();

          // Arrowhead at destination node boundary
          const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
          const arrowDist = tgt.radius + 8;
          const arrowX = tgt.x - Math.cos(angle) * arrowDist;
          const arrowY = tgt.y - Math.sin(angle) * arrowDist;

          ctx.translate(arrowX, arrowY);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-7, -4);
          ctx.lineTo(-7, 4);
          ctx.closePath();
          ctx.fillStyle = isEdgeActive ? '#2563eb' : '#64748b';
          ctx.fill();
          ctx.restore();

          // Relationship Pill Badge (Rendered with rounded backdrop so it NEVER clashes)
          if (link.type && zoom > 0.65) {
            const midX = (src.x + tgt.x) / 2;
            const midY = (src.y + tgt.y) / 2;
            const labelText = link.type.replace(/_/g, ' ');

            ctx.save();
            ctx.globalAlpha = isDimmed ? 0.25 : 1.0;
            ctx.font = 'bold 9px Fira Sans, sans-serif';
            const metrics = ctx.measureText(labelText);
            const pillW = metrics.width + 12;
            const pillH = 17;

            // Frosted rounded pill background
            ctx.beginPath();
            ctx.roundRect(midX - pillW / 2, midY - pillH / 2, pillW, pillH, 6);
            ctx.fillStyle = isEdgeActive ? '#eff6ff' : 'rgba(255, 255, 255, 0.95)';
            ctx.fill();
            ctx.strokeStyle = isEdgeActive ? '#93c5fd' : '#e2e8f0';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Label text
            ctx.fillStyle = isEdgeActive ? '#1d4ed8' : '#475569';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, midX, midY);
            ctx.restore();
          }
        }
      });

      // 4. Render Clinical Nodes
      nodeArray.forEach(({ node, pos }) => {
        const style = CATEGORY_STYLES[node.label] || CATEGORY_STYLES.Entity;
        const isHovered = hoveredNodeId === node.id;
        const isSelected = selectedNode?.id === node.id;
        const isNeighbor = activeNeighbors?.has(node.id);
        const isFocus = isHovered || isSelected;

        const isDimmed = activeFocusId && !isFocus && !isNeighbor;

        ctx.save();
        ctx.globalAlpha = isDimmed ? 0.18 : 1.0;

        // Outer Glow Ring when focused
        if (isFocus) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, pos.radius + 9, 0, Math.PI * 2);
          ctx.fillStyle = style.shadow;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(pos.x, pos.y, pos.radius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else if (isNeighbor) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, pos.radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = '#93c5fd';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // 3D Glass Sphere Radial Gradient
        const grad = ctx.createRadialGradient(
          pos.x - pos.radius * 0.35,
          pos.y - pos.radius * 0.35,
          pos.radius * 0.15,
          pos.x,
          pos.y,
          pos.radius
        );
        grad.addColorStop(0, style.gradientStart);
        grad.addColorStop(1, style.gradientEnd);

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pos.radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.shadowColor = style.shadow;
        ctx.shadowBlur = 10;
        ctx.fill();

        // Node Outer Border
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = isFocus ? '#ffffff' : style.stroke;
        ctx.stroke();

        // Node Centered Symbol / Icon Glyph
        ctx.font = `bold ${Math.max(10, Math.round(pos.radius * 0.65))}px Fira Sans, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(style.symbol, pos.x, pos.y);

        // 5. High-Contrast Frosted Title Badge (Below Node)
        const title = node.name || node.id;
        const displayTitle = title.length > 24 ? title.slice(0, 22) + '…' : title;

        ctx.font = isFocus ? 'bold 11px Fira Sans, sans-serif' : '600 10.5px Fira Sans, sans-serif';
        const titleMetrics = ctx.measureText(displayTitle);
        const cardW = Math.max(70, titleMetrics.width + 16);
        const cardH = 22;
        const cardY = pos.y + pos.radius + 8;

        ctx.beginPath();
        ctx.roundRect(pos.x - cardW / 2, cardY, cardW, cardH, 7);
        ctx.fillStyle = isFocus ? '#ffffff' : 'rgba(255, 255, 255, 0.94)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
        ctx.shadowBlur = 6;
        ctx.fill();

        ctx.strokeStyle = isFocus ? '#2563eb' : '#cbd5e1';
        ctx.lineWidth = isFocus ? 1.5 : 1;
        ctx.stroke();

        // Title text
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayTitle, pos.x, cardY + cardH / 2);

        // Optional Code Sub-Badge (ICD-10, SNOMED, RxNorm, etc.)
        if (node.code && zoom > 0.75) {
          const codeText = node.code;
          ctx.font = 'bold 8.5px Fira Sans, monospace';
          const codeMetrics = ctx.measureText(codeText);
          const codeW = codeMetrics.width + 10;
          const codeH = 14;
          const codeY = cardY + cardH + 4;

          ctx.beginPath();
          ctx.roundRect(pos.x - codeW / 2, codeY, codeW, codeH, 4);
          ctx.fillStyle = '#f1f5f9';
          ctx.fill();
          ctx.strokeStyle = '#e2e8f0';
          ctx.stroke();

          ctx.fillStyle = '#475569';
          ctx.fillText(codeText, pos.x, codeY + codeH / 2);
        }

        ctx.restore();
      });

      ctx.restore();
      animId = requestAnimationFrame(simulateAndRender);
    };

    animId = requestAnimationFrame(simulateAndRender);
    return () => cancelAnimationFrame(animId);
  }, [
    filteredNodes, 
    filteredLinks, 
    selectedNode, 
    hoveredNodeId, 
    zoom, 
    pan, 
    draggedNode, 
    connectedMap, 
    effectiveHeight
  ]);

  // Pointer Interaction Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;

    const positions = positionsRef.current;
    let clickedNode: GraphNode | null = null;

    // Check hit against nodes (reverse order for top elements)
    for (let i = filteredNodes.length - 1; i >= 0; i--) {
      const node = filteredNodes[i];
      const pos = positions.get(node.id);
      if (pos) {
        const dx = mouseX - pos.x;
        const dy = mouseY - pos.y;
        if (dx * dx + dy * dy <= (pos.radius + 8) * (pos.radius + 8)) {
          clickedNode = node;
          break;
        }
      }
    }

    if (clickedNode) {
      setDraggedNode(clickedNode);
      setSelectedNode(clickedNode);
      if (onNodeSelect) onNodeSelect(clickedNode);
    } else {
      setIsDraggingCanvas(true);
      setDragStartPos({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;

    // Update dragged node position directly
    if (draggedNode) {
      const pos = positionsRef.current.get(draggedNode.id);
      if (pos) {
        pos.x = mouseX;
        pos.y = mouseY;
        pos.vx = 0;
        pos.vy = 0;
      }
      return;
    }

    // Canvas panning
    if (isDraggingCanvas) {
      setPan({
        x: e.clientX - dragStartPos.x,
        y: e.clientY - dragStartPos.y,
      });
      return;
    }

    // Hover test
    let foundHover: string | null = null;
    const positions = positionsRef.current;
    for (let i = filteredNodes.length - 1; i >= 0; i--) {
      const node = filteredNodes[i];
      const pos = positions.get(node.id);
      if (pos) {
        const dx = mouseX - pos.x;
        const dy = mouseY - pos.y;
        if (dx * dx + dy * dy <= (pos.radius + 12) * (pos.radius + 12)) {
          foundHover = node.id;
          break;
        }
      }
    }
    setHoveredNodeId(foundHover);
    if (foundHover) {
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = isDraggingCanvas ? 'grabbing' : 'grab';
    }
  };

  const handlePointerUp = () => {
    setDraggedNode(null);
    setIsDraggingCanvas(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((prevZoom) => {
      const nextZoom = Math.max(0.45, Math.min(2.4, prevZoom * zoomFactor));
      return Number(nextZoom.toFixed(3));
    });
  };

  const toggleFilter = (cat: GraphNodeCategory) => {
    setActiveFilters((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleNodeSelect = useCallback(
    (node: GraphNode | null) => {
      setSelectedNode(node);
      onNodeSelect?.(node);
    },
    [onNodeSelect]
  );

  const content = viewMode === '3d' ? (
    <ClinicalKnowledgeGraph3D
      nodes={rawNodes}
      links={rawLinks}
      patientId={patientId}
      patientName={patientName}
      className={className}
      height={isFullscreen ? (typeof window !== 'undefined' ? window.innerHeight : height) : height}
      isFullscreen={isFullscreen}
      onToggleFullscreen={toggleFullscreen}
      onSwitchTo2D={() => setViewMode('2d')}
      onNodeSelect={handleNodeSelect}
      selectedNode={selectedNode}
    />
  ) : (
    <div 
      ref={containerRef}
      className={`relative flex flex-col overflow-hidden ${
        isFullscreen && !onToggleFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen bg-white'
          : `w-full h-full bg-white rounded-3xl border border-slate-200/90 shadow-diffuse ${className}`
      }`}
      style={{ height: (isFullscreen && !onToggleFullscreen) ? '100vh' : (isFullscreen ? '100%' : (typeof height === 'number' ? `${height}px` : height)) }}
    >
      {/* Top Filter and Navigation Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-50/80 border-b border-slate-200/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-sm" />
          <span className="text-xs font-extrabold text-slate-900 tracking-tight font-sans">
            {patientName}
          </span>
          <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200 shadow-2xs">
            {filteredNodes.length} Nodes • {filteredLinks.length} Triples
          </span>
        </div>

        {/* 2D / 3D Mode Toggle */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-200/80 shadow-2xs">
          <button
            onClick={() => setViewMode('2d')}
            className="px-2.5 py-1 rounded-xl bg-clinical-blue text-white text-[10px] font-bold transition-all flex items-center gap-1 shadow-2xs cursor-default"
            title="Active 2D Force-Directed View"
          >
            <Network className="w-3 h-3" />
            <span>2D View</span>
          </button>
          <button
            onClick={() => setViewMode('3d')}
            className="px-2.5 py-1 rounded-xl hover:bg-slate-100 text-slate-700 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
            title="Switch to 3D Supernova Knowledge Graph"
          >
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>3D Nova</span>
          </button>
        </div>

        {/* Category Filter Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(['Condition', 'Anatomy', 'Medication', 'DiagnosticReport', 'Observation'] as GraphNodeCategory[]).map((cat) => {
            const isActive = activeFilters[cat];
            const style = CATEGORY_STYLES[cat];
            return (
              <button
                key={cat}
                onClick={() => toggleFilter(cat)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 ${
                  isActive 
                    ? style.bg 
                    : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-50'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.gradientEnd }} />
                <span>{cat}</span>
              </button>
            );
          })}
        </div>

        {/* Zoom & Spacious Layout Actions */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-200/80 shadow-2xs">
          <button
            onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.15).toFixed(2))))}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono font-extrabold text-slate-700 px-1 min-w-[36px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.max(0.45, Number((z - 0.15).toFixed(2))))}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <div className="h-3.5 w-px bg-slate-200 mx-0.5" />
          <button
            onClick={handleFitToScreen}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            title="Fit to Screen"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              initializeSpaciousLayout();
              setTimeout(handleFitToScreen, 120);
            }}
            className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-extrabold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
            title="Unclump and Distribute Graph Spaciously"
          >
            <Sparkles className="w-3 h-3 text-indigo-600" />
            <span>Unclump</span>
          </button>
          <div className="h-3.5 w-px bg-slate-200 mx-0.5" />
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Expand to Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-clinical-blue" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main High-DPI Interactive Canvas */}
      <div 
        className="relative flex-1 min-h-0 w-full overflow-hidden bg-slate-50 cursor-grab active:cursor-grabbing select-none" 
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            setHoveredNodeId(null);
            if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
          }}
          onWheel={handleWheel}
          onDoubleClick={toggleFullscreen}
          className="w-full h-full block"
        />

        {/* Bottom Legend Pill Bar */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-200/90 shadow-sm text-[10px] flex items-center gap-3.5 pointer-events-none">
          <span className="font-extrabold text-slate-400 uppercase tracking-wider text-[9px]">Legend:</span>
          <span className="flex items-center gap-1.5 text-slate-800 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-2xs" /> Condition
          </span>
          <span className="flex items-center gap-1.5 text-slate-800 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow-2xs" /> Anatomy
          </span>
          <span className="flex items-center gap-1.5 text-slate-800 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-2xs" /> Drug
          </span>
          <span className="flex items-center gap-1.5 text-slate-800 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-2xs" /> Report
          </span>
          <span className="flex items-center gap-1.5 text-slate-800 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-2xs" /> Observation
          </span>
        </div>

        {/* Selected Node Inspector Drawer */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: 25, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 25, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute top-4 right-4 w-80 bg-white/98 backdrop-blur-xl p-5 rounded-3xl border border-slate-200/90 shadow-xl text-xs space-y-3.5 z-20"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${CATEGORY_STYLES[selectedNode.label]?.bg || 'bg-slate-100'}`}>
                    {selectedNode.label}
                  </span>
                  <h4 className="text-sm font-extrabold text-slate-900 mt-1.5 tracking-tight font-sans">
                    {selectedNode.name || selectedNode.id}
                  </h4>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Clinical Ontological Metadata */}
              <div className="space-y-2 pt-1.5 text-[11px] border-t border-slate-100">
                {selectedNode.code && (
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-slate-500 font-semibold">Ontology Code:</span>
                    <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                      {selectedNode.code}
                    </span>
                  </div>
                )}
                {selectedNode.snomed && (
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-slate-500 font-semibold">SNOMED CT:</span>
                    <span className="font-mono font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                      {selectedNode.snomed}
                    </span>
                  </div>
                )}
                {selectedNode.modality && (
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-slate-500 font-semibold">Modality:</span>
                    <span className="font-bold text-slate-800">{selectedNode.modality}</span>
                  </div>
                )}
                {selectedNode.gender && (
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-slate-500 font-semibold">Gender / MRN:</span>
                    <span className="font-bold text-slate-800">{selectedNode.gender} • {selectedNode.mrn}</span>
                  </div>
                )}
              </div>

              {/* Findings or Impression text excerpt */}
              {(selectedNode.impression || selectedNode.findings) && (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-[11px] leading-relaxed text-slate-700">
                  <span className="font-bold text-slate-900 block mb-1">Clinical Ground Truth:</span>
                  {selectedNode.impression || selectedNode.findings}
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between">
                <span className="flex items-center gap-1 font-bold text-emerald-600">
                  <ShieldCheck className="w-3.5 h-3.5" /> Neo4j Verified
                </span>
                <span className="font-mono text-slate-400 truncate max-w-[120px]">
                  ID: {selectedNode.id}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className={`w-full h-full relative ${isFullscreen && !onToggleFullscreen ? 'fixed inset-0 z-50 w-screen h-screen' : ''}`}>
      {content}
    </div>
  );
};
