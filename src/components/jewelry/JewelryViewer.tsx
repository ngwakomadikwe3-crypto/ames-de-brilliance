"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, useGLTF } from "@react-three/drei";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createDiamondMaterial, materialMap, setMetal, type MetalId } from "./jewelryMaterials";
import * as THREE from "three";
import { jewelryViewerConfig } from "./jewelryViewerConfig";
import type { JewelryViewerProps } from "./jewelryTypes";

let activeModelUrl: string | null = null;
const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => { material.dispose(); });
    child.geometry.dispose();
  });
};

class ViewerErrorBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Model({ modelUrl, autoRotate, onVariants, onReady }: { modelUrl: string; autoRotate: boolean; onVariants: (variants: { metals: MetalId[]; hasDiamond: boolean }) => void; onReady: () => void }) {
  const { scene } = useGLTF(modelUrl);
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const fitted = useMemo(() => {
    activeModelUrl = modelUrl;
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 1.7 / Math.max(size.x, size.y, size.z, 0.001);
    clone.position.sub(center).multiplyScalar(scale);
    clone.scale.setScalar(scale);
    return clone;
  }, [scene, modelUrl]);
  useEffect(() => {
    const metals: MetalId[] = [];
    let hasDiamond = false;
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (materialMap.diamond.includes(material.name)) { child.material = createDiamondMaterial(); hasDiamond = true; }
        (Object.keys(materialMap) as Array<MetalId | "diamond">).forEach((key) => { if (key !== "diamond" && materialMap[key].includes(material.name) && !metals.includes(key)) metals.push(key); });
      });
    });
    onVariants({ metals, hasDiamond });
    camera.position.set(0, 0.05, 3.2);
    camera.lookAt(0, 0, 0);
    onReady();
    return () => { disposeObject(fitted); if (activeModelUrl === modelUrl) activeModelUrl = null; };
  }, [camera, fitted, modelUrl, onReady, onVariants, scene]);
  useFrame((_, delta) => { if (autoRotate && group.current && document.visibilityState === "visible") group.current.rotation.y += delta * 0.14; });
  return <group ref={group}><primitive object={fitted} /></group>;
}

function LoadingFallback() { return <div className="jewelry-viewer-shimmer" aria-label="Jewelry viewer warming" />; }

export default function JewelryViewer({ modelUrl, image, caption, className = "", autoRotate = true }: JewelryViewerProps & { image?: string; caption?: string }) {
  const [error, setError] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [ready, setReady] = useState(false);
  const [variants, setVariants] = useState<{ metals: MetalId[]; hasDiamond: boolean }>({ metals: [], hasDiamond: false });
  const [metal, setMetalChoice] = useState<MetalId | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const safeAutoRotate = autoRotate && !prefersReducedMotion;
  useEffect(() => { const node = wrapper.current; if (!node) return; const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 }); observer.observe(node); return () => observer.disconnect(); }, []);
  useEffect(() => { const onVisibility = () => setVisible(document.visibilityState === "visible"); document.addEventListener("visibilitychange", onVisibility); return () => document.removeEventListener("visibilitychange", onVisibility); }, []);
  useEffect(() => { if (!window.WebGLRenderingContext) setWebgl(false); }, []);
  useEffect(() => () => { if (activeModelUrl === modelUrl) { activeModelUrl = null; useGLTF.clear(modelUrl); } }, [modelUrl]);
  const onVariants = useMemo(() => (next: { metals: MetalId[]; hasDiamond: boolean }) => setVariants(next), []);
  const onReady = useMemo(() => () => setReady(true), []);
  useEffect(() => { if (metal && activeModelUrl === modelUrl) { const cached = useGLTF(modelUrl); setMetal(cached.scene, "", metal); } }, [modelUrl, metal]);
  if (error || !webgl) return <figure ref={wrapper} className={`jewelry-viewer-fallback ${className}`}><img src={image || "/ring-poster.jpg"} alt={caption || "Jewellery piece"} /><figcaption>{caption || "A study in light and proportion."}</figcaption></figure>;
  return <div ref={wrapper} className={`jewelry-viewer ${className}`} aria-describedby="jewelry-viewer-description">
    <p id="jewelry-viewer-description" className="sr-only">Interactive three-dimensional jewellery viewer. Drag to rotate and use pinch or scroll to zoom.</p>
    {variants.metals.length > 0 && <div className="jewelry-material-controls" role="group" aria-label="Available metals">{variants.metals.map((id) => <button key={id} onClick={() => setMetalChoice(id)} aria-pressed={metal === id} aria-label={`Use ${id} metal`}>{id}</button>)}</div>}
    {visible && <ViewerErrorBoundary fallback={<figure className="jewelry-viewer-fallback"><img src={image || "/ring-poster.jpg"} alt={caption || "Jewellery piece"} /><figcaption>{caption || "A study in light and proportion."}</figcaption></figure>}><Canvas dpr={[0.75, Math.min(jewelryViewerConfig.maxPixelRatio, typeof navigator !== "undefined" && /Android|iPhone|iPad/.test(navigator.userAgent) ? 1.15 : 1.5)]} camera={{ fov: jewelryViewerConfig.cameraFov, near: 0.01, far: 100 }} fallback={<div className="jewelry-viewer-error">This piece is best viewed in a browser with 3D enabled.</div>} onCreated={({ gl, scene }) => { try { gl.setPixelRatio(Math.min(window.devicePixelRatio, typeof navigator !== "undefined" && navigator.hardwareConcurrency < 4 ? 1 : jewelryViewerConfig.maxPixelRatio)); gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; const pmrem = new THREE.PMREMGenerator(gl); const env = new RoomEnvironment(); scene.environment = pmrem.fromScene(env).texture; env.dispose(); pmrem.dispose(); } catch { setWebgl(false); } }}>
      <color attach="background" args={["#0a0a0a"]} /><ambientLight intensity={1.2} /><directionalLight position={[3, 4, 4]} intensity={3} /><directionalLight position={[-3, 1, 2]} intensity={1.4} />
      <Suspense fallback={<LoadingFallback />}><Model modelUrl={modelUrl} autoRotate={safeAutoRotate} onVariants={onVariants} onReady={onReady} /></Suspense>
      <ContactShadows position={[0, -0.85, 0]} opacity={0.38} scale={4} blur={2.4} far={2} /><OrbitControls enablePan={false} enableDamping dampingFactor={0.08} minDistance={jewelryViewerConfig.minDistance} maxDistance={jewelryViewerConfig.maxDistance} autoRotate={safeAutoRotate} autoRotateSpeed={0.7} minPolarAngle={Math.PI * 0.28} maxPolarAngle={Math.PI * 0.72} />
    </Canvas></ViewerErrorBoundary>}
    {!ready && <div className="jewelry-viewer-shimmer" aria-hidden="true" />}
  </div>;
}

export function preloadJewelryModel(modelUrl: string) { if (modelUrl) useGLTF.preload(modelUrl); }
export function disposeJewelryModel(modelUrl: string) { if (activeModelUrl === modelUrl) activeModelUrl = null; useGLTF.clear(modelUrl); }
