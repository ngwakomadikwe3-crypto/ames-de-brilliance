'use client';
// HOUSEofAMES portrait try-on: earrings and necklaces on the customer's 3D portrait twin.
//
// The twin is the parametric head (MakeHuman CC0 mesh and targets) shaped by the customer's face scan, in the same HDR
// studio light as the jewellery: subsurface skin with pores and the scan's own tones, living eyes, groomed brows and
// lashes, a chosen hairstyle in their hair colour, lips with their own zone (ready for lipstick). It breathes, blinks,
// sways a little and moves its mouth now and then; when a piece goes on it smiles once, warmly, and settles into a
// pleased resting smile (tap the piece to see it again). Without a scan it is a neutral average face, never bald.
// Default screen: the stage, the name, one primary action, Customize.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping, AmbientLight, Box3, BufferAttribute, Color, DirectionalLight, Group, Matrix3, Matrix4, Mesh, Object3D, PCFSoftShadowMap,
  PMREMGenerator, PerspectiveCamera, Quaternion, Raycaster, RepeatWrapping, Scene, ShaderMaterial, SRGBColorSpace, TextureLoader, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { faceTrackingAssets } from '../lib/hand-tracking-assets';
import { dress } from '../lib/ar/jewel-dress';
import { createMetalStudioEnvironment } from '../lib/metal-studio-env';
import { loadPortraitHead, bakeIdentity, meshPointsMm, anchoredPoints, eyeCentres, LIP_ZONES_URL } from '../lib/portrait-head';
import { portraitSkinV2, portraitEye, teethMaterial, tongueMaterial, type ToneMap } from '../lib/portrait-materials';
import { SkinField, growBrows, growLashes, growHair, scalpRoots, HAIR_STYLES, type HairStyle } from '../lib/portrait-grooming';
import { FaceLife } from '../lib/portrait-life';
import { readTwin, saveFace, saveFacePrefs, deleteTwin, twinTones, harmonisedFaceTones, TWIN_EVENT, type FaceIdentity } from '../lib/twin-profile';
import { unpack } from '../lib/face-scan';
import FaceScan from './FaceScan';
import type { P3 } from '../lib/face-morph';

type V3 = [number, number, number];
export type BustAnchors = { earlobe_l: V3; earlobe_r: V3; eye_l: V3; eye_r: V3; neck: { centre: V3; half_width: number; half_depth: number }; neck_front: V3 };
const EARRING = /^earring[ _](left|right)$/i;
const AVERAGE: Record<string, number> = { 'id:base-afr-female': 1 / 6, 'id:base-afr-male': 1 / 6, 'id:base-asi-female': 1 / 6, 'id:base-asi-male': 1 / 6, 'id:base-cau-female': 1 / 6, 'id:base-cau-male': 1 / 6 };

