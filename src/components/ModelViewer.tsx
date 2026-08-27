"use client";

import { Suspense, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, OrbitControls, ContactShadows, Environment } from "@react-three/drei";
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

/* ── Crystal material — premium sharpness ── */
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

/* ── Diamond scene: auto-center, apply crystal material to every mesh ── */
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

  // Auto-center and normalize to ~1.6 world units
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  scene.position.sub(center);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) scene.scale.setScalar(1.6 / maxDim);

  return <group ref={group}><primitive object={scene} /></group>;
}

/* ═══════════════════════════════════════════
   MODEL VIEWER — premium crystal diamond
   Transparent canvas, custom lighting, ContactShadows.
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
      <Suspense fallback={<PlatinumGlyph />}>
        <Canvas
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          dpr={[2, 3]}
          camera={{ position: [0, 0.35, 3], fov: 45 }}
          style={{ background: "transparent", width: "100%", height: "100%", touchAction: "pan-y" }}
        >
          {/* Custom Lightformers — no network presets, fully local */}
          <Environment resolution={256}>
            {/* White area light above — bright, clean key */}
            <group rotation={[-Math.PI / 3, 0, 0]}>
              <mesh position={[0, 0, 0]} rotation={[0, 0, 0]}>
                <planeGeometry args={[10, 10]} />
                <meshBasicMaterial color="#ffffff" toneMapped={false} />
              </mesh>
              <pointLight intensity={3} distance={10} decay={0} />
            </group>
            {/* Dark side strip left — creates facet contrast */}
            <group rotation={[0, Math.PI / 2, 0]} position={[-3, 0, 0]}>
              <mesh>
                <planeGeometry args={[6, 6]} />
                <meshBasicMaterial color="#2B2B2B" toneMapped={false} />
              </mesh>
              <pointLight intensity={1.2} distance={8} decay={0} />
            </group>
            {/* Dark side strip right */}
            <group rotation={[0, -Math.PI / 2, 0]} position={[3, 0, 0]}>
              <mesh>
                <planeGeometry args={[6, 6]} />
                <meshBasicMaterial color="#2B2B2B" toneMapped={false} />
              </mesh>
              <pointLight intensity={1.2} distance={8} decay={0} />
            </group>
            {/* Cool silver accent from behind */}
            <group rotation={[0, Math.PI, 0]}>
              <mesh>
                <planeGeometry args={[8, 4]} />
                <meshBasicMaterial color="#b0c4de" toneMapped={false} />
              </mesh>
              <pointLight intensity={0.6} distance={8} decay={0} />
            </group>
          </Environment>

          {/* Subtle ambient fill */}
          <ambientLight intensity={0.15} />

          <DiamondScene modelPath={modelPath} />

          {/* Contact shadow — stone sits on the pearl surface */}
          {showContactShadows && (
            <ContactShadows
              position={[0, -0.8, 0]}
              opacity={0.25}
              blur={2.5}
              scale={3}
              far={2}
              color="#171717"
            />
          )}

          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate
            autoRotateSpeed={1.2}
            dampingFactor={0.05}
            enableDamping
          />
        </Canvas>
      </Suspense>
    </div>
  );
}

try { useGLTF.preload("/diamond.glb/scene.gltf"); } catch {}
