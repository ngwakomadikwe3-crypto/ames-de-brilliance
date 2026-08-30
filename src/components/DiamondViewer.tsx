"use client";

import { useEffect, useRef } from "react";
import type { MeshPhysicalMaterial, MeshStandardMaterial, Object3D } from "three";

const MODEL_URLS = ["/models/chat-diamond.glb", "/chat-diamond.glb"];

export default function DiamondViewer() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};
    let started = false;

    const start = async () => {
      if (started) return;
      started = true;
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      if (disposed) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
      camera.position.set(0, 0.12, 4.8);
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      host.replaceChildren(renderer.domElement);
      renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none;cursor:grab";

      scene.add(new THREE.HemisphereLight(0xfff1d2, 0x080808, 2.6));
      const key = new THREE.DirectionalLight(0xffd28a, 5);
      key.position.set(2, 3, 4);
      scene.add(key);
      const group = new THREE.Group();
      scene.add(group);
      const fallbackGeometry = new THREE.OctahedronGeometry(1.15, 2);
      const fallbackMaterial = new THREE.MeshPhysicalMaterial({ color: 0xf8e1b0, metalness: 0, roughness: 0, transmission: 1, ior: 2.42, flatShading: true });
      const fallback = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
      fallback.scale.set(1, 1.18, 0.72);
      group.add(fallback);
      const materials: MeshPhysicalMaterial[] = [fallbackMaterial];
      let modelRoot: Object3D | null = null;

      try {
        let gltf;
        for (const url of MODEL_URLS) {
          try {
            gltf = await new GLTFLoader().loadAsync(url);
            break;
          } catch (error) {
            console.warn(`[diamond] unable to load ${url}; trying fallback`, error);
          }
        }
        if (!disposed && gltf) {
          fallback.visible = false;
          modelRoot = gltf.scene;
          modelRoot.traverse((object: Object3D) => {
            if (!(object instanceof THREE.Mesh)) return;
            const source = object.material as MeshStandardMaterial;
            const material = new THREE.MeshPhysicalMaterial({
              color: source.color?.getHex() ?? 0xffffff,
              map: source.map ?? null,
              transmission: 1,
              ior: 2.42,
              roughness: 0,
              metalness: 0,
              flatShading: true,
              transparent: true,
              side: THREE.DoubleSide,
            });
            const candidate = material as MeshPhysicalMaterial & { dispersion?: number };
            if ("dispersion" in candidate) candidate.dispersion = 0.08;
            object.material = material;
            materials.push(material);
          });
          group.add(modelRoot);
        }
      } catch {}

      const sparkleGeometry = new THREE.BufferGeometry();
      const points = new Float32Array(180);
      for (let i = 0; i < points.length; i += 3) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.2 + Math.random() * 1.1;
        points[i] = Math.cos(angle) * radius;
        points[i + 1] = (Math.random() - 0.5) * 1.8;
        points[i + 2] = Math.sin(angle) * radius;
      }
      sparkleGeometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
      const sparkleMaterial = new THREE.PointsMaterial({ color: 0xffd58a, size: 0.045, transparent: true, opacity: 0 });
      const sparkles = new THREE.Points(sparkleGeometry, sparkleMaterial);
      group.add(sparkles);

      const resize = () => { const width = host.clientWidth || 1; const height = host.clientHeight || width; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); };
      resize();
      const sizeObserver = new ResizeObserver(resize);
      sizeObserver.observe(host);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let visible = true;
      let sparkleUntil = 0;
      let spinUntil = 0;
      const pulse = () => {
        const now = performance.now();
        sparkleUntil = now + 520;
        spinUntil = now + 520;
      };
      const onReply = () => pulse();
      host.addEventListener("pointerdown", pulse);
      window.addEventListener("ames-reply", onReply);
      const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.01 });
      visibilityObserver.observe(host);
      let dragging = false;
      let lastX = 0;
      const down = (event: PointerEvent) => { dragging = true; lastX = event.clientX; host.setPointerCapture(event.pointerId); };
      const move = (event: PointerEvent) => { if (dragging) { group.rotation.y += (event.clientX - lastX) * 0.01; lastX = event.clientX; } };
      const up = () => { dragging = false; };
      renderer.domElement.addEventListener("pointerdown", down);
      renderer.domElement.addEventListener("pointermove", move);
      renderer.domElement.addEventListener("pointerup", up);
      let raf = 0;
      const animate = (now: number) => {
        raf = requestAnimationFrame(animate);
        if (!visible) return;
        if (!reduced && !dragging) group.rotation.y += now < spinUntil ? 0.035 : 0.0025;
        const burst = Math.max(0, (sparkleUntil - now) / 520);
        sparkleMaterial.opacity = burst * 0.95;
        group.scale.setScalar(1 + burst * 0.035);
        renderer.render(scene, camera);
      };
      animate(performance.now());
      cleanup = () => { cancelAnimationFrame(raf); sizeObserver.disconnect(); visibilityObserver.disconnect(); host.removeEventListener("pointerdown", pulse); window.removeEventListener("ames-reply", onReply); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointermove", move); renderer.domElement.removeEventListener("pointerup", up); scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const material = object.material; if (Array.isArray(material)) material.forEach((item) => item.dispose()); else material.dispose(); } }); sparkleGeometry.dispose(); sparkleMaterial.dispose(); renderer.dispose(); host.replaceChildren(); };
    };

    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { observer.disconnect(); void start(); } }, { rootMargin: "240px" });
    observer.observe(host);
    return () => { disposed = true; observer.disconnect(); cleanup(); };
  }, []);

  return <div ref={hostRef} aria-label="Interactive diamond" className="h-56 w-full" />;
}
