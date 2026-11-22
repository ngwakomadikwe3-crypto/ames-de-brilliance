'use client';
// HOUSEofAMES portrait try-on: earrings and necklaces on a 3D portrait twin (the MakeHuman CC0 bust, lit like a
// jewellery photograph). Earrings hang from the ear lobes, a necklace sits round the base of the neck, at true size,
// in one WebGL scene so the light, shadows and occlusion are real. With "Use my camera" the face tracker turns the
// twin with the customer's head, like a mirror; otherwise drag turns it, pinch or the wheel zooms, and it turns
// slowly in the showcase motion. Default screen: the stage, the name, one primary action, Customize.
import { useEffect, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping, AmbientLight, Box3, BufferAttribute, Color, DirectionalLight, Group, Matrix3, Matrix4, Mesh, Object3D, PCFSoftShadowMap, PMREMGenerator,
  PerspectiveCamera, Quaternion, RepeatWrapping, Scene, SRGBColorSpace, TextureLoader, Vector3, WebGLRenderer, type MeshPhysicalMaterial,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { faceTrackingAssets } from '../lib/hand-tracking-assets';
import { portraitSkin, portraitEyes } from '../lib/portrait-skin';
import { dress } from '../lib/ar/jewel-dress';
import { createMetalStudioEnvironment } from '../lib/metal-studio-env';
import { averageFrames, faceDeltas, forgetFaceShape, fromImage, jitter, morphField, readFaceShape, saveFaceShape, type FaceLandmarkAsset, type P3 } from '../lib/face-morph';

export const BUST_URL = '/portrait-twin/portrait-bust-v1.glb', LANDMARKS_URL = '/portrait-twin/face-landmarks-v1.json';
const CAPTURE_FRAMES = 24, FRONTAL = 0.3, STEADY_MM = 2.5;   // a capture: 24 frames within ~17 degrees of frontal, held still

/** Move the bust's skin and eyes by a face-morph field (mm, in `frame`'s space). The original shape is kept on the
 *  mesh, so every call starts from it; normals are recomputed and welded across seams. */
export function morphBust(bust: Object3D, frame: Object3D, field: ((p: P3) => P3) | null) {
  frame.updateMatrixWorld(true); const toFrame = new Matrix4().copy(frame.matrixWorld).invert();
  bust.traverse(o => { const mesh = o as Mesh; if (!mesh.isMesh) return;
    const M = new Matrix4().multiplyMatrices(toFrame, mesh.matrixWorld), Minv = M.clone().invert(), geo = mesh.geometry;
    if (/eye/i.test(mesh.name)) {                                         // eyes move whole, with the face at their centre
      const base = (mesh.userData.basePosition ??= mesh.position.clone()) as Vector3;
      geo.computeBoundingBox(); const c = geo.boundingBox!.getCenter(new Vector3()).applyMatrix4(M);
      const d = field ? field([c.x, c.y, c.z]) : [0, 0, 0];
      const parentToFrame = new Matrix4().multiplyMatrices(toFrame, mesh.parent!.matrixWorld);
      const local = new Vector3(d[0], d[1], d[2]).applyMatrix3(new Matrix3().setFromMatrix4(parentToFrame.invert()));
      mesh.position.copy(base).add(local); return;
    }
    if (!mesh.userData.basePositions) {                                    // decompress once: quantised attributes cannot hold the morph
      const src = geo.attributes.position, out = new Float32Array(src.count * 3);
      for (let i = 0; i < src.count; i++) { out[i * 3] = src.getX(i); out[i * 3 + 1] = src.getY(i); out[i * 3 + 2] = src.getZ(i); }
      mesh.userData.basePositions = out.slice(); geo.setAttribute('position', new BufferAttribute(out, 3));
      mesh.userData.baseNormals = geo.attributes.normal; 
    }
    const base = mesh.userData.basePositions as Float32Array, pos = geo.attributes.position as BufferAttribute, v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]).applyMatrix4(M);
      const d = field ? field([v.x, v.y, v.z]) : [0, 0, 0];
      if (d[0] || d[1] || d[2]) v.set(v.x + d[0], v.y + d[1], v.z + d[2]);
      v.applyMatrix4(Minv); pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    if (!field) { geo.setAttribute('normal', mesh.userData.baseNormals); geo.computeBoundingSphere(); return; }
    geo.deleteAttribute('normal'); geo.computeVertexNormals();
    const n = geo.attributes.normal as BufferAttribute, key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const sums = new Map<string, Vector3>();
    for (let i = 0; i < n.count; i++) { const k = key(i), s = sums.get(k) ?? new Vector3(); s.x += n.getX(i); s.y += n.getY(i); s.z += n.getZ(i); sums.set(k, s); }
    for (let i = 0; i < n.count; i++) { const s = sums.get(key(i))!.clone().normalize(); n.setXYZ(i, s.x, s.y, s.z); }
    n.needsUpdate = true; geo.computeBoundingSphere();
  });
}

