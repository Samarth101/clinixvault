import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';
import { 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  Sparkles, 
  Network, 
  X, 
  ShieldCheck, 
  ZoomIn, 
  ZoomOut,
  Layers
} from 'lucide-react';
import { GraphNode, GraphLink } from '../types';

interface ClinicalKnowledgeGraph3DProps {
  nodes: GraphNode[];
  links: GraphLink[];
  patientId: string;
  patientName?: string;
  className?: string;
  height?: number | string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onSwitchTo2D?: () => void;
  onNodeSelect?: (node: GraphNode | null) => void;
  selectedNode?: GraphNode | null;
}

interface Node3DInternal {
  data: GraphNode;
  id: string;
  label: string;
  tier: number;
  targetPos: THREE.Vector3;
  parentId: string | null;
  group: THREE.Group;
  sphere: THREE.Mesh;
  mat: THREE.MeshPhysicalMaterial;
  ringMesh: THREE.Mesh;
  flareSprite: THREE.Sprite | null;
  labelEl: HTMLDivElement | null;
  pct: string;
  primaryBurst?: boolean;
}

interface Edge3DInternal {
  source: string;
  target: string;
  type: 'gold' | 'cyan' | 'cyan_cross' | 'dashed';
  src: Node3DInternal;
  tgt: Node3DInternal;
  containerObj: THREE.Group;
  line?: THREE.Line;
  isDashed: boolean;
  drawProgress: number;
}

// Sober, uncluttered node label formatter
function formatSoberNodeLabel(node: GraphNode): string {
  let rawText = (node.name || node.id || '').trim();

  // Strip trailing clinical classifier tags like (disorder), (finding), (procedure), (body structure)
  rawText = rawText.replace(/\s*\((disorder|finding|procedure|body structure|substance|morphologic abnormality|qualifier value|observable entity)\)$/i, '');

  // Truncate report-68db... to Report #68db
  if (rawText.startsWith('report-') || node.id.startsWith('report-')) {
    const id = rawText.startsWith('report-') ? rawText : node.id;
    const hash = id.replace(/^report-/, '').slice(0, 4);
    return `Report #${hash}`;
  }

  // Truncate enc-3a3d... to Enc #3a3d
  if (rawText.startsWith('enc-') || node.id.startsWith('enc-')) {
    const id = rawText.startsWith('enc-') ? rawText : node.id;
    const hash = id.replace(/^enc-/, '').slice(0, 4);
    return `Enc #${hash}`;
  }

  // Truncate obs-4f1a... to Obs #4f1a
  if (rawText.startsWith('obs-') || node.id.startsWith('obs-')) {
    const id = rawText.startsWith('obs-') ? rawText : node.id;
    const hash = id.replace(/^obs-/, '').slice(0, 4);
    return `Obs #${hash}`;
  }

  // Truncate urn:uuid:
  if (rawText.startsWith('urn:uuid:')) {
    const hash = rawText.replace(/^urn:uuid:/, '').slice(0, 6);
    return `#${hash}`;
  }

  // Long hex hash or UUID without spaces
  if (/^[0-9a-fA-F-]{20,}$/.test(rawText)) {
    return `#${rawText.slice(0, 6)}`;
  }

  // Truncate overly long text (> 22 chars) to prevent clutter and collision
  if (rawText.length > 22) {
    return `${rawText.slice(0, 20)}…`;
  }

  return rawText;
}

// Procedural Supernova Flare Texture
function createSupernovaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = 256;
    const cy = 256;
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 250);
    grad.addColorStop(0, 'rgba(255, 255, 245, 1)');
    grad.addColorStop(0.18, 'rgba(255, 240, 175, 0.95)');
    grad.addColorStop(0.45, 'rgba(240, 185, 85, 0.45)');
    grad.addColorStop(1, 'rgba(240, 185, 85, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
  }
  return new THREE.CanvasTexture(canvas);
}

