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
      const frameModel = (root: Object3D) => {
        root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(root);
        const size = bounds.getSize(new THREE.Vector3());
        const centre = bounds.getCenter(new THREE.Vector3());
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        const targetHeight = 1.05;
        const scale = size.y > 0 ? targetHeight / size.y : 1;
        root.scale.setScalar(scale);
        root.position.x = -centre.x * scale;
        root.position.y = -centre.y * scale + 0.35;
        root.position.z = -centre.z * scale;
        const radius = Math.max(sphere.radius * scale, 0.8);
        camera.position.set(0, 0.08, radius * 2.2);
        camera.lookAt(0, 0.08, 0);
        camera.updateProjectionMatrix();
      };

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
              color: 0xffffff,
              map: null,
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
          frameModel(modelRoot);
        }
      } catch (error) {
        console.warn("[diamond] GLB parse failed; using procedural fallback", error);
      }

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

      const resize = () => {
        const width = host.clientWidth || 1;
        const height = host.clientHeight || width;
        camera.aspect = width / height;
        renderer.setSize(width, height, false);
        if (modelRoot) frameModel(modelRoot);
        else { camera.position.set(0, 0.08, 2.6); camera.lookAt(0, 0.08, 0); }
        camera.updateProjectionMatrix();
      };
      resize();
      const sizeObserver = new ResizeObserver(resize);
      sizeObserver.observe(host);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let visible = true;
      let sparkleUntil = 0;
      let spinStart = 0;
      let spinUntil = 0;
      let spinApplied = 0;
      let flareTimer = 0;
      const pulse = () => {
        const now = performance.now();
        const stage = host.parentElement;
        stage?.classList.add("stage-flare");
        window.clearTimeout(flareTimer);
        flareTimer = window.setTimeout(() => stage?.classList.remove("stage-flare"), 900);
        sparkleUntil = now + 520;
        spinStart = now;
        spinUntil = now + 800;
        spinApplied = 0;
      };
      const onReply = () => pulse();
      window.addEventListener("ames-reply", onReply);
      const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0 });
      visibilityObserver.observe(host);
      let dragging = false;
      let lastTap = 0;
      let lastX = 0;
      let lastY = 0;
      let downX = 0;
      let downY = 0;
      const down = (event: PointerEvent) => {
        dragging = true;
        lastX = downX = event.clientX;
        lastY = downY = event.clientY;
        host.setPointerCapture(event.pointerId);
      };
      const move = (event: PointerEvent) => {
        if (!dragging) return;
        const showcase = host.parentElement?.classList.contains("diamond-showcase");
        if (showcase && !reduced) {
          group.rotation.z = THREE.MathUtils.clamp((event.clientX - host.getBoundingClientRect().left - host.clientWidth / 2) / host.clientWidth * 0.14, -0.07, 0.07);
          group.rotation.x = THREE.MathUtils.clamp((event.clientY - host.getBoundingClientRect().top - host.clientHeight / 2) / host.clientHeight * 0.14, -0.07, 0.07);
        }
        group.rotation.y += (event.clientX - lastX) * 0.01;
        group.rotation.x = THREE.MathUtils.clamp(group.rotation.x + (event.clientY - lastY) * 0.01, -0.6, 0.6);
        lastX = event.clientX;
        lastY = event.clientY;
      };
      const up = (event: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        if (Math.hypot(event.clientX - downX, event.clientY - downY) < 6) {
          const now = performance.now();
          if (!reduced && now - lastTap < 320) host.parentElement?.classList.toggle("diamond-showcase");
          lastTap = now;
          pulse();
        }
        if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      };
      renderer.domElement.addEventListener("pointerdown", down);
      renderer.domElement.addEventListener("pointermove", move);
      renderer.domElement.addEventListener("pointerup", up);
      let raf = 0;
      let previous = performance.now();
      const animate = (now: number) => {
        raf = requestAnimationFrame(animate);
        const delta = Math.min(now - previous, 50);
        previous = now;
        if (!visible) return;
        if (!dragging) group.rotation.y += (reduced ? 0.05 : 0.3) * delta / 1000;
        if (now < spinUntil) {
          const progress = Math.min(1, (now - spinStart) / 800);
          const eased = 1 - Math.pow(1 - progress, 3);
          const target = eased * Math.PI * 2;
          group.rotation.y += target - spinApplied;
          spinApplied = target;
        }
        const burst = Math.max(0, (sparkleUntil - now) / 520);
        sparkleMaterial.opacity = burst * 0.95;
        group.scale.setScalar(1 + burst * 0.035);
        renderer.render(scene, camera);
      };
      animate(performance.now());
      cleanup = () => { cancelAnimationFrame(raf); window.clearTimeout(flareTimer); host.parentElement?.classList.remove("stage-flare"); sizeObserver.disconnect(); visibilityObserver.disconnect(); window.removeEventListener("ames-reply", onReply); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointermove", move); renderer.domElement.removeEventListener("pointerup", up); scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const material = object.material; if (Array.isArray(material)) material.forEach((item) => item.dispose()); else material.dispose(); } }); sparkleGeometry.dispose(); sparkleMaterial.dispose(); renderer.dispose(); host.replaceChildren(); };
    };

    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { observer.disconnect(); void start(); } }, { rootMargin: "240px" });
    observer.observe(host);
    return () => { disposed = true; observer.disconnect(); cleanup(); };
  }, []);

  const dust = [3, 11, 18, 27, 36, 44, 53, 61, 69, 76, 83, 89, 94, 98];
  return (
    <div className="diamond-stage" aria-label="Interactive diamond stage">
      <div className="diamond-backdrop" aria-hidden="true" />
      <div className="diamond-spotlight" aria-hidden="true" />
      <div className="diamond-rays" aria-hidden="true" />
      <div className="diamond-pool" aria-hidden="true" />
      <div className="diamond-pedestal" aria-hidden="true"><div className="pedestal-top" /><div className="pedestal-ring" /><div className="pedestal-base" /><div className="pedestal-shadow" /></div>
      {dust.map((left, index) => <i key={left} className="diamond-dust" style={{ left: `${left}%`, animationDelay: `${index * -0.37}s`, animationDuration: `${2 + (index % 4)}s` }} aria-hidden="true" />)}
      <div ref={hostRef} aria-label="Interactive diamond" className="diamond-canvas" />
    </div>
  );
}