/** Where the camera looks and how far it stands (mm, head frame). */
export function portraitFraming(category: string, a: BustAnchors) {
  if (category === 'set') return { target: new Vector3(0, a.neck.centre[1] + 5, 40), distance: 1050, yaw: 0.12, pitch: 0.03 };
  if (category === 'necklace' || category === 'pendant') return { target: new Vector3(0, a.neck.centre[1] - 25, 40), distance: 1000, yaw: 0.18, pitch: 0.03 };
  return { target: new Vector3(30, a.earlobe_l[1] - 5, 10), distance: 620, yaw: 0.78, pitch: 0.14 };
}
/** Each earring's origin (its stud) at a lobe, stones facing outward and a little forward. */
export function hangEarrings(piece: Object3D, a: BustAnchors) {
  const found: Object3D[] = []; piece.traverse(o => { if (EARRING.test(o.name)) found.push(o); });
  const pair = found.length ? found : [piece, piece.clone(true)], scale = found.length ? piece.scale.x : 1;
  return pair.slice(0, 2).map((earring, i) => {
    const left = found.length ? /left/i.test(earring.name) : i === 0, lobe = left ? a.earlobe_l : a.earlobe_r, side = left ? 1 : -1;
    const holder = new Group(); holder.name = `Earring at ${left ? 'left' : 'right'} lobe`;
    holder.position.set(lobe[0] + side * 1.6, lobe[1] + 1.5, lobe[2] + 2); holder.rotation.y = side * (Math.PI / 2 - 0.38); holder.scale.setScalar(scale);
    earring.removeFromParent(); earring.position.set(0, 0, 0); holder.add(earring);
    return holder;
  });
}
/** A necklace round the base of the neck: the worn loop opened to clear the neck, tilted onto the chest. */
export function setNecklace(piece: Object3D, a: BustAnchors) {
  piece.updateMatrixWorld(true);
  const box = new Box3().setFromObject(piece), half = (box.max.x - box.min.x) / 2;
  const holder = new Group(); holder.name = 'Necklace at the neck';
  holder.position.set(a.neck.centre[0], a.neck.centre[1] + 8, a.neck.centre[2] - 4); holder.rotation.x = -0.36;
  holder.scale.setScalar(Math.min(1.3, Math.max(0.75, (a.neck.half_width + 9) / Math.max(1, half)))); holder.add(piece);
  return holder;
}
/** Ear lobes and the neck from the fitted head (mm). */
function anchorsFrom(skin: P3[], lm: P3[], eyes: { left: P3; right: P3 }): BustAnchors {
  const eyeY = (eyes.left[1] + eyes.right[1]) / 2, eyeZ = (eyes.left[2] + eyes.right[2]) / 2;
  const lobe = (sign: number): V3 => {
    const ear = skin.filter(p => Math.sign(p[0]) === sign && p[1] > eyeY - 55 && p[1] < eyeY + 15 && p[2] < eyeZ - 45 && p[2] > eyeZ - 115);
    const outer = Math.max(...ear.map(p => Math.abs(p[0]))), rim = ear.filter(p => Math.abs(p[0]) > outer - 9);
    return rim.reduce((a, b) => (b[1] < a[1] ? b : a), rim[0] ?? [sign * 70, eyeY - 35, eyeZ - 75]) as V3;
  };
  const chinY = lm[152][1], ringY = chinY - 45, ring = skin.filter(p => Math.abs(p[1] - ringY) < 1.5 && Math.abs(p[0]) < 80);
  const xs = ring.map(p => p[0]), zs = ring.map(p => p[2]);
  const centre: V3 = [(Math.max(...xs) + Math.min(...xs)) / 2, ringY, (Math.max(...zs) + Math.min(...zs)) / 2];
  const front = skin.filter(p => Math.abs(p[0]) < 6 && Math.abs(p[1] - (ringY - 12)) < 2).reduce((a, b) => (b[2] > a[2] ? b : a), [0, ringY - 12, centre[2]] as P3);
  return { earlobe_l: lobe(1), earlobe_r: lobe(-1), eye_l: eyes.left, eye_r: eyes.right,
    neck: { centre, half_width: (Math.max(...xs) - Math.min(...xs)) / 2, half_depth: (Math.max(...zs) - Math.min(...zs)) / 2 }, neck_front: front as V3 };
}

