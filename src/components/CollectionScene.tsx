'use client';
// A collection as one live 3D still-life on emerald silk: the real design GLBs (the same files as the catalogue,
// dressed with the same materials), the watch standing, the necklace, bracelet and earrings laid on the satin,
// turning slowly. Metal and accent choices recolour every piece live. Pieces load heaviest-first (necklace,
// earrings, bracelet, watch) and appear as they arrive. Under 30 fps the scene thins the pavé (instanced stones)
// before it would ever drop frames further. Any failure hands back to the stills (onFallback): never a broken view.
import { useEffect, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping, Box3, Color, DirectionalLight, Group, HemisphereLight, InstancedMesh, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Quaternion, Scene, SRGBColorSpace, Vector3, WebGLRenderer, type Material, type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { dress } from '../lib/ar/jewel-dress';
import { fitLoop } from '../lib/ar/model-fit';
import { createMetalStudioEnvironment } from '../lib/metal-studio-env';
import { LOAD_ORDER } from '../lib/collections';
import HandClasp from './HandClasp';

export interface ScenePiece { code: string; category: string; glb: string; metal: string; accent: string; included: boolean }

// Metal colours (sRGB): the alloy's own reflectance, as the house's PBR library uses it.
export const METAL_COLOURS: Record<string, string> = {
  '925 silver, rhodium plated': '#f3f4f6', '18k white gold': '#ebe8e1', '18k yellow gold': '#ffcd6b', '18k rose gold': '#f3b69c', Platinum: '#e3e2de',
};
export const ACCENT_COLOURS: Record<string, string | null> = { None: null, Sapphire: '#2a52d8', Ruby: '#c8143c', Emerald: '#0f9d5f' };

// Still-life layout on the silk, in millimetres (x right, z toward the viewer)
const SPOT: Record<string, { x: number; z: number; turn: number }> = {
  necklace: { x: 0, z: -55, turn: 0 }, earrings: { x: -22, z: 82, turn: 0.35 }, bracelet: { x: 82, z: 38, turn: -0.4 }, watch: { x: -78, z: 30, turn: 0.55 },
};
const silkHeight = (x: number, z: number) =>
  6 * Math.sin(x * 0.012 + z * 0.004) + 4 * Math.sin(z * 0.019 - x * 0.006 + 1.3) + 2.5 * Math.sin((x + z) * 0.031) + Math.max(0, -z - 120) ** 2 * 0.0016;

export default function CollectionScene({ pieces, onFallback, onReady }: { pieces: ScenePiece[]; onFallback: (why: string) => void; onReady?: () => void }) {
  const host = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(pieces); live.current = pieces;
  const api = useRef<{ move: (x: number, y: number) => void; zoom: (f: number) => void; reset: () => void; refresh: () => void } | null>(null);
  const [loading, setLoading] = useState('');
  const fallback = useRef(onFallback); fallback.current = onFallback;
  const ready = useRef(onReady); ready.current = onReady;
  const key = pieces.map(p => p.code + p.glb).join('|');

  useEffect(() => {
    const canvas = canvasRef.current, el = host.current;
    if (!canvas || !el) return;
    let renderer: WebGLRenderer;
    try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); }
    catch { fallback.current('WebGL unavailable'); return; }
    let disposed = false, frame = 0;
    const disposables: { dispose: () => void }[] = [renderer];
    renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
    const scene = new Scene(); scene.background = new Color('#062a21');
    const camera = new PerspectiveCamera(30, 1, 5, 5000);
    let silkMat: MeshPhysicalMaterial;
    const pmrem = new PMREMGenerator(renderer); disposables.push(pmrem);
    new HDRLoader().load('/ames-engine/environments/jewellery-tent-v3.hdr', hdr => {
      if (disposed) return; const env = pmrem.fromEquirectangular(hdr); hdr.dispose(); scene.environment = env.texture; disposables.push(env);
      silkMat.envMap = env.texture; silkMat.envMapIntensity = 0.12; silkMat.needsUpdate = true;   // the cloth takes only a little of the tent light
    });
    const metalStudio = createMetalStudioEnvironment(renderer); disposables.push(metalStudio);
    scene.add(new HemisphereLight('#e9fff6', '#0b3328', 0.6));
    const key = new DirectionalLight('#fff7ec', 2.6); key.position.set(-180, 420, 260); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; key.shadow.bias = -0.0004;
    Object.assign(key.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, near: 50, far: 1200 }); scene.add(key);

    // the silk: a satin cloth with soft folds, rising behind into a backdrop
    const silkGeo = new PlaneGeometry(1100, 1100, 200, 200); silkGeo.rotateX(-Math.PI / 2);
    const pos = silkGeo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setY(i, silkHeight(pos.getX(i), pos.getZ(i)));
    silkGeo.computeVertexNormals();
    silkMat = new MeshPhysicalMaterial({ color: '#063526', roughness: 0.5, sheen: 0.55, sheenRoughness: 0.3, sheenColor: new Color('#2f9e76'), envMapIntensity: 0.18 });
    const silk = new Mesh(silkGeo, silkMat); silk.receiveShadow = true; scene.add(silk); disposables.push(silkGeo, silkMat);

    const table = new Group(); scene.add(table);                         // the arrangement turns as one
    const loaded = new Map<string, { root: Group; metals: MeshStandardMaterial[]; accents: (MeshPhysicalMaterial | MeshStandardMaterial)[]; pave: { mesh: InstancedMesh; full: number }[] }>();

    // live configuration: metal and accent colours, pieces in or out of the set
    const refresh = () => {
      for (const p of live.current) {
        const item = loaded.get(p.code); if (!item) continue;
        item.root.visible = p.included;
        const metal = new Color(METAL_COLOURS[p.metal] ?? '#ebe8e1');
        for (const m of item.metals) m.color.copy(metal);
        const accent = ACCENT_COLOURS[p.accent];
        for (const m of item.accents) m.color.set(accent ?? '#ffffff');
      }
    };

    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const order = [...live.current].sort((a, b) => (LOAD_ORDER[a.category] ?? 9) - (LOAD_ORDER[b.category] ?? 9));
    (async () => {
      for (const p of order) {
        if (disposed) return;
        setLoading(`Setting out the ${p.category}…`);
        let gltf;
        try { gltf = await loader.loadAsync(p.glb); } catch { if (!disposed) fallback.current(`model missing: ${p.code}`); return; }
        if (disposed) return;
        const piece = gltf.scene;
        dress(piece, metalStudio.texture);
        const metals: MeshStandardMaterial[] = [], accents: MeshStandardMaterial[] = [], pave: { mesh: InstancedMesh; full: number }[] = [];
        piece.traverse(o => {
          const mesh = o as Mesh; if (!mesh.isMesh) return;
          mesh.castShadow = true; mesh.receiveShadow = true;
          const m = mesh.material as MeshStandardMaterial;
          if (m.metalness >= 0.9 && !metals.includes(m)) metals.push(m);
          // accent stones: by contract their node or material name says "accent"
          if ((/accent/i.test(o.name) || /accent/i.test((m as Material).name)) && !accents.includes(m)) accents.push(m);
          if ((o as InstancedMesh).isInstancedMesh) pave.push({ mesh: o as InstancedMesh, full: (o as InstancedMesh).count });
        });
        // real size in millimetres, lying naturally on the silk (the watch stands on its bracelet)
        const root = new Group(); root.add(piece); root.updateMatrixWorld(true);
        const size = new Box3().setFromObject(piece).getSize(new Vector3());
        if (Math.max(size.x, size.y, size.z) < 2) root.scale.setScalar(1000);
        if (p.category === 'watch') {
          let head: Object3D | undefined;
          piece.traverse(o => { if (o.name.replace(/_/g, ' ') === 'Watch head') head = o; });
          const loop = fitLoop(piece, head ? { up: head.getWorldPosition(new Vector3()) } : undefined);
          root.quaternion.setFromUnitVectors(loop.up.clone().normalize(), new Vector3(0, 1, 0));
        } else {
          const axes = [size.x, size.y, size.z], thin = axes.indexOf(Math.min(...axes));
          if (thin === 2) root.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
          else if (thin === 0) root.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
        }
        const spot = SPOT[p.category] ?? { x: 0, z: 0, turn: 0 };
        root.quaternion.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), spot.turn));
        root.updateMatrixWorld(true);
        const box = new Box3().setFromObject(root), centre = box.getCenter(new Vector3());
        root.position.set(spot.x - centre.x, silkHeight(spot.x, spot.z) + 0.6 - box.min.y, spot.z - centre.z);
        table.add(root);
        loaded.set(p.code, { root, metals, accents, pave });
        refresh();
      }
      if (!disposed) { setLoading(''); ready.current?.(); }
    })();

    // camera, showcase turn, drag / pinch / hand gestures
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let yaw = 0, pitch = 0.62, distance = 560, targetYaw = 0, targetPitch = 0.62, targetDistance = 560, idleSince = performance.now();
    const touch = () => { idleSince = performance.now(); };
    api.current = {
      move: (x, y) => { targetYaw += x * Math.PI; targetPitch = Math.min(1.2, Math.max(0.2, targetPitch + y * Math.PI * 0.5)); touch(); },
      zoom: f => { targetDistance = Math.min(900, Math.max(220, targetDistance / f)); touch(); },
      reset: () => { targetYaw = 0; targetPitch = 0.62; targetDistance = 560; touch(); },
      refresh,
    };
    const pointers = new Map<number, { x: number; y: number }>(); let pinchFrom = 0;
    const down = (e: PointerEvent) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); touch(); };
    const moveP = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId); if (!prev) return;
      if (pointers.size === 1) api.current!.move((e.clientX - prev.x) / canvas.clientWidth, (e.clientY - prev.y) / canvas.clientHeight);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchFrom) api.current!.zoom(d / pinchFrom); pinchFrom = d;
      }
    };
    const up = (e: PointerEvent) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchFrom = 0; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); api.current!.zoom(Math.exp(-e.deltaY * 0.0012)); };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', moveP); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });

    // performance governor: hold 30 fps by thinning the pavé first, then the pixel ratio
    let avg = 16, level = 0, checkAt = performance.now() + 2500, last = performance.now();
    const govern = (now: number) => {
      avg += ((now - last) - avg) * 0.05; last = now;
      if (now < checkAt) return; checkAt = now + 2000;
      if (avg > 34 && level < 4) {
        level++;
        const keep = [1, 0.6, 0.4, 0.25, 0.25][level];
        for (const item of loaded.values()) for (const p of item.pave) p.mesh.count = Math.max(1, Math.round(p.full * keep));
        if (level === 4) renderer.setPixelRatio(1);
      }
    };
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setPixelRatio(level >= 4 ? 1 : Math.min(2, devicePixelRatio)); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    const loop = (now: number) => {
      if (disposed) return; frame = requestAnimationFrame(loop);
      if (document.hidden) return;
      govern(now);
      if (!reduced && now - idleSince > 4000) targetYaw += 0.0026;            // slow showcase turn when left alone
      const k = 0.12; yaw += (targetYaw - yaw) * k; pitch += (targetPitch - pitch) * k; distance += (targetDistance - distance) * k;
      table.rotation.y = yaw;
      camera.position.set(0, Math.sin(pitch) * distance, Math.cos(pitch) * distance); camera.lookAt(0, 12, 10);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', moveP); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('wheel', wheel);
      scene.traverse((o: Object3D) => { const m = o as Mesh; if (m.isMesh) { m.geometry?.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x?.dispose()); } });
      disposables.forEach(d => d.dispose()); api.current = null;
    };
  }, [key]);

  // configuration changes recolour live (no reload)
  useEffect(() => { api.current?.refresh(); }, [pieces]);

  return (
    <div ref={host} className="relative h-full w-full" data-collection-scene>
      <canvas ref={canvasRef} className="block h-full w-full touch-none" aria-label="The collection in 3D. Drag to turn, pinch to zoom." />
      {loading && <p role="status" className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] text-white">{loading}</p>}
      <div className="absolute bottom-3 right-3">
        <HandClasp onMove={(x, y) => api.current?.move(x, y)} onZoom={f => api.current?.zoom(f)} onReset={() => api.current?.reset()} />
      </div>
    </div>
  );
}
