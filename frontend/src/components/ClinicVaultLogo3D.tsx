import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';

export interface ClinicVaultLogo3DHandle {
  triggerPulse: () => void;
  exportPNG: (exportSize?: number) => string | null;
}

export interface ClinicVaultLogo3DProps {
  /** Size in pixels (e.g., 48, 64, 120, 500) or CSS string */
  size?: number | string;
  /** Custom width override */
  width?: number | string;
  /** Custom height override */
  height?: number | string;
  /** Whether the logo responds to mouse parallax */
  interactive?: boolean;
  /** Enable OrbitControls (user can click & drag to rotate in 3D) */
  enableOrbit?: boolean;
  /** Trigger AI Pulse animation when clicked */
  enablePulseOnClick?: boolean;
  /** Active loading state with high-speed rotation and energetic core breathing */
  isLoading?: boolean;
  /** Force enable or disable UnrealBloomPass post-processing (auto-enabled for sizes >= 160) */
  enableBloom?: boolean;
  /** Additional container CSS classes */
  className?: string;
  /** Style overrides */
  style?: React.CSSProperties;
  /** Optional click handler */
  onClick?: () => void;
}

export const ClinicVaultLogo3D = forwardRef<ClinicVaultLogo3DHandle, ClinicVaultLogo3DProps>(({
  size = 200,
  width,
  height,
  interactive = true,
  enableOrbit = false,
  enablePulseOnClick = true,
  isLoading = false,
  enableBloom,
  className = '',
  style = {},
  onClick
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // References for imperative actions & animation loops
  const pulseTriggerRef = useRef<(() => void) | null>(null);
  const exportPNGRef = useRef<((size?: number) => string | null) | null>(null);

  useImperativeHandle(ref, () => ({
    triggerPulse: () => {
      pulseTriggerRef.current?.();
    },
    exportPNG: (exportSize = 2048) => {
      return exportPNGRef.current ? exportPNGRef.current(exportSize) : null;
    }
  }));

  // Determine computed width/height
  const finalWidth = width ?? size;
  const finalHeight = height ?? size;

  const widthStyle = typeof finalWidth === 'number' ? `${finalWidth}px` : finalWidth;
  const heightStyle = typeof finalHeight === 'number' ? `${finalHeight}px` : finalHeight;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Numerical size for bloom / LOD threshold
    const numSize = typeof size === 'number' 
      ? size 
      : (typeof finalWidth === 'number' ? finalWidth : parseInt(String(finalWidth), 10) || 200);

    const useBloom = enableBloom !== undefined ? enableBloom : numSize >= 150;

    const rect = container.getBoundingClientRect();
    const currentW = Math.max(rect.width || (typeof finalWidth === 'number' ? finalWidth : 200), 32);
    const currentH = Math.max(rect.height || (typeof finalHeight === 'number' ? finalHeight : 200), 32);

    // --- 1. SCENE & CAMERA ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, currentW / currentH, 0.1, 100);
    camera.position.set(0, 0, 14.5);

    // --- 2. RENDERER ---
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true // Required for clean PNG export
    });
    renderer.setSize(currentW, currentH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    // --- 3. CONTROLS ---
    let controls: OrbitControls | null = null;
    if (enableOrbit) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxDistance = 25;
      controls.minDistance = 7;
      controls.enableZoom = true;
    }

    // --- 4. POST-PROCESSING (BLOOM) ---
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    if (useBloom) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(currentW, currentH),
        0.55, // strength
        0.65, // radius
        0.45  // threshold
      );
      composer.addPass(bloomPass);
    }

    // --- 5. STUDIO LIGHTING ---
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(8, 12, 10);
    scene.add(keyLight);

    const rimLightCyan = new THREE.PointLight(0x00f2fe, 5, 25);
    rimLightCyan.position.set(-8, 6, 6);
    scene.add(rimLightCyan);

    const rimLightEmerald = new THREE.PointLight(0x10b981, 4, 25);
    rimLightEmerald.position.set(6, -8, 5);
    scene.add(rimLightEmerald);

    const corePointLight = new THREE.PointLight(0x34d399, 3.5, 8);
    corePointLight.position.set(0, 0, 0.5);
    scene.add(corePointLight);

    // --- 6. ROOT 3D LOGO GROUP ---
    const logoGroup = new THREE.Group();
    scene.add(logoGroup);

    // -------------------------------------------------------------------------
    // LAYER 1: OUTER ZERO-EGRESS VAULT ARMOR (3D Extruded Beveled Hexagon)
    // -------------------------------------------------------------------------
    const outerRadius = 3.8;
    const innerRadius = 3.12;
    const hexOuterShape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + Math.PI / 6;
      const x = Math.cos(angle) * outerRadius;
      const y = Math.sin(angle) * outerRadius;
      if (i === 0) hexOuterShape.moveTo(x, y);
      else hexOuterShape.lineTo(x, y);
    }
    hexOuterShape.closePath();

    const hexHolePath = new THREE.Path();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + Math.PI / 6;
      const x = Math.cos(angle) * innerRadius;
      const y = Math.sin(angle) * innerRadius;
      if (i === 0) hexHolePath.moveTo(x, y);
      else hexHolePath.lineTo(x, y);
    }
    hexHolePath.closePath();
    hexOuterShape.holes.push(hexHolePath);

    const vaultExtrudeSettings = {
      depth: 0.55,
      bevelEnabled: true,
      bevelSegments: 5,
      steps: 1,
      bevelSize: 0.09,
      bevelThickness: 0.09
    };

    const vaultGeo = new THREE.ExtrudeGeometry(hexOuterShape, vaultExtrudeSettings);
    vaultGeo.center();

    const vaultArmorMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e3a8a,
      emissive: 0x091533,
      metalness: 0.78,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.12
    });

    const vaultMesh = new THREE.Mesh(vaultGeo, vaultArmorMat);
    logoGroup.add(vaultMesh);

    // Neon Cyan Rim Accent on the Front Face of the Vault Hexagon
    const hexEdgeGeo = new THREE.EdgesGeometry(vaultGeo, 25);
    const hexEdgeMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55
    });
    const vaultEdges = new THREE.LineSegments(hexEdgeGeo, hexEdgeMat);
    vaultMesh.add(vaultEdges);

    // 6 Inward-Locking Zero-Egress Bolts
    const boltGroup = new THREE.Group();
    const boltGeo = new THREE.CylinderGeometry(0.11, 0.08, 0.52, 16);
    const boltTipGeo = new THREE.SphereGeometry(0.085, 16, 16);
    const boltMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.65,
      metalness: 0.5,
      roughness: 0.15
    });

    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + Math.PI / 6;
      const dist = 2.95;
      const pin = new THREE.Group();
      pin.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
      pin.rotation.z = angle + Math.PI / 2;

      const shaft = new THREE.Mesh(boltGeo, boltMat);
      const tip = new THREE.Mesh(boltTipGeo, boltMat);
      tip.position.y = -0.26;
      pin.add(shaft, tip);
      boltGroup.add(pin);
    }
    logoGroup.add(boltGroup);

    // -------------------------------------------------------------------------
    // LAYER 2: THE AIR-GAP ISOLATION MOAT (Rotating Cyan Dashed Laser Boundary)
    // -------------------------------------------------------------------------
    const airGapGroup = new THREE.Group();
    logoGroup.add(airGapGroup);

    const airGapPoints: THREE.Vector3[] = [];
    const airGapRadius = 2.48;
    for (let i = 0; i <= 6; i++) {
      const angle = (i * Math.PI) / 3 + Math.PI / 6;
      airGapPoints.push(new THREE.Vector3(Math.cos(angle) * airGapRadius, Math.sin(angle) * airGapRadius, 0));
    }
    const airGapGeo = new THREE.BufferGeometry().setFromPoints(airGapPoints);
    const airGapMat = new THREE.LineDashedMaterial({
      color: 0x00f2fe,
      dashSize: 0.18,
      gapSize: 0.14,
      transparent: true,
      opacity: 0.8
    });
    const airGapLine = new THREE.Line(airGapGeo, airGapMat);
    airGapLine.computeLineDistances();
    airGapLine.position.z = 0.22;
    airGapGroup.add(airGapLine);

    // Rear Air-Gap Ring for True 3D Depth
    const airGapLineBack = airGapLine.clone();
    airGapLineBack.position.z = -0.22;
    airGapGroup.add(airGapLineBack);

    // -------------------------------------------------------------------------
    // LAYER 3: INNER 3D CLINICAL CROSS SANCTUARY (Sapphire Glass Chassis)
    // -------------------------------------------------------------------------
    const armHalfWidth = 0.68;
    const armOuter = 1.85;
    const crossShape = new THREE.Shape();
    crossShape.moveTo(-armHalfWidth, armOuter);
    crossShape.lineTo(armHalfWidth, armOuter);
    crossShape.lineTo(armHalfWidth, armHalfWidth);
    crossShape.lineTo(armOuter, armHalfWidth);
    crossShape.lineTo(armOuter, -armHalfWidth);
    crossShape.lineTo(armHalfWidth, -armHalfWidth);
    crossShape.lineTo(armHalfWidth, -armOuter);
    crossShape.lineTo(-armHalfWidth, -armOuter);
    crossShape.lineTo(-armHalfWidth, -armHalfWidth);
    crossShape.lineTo(-armOuter, -armHalfWidth);
    crossShape.lineTo(-armOuter, armHalfWidth);
    crossShape.lineTo(-armHalfWidth, armHalfWidth);
    crossShape.closePath();

    const crossExtrudeSettings = {
      depth: 0.42,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.06,
      bevelThickness: 0.06
    };

    const crossGeo = new THREE.ExtrudeGeometry(crossShape, crossExtrudeSettings);
    crossGeo.center();

    const crossGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b192c,
      emissive: 0x062c38,
      emissiveIntensity: 0.35,
      metalness: 0.25,
      roughness: 0.15,
      transmission: 0.45,
      thickness: 0.8,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08
    });

    const crossMesh = new THREE.Mesh(crossGeo, crossGlassMat);
    logoGroup.add(crossMesh);

    // Glowing Teal Bevel Rim on the 3D Medical Cross
    const crossEdgesGeo = new THREE.EdgesGeometry(crossGeo, 15);
    const crossEdgesMat = new THREE.LineBasicMaterial({
      color: 0x2dd4bf,
      transparent: true,
      opacity: 0.9
    });
    const crossRim = new THREE.LineSegments(crossEdgesGeo, crossEdgesMat);
    crossMesh.add(crossRim);

    // -------------------------------------------------------------------------
    // LAYER 4: ENCAPSULATED NEURAL AI CORE (Neural Network inside the Cross)
    // -------------------------------------------------------------------------
    const aiCoreGroup = new THREE.Group();
    aiCoreGroup.position.z = 0.28;
    logoGroup.add(aiCoreGroup);

    // 4 Outer Synapse Nodes (Top, Bottom, Left, Right inside Cross Arms)
    const synapseDist = 1.22;
    const synapseCoords = [
      new THREE.Vector3(0, synapseDist, 0),
      new THREE.Vector3(0, -synapseDist, 0),
      new THREE.Vector3(-synapseDist, 0, 0),
      new THREE.Vector3(synapseDist, 0, 0)
    ];

    const synapseGeo = new THREE.SphereGeometry(0.16, 24, 24);
    const synapseMat = new THREE.MeshPhysicalMaterial({
      color: 0x00f2fe,
      emissive: 0x00f2fe,
      emissiveIntensity: 0.85,
      roughness: 0.1,
      clearcoat: 1.0
    });

    const synapseMeshes: THREE.Mesh[] = [];
    synapseCoords.forEach((pos) => {
      const node = new THREE.Mesh(synapseGeo, synapseMat);
      node.position.copy(pos);
      aiCoreGroup.add(node);
      synapseMeshes.push(node);
    });

    // Helper to build 3D Fiber-Optic Neural Tubes between nodes
    function createNeuralLink(p1: THREE.Vector3, p2: THREE.Vector3, rad: number, colorHex: number, opacity = 0.85) {
      const dir = p2.clone().sub(p1);
      const len = dir.length();
      const cylGeo = new THREE.CylinderGeometry(rad, rad, len, 12);
      const cylMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity
      });
      const mesh = new THREE.Mesh(cylGeo, cylMat);
      mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      aiCoreGroup.add(mesh);
      return mesh;
    }

    // Axial Links (Through Center)
    createNeuralLink(synapseCoords[0], synapseCoords[1], 0.042, 0x2dd4bf, 0.9);
    createNeuralLink(synapseCoords[2], synapseCoords[3], 0.042, 0x2dd4bf, 0.9);

    // Diamond Cross-Synapse Links
    createNeuralLink(synapseCoords[0], synapseCoords[2], 0.026, 0x38bdf8, 0.65);
    createNeuralLink(synapseCoords[0], synapseCoords[3], 0.026, 0x38bdf8, 0.65);
    createNeuralLink(synapseCoords[1], synapseCoords[2], 0.026, 0x38bdf8, 0.65);
    createNeuralLink(synapseCoords[1], synapseCoords[3], 0.026, 0x38bdf8, 0.65);

    // Central Singularity AI Brain (Inner White-Hot Core + Outer Emerald Aura Shell)
    const coreInnerGeo = new THREE.SphereGeometry(0.32, 32, 32);
    const coreInnerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xa7f3d0,
      emissiveIntensity: 1.4,
      roughness: 0.1
    });
    const coreInnerMesh = new THREE.Mesh(coreInnerGeo, coreInnerMat);
    aiCoreGroup.add(coreInnerMesh);

    const coreAuraGeo = new THREE.SphereGeometry(0.56, 32, 32);
    const coreAuraMat = new THREE.MeshPhysicalMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.42,
      roughness: 0.1,
      transmission: 0.6,
      clearcoat: 1.0
    });
    const coreAuraMesh = new THREE.Mesh(coreAuraGeo, coreAuraMat);
    aiCoreGroup.add(coreAuraMesh);

    // Duplicate Neural Core on the Back Face so the 3D Emblem is 360° Double-Sided
    const aiCoreBack = aiCoreGroup.clone();
    aiCoreBack.position.z = -0.28;
    logoGroup.add(aiCoreBack);

    // -------------------------------------------------------------------------
    // 7. GSAP AI PULSE TRIGGER
    // -------------------------------------------------------------------------
    const triggerAIPulse = () => {
      const tl = gsap.timeline();

      // Outer Vault Armor locks inward with elastic spring
      tl.fromTo(
        logoGroup.rotation,
        { y: -0.6, x: 0.25 },
        { y: 0, x: 0, duration: 1.4, ease: 'elastic.out(1, 0.65)' },
        0
      );

      // Zero-Egress bolts snap inward to locking position
      boltGroup.children.forEach((pin, idx) => {
        const angle = (idx * Math.PI) / 3 + Math.PI / 6;
        tl.fromTo(
          pin.position,
          { x: Math.cos(angle) * 3.35, y: Math.sin(angle) * 3.35 },
          { x: Math.cos(angle) * 2.95, y: Math.sin(angle) * 2.95, duration: 0.6, ease: 'back.out(2.5)' },
          0.15 + idx * 0.04
        );
      });

      // Central AI Singularity Pulse
      tl.fromTo(
        coreAuraMesh.scale,
        { x: 0.6, y: 0.6, z: 0.6 },
        { x: 1.35, y: 1.35, z: 1.35, duration: 0.45, yoyo: true, repeat: 1, ease: 'power2.out' },
        0.2
      );

      if (bloomPass) {
        tl.fromTo(
          bloomPass,
          { strength: 1.25 },
          { strength: 0.55, duration: 1.1, ease: 'power2.out' },
          0.2
        );
      }
    };

    pulseTriggerRef.current = triggerAIPulse;

    // High-Resolution 3D PNG Export
    exportPNGRef.current = (exportSize = 2048) => {
      const origAspect = camera.aspect;
      camera.aspect = 1;
      camera.updateProjectionMatrix();

      renderer.setSize(exportSize, exportSize);
      renderer.setClearColor(0x000000, 0);
      renderer.render(scene, camera);

      const dataURL = renderer.domElement.toDataURL('image/png');

      // Restore viewport
      camera.aspect = origAspect;
      camera.updateProjectionMatrix();
      renderer.setSize(currentW, currentH);
      return dataURL;
    };

    // Trigger initial entrance pulse
    triggerAIPulse();

    // -------------------------------------------------------------------------
    // 8. INTERACTIVE MOUSE PARALLAX & ANIMATION LOOP
    // -------------------------------------------------------------------------
    let targetRotX = 0;
    let targetRotY = 0;

    const handlePointerMove = (e: PointerEvent) => {
      if (!interactive) return;
      const b = container.getBoundingClientRect();
      const nx = ((e.clientX - b.left) / b.width) * 2 - 1;
      const ny = -(((e.clientY - b.top) / b.height) * 2 - 1);
      targetRotY = THREE.MathUtils.clamp(nx * 0.45, -0.6, 0.6);
      targetRotX = THREE.MathUtils.clamp(-ny * 0.35, -0.5, 0.5);
    };

    const handlePointerLeave = () => {
      if (!interactive) return;
      targetRotX = 0;
      targetRotY = 0;
    };

    if (interactive) {
      container.addEventListener('pointermove', handlePointerMove);
      container.addEventListener('pointerleave', handlePointerLeave);
    }

    const clock = new THREE.Clock();
    let animId: number;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Dynamic rotation speed (accelerated during loading state)
      const airGapSpeed = isLoading ? 0.05 : 0.008;
      airGapGroup.rotation.z += airGapSpeed;

      // Floating idle wave
      const floatAmp = isLoading ? 0.18 : 0.11;
      const floatFreq = isLoading ? 2.8 : 1.5;
      logoGroup.position.y = Math.sin(t * floatFreq) * floatAmp;

      // Mouse Parallax Lerp
      if (!enableOrbit) {
        logoGroup.rotation.y += (targetRotY - logoGroup.rotation.y) * 0.06;
        logoGroup.rotation.x += (targetRotX - logoGroup.rotation.x) * 0.06;
      }

      // Breathing AI Singularity Core
      const pulseSpeed = isLoading ? 7.0 : 3.2;
      const pulseAmp = isLoading ? 0.16 : 0.08;
      const pulse = 1 + Math.sin(t * pulseSpeed) * pulseAmp;
      coreAuraMesh.scale.setScalar(pulse);

      // Synapse Pulsing
      synapseMeshes.forEach((s, i) => {
        const sSpeed = isLoading ? 8.0 : 4.0;
        s.scale.setScalar(1 + Math.sin(t * sSpeed + i) * 0.12);
      });

      if (controls) {
        controls.update();
      }

      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    };
    animate();

    // Resize Observer for dynamic card scaling
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: rw, height: rh } = entry.contentRect;
        if (rw > 0 && rh > 0) {
          camera.aspect = rw / rh;
          camera.updateProjectionMatrix();
          renderer.setSize(rw, rh);
          if (composer) composer.setSize(rw, rh);
        }
      }
    });
    resizeObserver.observe(container);

    // -------------------------------------------------------------------------
    // 9. CLEANUP DISPOSAL
    // -------------------------------------------------------------------------
    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      if (interactive) {
        container.removeEventListener('pointermove', handlePointerMove);
        container.removeEventListener('pointerleave', handlePointerLeave);
      }
      if (controls) controls.dispose();

      // Dispose Geometries and Materials
      vaultGeo.dispose();
      vaultArmorMat.dispose();
      hexEdgeGeo.dispose();
      hexEdgeMat.dispose();
      boltGeo.dispose();
      boltTipGeo.dispose();
      boltMat.dispose();
      airGapGeo.dispose();
      airGapMat.dispose();
      crossGeo.dispose();
      crossGlassMat.dispose();
      crossEdgesGeo.dispose();
      crossEdgesMat.dispose();
      synapseGeo.dispose();
      synapseMat.dispose();
      coreInnerGeo.dispose();
      coreInnerMat.dispose();
      coreAuraGeo.dispose();
      coreAuraMat.dispose();

      if (composer) {
        composer.dispose();
      }
      renderer.dispose();

      if (renderer.domElement && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [finalWidth, finalHeight, interactive, enableOrbit, enableBloom, size, isLoading]);

  const handleClick = useCallback(() => {
    if (enablePulseOnClick) {
      pulseTriggerRef.current?.();
    }
    onClick?.();
  }, [enablePulseOnClick, onClick]);

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        width: widthStyle,
        height: heightStyle,
        position: 'relative',
        display: 'inline-block',
        cursor: (interactive || onClick || enablePulseOnClick) ? 'pointer' : 'default',
        userSelect: 'none',
        ...style
      }}
      className={`clinicvault-logo-3d select-none ${className}`}
      title="ClinixVault — Zero-Egress Air-Gap Monolith"
    />
  );
});

ClinicVaultLogo3D.displayName = 'ClinicVaultLogo3D';

export default ClinicVaultLogo3D;