type V3 = [number, number, number];
export type BustAnchors = { earlobe_l: V3; earlobe_r: V3; nose_bridge: V3; eye_l: V3; eye_r: V3; neck: { centre: V3; half_width: number; half_depth: number }; neck_front: V3 };
// Skin tones shared with the hand twin (same key: one choice on this device for both twins).
const TONES = ['#f4d8c3', '#e8c0a1', '#d9a786', '#c58e6b', '#b07a5a', '#966045', '#7a4a31', '#5d3624', '#412619'];
const TONE_KEY = 'ames-hand-tone', SEEN_KEY = 'ames-portrait-seen';
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const EARRING = /^earring[ _](left|right)$/i;

/** Where the camera looks and how far it stands, per piece (mm, bust frame). */
export function portraitFraming(category: string, a: BustAnchors) {
  if (category === 'necklace' || category === 'pendant') return { target: new Vector3(0, a.neck.centre[1] - 45, 40), distance: 900, yaw: 0.18 };
  return { target: new Vector3(22, a.earlobe_l[1] - 8, 30), distance: 640, yaw: 0.62 };   // earrings: a three-quarter view of one ear
}

/** Place a pair of earrings: each earring's origin (its stud) at a lobe, its stones facing outward and a little forward. */
export function hangEarrings(piece: Object3D, a: BustAnchors) {
  const found: Object3D[] = []; piece.traverse(o => { if (EARRING.test(o.name)) found.push(o); });
  const holders: Group[] = [];
  const pair: Object3D[] = found.length ? found : [piece, piece.clone(true)];
  const scale = found.length ? piece.scale.x : 1;                                  // named earrings leave the piece root: keep its scale
  pair.slice(0, 2).forEach((earring, i) => {
    const left = found.length ? /left/i.test(earring.name) : i === 0;
    const lobe = left ? a.earlobe_l : a.earlobe_r, side = left ? 1 : -1;            // bust left (+x) is the figure's own left
    const holder = new Group(); holder.name = `Earring at ${left ? 'left' : 'right'} lobe`;
    holder.position.set(lobe[0] + side * 1.6, lobe[1] + 1.5, lobe[2] + 2);         // just outside the lobe, the post through it
    holder.rotation.y = side * (Math.PI / 2 - 0.38); holder.scale.setScalar(scale);
    earring.removeFromParent(); earring.position.set(0, 0, 0); holder.add(earring);
    holders.push(holder);
  });
  return holders;
}

/** Set a necklace round the base of the neck: the worn loop opened to clear the neck, tilted onto the chest. */
export function setNecklace(piece: Object3D, a: BustAnchors) {
  piece.updateMatrixWorld(true);
  const box = new Box3().setFromObject(piece), half = (box.max.x - box.min.x) / 2;
  const k = Math.min(1.3, Math.max(0.75, (a.neck.half_width + 9) / Math.max(1, half)));
  const holder = new Group(); holder.name = 'Necklace at the neck';
  holder.position.set(a.neck.centre[0], a.neck.centre[1] + 8, a.neck.centre[2] - 4);
  holder.rotation.x = -0.36;                                                         // the front falls onto the chest
  holder.scale.setScalar(k);
  holder.add(piece);
  return holder;
}

