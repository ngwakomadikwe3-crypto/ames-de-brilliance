"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

/* ── Diamond model (auto-rotating, crystal material, interactive) ── */
function DiamondModel({
  dragRef,
  draggingRef,
}: {
  dragRef: React.MutableRefObject<{ dx: number; dy: number }>;
  draggingRef: React.MutableRefObject<boolean>;
}) {
  const { scene } = useGLTF("/diamond.glb/scene.gltf");
  const group = useRef<THREE.Group>(null);
  const baseRotY = useRef(0);

  // Apply crystal material to all meshes
  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: "#ffffff",
          transmission: 1,
          thickness: 1.5,
          roughness: 0.05,
          ior: 2.3,
          clearcoat: 1,
          clearcoatRoughness: 0.1,
          iridescence: 0.2,
          iridescenceIOR: 1.3,
          envMapIntensity: 1.5,
          transparent: true,
          opacity: 0.95,
          side: THREE.DoubleSide,
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    // Center and scale the model
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 2.2 / maxDim;
    scene.scale.setScalar(scale);
    scene.position.sub(center.multiplyScalar(scale));
    scene.position.y -= size.y * scale * 0.15;
  }, [scene]);

  // Auto-rotation + drag interaction
  useFrame((_, delta) => {
    if (!group.current) return;

    const drag = dragRef.current;
    const dragging = draggingRef.current;

    if (dragging) {
      // While dragging, apply drag deltas directly
      group.current.rotation.y += drag.dx * 0.01;
      // Tilt on X axis, clamped to ±0.3 rad
      group.current.rotation.x = Math.max(
        -0.3,
        Math.min(0.3, group.current.rotation.x + drag.dy * 0.01)
      );
      // Zero out so next frame doesn't accumulate
      drag.dx = 0;
      drag.dy = 0;
      // Update base rotation so auto-rotate resumes from current position
      baseRotY.current = group.current.rotation.y;
    } else {
      // Resume auto-rotation on Y from where we left off
      baseRotY.current += delta * 0.25;
      group.current.rotation.y = baseRotY.current;
      // Gently tilt X back to 0 when idle
      const currentX = group.current.rotation.x;
      if (Math.abs(currentX) > 0.001) {
        group.current.rotation.x += (0 - currentX) * 0.05;
      }
    }
  });

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

/* ── Fallback gold SVG glyph ── */
function FallbackGlyph() {
  return (
    <div
      style={{
        width: 72,
        height: 72,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        style={{ width: 72, height: 72 }}
        aria-hidden="true"
      >
        <path
          d="M12 2L22 9L12 22L2 9L12 2Z"
          stroke="#C9A227"
          strokeWidth="1.5"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

/* ── Main exported component ── */
export function DiamondViewer({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Shared drag state between pointer handlers and DiamondModel
  const dragDeltaRef = useRef({ dx: 0, dy: 0 });
  const draggingRef = useRef(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only handle primary button (left click / single touch)
      if (e.button !== 0) return;
      draggingRef.current = true;
      clearIdleTimer();
      // Set the pointer capture on the element so we keep getting move/up
      // events even if the pointer moves outside — this does NOT prevent
      // scrolling because we use touch-action: pan-y
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [clearIdleTimer]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      // Accumulate deltas — the render loop will consume them.
      // We intentionally do NOT call preventDefault so the page can scroll.
      dragDeltaRef.current.dx += e.movementX;
      dragDeltaRef.current.dy += e.movementY;
    },
    []
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      // Start the idle timer: auto-rotation resumes after 3 seconds
      clearIdleTimer();
      idleTimerRef.current = setTimeout(() => {
        draggingRef.current = false;
      }, 3000);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [clearIdleTimer]
  );

  // Cleanup idle timer on unmount
  useEffect(() => {
    return () => clearIdleTimer();
  }, [clearIdleTimer]);

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* 3D canvas — hidden until loaded, shown after */}
      {!error && (
        <div
          ref={canvasContainerRef}
          style={{
            position: "absolute",
            inset: 0,
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.6s ease-in",
          }}
        >
          {/* touch-action: pan-y so vertical swipes scroll the page beneath */}
          <Canvas
            camera={{ position: [0, 0, 4], fov: 35 }}
            gl={{
              antialias: true,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.2,
              alpha: true,
            }}
            style={{
              background: "transparent",
              touchAction: "pan-y",
              cursor: "grab",
            }}
            dpr={[1, 2]}
            onCreated={() => setLoaded(true)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* Key light — warm, from upper-right */}
            <directionalLight
              position={[3, 4, 2]}
              intensity={2.5}
              color="#fff5e6"
              castShadow
            />
            {/* Fill light — soft, from left */}
            <directionalLight
              position={[-2, 1, 1]}
              intensity={0.8}
              color="#e0e8ff"
            />
            {/* Rim light — cool, from behind */}
            <pointLight
              position={[0, 2, -3]}
              intensity={3}
              color="#a0c4ff"
              distance={10}
            />
            {/* Subtle gold accent from below */}
            <pointLight
              position={[0, -2, 1]}
              intensity={1.2}
              color="#C9A227"
              distance={8}
            />
            {/* Ambient fill */}
            <ambientLight intensity={0.3} color="#ffffff" />
            <DiamondModel
              dragRef={dragDeltaRef}
              draggingRef={draggingRef}
            />
          </Canvas>
        </div>
      )}

      {/* Fallback glyph — shown during load or on error */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: loaded && !error ? 0 : 1,
          transition: "opacity 0.4s ease-out",
          pointerEvents: "none",
        }}
      >
        <FallbackGlyph />
      </div>
    </div>
  );
}
