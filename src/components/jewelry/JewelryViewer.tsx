"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { jewelryViewerConfig } from "./jewelryViewerConfig";
import type { JewelryViewerProps } from "./jewelryTypes";

function Model({ modelUrl }: { modelUrl: string }) {
  const { scene } = useGLTF(modelUrl);
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const fitted = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 1.7 / Math.max(size.x, size.y, size.z, 0.001);
    clone.position.sub(center).multiplyScalar(scale);
    clone.scale.setScalar(scale);
    return clone;
  }, [scene]);

  useEffect(() => {
    camera.position.set(0, 0.05, 3.2);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.14;
  });

  return <group ref={group}><primitive object={fitted} /></group>;
}

function LoadingFallback() {
  return <div className="jewelry-viewer-shimmer" aria-label="Loading jewelry viewer" />;
}

export default function JewelryViewer({ modelUrl, className = "", autoRotate = true }: JewelryViewerProps) {
  const [error, setError] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const node = wrapper.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => { useGLTF.clear(modelUrl); }, [modelUrl]);

  if (error) return <div ref={wrapper} className={`jewelry-viewer-error ${className}`}>Unable to display this piece.</div>;

  return <div ref={wrapper} className={`jewelry-viewer ${className}`}>
    {visible && <Canvas dpr={[1, jewelryViewerConfig.maxPixelRatio]} camera={{ fov: jewelryViewerConfig.cameraFov, near: 0.01, far: 100 }} onCreated={({ gl }) => { gl.setPixelRatio(Math.min(window.devicePixelRatio, jewelryViewerConfig.maxPixelRatio)); }}>
      <color attach="background" args={["#0a0a0a"]} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 4, 4]} intensity={3} />
      <directionalLight position={[-3, 1, 2]} intensity={1.4} />
      <Suspense fallback={null}><Model modelUrl={modelUrl} /></Suspense>
      <ContactShadows position={[0, -0.85, 0]} opacity={0.38} scale={4} blur={2.4} far={2} />
      <Environment preset="studio" />
      <OrbitControls enablePan={false} enableDamping dampingFactor={0.08} minDistance={jewelryViewerConfig.minDistance} maxDistance={jewelryViewerConfig.maxDistance} autoRotate={autoRotate} autoRotateSpeed={0.7} minPolarAngle={Math.PI * 0.28} maxPolarAngle={Math.PI * 0.72} />
    </Canvas>}
  </div>;
}