export default function PortraitTryOn({ model, category, title, onClose, detachable, wearLabels, more }: {
  model: string; category: string; title?: string; onClose?: () => void; detachable?: string; wearLabels?: { stud: string; full: string };
  more?: { model: string; category: string }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);
  const [twin, setTwin] = useState(() => (typeof window === 'undefined' ? null : readTwin()));
  const [preview, setPreview] = useState<{ face: FaceIdentity; photo: string } | null>(null);
  const [scanning, setScanning] = useState(false), [panel, setPanel] = useState(false), [confirmDelete, setConfirmDelete] = useState(false);
  const [wear, setWear] = useState<'stud' | 'full'>('full'), [tracking, setTracking] = useState(false), [status, setStatus] = useState('');
  const face = preview?.face ?? twin?.face ?? null;
  const [hairStyle, setHairStyle] = useState<HairStyle>(face?.hairStyle ?? 'medium');
  const api = useRef<{ wear: (w: 'stud' | 'full') => void; camera: (on: boolean) => void; hair: (s: HairStyle) => void } | null>(null);
  useEffect(() => { const sync = () => setTwin(readTwin()); addEventListener(TWIN_EVENT, sync); addEventListener('ames-hand-fit', sync); return () => { removeEventListener(TWIN_EVENT, sync); removeEventListener('ames-hand-fit', sync); }; }, []);
  const faceKey = face ? `${face.savedAt}` : 'average';

  useEffect(() => {
    const canvas = canvasRef.current!, host = box.current!;
    let stopped = false, frame = 0;
    const disposables: { dispose: () => void }[] = [];
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap; renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    disposables.push(renderer);
    const scene = new Scene(), camera = new PerspectiveCamera(24, 1, 10, 6000), pmrem = new PMREMGenerator(renderer); disposables.push(pmrem);
    const key = new DirectionalLight('#fff4ea', 1.8); key.position.set(-260, 520, 520); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -280, right: 280, top: 280, bottom: -280, near: 100, far: 2400 }); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.6; key.shadow.radius = 5;
    const rim = new DirectionalLight('#dfe9ff', 1.2); rim.position.set(320, 460, -520);
    scene.add(key, key.target, rim, new AmbientLight('#ffffff', 0.08));
    const metalStudio = createMetalStudioEnvironment(renderer); disposables.push(metalStudio);
    const view = new Group(), headFrame = new Group(); scene.add(view); view.add(headFrame);
    const life = new FaceLife(face?.smile ?? undefined);
    let anchors: BustAnchors | null = null, framing = { target: new Vector3(0, 640, 40), distance: 700, yaw: 0.3, pitch: 0.03 };
    let skinMat: ReturnType<typeof portraitSkinV2> | null = null, hairMesh: Mesh | null = null, pieceRoot: Object3D | null = null, wearNow: 'stud' | 'full' = 'full';
    const morphMeshes: Mesh[] = [], grooming: { brows?: Mesh; lashes?: Mesh } = {};
    const pieces: Object3D[] = [];
    let regrowHair: (s: HairStyle) => void = () => {};
    let yaw = 0, pitch = 0.03, zoom = 1, idleSince = performance.now(), drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;

    (async () => {
      const H = await loadPortraitHead(); if (stopped) return;
      const weights = face?.weights ?? AVERAGE;
      bakeIdentity(H.head, weights);
      headFrame.add(H.head);
      const pts = meshPointsMm(H.skin, H.head), lm = anchoredPoints(pts, H.anchors), eyes = eyeCentres(H.parts, H.head);
      anchors = anchorsFrom(pts, lm, eyes);
      framing = portraitFraming((more ?? []).length ? 'set' : category, anchors); key.target.position.copy(framing.target); pitch = framing.pitch;
      // tones: the harmonised identity (face and hands one skin); without a face scan, the hand scan's tone
      const tones = twinTones();
      const toneMap: ToneMap = face ? harmonisedFaceTones(face, tones?.face ?? face.tones.cheeks ?? face.tones.base) : { base: tones?.face ?? '#c58e6b' };
      const detail = new TextureLoader().load('/hand-twin/skin-detail.jpg'); detail.wrapS = detail.wrapT = RepeatWrapping; disposables.push(detail);
      const lipZones = new TextureLoader().load(LIP_ZONES_URL); disposables.push(lipZones);
      const chestY = Math.min(...pts.map(p => p[1])) + 75;                    // where the portrait fades out, clear of the notched bottom edge
      skinMat = portraitSkinV2({ tones: toneMap, env: null, detail, lipZones, lipRect: H.meta.lips.uvRect, lipRangeMm: H.meta.lips.rangeMm, stubble: face?.stubble ?? 0,
        anchors: { eyeY: (eyes.left[1] + eyes.right[1]) / 2, noseY: lm[1][1], mouthY: lm[13][1], chinY: lm[152][1], chestY } });
      if (face?.photo) {
        const photo = unpack(face.photo);
        if (photo.length === H.skin.geometry.getAttribute('position').count * 4) { H.skin.geometry.setAttribute('aPhoto', new BufferAttribute(photo, 4, true)); skinMat.usePhoto(true); }
      }
      const hairColor = new Color(face?.hairColor ?? '#2b1d14');
      skinMat.uniforms.uHairColor.value.copy(hairColor);
      skinMat.uniforms.uHair.value.set(lm[10][1] - 6, (eyes.left[2] + eyes.right[2]) / 2, lm[13][1] - 8, 1);
      // brow centrelines (midway between MediaPipe's upper and lower brow arcs), inner head to tail
      [[[107, 55], [66, 65], [105, 52], [63, 53], [70, 46]], [[336, 285], [296, 295], [334, 282], [293, 283], [300, 276]]].flat()
        .forEach(([u, l], i) => (skinMat!.uniforms.uBrow.value as Vector3[])[i].set((lm[u][0] + lm[l][0]) / 2, (lm[u][1] + lm[l][1]) / 2, (lm[u][2] + lm[l][2]) / 2));
      skinMat.uniforms.uBrowOn.value = 0.55;
      for (const [name, m] of Object.entries(H.parts)) {
        m.castShadow = m.receiveShadow = true; morphMeshes.push(m);
        if (name === 'head skin') m.material = skinMat.material;
        else if (name.startsWith('eye')) { const p = meshPointsMm(m, H.head), c = new Vector3(); m.geometry.computeBoundingBox(); m.geometry.boundingBox!.getCenter(c);
          m.material = portraitEye({ env: null, iris: face?.irisColor ?? '#4a3222', centre: c, radius: 12 }); void p; }
        else if (name.startsWith('teeth')) m.material = teethMaterial(null); else if (name === 'tongue') m.material = tongueMaterial(null);
      }
      // grooming: strands on the skin, following its expressions
      const nrm = H.skin.geometry.getAttribute('normal'), toHead = new Matrix4().copy(headFrame.matrixWorld).invert().multiply(H.skin.matrixWorld), N3 = new Matrix3().setFromMatrix4(toHead);
      const normals: P3[] = []; for (let i = 0; i < nrm.count; i++) { const v = new Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).applyMatrix3(N3).normalize(); normals.push([v.x, v.y, v.z]); }
      const field = new SkinField(pts, normals), dict = H.skin.morphTargetDictionary!, morph = H.skin.geometry.morphAttributes.position ?? [];
      const delta = (i: number, name: string) => { const at = dict[name]; return at === undefined ? new Vector3() : new Vector3().fromBufferAttribute(morph[at], i).applyMatrix3(N3); };
      const browColor = hairColor.clone().multiplyScalar(0.8);
      grooming.brows = growBrows(field, lm, browColor, 1, i => [delta(i, 'ex:brows-soft'), delta(i, 'ex:brows-up')]);
      grooming.lashes = growLashes(lm, new Color('#120c09'), eyes, field, i => [delta(i, 'ex:blink-l'), delta(i, 'ex:blink-r')]);
      headFrame.add(grooming.brows, grooming.lashes);
      const roots = scalpRoots(field, lm, eyes), shoulders = { y: lm[152][1] - 95 };
      regrowHair = (s: HairStyle) => {
        if (hairMesh) { headFrame.remove(hairMesh); hairMesh.geometry.dispose(); (hairMesh.material as { dispose(): void }).dispose(); }
        hairMesh = growHair(field, roots, s, hairColor, lm, shoulders, { left: anchors!.earlobe_l as P3, right: anchors!.earlobe_r as P3 }); hairMesh.castShadow = true; (hairMesh.material as ShaderMaterial).uniforms.uFade.value = skinMat?.uniforms.uChest.value ?? -1e6; headFrame.add(hairMesh);
      };
      regrowHair(hairStyle);
      // the jewellery
      const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
      const load = (url: string, kind: string) => loader.load(url, gltf => {
        if (stopped) return;
        const root = gltf.scene; root.scale.setScalar(1000); dress(root, metalStudio.texture);
        root.traverse(o => { if ((o as Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        if (kind === category) { pieceRoot = root; if (detachable) root.traverse(o => { if (o.name === detachable || o.name.startsWith(detachable + '_')) o.visible = wearNow === 'full'; }); }
        if (kind === 'necklace' || kind === 'pendant') { const h = setNecklace(root, anchors!); headFrame.add(h); pieces.push(h); }
        else { root.updateMatrixWorld(true); hangEarrings(root, anchors!).forEach(h => { headFrame.add(h); pieces.push(h); }); }
        if (kind === 'earrings' || kind === 'necklace' || kind === 'pendant') life.delight();      // a piece goes on: one warm smile
      }, undefined, () => setStatus('This piece could not be loaded.'));
      load(model, category); for (const m of more ?? []) load(m.model, m.category);
      new HDRLoader().load('/ames-engine/environments/jewellery-tent-v3.hdr', hdr => {
        if (stopped) { hdr.dispose(); return; }
        const env = pmrem.fromEquirectangular(hdr); hdr.dispose(); disposables.push(env);
        scene.traverse(o => { const m = (o as Mesh).material as { envMap?: unknown; needsUpdate?: boolean; envMapIntensity?: number } | undefined;
          if (m && 'envMap' in m && !(o as Mesh).userData?.ames) { if (m === skinMat?.material || /Eye|eye|teeth|tongue/i.test(o.name)) { m.envMap = env.texture; m.needsUpdate = true; } } });
      });
    })().catch(() => setStatus('The twin could not be prepared on this device.'));

    // --- view: drag to turn, pinch / wheel to zoom; tap a piece to see the smile again -------------------------------
    const pointers = new Map<number, { x: number; y: number }>(); let pinch0 = 0, zoom0 = 1;
    const ray = new Raycaster();
    const down = (e: PointerEvent) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId);
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false };
      if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch0 = Math.hypot(p.x - q.x, p.y - q.y); zoom0 = zoom; drag = null; } };
    const move = (e: PointerEvent) => { if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); idleSince = performance.now();
      if (pointers.size === 2) { const [p, q] = [...pointers.values()]; zoom = Math.min(2.4, Math.max(0.7, zoom0 * Math.hypot(p.x - q.x, p.y - q.y) / Math.max(1, pinch0))); }
      else if (drag) { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true; yaw = drag.yaw + (e.clientX - drag.x) * 0.008; pitch = Math.min(0.5, Math.max(-0.35, drag.pitch + (e.clientY - drag.y) * 0.005)); } };
    const up = (e: PointerEvent) => {
      if (drag && !drag.moved && pieces.length) {                          // a tap on the piece replays the smile
        const r = canvas.getBoundingClientRect(); ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        if (ray.intersectObjects(pieces, true).length) life.delight();
      }
      pointers.delete(e.pointerId); if (!pointers.size) drag = null;
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoom = Math.min(2.4, Math.max(0.7, zoom * Math.exp(-e.deltaY * 0.0012))); idleSince = performance.now(); };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');

    // --- the face tracker: the twin turns with the customer's head, as a mirror -----------------------------------------
    let stream: MediaStream | undefined, tracker: FaceLandmarker | undefined, faceSeen = 0;
    const video = document.createElement('video'); video.muted = true; video.playsInline = true;
    const faceTarget = new Quaternion(), m4 = new Matrix4();
    const stopCamera = () => { stream?.getTracks().forEach(t => t.stop()); stream = undefined; tracker?.close(); tracker = undefined; setTracking(false); faceTarget.identity(); };
    const startCamera = async () => {
      setStatus('Starting the camera…');
      try {
        const assets = faceTrackingAssets();
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
        if (stopped) { stopCamera(); return; }
        video.srcObject = stream; await video.play();
        const { FaceLandmarker, files, bytes } = await assets;
        tracker = await FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetBuffer: bytes.slice(), delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true });
        setStatus(''); setTracking(true);
      } catch { setStatus('The camera is not available. You can still turn the portrait with your finger.'); stopCamera(); }
    };
    api.current = {
      wear: w => { wearNow = w; if (pieceRoot && detachable) pieceRoot.traverse(o => { if (o.name === detachable || o.name.startsWith(detachable + '_')) o.visible = w === 'full'; }); },
      camera: on => { if (on) void startCamera(); else stopCamera(); },
      hair: s => regrowHair(s),
    };

    const resize = () => { const r = host.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); };
    const watch = new ResizeObserver(resize); watch.observe(host); resize();
    let last = performance.now();
    const swayQ = new Quaternion(), tmp = new Quaternion();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (tracker && video.readyState >= 2) {
        const res = tracker.detectForVideo(video, now), mat = res.facialTransformationMatrixes?.[0]?.data;
        if (mat) { faceSeen = now; m4.fromArray(mat as unknown as number[]); const q = new Quaternion().setFromRotationMatrix(m4); faceTarget.set(q.x, -q.y, -q.z, q.w).normalize(); }
      }
      const live = !!tracker && now - faceSeen < 600;
      const s = life.step(dt, reduced.matches);
      for (const m of morphMeshes) { const d = m.morphTargetDictionary, inf = m.morphTargetInfluences; if (!d || !inf) continue; for (const k in d) inf[d[k]] = s.weights[k] ?? 0; }
      for (const g of [grooming.brows, grooming.lashes]) { const u = (g?.material as { uniforms?: Record<string, { value: number }> } | undefined)?.uniforms; if (!u) continue;
        if (g === grooming.brows) { u.uW1.value = s.weights['ex:brows-soft'] ?? 0; u.uW2.value = s.weights['ex:brows-up'] ?? 0; } else { u.uW1.value = s.weights['ex:blink-l'] ?? 0; u.uW2.value = s.weights['ex:blink-r'] ?? 0; } }
      swayQ.setFromAxisAngle(new Vector3(0, 1, 0), s.sway.yaw).multiply(tmp.setFromAxisAngle(new Vector3(1, 0, 0), s.sway.pitch)).multiply(tmp.setFromAxisAngle(new Vector3(0, 0, 1), s.sway.roll));
      headFrame.quaternion.slerp(live ? faceTarget.clone().multiply(swayQ) : swayQ, 1 - Math.exp(-dt * 8));
      headFrame.position.y = s.breath;
      headFrame.updateMatrixWorld(true);
      if (skinMat) skinMat.uniforms.uToHead.value.copy(headFrame.matrixWorld).invert();
      if (!drag && !live && !reduced.matches && now - idleSince > 3000) yaw += dt * 0.12 * Math.sign(Math.sin(now / 11000) + 1e-3);
      const ay = framing.yaw + yaw, d = framing.distance / zoom * (camera.aspect < 0.8 ? 1.25 : 1);
      camera.position.set(framing.target.x + Math.sin(ay) * Math.cos(pitch) * d, framing.target.y + Math.sin(pitch) * d, framing.target.z + Math.cos(ay) * Math.cos(pitch) * d);
      camera.lookAt(framing.target);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true; cancelAnimationFrame(frame); watch.disconnect(); stopCamera();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('wheel', wheel);
      scene.traverse(o => { const m = o as Mesh; if (m.isMesh) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose()); } });
      disposables.forEach(x => x.dispose()); api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, category, detachable, JSON.stringify(more ?? []), faceKey]);

  useEffect(() => { api.current?.wear(wear); }, [wear]);
  const chooseHair = useCallback((s: HairStyle) => { setHairStyle(s); api.current?.hair(s); if (!preview) saveFacePrefs({ hairStyle: s }); }, [preview]);
  const bubble = { background: '#ffffff', color: '#0c3b2e' };
  return <div ref={box} className="relative h-full w-full overflow-hidden" data-portrait-try-on>
    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label={`${title ?? 'The piece'} on your 3D portrait twin`} />
    {onClose && <button type="button" onClick={onClose} aria-label="Close try-on" className="absolute left-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full shadow-lg" style={bubble}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
    <button type="button" onClick={() => setPanel(v => !v)} aria-expanded={panel} aria-label="Customize" className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full shadow-lg" style={bubble}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg></button>
    {title && !preview && <p className="pointer-events-none absolute inset-x-16 top-5 text-center text-sm text-white">{title}</p>}
    {status && <p role="status" className="absolute inset-x-6 top-16 text-center text-xs text-white">{status}</p>}
    {preview
      ? <div className="absolute inset-x-0 bottom-0 z-20 flex items-end gap-3 bg-[#0b2f26]/95 p-4 text-white" data-twin-verify>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.photo} alt="Your front photo" className="h-28 w-24 rounded-lg object-cover" />
          <div className="flex-1 space-y-2">
            <p style={{ fontFamily: 'var(--font-satoshi)', fontSize: 17 }}>Is this your twin?</p>
            <p className="text-[11px] opacity-85">A likeness from your photos, not an exact scan. Compare the jaw, nose, lips and tone.</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="min-h-11 rounded-full px-5 font-medium" style={bubble} data-save-twin onClick={() => { try { saveFace({ ...preview.face, hairStyle }); setPreview(null); setStatus('Your twin is saved on this device.'); } catch { setStatus('Your twin could not be saved on this device.'); } }}>Save my twin</button>
              <button type="button" className="min-h-10 px-2 text-xs underline" onClick={() => { setPreview(null); setScanning(true); }}>Retake</button>
              <button type="button" className="min-h-10 px-2 text-xs underline" onClick={() => setPreview(null)}>Cancel</button>
            </div>
          </div>
        </div>
      : <div className="absolute inset-x-0 bottom-5 z-10 flex justify-center">
          {face
            ? <button type="button" onClick={() => api.current?.camera(!tracking)} className="min-h-11 rounded-full px-6 text-sm font-medium shadow-lg" style={bubble} data-portrait-camera>{tracking ? 'Stop the camera' : 'Move with me'}</button>
            : <button type="button" onClick={() => setScanning(true)} className="min-h-11 rounded-full px-6 text-sm font-medium shadow-lg" style={bubble} data-scan-face>Create your twin</button>}
        </div>}
    {panel && !preview && <div className="absolute inset-x-3 bottom-20 z-20 max-h-[60%] overflow-auto rounded-2xl p-4 text-white shadow-xl" style={{ background: 'rgba(6,42,33,0.95)' }} data-portrait-customize>
      {detachable && wearLabels && <><p className="mb-2 text-xs">Wear as</p>
        <div className="mb-4 flex gap-2">{(['stud', 'full'] as const).map(w => <button key={w} type="button" aria-pressed={wear === w} onClick={() => setWear(w)} className="ames-pill min-h-10 rounded-full px-4 text-[12px]">{wearLabels[w]}</button>)}</div></>}
      <p className="mb-2 text-xs">Hair</p>
      <div className="mb-4 flex flex-wrap gap-2">{HAIR_STYLES.map(h => <button key={h.id} type="button" aria-pressed={hairStyle === h.id} onClick={() => chooseHair(h.id)} className="ames-pill min-h-10 rounded-full px-4 text-[12px]">{h.label}</button>)}</div>
      <p className="mb-2 text-xs">Your twin</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="ames-pill min-h-10 rounded-full px-4 text-[12px]" onClick={() => { setPanel(false); setScanning(true); }}>{face ? 'Rescan my face' : 'Scan my face'}</button>
        {(twin?.face || twinTones()) && (confirmDelete
          ? <span className="text-xs">Delete your face, hands and tone from this device? <button type="button" className="ml-1 underline" onClick={() => { deleteTwin(); setConfirmDelete(false); setStatus('Your twin is deleted from this device.'); }}>Delete</button> <button type="button" className="ml-2 underline" onClick={() => setConfirmDelete(false)}>Keep</button></span>
          : <button type="button" className="text-xs underline" onClick={() => setConfirmDelete(true)}>Delete my twin</button>)}
      </div>
      <p className="mt-3 text-[11px] opacity-80">One twin for your face and hands: same skin tone everywhere. Measurements stay on this device.</p>
    </div>}
    {scanning && <FaceScan onCancel={() => setScanning(false)} onDone={(f, photo) => { setScanning(false); setHairStyle(f.hairStyle); setPreview({ face: f, photo }); }} />}
  </div>;
}
