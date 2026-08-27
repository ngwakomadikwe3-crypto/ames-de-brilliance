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
      <svg viewBox="0 0 24 24" fill="none" style={{ width: "30%", height: "30%" }} aria-hidden="true">
        <defs>
          <linearGradient id="rv-glyph" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E8E6E1" />
            <stop offset="50%" stopColor="#C8C6C1" />
            <stop offset="100%" stopColor="#A6A6AB" />
          </linearGradient>
        </defs>
        <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="url(#rv-glyph)" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}

/* ── Procedural brilliant-cut diamond (crown + pavilion) ── */
function ProceduralDiamond() {
  return (
    <group>
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

/* ── Crystal material for the diamond stone ── */
const CRYSTAL = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color("#ffffff"),
  transmission: 1,
  ior: 2.417,
  dispersion: 0.4,
  roughness: 0.03,
  clearcoat: 1,
  envMapIntensity: 2.5,
  thickness: 1.2,
  transparent: true,
  side: THREE.DoubleSide,
});

/* ── Platinum material for the band — per spec: roughness 0.15, envMapIntensity 1.5 ── */
const PLATINUM = new THREE.MeshStandardMaterial({
  color: new THREE.Color("#E8E6E1"),
  metalness: 1,
  roughness: 0.15,
  envMapIntensity: 1.5,
});

/* ═══════════════════════════════════════════
   RingScene — torus band + prongs + diamond
   ═══════════════════════════════════════════ */

function RingScene() {
  const group = useRef<THREE.Group>(null!);
  const [loaded, setLoaded] = useState(false);
  let scene: THREE.Group | null = null;

  try {
    const result = useGLTF("/diamond.glb/scene.gltf");
    scene = result.scene;
    if (!loaded) setLoaded(true);
  } catch {
    /* ErrorBoundary catches real load failures */
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
    const size = box.getSize(new THREE.Vector3());
    const height = size.y;

    if (height > 0.01) {
      scene.scale.setScalar(0.55 / height);
    }

    const center = box.getCenter(new THREE.Vector3());
    scene.position.set(-center.x * (0.55 / (height || 1)), 0.62 + 0.04, -center.z * (0.55 / (height || 1)));
  }

  return (
    <group ref={group}>
      {/* Platinum torus band */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.07, 32, 128]} />
        <primitive object={PLATINUM} attach="material" />
      </mesh>

      {/* Four prongs — small spheres seating the stone */}
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle, i) => (
        <mesh
          key={i}
          position={[
            Math.cos(angle) * 0.12,
            0.62,
            Math.sin(angle) * 0.12,
          ]}
        >
          <sphereGeometry args={[0.03, 16, 16]} />
          <primitive object={PLATINUM} attach="material" />
        </mesh>
      ))}

      {/* Diamond stone — loaded or procedural */}
      {loaded && scene ? (
        <primitive object={scene} />
      ) : (
        <group position={[0, 0.66, 0]} scale={0.55 / 1.2}>
          <ProceduralDiamond />
        </group>
      )}
    </group>
  );
}

/* ═══════════════════════════════════════════
   RING VIEWER — boutique hero
   Self-contained lighting, procedural fallback,
   ContactShadows, transparent canvas.
   ═══════════════════════════════════════════ */

export interface RingViewerProps {
  className?: string;
  style?: React.CSSProperties;
}

export default function RingViewer({ className, style }: RingViewerProps) {
  return (
    <div className={className} style={style}>
      <GlbErrorBoundary fallback={<PlatinumGlyph />}>
        <Suspense fallback={<PlatinumGlyph />}>
          <Canvas
            gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
            dpr={[2, 3]}
            camera={{ position: [0, 0.8, 2.8], fov: 40 }}
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

            {/* Normalize entire ring to ~1.5 units */}
            <group scale={1.5 / 1.8}>
              <RingScene />
            </group>

            {/* Contact shadow — stone sits on the niche floor */}
            <ContactShadows position={[0, -0.55, 0]} opacity={0.25} blur={2.5} scale={3} far={2} color="#171717" />

            <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={1.5} dampingFactor={0.05} enableDamping />
          </Canvas>
        </Suspense>
      </GlbErrorBoundary>
    </div>
  );
}

try { useGLTF.preload("/diamond.glb/scene.gltf"); } catch {}
