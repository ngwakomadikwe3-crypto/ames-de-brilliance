"use client";

import { Suspense, useRef, useState, Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, OrbitControls, ContactShadows, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";

/* ── Error boundary for GLB load failures ── */
class GlbErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

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

/* ── Procedural brilliant-cut diamond (crown + pavilion) ── */
function ProceduralDiamond() {
  return (
    <group>
      {/* Crown — flat cylinder */}
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.5, 0.7, 0.16, 8]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transmission={1}
          ior={2.417}
          dispersion={0.4}
          roughness={0.03}
          thickness={1.2}
          clearcoat={1}
          envMapIntensity={2.5}
          transparent
          side={THREE.DoubleSide}
          flatShading
        />
      </mesh>
      {/* Pavilion — inverted cone */}
      <mesh position={[0, -0.38, 0]}>
        <coneGeometry args={[0.7, 0.6, 8]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transmission={1}
          ior={2.417}
          dispersion={0.4}
          roughness={0.03}
          thickness={1.2}
          clearcoat={1}
          envMapIntensity={2.5}
          transparent
          side={THREE.DoubleSide}
          flatShading
        />
      </mesh>
    </group>
  );
}

/* ── Crystal material — shared across both viewers ── */
const CRYSTAL = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color("#ffffff"),
  transmission: 1,
  ior: 2.417,
  dispersion: 0.4,
  roughness: 0.03,
  thickness: 1.2,
  clearcoat: 1,
  envMapIntensity: 2.5,
  transparent: true,
  side: THREE.DoubleSide,
});

/* ── Diamond scene: load GLB or fallback to procedural, centre, scale ── */
function DiamondScene({ modelPath, targetHeight }: { modelPath: string; targetHeight: number }) {
  const group = useRef<THREE.Group>(null!);
  const [loaded, setLoaded] = useState(false);
  let scene: THREE.Group | null = null;

  try {
    const result = useGLTF(modelPath);
    scene = result.scene;
    if (!loaded) setLoaded(true);
  } catch {
    /* Suspense will throw a promise; if the GLB truly fails, ErrorBoundary catches */
  }

  if (loaded && scene) {
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.material = CRYSTAL;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });

    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    scene.position.sub(center);

    const size = box.getSize(new THREE.Vector3());
    const height = size.y;
    if (height > 0.01) {
      scene.scale.setScalar(targetHeight / height);
    }
  }

  return (
    <group ref={group}>
      {loaded && scene ? (
        <primitive object={scene} />
      ) : (
        <group scale={targetHeight / 1.2}>
          <ProceduralDiamond />
        </group>
      )}
    </group>
  );
}

/* ═══════════════════════════════════════════
   MODEL VIEWER — premium crystal diamond
   Transparent canvas, self-contained lighting,
   real lights as guarantee, procedural fallback.
   ═══════════════════════════════════════════ */

export interface ModelViewerProps {
  modelPath: string;
  className?: string;
  style?: React.CSSProperties;
  showContactShadows?: boolean;
}

export default function ModelViewer({ modelPath, className, style, showContactShadows = true }: ModelViewerProps) {
  return (
    <div className={className} style={style}>
      <GlbErrorBoundary fallback={<PlatinumGlyph />}>
        <Suspense fallback={<PlatinumGlyph />}>
          <Canvas
            gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
            dpr={[2, 3]}
            camera={{ position: [0, 0.35, 3], fov: 45 }}
            style={{ background: "transparent", width: "100%", height: "100%", touchAction: "pan-y" }}
          >
            {/* Self-contained environment — Lightformers only, no network */}
            <Environment resolution={256}>
              <Lightformer form="rect" intensity={3} scale={4} position={[0, 5, 0]} rotation-x={-Math.PI / 3} color="#ffffff" />
              <Lightformer form="rect" intensity={1.2} scale={[1, 6, 1]} position={[-5, 0, 0]} rotation-y={Math.PI / 2} color="#2B2B2B" />
              <Lightformer form="rect" intensity={1.2} scale={[1, 6, 1]} position={[5, 0, 0]} rotation-y={-Math.PI / 2} color="#2B2B2B" />
              <Lightformer form="rect" intensity={0.6} scale={[6, 3, 1]} position={[0, 0, -5]} rotation-y={Math.PI} color="#DDE3EA" />
            </Environment>

            {/* Real lights — guarantee materials never render black */}
            <directionalLight intensity={2.5} position={[4, 6, 3]} />
            <directionalLight intensity={1.2} position={[-5, 2, -4]} color="#DDE3EA" />
            <ambientLight intensity={0.4} />

            <DiamondScene modelPath={modelPath} targetHeight={1.4} />

            {showContactShadows && (
              <ContactShadows position={[0, -0.8, 0]} opacity={0.25} blur={2.5} scale={3} far={2} color="#171717" />
            )}

            <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={1.2} dampingFactor={0.05} enableDamping />
          </Canvas>
        </Suspense>
      </GlbErrorBoundary>
    </div>
  );
}

try { useGLTF.preload("/diamond.glb/scene.gltf"); } catch {}
