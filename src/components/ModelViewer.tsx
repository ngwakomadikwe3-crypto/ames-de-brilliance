"use client";

import { Suspense, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

/* ── Platinum SVG glyph fallback ── */
function PlatinumGlyph() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg viewBox="0 0 24 24" fill="none" style={{ width: "35%", height: "35%" }} aria-hidden="true">
        <defs>
          <linearGradient id="mv-glyph" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E8E6E1" />
            <stop offset="50%" stopColor="#C8C6C1" />
            <stop offset="100%" stopColor="#A6A6AB" />
          </linearGradient>
        </defs>
        <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="url(#mv-glyph)" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}

/* ── Crystal material for the diamond ── */
const CRYSTAL = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color("#ffffff"),
  transmission: 1,
  ior: 2.4,
  roughness: 0.05,
  clearcoat: 1,
  thickness: 1.5,
  transparent: true,
});

/* ── Diamond scene: auto-center, apply crystal material ── */
function DiamondScene({ modelPath }: { modelPath: string }) {
  const group = useRef<THREE.Group>(null!);
  const { scene } = useGLTF(modelPath);

  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    mesh.material = CRYSTAL;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });

  // Auto-center and normalize to ~1.8 world units
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  scene.position.sub(center);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) scene.scale.setScalar(1.8 / maxDim);

  return <group ref={group}><primitive object={scene} /></group>;
}

/* ═══════════════════════════════════════════
   MODEL VIEWER — chat diamond
   Fully transparent canvas merged into pearl background.
   ═══════════════════════════════════════════ */

export interface ModelViewerProps {
  modelPath: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function ModelViewer({ modelPath, className, style }: ModelViewerProps) {
  return (
    <div className={className} style={style}>
      <Suspense fallback={<PlatinumGlyph />}>
        <Canvas
          gl={{ alpha: true, antialias: true }}
          dpr={[1, 3]}
          camera={{ position: [0, 0.3, 3.2], fov: 45 }}
          style={{ background: "transparent", width: "100%", height: "100%", touchAction: "pan-y" }}
        >
          <Environment preset="studio" />
          <directionalLight position={[3, 4, 2]} intensity={1.5} />
          <ambientLight intensity={0.3} />
          <DiamondScene modelPath={modelPath} />
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate
            autoRotateSpeed={4}
            dampingFactor={0.05}
            enableDamping
          />
        </Canvas>
      </Suspense>
    </div>
  );
}

try { useGLTF.preload("/diamond.glb/scene.gltf"); } catch {}
