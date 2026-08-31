"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { JewelryViewerProps } from "./jewelryTypes";
import { createDiamondMaterial } from "./jewelryMaterials";
import JewelryControls from "./JewelryControls";

function disposeModel(root: THREE.Object3D) { root.traverse((node) => { if (!(node instanceof THREE.Mesh)) return; node.geometry.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose(); }); }

class ViewerBoundary extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error("[v0] AMES viewer failed", error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function PlaceholderPiece() {
  const group = useRef<THREE.Group>(null);
  const gold = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#b76e79", metalness: 0.92, roughness: 0.22 }), []);
  const diamond = useMemo(() => createDiamondMaterial(), []);
  useEffect(() => () => { gold.dispose(); diamond.dispose(); }, [gold, diamond]);
  useFrame((_, delta) => { if (group.current) group.current.rotation.y += delta * 0.14; });
  return <group ref={group} rotation={[0.2, 0, 0]}>
    <mesh rotation={[Math.PI / 2, 0, 0]} material={gold}><torusGeometry args={[0.72, 0.075, 32, 96]} /></mesh>
    <mesh position={[0, 0.22, 0]} material={diamond}><icosahedronGeometry args={[0.28, 2]} /></mesh>
  </group>;
}

function LoadedPiece({ url, autoRotate, onReady }: { url: string; autoRotate: boolean; onReady: () => void }) {
  const { scene } = useGLTF(url);
  const group = useRef<THREE.Group>(null);
  const fitted = useMemo(() => { const copy = scene.clone(true); const box = new THREE.Box3().setFromObject(copy); const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3()); const scale = 1.5 / Math.max(size.x, size.y, size.z, 0.001); copy.position.sub(center).multiplyScalar(scale); copy.scale.setScalar(scale); return copy; }, [scene]);
  useEffect(() => { onReady(); return () => disposeModel(fitted); }, [fitted, onReady]);
  useFrame((_, delta) => { if (autoRotate && group.current) group.current.rotation.y += delta * 0.14; });
  return <group ref={group}><primitive object={fitted} /></group>;
}

function Scene({ modelUrl, autoRotate, onReady }: { modelUrl: string; autoRotate: boolean; onReady: () => void }) {
  const { gl, scene } = useThree();
  useEffect(() => { gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; const pmrem = new THREE.PMREMGenerator(gl); const room = new RoomEnvironment(); scene.environment = pmrem.fromScene(room).texture; room.dispose(); pmrem.dispose(); return () => { scene.environment?.dispose(); }; }, [gl, scene]);
  return <><ambientLight intensity={0.75} /><directionalLight position={[3, 4, 4]} intensity={2.2} /><directionalLight position={[-3, 2, 1]} intensity={1.1} />{modelUrl.startsWith("placeholder:") ? <PlaceholderPiece /> : <Suspense fallback={null}><LoadedPiece url={modelUrl} autoRotate={autoRotate} onReady={onReady} /></Suspense>}<ContactShadows position={[0, -0.8, 0]} opacity={0.32} scale={3.5} blur={2.4} far={2.5} /></>;
}

function Fallback({ image, caption }: { image?: string; caption?: string }) { return <figure className="jewelry-viewer-fallback"><img src={image || "/ring-poster.jpg"} alt={caption || "AMES jewellery piece"} /><figcaption>{caption || "Private viewing — not for sale"}</figcaption></figure>; }

export default function JewelryViewer({ modelUrl, image, caption, className = "", autoRotate = true }: JewelryViewerProps) {
  const [failed, setFailed] = useState(false); const [ready, setReady] = useState(false); const [visible, setVisible] = useState(true); const [motion, setMotion] = useState(autoRotate); const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => { const node = wrapper.current; if (!node) return; const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 }); observer.observe(node); return () => observer.disconnect(); }, []);
  useEffect(() => { const reduce = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setMotion(autoRotate && !reduce.matches); update(); reduce.addEventListener("change", update); return () => reduce.removeEventListener("change", update); }, [autoRotate]);
  useEffect(() => () => { if (modelUrl && !modelUrl.startsWith("placeholder:")) useGLTF.clear(modelUrl); }, [modelUrl]);
  if (failed || typeof window !== "undefined" && !window.WebGLRenderingContext) return <Fallback image={image} caption={caption} />;
  return <div ref={wrapper} className={`jewelry-viewer ${className}`} aria-label="Interactive AMES jewellery preview"><p className="sr-only">{caption || "Private viewing — not for sale"}. Drag to rotate, scroll or pinch to zoom.</p><JewelryControls reset={() => setReady(false)} auto={() => setMotion((value) => !value)} fullscreen={() => wrapper.current?.requestFullscreen?.().catch(() => undefined)} autoRotate={motion} />{visible && <ViewerBoundary fallback={<Fallback image={image} caption={caption} />}><Canvas dpr={[1, Math.min(2, typeof navigator !== "undefined" && navigator.hardwareConcurrency < 4 ? 1.25 : 2)]} camera={{ fov: 28, position: [0, 0.1, 3.2], near: 0.01, far: 100 }} onCreated={({ gl }) => { gl.setPixelRatio(Math.min(window.devicePixelRatio, 2)); }}><Scene modelUrl={modelUrl} autoRotate={motion} onReady={() => setReady(true)} /><OrbitControls enablePan={false} enableDamping dampingFactor={0.08} minDistance={1.4} maxDistance={5} autoRotate={false} /></Canvas></ViewerBoundary>}{!ready && !modelUrl.startsWith("placeholder:") && <div className="jewelry-viewer-shimmer" aria-label="Preparing your AMES piece…" />}</div>;
}

export function preloadJewelryModel(modelUrl: string) { if (modelUrl && !modelUrl.startsWith("placeholder:")) useGLTF.preload(modelUrl); }
export function disposeJewelryModel(modelUrl: string) { if (modelUrl) useGLTF.clear(modelUrl); }
