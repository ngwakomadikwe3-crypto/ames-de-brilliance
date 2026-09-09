"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { ACESFilmicToneMapping, Box3, Group, Mesh, MeshPhysicalMaterial, PMREMGenerator, SRGBColorSpace, Vector3 } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export const BOUTIQUE_RING_URL = "/models/jewelry/ames-pave-solitaire.glb";

function Ring({ idle }: { idle: boolean }) {
  const { scene } = useGLTF(BOUTIQUE_RING_URL);
  const group = useRef<Group>(null);
  const fitted = useMemo(() => {
    const root = scene.clone(true);
    root.traverse(node => {
      if (!(node instanceof Mesh)) return;
      // Own GPU resources; preserve all imported vertex/index data and transforms.
      node.geometry = node.geometry.clone();
      const material = (source: MeshPhysicalMaterial) => {
        if (source.name === "Material" || source.name === "Dimond") return new MeshPhysicalMaterial({ name: source.name, color: "#ffffff", transmission: 1, thickness: .25, ior: 2.417, roughness: .015, metalness: 0, envMapIntensity: 1.5, flatShading: true, dispersion: .035 });
        return source.clone();
      };
      node.material = Array.isArray(node.material) ? node.material.map(m => material(m as MeshPhysicalMaterial)) : material(node.material as MeshPhysicalMaterial);
    });
    const bounds = new Box3().setFromObject(root);const size = bounds.getSize(new Vector3());const center = bounds.getCenter(new Vector3());
    const scale = 1.7 / Math.max(size.x, size.y, size.z);const frame = new Group();frame.add(root);root.position.sub(center);frame.scale.setScalar(scale);
    return frame;
  }, [scene]);
  useEffect(() => () => fitted.traverse(node => { if (node instanceof Mesh) { node.geometry.dispose(); for (const mat of Array.isArray(node.material) ? node.material : [node.material]) mat.dispose(); } }), [fitted]);
  useFrame((_, delta) => { if (idle && group.current) group.current.rotation.y += delta * .055; });
  return <group ref={group} rotation={[.28, -.55, -.08]}><primitive object={fitted} /></group>;
}

function Lighting() {
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.outputColorSpace = SRGBColorSpace;gl.toneMapping = ACESFilmicToneMapping;gl.toneMappingExposure = 1;
    const generator = new PMREMGenerator(gl);const room = new RoomEnvironment();const target = generator.fromScene(room);scene.environment = target.texture;room.dispose();generator.dispose();
    return () => { scene.environment = null;target.dispose(); };
  }, [gl, scene]);
  return <><ambientLight intensity={.2} /><directionalLight position={[2,4,3]} intensity={2.5} /><directionalLight position={[-3,1,-1]} intensity={1.1} /></>;
}

export default function BoutiqueJewelryStage({ active = true }: { active?: boolean }) {
  const [idle, setIdle] = useState(false);
  useEffect(() => { const query = matchMedia("(prefers-reduced-motion: reduce)");const update = () => setIdle(!query.matches);update();query.addEventListener("change",update);return () => query.removeEventListener("change",update); }, []);
  return <div className="ames-boutique-jewelry-stage" aria-label="Pavé Solitaire, drag to rotate, pinch or scroll to zoom" onPointerDown={e=>e.stopPropagation()}>
    <Canvas dpr={[1,1.5]} frameloop={active ? "always" : "never"} camera={{position:[0,.12,3.6],fov:32,near:.01,far:50}} gl={{antialias:true,alpha:true}}>
      <Lighting /><Suspense fallback={null}><Ring idle={active && idle} /></Suspense><OrbitControls enablePan={false} enableDamping minDistance={2.6} maxDistance={5.5} />
    </Canvas>
  </div>;
}
