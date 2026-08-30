"use client";

import { useEffect, useRef } from "react";

function buildRoundBrilliant(THREE: typeof import("three")) {
  const segments = 16;
  const rings = [
    { count: 8, radius: 0.55, z: 0.35, twist: 0 },
    { count: segments, radius: 0.8, z: 0.2, twist: Math.PI / 16 },
    { count: segments, radius: 1, z: 0.03, twist: 0 },
    { count: segments, radius: 1, z: -0.03, twist: 0 },
    { count: segments, radius: 0.5, z: -0.43, twist: Math.PI / 16 },
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  const addRing = (ring: (typeof rings)[number]) => {
    const start = positions.length / 3;
    for (let i = 0; i < ring.count; i += 1) {
      const a = (i / ring.count) * Math.PI * 2 + ring.twist;
      positions.push(Math.cos(a) * ring.radius, Math.sin(a) * ring.radius, ring.z);
    }
    return start;
  };
  const starts = rings.map(addRing);
  const connect = (a: number, ac: number, b: number, bc: number) => {
    for (let i = 0; i < 16; i += 1) {
      const an = (i + 1) % 16;
      indices.push(a + (i % ac), b + (i % bc), b + (an % bc), a + (i % ac), b + (an % bc), a + (an % ac));
    }
  };
  // Alternating triangle strips: table to crown, crown to girdle, and pavilion.
  for (let i = 0; i < starts.length - 1; i += 1) connect(starts[i], rings[i].count, starts[i + 1], rings[i + 1].count);
  const tableCenter = positions.length / 3;
  positions.push(0, 0, 0.35);
  for (let i = 0; i < 8; i += 1) indices.push(tableCenter, starts[0] + i, starts[0] + (i + 1) % 8);
  const culet = positions.length / 3;
  positions.push(0, 0, -0.86);
  for (let i = 0; i < 16; i += 1) indices.push(culet, starts[4] + i, starts[4] + (i + 1) % 16);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

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
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      if (disposed) return;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      host.replaceChildren(renderer.domElement);
      renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none;cursor:grab";
      scene.add(new THREE.HemisphereLight(0xfff1d2, 0x080808, 2.6));
      const key = new THREE.DirectionalLight(0xffd28a, 5);
      key.position.set(2, 3, 4);
      scene.add(key);
      const pmrem = new THREE.PMREMGenerator(renderer);
      const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = environment.texture;
      const group = new THREE.Group();
      scene.add(group);
      const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, ior: 2.42, roughness: 0, metalness: 0, thickness: 1.5, envMapIntensity: 1.6, flatShading: true, transparent: true, side: THREE.DoubleSide });
      const dispersionMaterial = material as typeof material & { dispersion?: number };
      if ("dispersion" in dispersionMaterial) dispersionMaterial.dispersion = 0.08;
      const stone = new THREE.Mesh(buildRoundBrilliant(THREE), material);
      group.add(stone);
      const sparkleGeometry = new THREE.BufferGeometry();
      const points = new Float32Array(180);
      for (let i = 0; i < points.length; i += 3) { const angle = Math.random() * Math.PI * 2; const radius = 1.2 + Math.random() * 1.1; points[i] = Math.cos(angle) * radius; points[i + 1] = (Math.random() - 0.5) * 1.8; points[i + 2] = Math.sin(angle) * radius; }
      sparkleGeometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
      const sparkleMaterial = new THREE.PointsMaterial({ color: 0xffd58a, size: 0.045, transparent: true, opacity: 0 });
      group.add(new THREE.Points(sparkleGeometry, sparkleMaterial));
      const resize = () => { const width = host.clientWidth || 1; const height = host.clientHeight || width; camera.aspect = width / height; camera.position.set(0, 0.08, 4.2); camera.lookAt(0, 0.08, 0); renderer.setSize(width, height, false); camera.updateProjectionMatrix(); };
      resize();
      const sizeObserver = new ResizeObserver(resize); sizeObserver.observe(host);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let visible = true; let sparkleUntil = 0; let spinStart = 0; let spinUntil = 0; let spinApplied = 0; let flareTimer = 0;
      const pulse = () => { const now = performance.now(); const stage = host.parentElement; stage?.classList.add("stage-flare"); window.clearTimeout(flareTimer); flareTimer = window.setTimeout(() => stage?.classList.remove("stage-flare"), 900); sparkleUntil = now + 520; spinStart = now; spinUntil = now + 800; spinApplied = 0; };
      const onReply = () => pulse(); window.addEventListener("ames-reply", onReply);
      const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0 }); visibilityObserver.observe(host);
      let dragging = false; let lastTap = 0; let lastX = 0; let lastY = 0; let downX = 0; let downY = 0;
      const down = (event: PointerEvent) => { dragging = true; lastX = downX = event.clientX; lastY = downY = event.clientY; host.setPointerCapture(event.pointerId); };
      const move = (event: PointerEvent) => { if (!dragging) return; group.rotation.y += (event.clientX - lastX) * 0.01; group.rotation.x = THREE.MathUtils.clamp(group.rotation.x + (event.clientY - lastY) * 0.01, -0.6, 0.6); lastX = event.clientX; lastY = event.clientY; };
      const up = (event: PointerEvent) => { if (!dragging) return; dragging = false; if (Math.hypot(event.clientX - downX, event.clientY - downY) < 6) { const now = performance.now(); if (!reduced && now - lastTap < 320) host.parentElement?.classList.toggle("diamond-showcase"); lastTap = now; pulse(); } if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId); };
      renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointermove", move); renderer.domElement.addEventListener("pointerup", up);
      let raf = 0; let previous = performance.now();
      const animate = (now: number) => { raf = requestAnimationFrame(animate); const delta = Math.min(now - previous, 50); previous = now; if (!visible) return; if (!dragging && !reduced) group.rotation.y += 0.3 * delta / 1000; if (now < spinUntil && !reduced) { const progress = Math.min(1, (now - spinStart) / 800); const target = (1 - Math.pow(1 - progress, 3)) * Math.PI * 2; group.rotation.y += target - spinApplied; spinApplied = target; } sparkleMaterial.opacity = Math.max(0, (sparkleUntil - now) / 520) * 0.95; group.scale.setScalar(1 + Math.max(0, (sparkleUntil - now) / 520) * 0.035); renderer.render(scene, camera); };
      animate(performance.now());
      cleanup = () => { cancelAnimationFrame(raf); window.clearTimeout(flareTimer); sizeObserver.disconnect(); visibilityObserver.disconnect(); window.removeEventListener("ames-reply", onReply); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointermove", move); renderer.domElement.removeEventListener("pointerup", up); scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const current = object.material; if (Array.isArray(current)) current.forEach((item) => item.dispose()); else current.dispose(); } }); sparkleGeometry.dispose(); sparkleMaterial.dispose(); environment.texture.dispose(); pmrem.dispose(); renderer.dispose(); host.replaceChildren(); };
    };
    void start();
    return () => { disposed = true; cleanup(); };
  }, []);

  const dust = [3, 11, 18, 27, 36, 44, 53, 61, 69, 76, 83, 89, 94, 98];
  return <div className="diamond-stage" aria-label="Interactive diamond stage"><div className="diamond-backdrop" aria-hidden="true" /><div className="diamond-spotlight" aria-hidden="true" /><div className="diamond-rays" aria-hidden="true" /><div className="diamond-pool" aria-hidden="true" /><div className="diamond-pedestal" aria-hidden="true"><div className="pedestal-top" /><div className="pedestal-ring" /><div className="pedestal-base" /><div className="pedestal-shadow" /></div>{dust.map((left, index) => <i key={left} className="diamond-dust" style={{ left: `${left}%`, animationDelay: `${index * -0.37}s`, animationDuration: `${2 + (index % 4)}s` }} aria-hidden="true" />)}<div ref={hostRef} aria-label="Interactive diamond" className="diamond-canvas" /> </div>;
}

// Future jewellery pieces may use GLTFLoader here, but the hero stone is intentionally procedural.
// const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
// const gltf = await new GLTFLoader().loadAsync("/models/jewellery-piece.glb");