// Procedural Concentric HUD Rings (Golden Spiked for Tier 0, Rose for Tier 1, Lavender for Tier 2)
function createHudRingTexture(tier: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  if (ctx) {
    if (tier === 0) {
      // Intricate Golden Spiked HUD Ring
      const grad = ctx.createRadialGradient(cx, cy, 90, cx, cy, 245);
      grad.addColorStop(0, 'rgba(235, 195, 120, 0.95)');
      grad.addColorStop(0.6, 'rgba(220, 175, 105, 0.65)');
      grad.addColorStop(1, 'rgba(210, 155, 80, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 245, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 242, 205, 0.9)';
      ctx.lineWidth = 3;
      [135, 168, 198, 214].forEach((r) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      });

      for (let i = 0; i < 72; i++) {
        const angle = (i / 72) * Math.PI * 2;
        const isMajor = i % 3 === 0;
        const r1 = 138;
        const r2 = isMajor ? 246 : 220;
        ctx.strokeStyle = isMajor ? 'rgba(255, 228, 160, 0.98)' : 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = isMajor ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
        ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
        ctx.stroke();
      }
    } else if (tier === 1) {
      // Rose Concentric HUD Ring
      const grad = ctx.createRadialGradient(cx, cy, 90, cx, cy, 235);
      grad.addColorStop(0, 'rgba(235, 175, 195, 0.88)');
      grad.addColorStop(0.75, 'rgba(215, 165, 180, 0.48)');
      grad.addColorStop(1, 'rgba(215, 165, 180, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 235, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 238, 244, 0.8)';
      ctx.lineWidth = 3;
      [150, 212, 226].forEach((r) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      });
    } else {
      // Lavender/Purple Concentric HUD Ring
      const grad = ctx.createRadialGradient(cx, cy, 90, cx, cy, 230);
      grad.addColorStop(0, 'rgba(195, 180, 235, 0.88)');
      grad.addColorStop(0.75, 'rgba(175, 160, 215, 0.45)');
      grad.addColorStop(1, 'rgba(175, 160, 215, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 230, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(235, 230, 255, 0.82)';
      ctx.lineWidth = 3.5;
      [155, 215].forEach((r) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
  }
  return new THREE.CanvasTexture(canvas);
}

const ROOT_COORDS = new THREE.Vector3(-0.8, -0.2, 0);

export const ClinicalKnowledgeGraph3D: React.FC<ClinicalKnowledgeGraph3DProps> = ({
  nodes: rawNodes,
  links: rawLinks,
  patientId,
  patientName = 'Clinical Patient',
  className = '',
  height = 620,
  isFullscreen = false,
  onToggleFullscreen,
  onSwitchTo2D,
  onNodeSelect,
  selectedNode: externalSelectedNode,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const bgRef = useRef<HTMLDivElement | null>(null);

  // Three.js instances ref
  const threeRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    labelRenderer: CSS2DRenderer;
    composer: EffectComposer;
    bloomPass: UnrealBloomPass;
    controls: OrbitControls;
    graphGroup: THREE.Group;
    nodes: Node3DInternal[];
    edges: Edge3DInternal[];
    nodeMap: Map<string, Node3DInternal>;
    animTimeline: gsap.core.Timeline | null;
    clickableMeshes: THREE.Object3D[];
  } | null>(null);

  const [internalSelectedNode, setInternalSelectedNode] = useState<GraphNode | null>(null);
  const activeSelectedNode = externalSelectedNode !== undefined ? externalSelectedNode : internalSelectedNode;
  const [hudVisible, setHudVisible] = useState<boolean>(true);
  const [isAnimationPlaying, setIsAnimationPlaying] = useState<boolean>(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState<boolean>(false);

  // Sync with native fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fsEl = document.fullscreenElement;
      const isFs = Boolean(
        fsEl &&
        (fsEl === containerRef.current ||
         containerRef.current?.contains(fsEl) ||
         fsEl.contains(containerRef.current))
      );
      setIsNativeFullscreen(isFs);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const effectiveFullscreen = Boolean(isFullscreen || isNativeFullscreen);

  const handleToggleFullscreen = useCallback(() => {
    if (onToggleFullscreen) {
      onToggleFullscreen();
    } else if (effectiveFullscreen) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setIsNativeFullscreen(false);
    } else {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {});
      } else {
        setIsNativeFullscreen(true);
      }
    }
  }, [effectiveFullscreen, onToggleFullscreen]);

  const onNodeSelectRef = useRef(onNodeSelect);
  useEffect(() => {
    onNodeSelectRef.current = onNodeSelect;
  }, [onNodeSelect]);

  const onToggleFullscreenRef = useRef(onToggleFullscreen);
  useEffect(() => {
    onToggleFullscreenRef.current = onToggleFullscreen;
  }, [onToggleFullscreen]);

  const isFullscreenRef = useRef(effectiveFullscreen);
  useEffect(() => {
    isFullscreenRef.current = effectiveFullscreen;
  }, [effectiveFullscreen]);

  const heightRef = useRef(height);
  useEffect(() => {
    heightRef.current = height;
  }, [height]);

  // Procedural textures memo
  const ringTextures = useMemo(() => ({
    0: createHudRingTexture(0),
    1: createHudRingTexture(1),
    2: createHudRingTexture(2),
  }), []);

  const supernovaTexture = useMemo(() => createSupernovaTexture(), []);

  // Compute 3D Topology from rawNodes and rawLinks
  const topology = useMemo(() => {
    // 1. Root Patient Node
    let rootNode = rawNodes.find((n) => n.label === 'Patient' || n.id === patientId);
    if (!rootNode) {
      rootNode = {
        id: patientId,
        label: 'Patient',
        name: patientName,
      };
    }

    // 2. Tier 1 Primary Hubs: Condition, DiagnosticReport, Encounter
    const primaryHubs = rawNodes.filter(
      (n) => n.id !== rootNode?.id && (n.label === 'Condition' || n.label === 'DiagnosticReport' || n.label === 'Encounter')
    );

    // If no primary hubs found, promote first 3 connected nodes
    const finalPrimaryHubs = primaryHubs.length > 0 
      ? primaryHubs 
      : rawNodes.filter((n) => n.id !== rootNode?.id).slice(0, 3);

    const primaryHubIds = new Set(finalPrimaryHubs.map((n) => n.id));

    // 3. Tier 2 Satellites: All other nodes
    const satellites = rawNodes.filter(
      (n) => n.id !== rootNode?.id && !primaryHubIds.has(n.id)
    );

    // Parent mapping for satellites based on links
    const parentMap = new Map<string, string>();
    rawLinks.forEach((l) => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;

      if (primaryHubIds.has(srcId) && !primaryHubIds.has(tgtId) && tgtId !== rootNode?.id) {
        parentMap.set(tgtId, srcId);
      } else if (primaryHubIds.has(tgtId) && !primaryHubIds.has(srcId) && srcId !== rootNode?.id) {
        parentMap.set(srcId, tgtId);
      }
    });

    // Compute 3D positions
    // Tier 0: Root Position
    const rootPos = ROOT_COORDS.clone();

    // Tier 1 Positions (True 3D Spatial Depth with spacious spherical coordinates across 3 depth shells)
    const pCount = Math.max(1, finalPrimaryHubs.length);
    const tier1Positions = new Map<string, THREE.Vector3>();

    finalPrimaryHubs.forEach((hub, i) => {
      // Golden / spherical distribution across three distinct depth zones:
      // Zone 0: Foreground (z in [+4.5, +7.0])
      // Zone 1: Midground (z in [-1.5, +1.5])
      // Zone 2: Deep background (z in [-7.0, -4.5])
      const depthLayer = i % 3;
      const baseZ = depthLayer === 0 
        ? (5.2 + (i % 2) * 1.6) 
        : depthLayer === 2 
        ? (-5.2 - (i % 2) * 1.6) 
        : ((i % 2 === 0 ? 0.9 : -0.9));

      const angle = (i / pCount) * Math.PI * 2 - Math.PI / 2;
      const rx = 9.2 + (i % 2) * 1.8;
      const ry = 6.0 + (i % 3) * 1.4;

      tier1Positions.set(
        hub.id,
        new THREE.Vector3(
          rootPos.x + Math.cos(angle) * rx,
          rootPos.y + Math.sin(angle) * ry * 0.88,
          rootPos.z + baseZ
        )
      );
    });

    // Group satellites by parent for distributed radial ejection
    const satellitesByParent = new Map<string, GraphNode[]>();
    satellites.forEach((sat) => {
      const pId = parentMap.get(sat.id) || (finalPrimaryHubs[0]?.id || rootNode!.id);
      if (!satellitesByParent.has(pId)) satellitesByParent.set(pId, []);
      satellitesByParent.get(pId)!.push(sat);
    });

    const satellitePositions = new Map<string, THREE.Vector3>();
    satellitesByParent.forEach((sats, pId) => {
      const parentPos = tier1Positions.get(pId) || rootPos;
      const kCount = sats.length;

      sats.forEach((sat, j) => {
        // True 3D spherical shell orbit around parent hub
        const phi = (((j % 3) - 1) * 0.75) + 0.1; // latitude: -0.65, +0.1, +0.85 rad
        const theta = (j / Math.max(1, kCount)) * Math.PI * 2 + (j % 2) * 0.5;
        const dist = 3.6 + (j % 2) * 1.2;

        satellitePositions.set(
          sat.id,
          new THREE.Vector3(
            parentPos.x + dist * Math.cos(theta) * Math.cos(phi),
            parentPos.y + dist * Math.sin(phi) * 0.9,
            parentPos.z + dist * Math.sin(theta) * Math.cos(phi) * 1.4
          )
        );
      });
    });

    return {
      rootNode,
      finalPrimaryHubs,
      satellites,
      parentMap,
      rootPos,
      tier1Positions,
      satellitePositions,
    };
  }, [rawNodes, rawLinks, patientId, patientName]);

  // Main 3D Animation Choreography (Matches User Prompt Mechanics Exactly)
  const playSupernovaChoreography = useCallback(() => {
    const refs = threeRef.current;
    if (!refs) return;

    const {
      nodes,
      edges,
      nodeMap,
      bloomPass,
    } = refs;

    if (refs.animTimeline) {
      refs.animTimeline.kill();
    }

    setIsAnimationPlaying(true);
    const tl = gsap.timeline({
      onComplete: () => {
        setIsAnimationPlaying(false);
      },
    });
    refs.animTimeline = tl;

    const root = nodeMap.get(topology.rootNode.id);
    if (!root) return;

    const primaryBurstNodes = nodes.filter((n) => n.tier === 1 || n.primaryBurst);
    const satelliteNodes = nodes.filter((n) => n.tier === 2 && !n.primaryBurst);
    const crossEdges = edges.filter((e) => e.type === 'cyan_cross');
    const satelliteEdges = edges.filter((e) => e.type === 'dashed');

    // Phase 0: Reset scene to pure black initial state
    if (bgRef.current) {
      gsap.set(bgRef.current, { opacity: 0 });
    }
    setHudVisible(true);

    nodes.forEach((n) => {
      if (n.labelEl) {
        n.labelEl.classList.remove('visible', 'badge-visible');
      }
      if (n.tier === 0) {
        n.group.position.copy(n.targetPos);
        n.group.scale.setScalar(0);
        n.ringMesh.scale.setScalar(0.1);
        if (n.flareSprite) {
          n.flareSprite.material.opacity = 1;
          n.flareSprite.scale.setScalar(4.5);
        }
      } else if (n.tier === 1 || n.primaryBurst) {
        // Start physically inside center root node
        n.group.position.copy(root.targetPos);
        n.group.scale.setScalar(0);
        n.mat.emissiveIntensity = 2.4; // Hot pink incandescent burst
      } else {
        // Satellites start physically inside center root node until parent reaches position
        n.group.position.copy(root.targetPos);
        n.group.scale.setScalar(0);
      }
    });

    crossEdges.forEach((e) => {
      e.drawProgress = 0;
    });
    satelliteEdges.forEach((e) => {
      e.drawProgress = 0;
    });

    bloomPass.strength = 1.4; // Blinding supernova ignition bloom

    // [0.0s - 0.3s] (Fade from Black): Scene fades in from pure #000000 to radial dark teal-slate background
    if (bgRef.current) {
      tl.to(bgRef.current, { opacity: 1, duration: 0.55, ease: 'power2.out' }, 0.05);
    }

    // [0.3s - 1.3s] (Center Supernova & Primary Radial Burst):
    // Root node ignites with intense blinding white-gold flare, label appears
    tl.to(
      root.group.scale,
      {
        x: 1,
        y: 1,
        z: 1,
        duration: 0.45,
        ease: 'back.out(1.8)',
        onStart: () => {
          root.labelEl?.classList.add('visible');
        },
      },
      0.32
    );

    // Primary hubs physically fly outward from center root to target coordinates, stretching beams
    primaryBurstNodes.forEach((node, i) => {
      const delay = 0.4 + i * 0.025;
      tl.to(
        node.group.scale,
        {
          x: 1,
          y: 1,
          z: 1,
          duration: 0.35,
          ease: 'power2.out',
        },
        delay
      );

      tl.to(
        node.group.position,
        {
          x: node.targetPos.x,
          y: node.targetPos.y,
          z: node.targetPos.z,
          duration: 1.05,
          ease: 'power3.out',
        },
        delay
      );

      // Incandescent glow cools down as nodes decelerate
      tl.to(
        node.mat,
        {
          emissiveIntensity: 0.45,
          duration: 0.9,
          ease: 'power2.out',
        },
        delay + 0.3
      );
    });

    // [1.2s - 2.2s] (Supernova Cool-Down & Secondary Satellite Ejection):
    // Flare smoothly settles down revealing glossy amber sphere and intricate rotating golden spiked HUD ring
    if (root.flareSprite) {
      tl.to(
        root.flareSprite.material,
        {
          opacity: 0.2,
          duration: 0.95,
          ease: 'power2.inOut',
        },
        1.1
      );
      tl.to(
        root.flareSprite.scale,
        {
          x: 1.8,
          y: 1.8,
          z: 1.8,
          duration: 0.95,
          ease: 'power2.inOut',
        },
        1.1
      );
    }

    tl.to(
      root.ringMesh.scale,
      {
        x: 2.15,
        y: 2.15,
        z: 2.15,
        duration: 0.85,
        ease: 'back.out(1.6)',
      },
      1.15
    );

    tl.to(
      bloomPass,
      {
        strength: 0.48,
        duration: 1.0,
        ease: 'power2.out',
      },
      1.15
    );

    // Satellites physically eject outward from parent hubs stretching dashed lines
    satelliteNodes.forEach((node, i) => {
      const parent = node.parentId ? nodeMap.get(node.parentId) : root;
      const startT = 1.25 + i * 0.025;
      const associatedEdge = satelliteEdges.find(
        (e) => (e.source === node.id && e.target === parent?.id) || (e.target === node.id && e.source === parent?.id)
      );

      tl.call(
        () => {
          if (parent) {
            node.group.position.copy(parent.group.position);
          }
        },
        [],
        startT
      );

      if (associatedEdge) {
        tl.to(
          associatedEdge,
          {
            drawProgress: 1,
            duration: 0.75,
            ease: 'power3.out',
          },
          startT
        );
      }

      tl.to(
        node.group.scale,
        {
          x: 1,
          y: 1,
          z: 1,
          duration: 0.4,
          ease: 'back.out(1.4)',
        },
        startT
      );

      tl.to(
        node.group.position,
        {
          x: node.targetPos.x,
          y: node.targetPos.y,
          z: node.targetPos.z,
          duration: 0.75,
          ease: 'power3.out',
        },
        startT
      );
    });

    // Cross-links animate across clusters
    crossEdges.forEach((edge, i) => {
      tl.to(
        edge,
        {
          drawProgress: 1,
          duration: 0.65,
          ease: 'power2.inOut',
        },
        1.45 + i * 0.08
      );
    });

    // [1.8s - 2.8s] (Labels & UI Chrome Settlement):
    // HTML labels fade & slide in cleanly without forcing redundant badge pills
    primaryBurstNodes.forEach((node, i) => {
      if (!node.labelEl) return;
      tl.call(
        () => {
          node.labelEl?.classList.add('visible');
        },
        [],
        1.55 + i * 0.04
      );
    });

    // Satellite labels
    satelliteNodes.forEach((node, i) => {
      if (!node.labelEl) return;
      tl.call(
        () => {
          node.labelEl?.classList.add('visible');
        },
        [],
        1.9 + i * 0.03
      );
    });

    // Surrounding HUD elements show
    tl.call(
      () => {
        setHudVisible(true);
      },
      [],
      1.65
    );
  }, [topology]);

  // Main Three.js Scene Setup & Render Loop
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    // Clear old elements if any
    container.innerHTML = '';

    const width = container.clientWidth || 860;
    const currentHeight = container.clientHeight || (typeof heightRef.current === 'number' ? heightRef.current : 620);

    // 1. Scene, Camera, Renderers with True 3D Depth Cues
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060c18, 0.015);

    const camera = new THREE.PerspectiveCamera(40, width / currentHeight, 0.1, 1000);
    camera.position.set(10.5, 7.0, 21.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, currentHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, currentHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.left = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none';
    labelRenderer.domElement.style.overflow = 'hidden';
    container.appendChild(labelRenderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controls.minDistance = 6;
    controls.maxDistance = 65;

    // 3D Spatial Depth Particle Field (ambient neural constellation for depth perception)
    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 180;
    const particlePos = new Float32Array(particleCount * 3);
    for (let p = 0; p < particleCount; p++) {
      const pr = 8.5 + Math.random() * 20;
      const pth = Math.random() * Math.PI * 2;
      const pph = (Math.random() - 0.5) * Math.PI;
      particlePos[p * 3] = pr * Math.cos(pth) * Math.cos(pph);
      particlePos[p * 3 + 1] = pr * Math.sin(pph);
      particlePos[p * 3 + 2] = pr * Math.sin(pth) * Math.cos(pph);
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.13,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
    });
    const depthParticles = new THREE.Points(particleGeo, particleMat);
    scene.add(depthParticles);

    // 2. Post-processing Unreal Bloom
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, currentHeight),
      0.55,
      0.7,
      0.55
    );
    composer.addPass(bloomPass);

    // 3. Lighting
    scene.add(new THREE.AmbientLight(0xd8ecef, 1.5));
    const dirLight = new THREE.DirectionalLight(0xfff5e4, 2.8);
    dirLight.position.set(10, 18, 22);
    scene.add(dirLight);

    // 4. Graph Group & Meshes
    const graphGroup = new THREE.Group();
    scene.add(graphGroup);

    const sphereGeo = new THREE.SphereGeometry(1, 32, 32);
    const planeGeo = new THREE.PlaneGeometry(1, 1);

    const nodesList: Node3DInternal[] = [];
    const nodeMap = new Map<string, Node3DInternal>();
    const clickableMeshes: THREE.Object3D[] = [];
    // Hover edge & node highlight function placeholder
    let applyHoverHighlight: (nodeId: string | null) => void = () => {};

    // Helper to build node 3D representation
    const buildNodeMesh = (
      nodeData: GraphNode,
      tier: number,
      targetPos: THREE.Vector3,
      parentId: string | null,
      pctBadge: string
    ) => {
      const group = new THREE.Group();
      group.position.copy(targetPos);

      const coreRadius = tier === 0 ? 0.48 : tier === 1 ? 0.26 : 0.19;
      const ringSize = tier === 0 ? 2.15 : tier === 1 ? 1.10 : 0.82;

      // Color scheme based on ontology category
      let sphereColor = 0x9c82d6;
      let emissiveColor = 0x311f5c;

      if (tier === 0) {
        sphereColor = 0xdba858; // Amber root
        emissiveColor = 0x8a5818;
      } else if (nodeData.label === 'Condition') {
        sphereColor = 0xd96b86; // Rose
        emissiveColor = 0x6e1f38;
      } else if (nodeData.label === 'DiagnosticReport') {
        sphereColor = 0xa78bfa; // Violet
        emissiveColor = 0x5b21b6;
      } else if (nodeData.label === 'Encounter') {
        sphereColor = 0x818cf8; // Indigo
        emissiveColor = 0x3730a3;
      } else if (nodeData.label === 'Anatomy') {
        sphereColor = 0x38bdf8; // Sky blue
        emissiveColor = 0x0284c7;
      } else if (nodeData.label === 'Medication') {
        sphereColor = 0x34d399; // Emerald
        emissiveColor = 0x059669;
      } else if (nodeData.label === 'Observation') {
        sphereColor = 0xfbbf24; // Amber
        emissiveColor = 0xb45309;
      } else if (nodeData.label === 'ProvenanceNode') {
        sphereColor = 0x22d3ee; // Cyan
        emissiveColor = 0x0891b2;
      }

      const mat = new THREE.MeshPhysicalMaterial({
        color: sphereColor,
        emissive: emissiveColor,
        emissiveIntensity: 0.45,
        roughness: 0.18,
        metalness: 0.2,
        clearcoat: 1.0,
        transparent: true,
        opacity: 1.0,
      });

      const sphere = new THREE.Mesh(sphereGeo, mat);
      sphere.scale.setScalar(coreRadius);
      sphere.userData = { nodeId: nodeData.id };
      group.add(sphere);
      clickableMeshes.push(sphere);

      // HUD Ring
      const ringTex = ringTextures[tier as 0 | 1 | 2] || ringTextures[2];
      const ringMat = new THREE.MeshBasicMaterial({
        map: ringTex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(planeGeo, ringMat);
      ringMesh.scale.setScalar(ringSize);
      ringMesh.userData = { nodeId: nodeData.id };
      group.add(ringMesh);
      // NOTE: Only spheres are added to clickableMeshes to avoid intersecting transparent quad corners

      // Supernova Flare sprite on Root Node
      let flareSprite: THREE.Sprite | null = null;
      if (tier === 0) {
        const flareMat = new THREE.SpriteMaterial({
          map: supernovaTexture,
          color: 0xfff2c2,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        flareSprite = new THREE.Sprite(flareMat);
        flareSprite.scale.setScalar(4.5);
        group.add(flareSprite);
      }

      // CSS2DRenderer HTML Label (Interactive selection with sober styling)
      const labelText = formatSoberNodeLabel(nodeData);
      const labelEl = document.createElement('div');
      labelEl.className = `node-label-3d ${tier === 0 ? 'root-label-3d' : ''}`;
      labelEl.innerHTML = `
        <div class="label-title-3d">${labelText}</div>
        ${pctBadge ? `<div class="label-badge-3d">${pctBadge}</div>` : ''}
      `;
      labelEl.addEventListener('click', (e) => {
        e.stopPropagation();
        setInternalSelectedNode(nodeData);
        onNodeSelectRef.current?.(nodeData);
      });
      labelEl.addEventListener('mouseenter', () => {
        applyHoverHighlight(nodeData.id);
      });
      labelEl.addEventListener('mouseleave', () => {
        applyHoverHighlight(null);
      });
      const cssObj = new CSS2DObject(labelEl);
      if (tier === 0) {
        cssObj.position.set(0, 1.45, 0);
      } else if (tier === 1) {
        cssObj.position.set(0, 1.15, 0);
      } else if (parentId) {
        // Radial outward offset: moves satellite label away from parent node to prevent collisions
        const parentPos = topology.tier1Positions.get(parentId) || topology.rootPos;
        const dir = new THREE.Vector3().subVectors(targetPos, parentPos).normalize();
        cssObj.position.set(dir.x * 0.45, Math.max(0.7, dir.y * 0.45 + 0.75), dir.z * 0.3);
      } else {
        cssObj.position.set(0, 0.85, 0);
      }
      group.add(cssObj);

      graphGroup.add(group);

      const nodeObj: Node3DInternal = {
        data: nodeData,
        id: nodeData.id,
        label: labelText,
        tier,
        targetPos,
        parentId,
        group,
        sphere,
        mat,
        ringMesh,
        flareSprite,
        labelEl,
        pct: pctBadge,
      };

      nodesList.push(nodeObj);
      nodeMap.set(nodeData.id, nodeObj);
      return nodeObj;
    };

    // Build Root Node (Remove redundant factuality percentage; displayed in metrics footer)
    buildNodeMesh(
      topology.rootNode,
      0,
      topology.rootPos,
      null,
      ''
    );

    // Build Tier 1 Hub Nodes
    topology.finalPrimaryHubs.forEach((hub) => {
      const pos = topology.tier1Positions.get(hub.id) || topology.rootPos;
      const pct = hub.code ? hub.code : hub.label === 'Condition' ? '31% Match' : 'Active';
      buildNodeMesh(hub, 1, pos, topology.rootNode.id, pct);
    });

    // Build Tier 2 Satellite Nodes
    topology.satellites.forEach((sat) => {
      const pos = topology.satellitePositions.get(sat.id) || topology.rootPos;
      const pId = topology.parentMap.get(sat.id) || topology.rootNode.id;
      const pct = sat.code || (sat.label === 'Medication' ? 'RxNorm' : 'Grounded');
      buildNodeMesh(sat, 2, pos, pId, pct);
    });

    // 5. Dynamic Stretching Edges
    const dynamicEdges: Edge3DInternal[] = [];
    const unitCylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
    unitCylGeo.rotateX(Math.PI / 2);
    unitCylGeo.translate(0, 0, 0.5);

    // Process all edges
    rawLinks.forEach((link) => {
      const srcId = typeof link.source === 'object' ? link.source.id : link.source;
      const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
      const src = nodeMap.get(srcId);
      const tgt = nodeMap.get(tgtId);
      if (!src || !tgt) return;

      const containerObj = new THREE.Group();
      graphGroup.add(containerObj);

      const isRootConnection = src.tier === 0 || tgt.tier === 0;
      const isCrossConnection = src.tier === 1 && tgt.tier === 1;

      if (isRootConnection) {
        const isGold = (src.data.label === 'Condition' || tgt.data.label === 'Condition') ||
                       (src.data.label === 'DiagnosticReport' || tgt.data.label === 'DiagnosticReport');

        if (isGold) {
          // Golden primary beam with additive outer core
          const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff0c2, transparent: true, opacity: 0.95 });
          const core = new THREE.Mesh(unitCylGeo, coreMat);
          core.scale.set(0.024, 0.024, 1);

          const glowMat = new THREE.MeshBasicMaterial({
            color: 0xe09b45,
            transparent: true,
            opacity: 0.38,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const glow = new THREE.Mesh(unitCylGeo, glowMat);
          glow.scale.set(0.085, 0.085, 1);

          containerObj.add(core, glow);
          dynamicEdges.push({
            source: srcId,
            target: tgtId,
            type: 'gold',
            src,
            tgt,
            containerObj,
            isDashed: false,
            drawProgress: 1,
          });
        } else {
          // Cyan Laser Line
          const cyanMat = new THREE.MeshBasicMaterial({ color: 0x6ce8f0, transparent: true, opacity: 0.75 });
          const cyan = new THREE.Mesh(unitCylGeo, cyanMat);
          cyan.scale.set(0.016, 0.016, 1);
          containerObj.add(cyan);
          dynamicEdges.push({
            source: srcId,
            target: tgtId,
            type: 'cyan',
            src,
            tgt,
            containerObj,
            isDashed: false,
            drawProgress: 1,
          });
        }
      } else if (isCrossConnection) {
        // Cyan Cross-Links
        const cyanMat = new THREE.MeshBasicMaterial({ color: 0x6ce8f0, transparent: true, opacity: 0.75 });
        const cyan = new THREE.Mesh(unitCylGeo, cyanMat);
        cyan.scale.set(0.015, 0.015, 1);
        containerObj.add(cyan);
        dynamicEdges.push({
          source: srcId,
          target: tgtId,
          type: 'cyan_cross',
          src,
          tgt,
          containerObj,
          isDashed: false,
          drawProgress: 1,
        });
      } else {
        // Dashed Satellite Links
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0, 1),
        ]);
        const lineMat = new THREE.LineDashedMaterial({
          color: 0xc8d2dc,
          dashSize: 0.12,
          gapSize: 0.09,
          transparent: true,
          opacity: 0.52,
        });
        const line = new THREE.Line(lineGeo, lineMat);
        containerObj.add(line);
        dynamicEdges.push({
          source: srcId,
          target: tgtId,
          type: 'dashed',
          src,
          tgt,
          containerObj,
          line,
          isDashed: true,
          drawProgress: 1,
        });
      }
    });

    // Helper that syncs dynamic edges to live positions of nodes
    const updateEdgesGeometry = () => {
      dynamicEdges.forEach((e) => {
        const p1 = e.src.group.position;
        const p2 = e.tgt.group.position;
        const dist = p1.distanceTo(p2) * e.drawProgress;

        if (dist < 0.001) {
          e.containerObj.visible = false;
          return;
        }
        e.containerObj.visible = true;
        e.containerObj.position.copy(p1);
        e.containerObj.lookAt(p2);

        if (e.isDashed && e.line) {
          const posAttr = e.line.geometry.attributes.position;
          posAttr.setXYZ(1, 0, 0, dist);
          posAttr.needsUpdate = true;
          e.line.computeLineDistances();
        } else {
          e.containerObj.scale.z = dist;
        }
      });
    };

    // Precompute connected 1-hop adjacency map for instant hover lookup
    const connectedMap = new Map<string, Set<string>>();
    rawLinks.forEach((l) => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      if (!connectedMap.has(srcId)) connectedMap.set(srcId, new Set());
      if (!connectedMap.has(tgtId)) connectedMap.set(tgtId, new Set());
      connectedMap.get(srcId)!.add(tgtId);
      connectedMap.get(tgtId)!.add(srcId);
    });

    let activeHoverNodeId: string | null = null;

    applyHoverHighlight = (nodeId: string | null) => {
      if (activeHoverNodeId === nodeId) return;
      activeHoverNodeId = nodeId;

      if (!nodeId) {
        // Reset dynamic edges to normal
        dynamicEdges.forEach((e) => {
          e.containerObj.scale.x = 1.0;
          e.containerObj.scale.y = 1.0;
          e.containerObj.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.material) {
              const mat = mesh.material as THREE.Material & { opacity?: number; color?: THREE.Color };
              if (e.type === 'gold') {
                mat.opacity = (mesh.scale.x > 0.05) ? 0.38 : 0.95;
                if (mat.color) mat.color.setHex((mesh.scale.x > 0.05) ? 0xe09b45 : 0xfff0c2);
              } else if (e.type === 'cyan' || e.type === 'cyan_cross') {
                mat.opacity = 0.75;
                if (mat.color) mat.color.setHex(0x6ce8f0);
              } else if (e.type === 'dashed') {
                mat.opacity = 0.52;
                if (mat.color) mat.color.setHex(0xc8d2dc);
              }
            }
          });
        });

        // Reset nodes to normal
        nodesList.forEach((n) => {
          n.group.scale.setScalar(1.0);
          n.mat.opacity = 1.0;
          n.ringMesh.visible = true;
          if (n.ringMesh.material) {
            (n.ringMesh.material as THREE.Material).opacity = 0.9;
          }
          if (n.labelEl) {
            n.labelEl.classList.remove('hover-highlight');
            n.labelEl.style.opacity = '';
          }
        });
        return;
      }

      const neighbors = connectedMap.get(nodeId);

      // Highlight incident edges brightly, dim non-incident edges
      dynamicEdges.forEach((e) => {
        const isIncident = (e.source === nodeId || e.target === nodeId);
        if (isIncident) {
          e.containerObj.scale.x = 2.4;
          e.containerObj.scale.y = 2.4;
          e.containerObj.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.material) {
              const mat = mesh.material as THREE.Material & { opacity?: number; color?: THREE.Color };
              mat.opacity = 1.0;
              if (mat.color) {
                if (e.type === 'gold') {
                  mat.color.setHex(0xffe082); // Bright golden glow
                } else if (e.type === 'dashed') {
                  mat.color.setHex(0x7dd3fc); // Bright light cyan
                } else {
                  mat.color.setHex(0x38bdf8); // Vivid electric cyan
                }
              }
            }
          });
        } else {
          e.containerObj.scale.x = 0.5;
          e.containerObj.scale.y = 0.5;
          e.containerObj.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.material) {
              const mat = mesh.material as THREE.Material & { opacity?: number; color?: THREE.Color };
              mat.opacity = 0.08;
            }
          });
        }
      });

      // Highlight hovered node and connected neighbor nodes, dim non-connected nodes
      nodesList.forEach((n) => {
        const isHovered = n.id === nodeId;
        const isNeighbor = neighbors?.has(n.id);

        if (isHovered) {
          n.group.scale.setScalar(1.3);
          n.mat.opacity = 1.0;
          n.ringMesh.visible = true;
          if (n.ringMesh.material) {
            (n.ringMesh.material as THREE.Material).opacity = 1.0;
          }
          if (n.labelEl) {
            n.labelEl.classList.add('hover-highlight');
            n.labelEl.style.opacity = '1';
          }
        } else if (isNeighbor) {
          n.group.scale.setScalar(1.1);
          n.mat.opacity = 0.95;
          n.ringMesh.visible = true;
          if (n.ringMesh.material) {
            (n.ringMesh.material as THREE.Material).opacity = 0.85;
          }
          if (n.labelEl) {
            n.labelEl.classList.remove('hover-highlight');
            n.labelEl.style.opacity = '0.95';
          }
        } else {
          n.group.scale.setScalar(0.8);
          n.mat.opacity = 0.18;
          n.ringMesh.visible = false;
          if (n.labelEl) {
            n.labelEl.classList.remove('hover-highlight');
            n.labelEl.style.opacity = '0.18';
          }
        }
      });
    };

    // Save references
    threeRef.current = {
      scene,
      camera,
      renderer,
      labelRenderer,
      composer,
      bloomPass,
      controls,
      graphGroup,
      nodes: nodesList,
      edges: dynamicEdges,
      nodeMap,
      animTimeline: null,
      clickableMeshes,
    };

    // 6. Interactive Raycasting for 3D Node Selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downPos = { x: 0, y: 0 };

    const handlePointerDown = (e: MouseEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - downPos.x);
      const dy = Math.abs(e.clientY - downPos.y);
      if (dx > 5 || dy > 5) return; // Dragged OrbitControls, not a click

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(clickableMeshes, false);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const nodeId = hit.userData?.nodeId;
        if (nodeId) {
          const found = nodeMap.get(nodeId);
          if (found) {
            setInternalSelectedNode(found.data);
            onNodeSelectRef.current?.(found.data);
          }
        }
      }
    };

    const handlePointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(clickableMeshes, false);
      if (intersects.length > 0) {
        renderer.domElement.style.cursor = 'pointer';
        const hit = intersects[0].object;
        const nodeId = hit.userData?.nodeId;
        applyHoverHighlight(nodeId || null);
      } else {
        renderer.domElement.style.cursor = 'grab';
        applyHoverHighlight(null);
      }
    };

    const handlePointerLeave = () => {
      applyHoverHighlight(null);
    };

    const handleDoubleClick = (e: MouseEvent) => {
      if (e.target === renderer.domElement && onToggleFullscreenRef.current) {
        onToggleFullscreenRef.current();
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('dblclick', handleDoubleClick);

    // 7. Render Loop with Rotating Golden Spiked HUD Rings
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const camPos = camera.position;

      nodesList.forEach((node) => {
        node.ringMesh.quaternion.copy(camera.quaternion);
        if (node.tier === 0) {
          node.ringMesh.rotateZ(t * 0.14);
        } else if (node.tier === 1) {
          node.ringMesh.rotateZ(-t * 0.08);
        } else {
          node.ringMesh.rotateZ(t * 0.05);
        }

        // Dynamic 3D depth scaling for CSS2D labels to reinforce distance perception
        if (node.labelEl) {
          const dist = camPos.distanceTo(node.group.position);
          const depthScale = Math.max(0.68, Math.min(1.15, 21.0 / Math.max(9.0, dist)));
          node.labelEl.style.transform = `translate(-50%, -100%) scale(${depthScale.toFixed(2)})`;
        }
      });

      depthParticles.rotation.y = t * 0.02;

      updateEdgesGeometry();
      controls.update();
      composer.render();
      labelRenderer.render(scene, camera);
    };

    animate();

    // 8. Auto-Trigger Exact 3-Second Supernova Sequence
    playSupernovaChoreography();

    // 9. Resize Handling via ResizeObserver
    const handleResize = () => {
      if (!container || !camera || !renderer || !composer || !labelRenderer) return;
      const w = container.clientWidth || window.innerWidth;
      const defaultH = typeof heightRef.current === 'number' ? heightRef.current : (parseInt(String(heightRef.current), 10) || 620);
      const h: number = container.clientHeight || (isFullscreenRef.current ? window.innerHeight : defaultH);

      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
      composer.setSize(w, h);
      bloomPass.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);

      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick);

      if (threeRef.current?.animTimeline) {
        threeRef.current.animTimeline.kill();
      }

      controls.dispose();
      renderer.dispose();
      composer.dispose();
      sphereGeo.dispose();
      planeGeo.dispose();
      unitCylGeo.dispose();
      particleGeo.dispose();
      particleMat.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      if (container.contains(labelRenderer.domElement)) {
        container.removeChild(labelRenderer.domElement);
      }
      threeRef.current = null;
    };
  }, [topology, rawLinks, ringTextures, supernovaTexture, playSupernovaChoreography]);

  // Keyboard shortcut listener for Esc key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && effectiveFullscreen) {
        handleToggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [effectiveFullscreen, handleToggleFullscreen]);

  // Sync selected node styling on 3D HTML labels
  useEffect(() => {
    if (!threeRef.current) return;
    threeRef.current.nodes.forEach((node) => {
      if (node.labelEl) {
        if (activeSelectedNode && node.id === activeSelectedNode.id) {
          node.labelEl.classList.add('selected');
        } else {
          node.labelEl.classList.remove('selected');
        }
      }
    });
  }, [activeSelectedNode]);

  // Orbit controls helper actions
  const handleResetCamera = () => {
    const refs = threeRef.current;
    if (!refs) return;
    gsap.to(refs.camera.position, {
      x: 10.5,
      y: 7.0,
      z: 21.5,
      duration: 0.8,
      ease: 'power2.out',
    });
    refs.controls.target.set(0, 0, 0);
  };

  const handleZoom = (delta: number) => {
    const refs = threeRef.current;
    if (!refs) return;
    const currentZ = refs.camera.position.z;
    const targetZ = Math.max(8, Math.min(50, currentZ + delta));
    gsap.to(refs.camera.position, {
      z: targetZ,
      duration: 0.4,
      ease: 'power2.out',
    });
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col overflow-hidden select-none ${
        isNativeFullscreen || (effectiveFullscreen && !onToggleFullscreen)
          ? 'fixed inset-0 z-50 w-screen h-screen bg-black'
          : `w-full h-full rounded-3xl border border-slate-200/90 shadow-diffuse ${className}`
      }`}
      style={{ height: (isNativeFullscreen || (effectiveFullscreen && !onToggleFullscreen)) ? '100vh' : (effectiveFullscreen ? '100%' : (typeof height === 'number' ? `${height}px` : height)) }}
    >
      {/* 0.0s - 0.3s Radial Dark Teal-Slate Background */}
      <div ref={bgRef} className="graph-3d-bg" />

      {/* Main Three.js + CSS2D Canvas Container */}
      <div ref={canvasContainerRef} className="canvas-container-3d" />

      {/* TOP LEFT BRANDING & METADATA */}
      <div className={`hud-ui-3d top-4 left-5 flex items-center gap-2.5 ${hudVisible ? 'show' : ''}`}>
        <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 backdrop-blur-md flex items-center justify-center text-cyan-300 shadow-md">
          <Sparkles className="w-4 h-4 text-cyan-300 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black tracking-tight text-white font-sans drop-shadow-md">
              ClinixVault 3D Ontological Mesh
            </span>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
              Neo4j
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-medium tracking-wide">
            {patientName} • {topology.rootNode.mrn || 'MRN-Verified'}
          </div>
        </div>
      </div>

      {/* TOP CENTER TOOLBAR (2D/3D Toggle, Camera Controls, Fullscreen) */}
      <div className={`hud-ui-3d top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-xl border border-white/20 px-3 py-1.5 rounded-2xl shadow-2xl pointer-events-auto z-50 ${hudVisible ? 'show' : ''}`}>
        {/* 2D / 3D Mode Switcher */}
        {onSwitchTo2D && (
          <button
            onClick={onSwitchTo2D}
            className="px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-clinical-blue text-white text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer pointer-events-auto z-50 border border-white/10 shadow-sm"
            title="Switch to 2D Force-Directed View"
          >
            <Network className="w-3.5 h-3.5 text-cyan-300" />
            <span>2D View</span>
          </button>
        )}

        <button
          className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500/30 to-rose-500/30 border border-amber-400/40 text-amber-200 text-[11px] font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-default"
          title="Active 3D Supernova Mode"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>3D Nova</span>
        </button>

        <div className="h-4 w-px bg-white/15 mx-1" />

        {/* Zoom Controls */}
        <button
          onClick={() => handleZoom(-4)}
          className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer pointer-events-auto"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleZoom(4)}
          className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer pointer-events-auto"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleResetCamera}
          className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer pointer-events-auto"
          title="Reset 3D Perspective"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-white/15 mx-1" />

        {/* Fullscreen Button */}
        {onToggleFullscreen && (
          <button
            onClick={handleToggleFullscreen}
            className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer pointer-events-auto"
            title={effectiveFullscreen ? 'Exit Fullscreen (Esc)' : 'Expand to Fullscreen'}
          >
            {effectiveFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-cyan-300" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* TOP RIGHT EXIT FULLSCREEN (WHEN FULLSCREEN) OR STATS BADGE */}
      <div className={`hud-ui-3d top-4 right-5 flex items-center gap-2 pointer-events-auto z-50 ${hudVisible ? 'show' : ''}`}>
        {effectiveFullscreen && onToggleFullscreen ? (
          <button
            onClick={handleToggleFullscreen}
            className="px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-bold transition-all flex items-center gap-1.5 backdrop-blur-md cursor-pointer pointer-events-auto shadow-lg"
            title="Exit Fullscreen (Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5 text-cyan-300" />
            <span>Exit Fullscreen</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/50 text-slate-300">Esc</span>
          </button>
        ) : (
          <div className="px-3 py-1 rounded-xl bg-slate-900/70 border border-white/10 backdrop-blur-md text-[10px] font-mono text-slate-300">
            {topology.finalPrimaryHubs.length + topology.satellites.length + 1} Entities • {rawLinks.length} Triples
          </div>
        )}
      </div>

      {/* BOTTOM LEFT LEGEND PANEL */}
      <div className={`hud-ui-3d bottom-5 left-5 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3.5 text-[10.5px] space-y-2 w-48 shadow-2xl pointer-events-auto z-40 ${hudVisible ? 'show' : ''}`}>
        <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
          <span>Legend</span>
          <Layers className="w-3 h-3 text-cyan-400" />
        </div>
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-2 text-slate-200">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#e5b368]" />
            <span>Patient Core</span>
          </div>
          <div className="flex items-center gap-2 text-slate-200">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_#d96b86]" />
            <span>Condition / Pathology</span>
          </div>
          <div className="flex items-center gap-2 text-slate-200">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_8px_#9c82d6]" />
            <span>Diagnostic Report</span>
          </div>
          <div className="flex items-center gap-2 text-slate-200">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span>Rx Medication</span>
          </div>
          <div className="flex items-center gap-2 text-slate-200">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <span>Anatomy Site</span>
          </div>
        </div>
      </div>

      {/* REPLAY SUPERNOVA BUTTON (ACCESSIBLE IN BOTH NORMAL AND FULLSCREEN VIEW) */}
      <div className={`hud-ui-3d bottom-5 right-5 pointer-events-auto z-50 ${hudVisible ? 'show' : ''}`}>
        <button
          onClick={playSupernovaChoreography}
          className="px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-amber-400/40 text-amber-200 hover:text-amber-100 text-xs font-bold backdrop-blur-xl transition-all flex items-center gap-2 cursor-pointer pointer-events-auto shadow-xl"
          title="Replay the 3-Second Supernova Intro Sequence"
        >
          <RotateCcw className={`w-3.5 h-3.5 text-amber-400 ${isAnimationPlaying ? 'animate-spin' : ''}`} />
          <span>↻ Replay Supernova Intro</span>
        </button>
      </div>

      {/* SELECTED NODE INSPECTOR DRAWER */}
      {activeSelectedNode && (
        <div className="absolute top-16 right-5 w-80 bg-slate-900/95 backdrop-blur-2xl p-5 rounded-3xl border border-white/20 shadow-2xl text-xs space-y-3.5 z-30 pointer-events-auto text-white">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white/10 text-cyan-300 border border-white/15">
                {activeSelectedNode.label}
              </span>
              <h4 className="text-sm font-extrabold text-white mt-1.5 tracking-tight font-sans">
                {activeSelectedNode.name || activeSelectedNode.id}
              </h4>
            </div>
            <button
              onClick={() => {
                setInternalSelectedNode(null);
                onNodeSelect?.(null);
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 pt-1 text-[11px] border-t border-white/10">
            {activeSelectedNode.code && (
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-400 font-semibold">Ontology Code:</span>
                <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {activeSelectedNode.code}
                </span>
              </div>
            )}
            {activeSelectedNode.snomed && (
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-400 font-semibold">SNOMED CT:</span>
                <span className="font-mono font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  {activeSelectedNode.snomed}
                </span>
              </div>
            )}
            {activeSelectedNode.modality && (
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-400 font-semibold">Modality:</span>
                <span className="font-bold text-slate-200">{activeSelectedNode.modality}</span>
              </div>
            )}
            {activeSelectedNode.gender && (
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-400 font-semibold">Demographics:</span>
                <span className="font-bold text-slate-200">{activeSelectedNode.gender} • {activeSelectedNode.mrn}</span>
              </div>
            )}
          </div>

          {(activeSelectedNode.impression || activeSelectedNode.findings) && (
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-[11px] leading-relaxed text-slate-300">
              <span className="font-bold text-white block mb-1">Clinical Fact / Ground Truth:</span>
              {activeSelectedNode.impression || activeSelectedNode.findings}
            </div>
          )}

          <div className="pt-2 border-t border-white/10 text-[10px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1 font-bold text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" /> Neo4j Verified
            </span>
            <span className="font-mono text-slate-400 truncate max-w-[120px]">
              ID: {activeSelectedNode.id}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
