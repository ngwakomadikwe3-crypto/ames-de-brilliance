"use client";

import { Suspense, useRef, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, OrbitControls, ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";

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

/* ── Platinum material for the band ── */
const PLATINUM = new THREE.MeshStandardMaterial({
  color: new THREE.Color("#E8E6E1"),
  metalness: 1,
  roughness: 0.12,
});

/* ═══════════════════════════════════════════
   RingScene — torus band + prongs + diamond
   ═══════════════════════════════════════════ */

function RingScene() {
  const group = useRef<THREE.Group>(null!);
  const { scene } = useGLTF("/diamond.glb/scene.gltf");

  /* Diamond: traverse every mesh, override material with crystal */
  useMemo(() => {
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.material = CRYSTAL;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });

    // Normalize the diamond to ~0.55 world units
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) scene.scale.setScalar(0.55 / maxDim);

    // Center the diamond and lift it above the band
    const center = box.getCenter(new THREE.Vector3());
    scene.position.set(-center.x * (0.55 / maxDim), 0.62 + 0.04, -center.z * (0.55 / maxDim));
  }, [scene]);

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

      {/* Diamond stone */}
      <primitive object={scene} />
    </group>
  );
}

/* ═══════════════════════════════════════════
   RING VIEWER — boutique hero
   Fully transparent canvas, graphite niche.
   ═══════════════════════════════════════════ */

export interface RingViewerProps {
  className?: string;
  style?: React.CSSProperties;
}

export default function RingViewer({ className, style }: RingViewerProps) {
  return (
    <div className={className} style={style}>
      <Suspense fallback={<PlatinumGlyph />}>
        <Canvas
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          dpr={[2, 3]}
          camera={{ position: [0, 0.8, 2.8], fov: 40 }}
          style={{ background: "transparent", width: "100%", height: "100%", touchAction: "pan-y" }}
        >
          {/* Custom Lightformers — no network presets */}
          <Environment resolution={256}>
            {/* White area light above */}
            <group rotation={[-Math.PI / 3, 0, 0]}>
              <mesh>
                <planeGeometry args={[10, 10]} />
                <meshBasicMaterial color="#ffffff" toneMapped={false} />
              </mesh>
              <pointLight intensity={3} distance={10} decay={0} />
            </group>
            {/* Dark side strip left */}
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

          <ambientLight intensity={0.15} />

          {/* Normalize entire ring to ~1.5 units */}
          <group scale={1.5 / 1.8}>
            <RingScene />
          </group>

          {/* Contact shadow on the niche floor */}
          <ContactShadows
            position={[0, -0.55, 0]}
            opacity={0.3}
            blur={2.5}
            scale={3}
            far={2}
            color="#171717"
          />

          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate
            autoRotateSpeed={1.5}
            dampingFactor={0.05}
            enableDamping
          />
        </Canvas>
      </Suspense>
    </div>
  );
}

try { useGLTF.preload("/diamond.glb/scene.gltf"); } catch {}