export default function PortraitTryOn({ model, category, title, onClose, detachable, wearLabels }: {
  model: string; category: string; title?: string; onClose?: () => void; detachable?: string; wearLabels?: { stud: string; full: string };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);
  const [tone, setTone] = useState(() => store.get(TONE_KEY) ?? TONES[3]);
  const [wear, setWear] = useState<'stud' | 'full'>('full');
  const [panel, setPanel] = useState(false), [tracking, setTracking] = useState(false), [status, setStatus] = useState('');
  const [firstVisit] = useState(() => !store.get(SEEN_KEY));
  const [shaped, setShaped] = useState(false);
  const api = useRef<{ tone: (t: string) => void; wear: (w: 'stud' | 'full') => void; camera: (on: boolean) => void; shape: (how: 'capture' | 'reset') => void } | null>(null);
  useEffect(() => { store.set(SEEN_KEY, '1'); }, []);

  useEffect(() => {
    const canvas = canvasRef.current!, host = box.current!;
    let stopped = false, frame = 0;
    const disposables: { dispose: () => void }[] = [];
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    disposables.push(renderer);
    const scene = new Scene(), camera = new PerspectiveCamera(26, 1, 10, 5000);
    const pmrem = new PMREMGenerator(renderer); disposables.push(pmrem);
    let skin: ReturnType<typeof portraitSkin> | null = null, eyes: MeshPhysicalMaterial | null = null;
    new HDRLoader().load('/ames-engine/environments/jewellery-tent-v3.hdr', hdr => {
      if (stopped) { hdr.dispose(); return; }
      const env = pmrem.fromEquirectangular(hdr); hdr.dispose(); scene.environment = env.texture; disposables.push(env);
      if (skin) { skin.material.envMap = env.texture; skin.material.envMapIntensity = 0.26; skin.material.needsUpdate = true; }
      if (eyes) { eyes.envMap = env.texture; eyes.needsUpdate = true; }
    });
    // a portrait key from the upper left front, a cool rim from behind, little fill: the face models in light and shade
    const key = new DirectionalLight('#fff4ea', 1.9); key.position.set(-260, 520, 520); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -260; key.shadow.camera.right = key.shadow.camera.top = 260;
    key.shadow.camera.near = 100; key.shadow.camera.far = 2000; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.8; key.shadow.radius = 4;
    const rim = new DirectionalLight('#dfe9ff', 1.1); rim.position.set(300, 420, -500);
    scene.add(key, key.target, rim, new AmbientLight('#ffffff', 0.1));
    const metalStudio = createMetalStudioEnvironment(renderer); disposables.push(metalStudio);

    // view (drag / showcase) > head (follows the live face) > bust + jewellery, all in millimetres
    const view = new Group(), head = new Group(); scene.add(view); view.add(head);
    let anchors: BustAnchors | null = null, framing = { target: new Vector3(0, 620, 40), distance: 600, yaw: 0.3 };
    let pieceRoot: Object3D | null = null, wearNow: 'stud' | 'full' = 'full';
    let bustRef: Object3D | null = null, landmarks: FaceLandmarkAsset | null = null, field: ((p: P3) => P3) | null = null;
    const lobeHolders: { holder: Object3D; lobe: P3; base: Vector3 }[] = [];
    const placeOnFace = () => { for (const h of lobeHolders) { const d = field ? field(h.lobe) : [0, 0, 0]; h.holder.position.copy(h.base).add(new Vector3(d[0], d[1], d[2])); } };
    const applyShape = (deltas: P3[] | null) => {
      if (!bustRef || !landmarks) return;
      field = deltas ? morphField(landmarks, deltas) : null;
      morphBust(bustRef, head, field); placeOnFace(); setShaped(!!deltas);
    };
    let capturing = false, frames: P3[][] = [];
    const applyWear = (w: 'stud' | 'full') => {
      if (!pieceRoot || !detachable) return;
      pieceRoot.traverse(o => { if (o.name === detachable || o.name.startsWith(detachable + '_')) o.visible = w === 'full'; });
    };
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(BUST_URL, gltf => {
      if (stopped) return;
      const bust = gltf.scene; bust.scale.setScalar(1000);
      bust.traverse(o => { if (o.userData?.ames_bust) anchors = o.userData.ames_bust as BustAnchors; });
      if (!anchors) { setStatus('The portrait could not be prepared.'); return; }
      const a: BustAnchors = anchors;
      const detail = new TextureLoader().load('/hand-twin/skin-detail.jpg'); detail.wrapS = detail.wrapT = RepeatWrapping; disposables.push(detail);
      skin = portraitSkin(tone, scene.environment, { hairline: a.eye_l[1] + 62, chest: Math.min(a.neck_front[1] - 150, 470), side: 188 }, detail);
      eyes = portraitEyes(scene.environment);
      bust.traverse(o => { const m = o as Mesh; if (!m.isMesh) return;
        m.material = /eye/i.test(m.name) ? eyes! : skin!.material; m.castShadow = true; m.receiveShadow = true; });
      head.add(bustRef = bust);
      fetch(LANDMARKS_URL).then(r => r.ok ? r.json() : null).then((asset: FaceLandmarkAsset | null) => {
        if (stopped || !asset) return; landmarks = asset;
        const saved = readFaceShape(); if (saved) applyShape(saved.deltas);   // shaped before, on this device
      }).catch(() => { /* the standard face */ });
      framing = portraitFraming(category, a);
      key.target.position.copy(framing.target);
      loader.load(model, piece => {
        if (stopped) return;
        const root = piece.scene; root.scale.setScalar(1000); dress(root, metalStudio.texture);
        root.traverse(o => { if ((o as Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        pieceRoot = root; applyWear(wearNow);
        if (category === 'necklace' || category === 'pendant') head.add(setNecklace(root, a));
        else { root.updateMatrixWorld(true); hangEarrings(root, a).forEach(h => { head.add(h); lobeHolders.push({ holder: h, lobe: (/left/.test(h.name) ? a.earlobe_l : a.earlobe_r) as P3, base: h.position.clone() }); }); placeOnFace(); }
      }, undefined, () => setStatus('This piece could not be loaded.'));
    }, undefined, () => setStatus('The portrait could not be loaded.'));

    // --- view: drag to turn, pinch / wheel to zoom, the showcase turn when idle -----------------------------------
    let yaw = 0, pitch = 0.04, zoom = 1, idleSince = performance.now(), drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
    const pointers = new Map<number, { x: number; y: number }>(); let pinch0 = 0, zoom0 = 1;
    const down = (e: PointerEvent) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId);
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, yaw, pitch };
      if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch0 = Math.hypot(p.x - q.x, p.y - q.y); zoom0 = zoom; drag = null; } };
    const move = (e: PointerEvent) => { if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); idleSince = performance.now();
      if (pointers.size === 2) { const [p, q] = [...pointers.values()]; zoom = Math.min(2.2, Math.max(0.7, zoom0 * Math.hypot(p.x - q.x, p.y - q.y) / Math.max(1, pinch0))); }
      else if (drag) { yaw = drag.yaw + (e.clientX - drag.x) * 0.008; pitch = Math.min(0.5, Math.max(-0.35, drag.pitch + (e.clientY - drag.y) * 0.005)); } };
    const up = (e: PointerEvent) => { pointers.delete(e.pointerId); if (!pointers.size) drag = null; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoom = Math.min(2.2, Math.max(0.7, zoom * Math.exp(-e.deltaY * 0.0012))); idleSince = performance.now(); };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');

    // --- the face tracker: the twin follows the customer's head, as a mirror --------------------------------------
    let stream: MediaStream | undefined, tracker: FaceLandmarker | undefined, trackingOn = false, faceSeen = 0;
    const video = document.createElement('video'); video.muted = true; video.playsInline = true;
    const faceQ = new Quaternion(), faceTarget = new Quaternion(), m4 = new Matrix4();
    const startCamera = async () => {
      trackingOn = true; setStatus('Starting the camera…');
      try {
        const assets = faceTrackingAssets();
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
        if (stopped || !trackingOn) { stream.getTracks().forEach(t => t.stop()); stream = undefined; return; }
        video.srcObject = stream; await video.play();
        setStatus('Loading face tracking…');
        const { FaceLandmarker, files, bytes } = await assets;
        tracker = await FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetBuffer: bytes.slice(), delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true });
        if (stopped || !trackingOn) { tracker.close(); tracker = undefined; return; }
        setStatus(capturing ? 'Look at the camera with a relaxed face…' : ''); setTracking(true);
      } catch { setStatus('The camera is not available. You can still turn the portrait with your finger.'); stopCamera(); }
    };
    const stopCamera = () => { trackingOn = false; capturing = false; stream?.getTracks().forEach(t => t.stop()); stream = undefined; tracker?.close(); tracker = undefined; setTracking(false); faceTarget.identity(); };
    const track = (now: number) => {
      if (!tracker || video.readyState < 2) return;
      const result = tracker.detectForVideo(video, now), matrix = result.facialTransformationMatrixes?.[0]?.data;
      if (!matrix) return;
      faceSeen = now; m4.fromArray(matrix as unknown as number[]);
      const q = new Quaternion().setFromRotationMatrix(m4);
      const marks = result.faceLandmarks?.[0];
      if (capturing && landmarks && marks && 2 * Math.acos(Math.min(1, Math.abs(q.w))) < FRONTAL) {
        frames.push(marks.slice(0, 468).map(l => fromImage(l, video.videoWidth, video.videoHeight)));
        if (frames.length >= CAPTURE_FRAMES) {
          if (jitter(frames, landmarks) < STEADY_MM) {
            const deltas = faceDeltas(averageFrames(frames), landmarks);
            applyShape(deltas); saveFaceShape(deltas); capturing = false;
            setStatus('Shaped to your face. The measurements stay on this device.'); setTimeout(() => setStatus(''), 4000);
          } else setStatus('Hold still and look at the camera…');
          frames = [];
        }
      }
      // mirror: the customer turns left, the twin facing them turns to their left too (flip yaw and roll)
      faceTarget.set(q.x, -q.y, -q.z, q.w).normalize();
      const angle = 2 * Math.acos(Math.min(1, Math.abs(faceTarget.w)));
      if (angle > 0.8) faceTarget.slerp(new Quaternion(), 1 - 0.8 / angle);            // keep within about 45 degrees
    };

    api.current = {
      tone: t => { if (!skin) return; skin.material.color.set(t); skin.material.sheenColor.set(t).lerp(new Color('#ffffff'), 0.45); skin.uniforms.uBleed.value.set(t).lerp(new Color('#c2452d'), 0.55); },
      wear: w => { wearNow = w; applyWear(w); },
      camera: on => { if (on) { capturing = !readFaceShape(); frames = []; void startCamera(); } else stopCamera(); },
      shape: how => {
        if (how === 'reset') { capturing = false; forgetFaceShape(); applyShape(null); return; }
        capturing = true; frames = []; if (!tracker) void startCamera(); else setStatus('Look at the camera with a relaxed face…');
      },
    };

    const resize = () => { const r = host.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); };
    const watch = new ResizeObserver(resize); watch.observe(host); resize();
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      track(now);
      const live = !!tracker && now - faceSeen < 600;
      head.quaternion.slerp(live ? faceTarget : faceQ.identity(), 1 - Math.exp(-dt * 10));
      if (skin) { head.updateMatrixWorld(); skin.uniforms.uToBust.value.copy(head.matrixWorld).invert(); }
      const idle = !drag && !live && !reduced.matches && now - idleSince > 2500;
      if (idle) yaw += dt * 0.18 * Math.sign(Math.sin(now / 9000) + 1e-3);
      const base = framing.yaw, ay = base + yaw;
      const d = framing.distance / zoom * (camera.aspect < 0.8 ? 1.25 : 1);
      camera.position.set(framing.target.x + Math.sin(ay) * Math.cos(pitch) * d, framing.target.y + Math.sin(pitch) * d, framing.target.z + Math.cos(ay) * Math.cos(pitch) * d);
      camera.lookAt(framing.target);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      stopped = true; cancelAnimationFrame(frame); watch.disconnect(); stopCamera();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('wheel', wheel);
      scene.traverse(o => { const m = o as Mesh; if (m.isMesh) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose()); } });
      disposables.forEach(d => d.dispose()); api.current = null;
    };
    // the scene is built once per piece; tone, wear and camera changes go through api
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, category, detachable]);

  useEffect(() => { api.current?.tone(tone); store.set(TONE_KEY, tone); }, [tone]);
  useEffect(() => { api.current?.wear(wear); }, [wear]);

  const bubble = { background: '#ffffff', color: '#0c3b2e' };
  return <div ref={box} className="relative h-full w-full overflow-hidden" data-portrait-try-on>
    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label={`${title ?? 'The piece'} on a 3D portrait`} />
    {onClose && <button type="button" onClick={onClose} aria-label="Close try-on" className="absolute left-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full shadow-lg" style={bubble}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
    <button type="button" onClick={() => setPanel(v => !v)} aria-expanded={panel} aria-label="Customize" className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full shadow-lg" style={bubble}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg></button>
    {firstVisit && title && <p className="pointer-events-none absolute inset-x-16 top-5 text-center text-sm text-white">{title}</p>}
    {status && <p role="status" className="absolute inset-x-6 top-16 text-center text-xs text-white">{status}</p>}
    <div className="absolute inset-x-0 bottom-5 z-10 flex justify-center">
      <button type="button" onClick={() => api.current?.camera(!tracking)} className="min-h-11 rounded-full px-6 text-sm font-medium shadow-lg" style={bubble} data-portrait-camera>
        {tracking ? 'Stop the camera' : 'Use my camera'}</button>
    </div>
    {panel && <div className="absolute inset-x-3 bottom-20 z-20 rounded-2xl p-4 text-white shadow-xl" style={{ background: 'rgba(6,42,33,0.94)' }} data-portrait-customize>
      {detachable && wearLabels && <>
        <p className="mb-2 text-xs">Wear as</p>
        <div className="mb-4 flex gap-2">{(['stud', 'full'] as const).map(w => <button key={w} type="button" aria-pressed={wear === w} onClick={() => setWear(w)} className="ames-pill min-h-10 rounded-full px-4 text-[12px]">{wearLabels[w]}</button>)}</div>
      </>}
      <p className="mb-2 text-xs">Face</p>
      <div className="mb-1 flex flex-wrap gap-2">
        <button type="button" onClick={() => { api.current?.shape('capture'); setPanel(false); }} className="ames-pill min-h-10 rounded-full px-4 text-[12px]" data-shape-face>{shaped ? 'Reshape to my face' : 'Shape to my face'}</button>
        {shaped && <button type="button" onClick={() => api.current?.shape('reset')} className="ames-pill min-h-10 rounded-full px-4 text-[12px]">Use the standard face</button>}
      </div>
      <p className="mb-4 text-[11px] text-white">Uses the camera for a moment. Your face measurements stay on this device.</p>
      <p className="mb-2 text-xs">Skin tone</p>
      <div className="flex flex-wrap gap-2">{TONES.map(t => <button key={t} type="button" aria-label={`Skin tone ${t}`} aria-pressed={tone === t} onClick={() => setTone(t)}
        className="h-9 w-9 rounded-full" style={{ background: t, outline: tone === t ? '2px solid #ffffff' : 'none', outlineOffset: 2 }} />)}</div>
    </div>}
  </div>;
}
