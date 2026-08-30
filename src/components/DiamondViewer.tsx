"use client";

import { useEffect, useRef } from "react";

export default function DiamondViewer() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void start();
    }, { rootMargin: "240px" });
    observer.observe(host);

    const start = async () => {
      const THREE = await import("three");
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
      const geometry = new THREE.OctahedronGeometry(1.15, 2);
      const material = new THREE.MeshPhysicalMaterial({ color: 0xffd990, metalness: 0.64, roughness: 0.1, transmission: 0.22, clearcoat: 1 });
      const diamond = new THREE.Mesh(geometry, material);
      diamond.scale.set(1, 1.18, 0.72);
      group.add(diamond);

      try {
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const gltf = await new GLTFLoader().loadAsync("/models/chat-diamond.glb");
        if (!disposed) {
          diamond.visible = false;
          group.add(gltf.scene);
        }
      } catch {
        // The procedural diamond remains the graceful local fallback.
      }

      const sparkleGeometry = new THREE.BufferGeometry();
      const points = new Float32Array(120);
      for (let i = 0; i < points.length; i += 3) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.35 + Math.random() * 0.95;
        points[i] = Math.cos(angle) * radius;
        points[i + 1] = (Math.random() - 0.5) * 1.8;
        points[i + 2] = Math.sin(angle) * radius;
      }
      sparkleGeometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
      const sparkleMaterial = new THREE.PointsMaterial({ color: 0xffc66d, size: 0.04, transparent: true, opacity: 0.9 });
      const sparkles = new THREE.Points(sparkleGeometry, sparkleMaterial);
      group.add(sparkles);

      const resize = () => { const width = host.clientWidth || 1; const height = host.clientHeight || width; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); };
      resize();
      const sizeObserver = new ResizeObserver(resize);
      sizeObserver.observe(host);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const pulse = () => { material.emissive.setHex(0x8b5b24); material.emissiveIntensity = 1.8; window.setTimeout(() => { material.emissiveIntensity = 0; }, 180); };
      host.addEventListener("pointerdown", pulse);
      let raf = 0;
      const animate = () => { raf = requestAnimationFrame(animate); if (!reduced) group.rotation.y += 0.003; sparkles.rotation.y -= 0.001; renderer.render(scene, camera); };
      animate();
      cleanup = () => { cancelAnimationFrame(raf); sizeObserver.disconnect(); host.removeEventListener("pointerdown", pulse); geometry.dispose(); material.dispose(); sparkleGeometry.dispose(); sparkleMaterial.dispose(); renderer.dispose(); host.replaceChildren(); };
    };

    return () => { disposed = true; observer.disconnect(); cleanup(); };
  }, []);

  return <div ref={hostRef} aria-label="Interactive diamond" className="h-56 w-full" />;
}
