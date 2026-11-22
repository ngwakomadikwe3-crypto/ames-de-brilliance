'use client';
// HOUSEofAMES try-on on the customer's own 3D hand. The hand is built once from their saved scan (shape and
// photo texture) or a generic hand; the front camera then drives it like a puppet (every finger joint and the
// wrist), while gestures move the view: pinch = zoom, index = turn, index + middle = tumble, open palm = freeze,
// fist held 500 ms = reset. With no hand in view the piece and hand turn slowly in the showcase motion.
// One WebGL scene: the jewellery wraps the 3D wrist or finger, so occlusion, shadows and light are real.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Box3, Color,
  ACESFilmicToneMapping, AmbientLight, DirectionalLight, Group, Material, Matrix4, Mesh, Object3D, PCFSoftShadowMap, PMREMGenerator,
  PerspectiveCamera, Quaternion, RepeatWrapping, Scene, SRGBColorSpace, TextureLoader, Vector2, Vector3, WebGLRenderer, type Bone, type Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { trackingAssets } from '../lib/hand-tracking-assets';
import { buildHand, solvePose, handednessFlip } from '../lib/clone-hand';
import { skinMaterial } from '../lib/clone-skin';
import { loadHandTemplate, templateShape, templateMeasure, buildRealHand, clampPose, jointBends, type HandTemplate } from '../lib/realistic-hand';
import { realisticSkin, realisticNails, type SkinUniforms } from '../lib/realistic-skin';
import { readProfile, saveProfile, deleteProfile, genericShape, genericTone, type HandProfileV2, type HandShape, type HandTexture } from '../lib/hand-profile';
import { shapeFromMorph, shiftTone, type HandMorph } from '../lib/hand-morph';
import { OneEuro } from '../lib/ar/one-euro';
import { TrackingGate, plausibleStep } from '../lib/ar/tracking-gate';
import { cameraFor, liftHand, DorsalSide } from '../lib/ar/hand-pose';
import { fitLoop } from '../lib/ar/model-fit';
import { fittingFor, handAnchor, fitScale } from '../lib/atelier/fitting-registry';
import { FRAMING_PRESETS, fitPoints, presetFor, zoomRange } from '../lib/try-on-framing';
import { dress } from '../lib/ar/jewel-dress';
import { createMetalStudioEnvironment } from '../lib/metal-studio-env';
import { GestureController, gestureDebugEnabled, type GestureOutput } from '../lib/gesture-controller';
import GestureDebug from './GestureDebug';
import HandScan, { type ScanResult } from './HandScan';

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
const DEFAULT_DISTANCE = 600;                                         // mm from the camera to the hand
let templatePromise: Promise<HandTemplate> | null = null;              // the sculpted hand, loaded once per page

// Skin tones for the standard hand (light to deep). The choice is remembered on this device.
const TONES = ['#f4d8c3', '#e8c0a1', '#d9a786', '#c58e6b', '#b07a5a', '#966045', '#7a4a31', '#5d3624', '#412619'];
const TONE_KEY = 'ames-hand-tone', TIPS_KEY = 'ames-gesture-tips-seen';
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } } };

export default function CloneTryOn({ model, category, onLiveCamera, title, onClose }: { model: string; category: string; onLiveCamera?: () => void; title?: string; onClose?: () => void }) {
  const box = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null);
  const [profile, setProfile] = useState<HandProfileV2 | null>(null);
  const [scanning, setScanning] = useState(false), [confirmDelete, setConfirmDelete] = useState(false);
  const [tracking, setTracking] = useState(false), [status, setStatus] = useState(''), [gesture, setGesture] = useState('');
  const [debugReadout, setDebugReadout] = useState<GestureOutput | null>(null);       // TEMPORARY gesture debug
  const [finger, setFinger] = useState(3), [paused, setPaused] = useState(false), [photo, setPhoto] = useState('');
  const [notice, setNotice] = useState('');
  const [sheet, setSheet] = useState(false), [menu, setMenu] = useState(false), [privacyOpen, setPrivacyOpen] = useState(false), [coach, setCoach] = useState(false);
  const [toneChoice, setToneChoice] = useState<string | null>(() => (typeof window === 'undefined' ? null : store.get(TONE_KEY)));
  // a new scan (or fine-tuning a saved one) is previewed on the 3D hand with three sliders; nothing is saved until confirmed
  const [draft, setDraft] = useState<{ morph: HandMorph; tone: string; texture?: HandTexture; shape: HandShape; measured: number; isNew: boolean } | null>(null);
  const [tune, setTune] = useState({ size: 1, fingers: 1, tone: 0 });
  const api = useRef<{ snap: () => Promise<Blob | null>; finger: (f: number) => void; pause: (p: boolean) => void; track: (on: boolean) => void; tone: (hex: string) => void } | null>(null);
  const wrist = category === 'watch' || category === 'bracelet';
  const [template, setTemplate] = useState<HandTemplate | 'failed' | null>(null);
  useEffect(() => {
    let live = true;
    (templatePromise ??= loadHandTemplate()).then(t => { if (live) setTemplate(t); }, e => { console.warn('Realistic hand unavailable, using the simple hand:', e); templatePromise = null; if (live) setTemplate('failed'); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const load = () => setProfile(readProfile());
    load(); window.addEventListener('ames-hand-fit', load); window.addEventListener('ames-hand-deleted', load);
    return () => { window.removeEventListener('ames-hand-fit', load); window.removeEventListener('ames-hand-deleted', load); };
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  useEffect(() => { api.current?.finger(finger); }, [finger]);
  useEffect(() => { api.current?.pause(paused); }, [paused]);
  useEffect(() => { api.current?.track(tracking); }, [tracking]);
  // gesture tips: once, the first time the hand camera is switched on (again only if re-enabled in Customize)
  useEffect(() => { if (tracking && !store.get(TIPS_KEY)) setCoach(true); }, [tracking]);
  useEffect(() => { if (coach && gesture) { setCoach(false); store.set(TIPS_KEY, '1'); } }, [gesture, coach]);
  // the hand on screen: the draft being previewed, else the saved morph, else the saved (older) shape, else the base hand
  const hand = draft ?? (profile ? { morph: profile.morph, tone: profile.tone, texture: profile.texture, shape: profile.shape } : null);
  const tone = draft ? shiftTone(draft.tone, tune.tone) : profile?.morph ? shiftTone(profile.tone, profile.morph.toneShift) : toneChoice ?? profile?.tone ?? genericTone;
  // the scene rebuilds when the hand's shape or photo changes, never for a tone change (that is applied live)
  const handKey = hand ? JSON.stringify([hand.morph && { ...hand.morph, toneShift: 0 }, hand.morph ? null : hand.shape, hand.texture?.image.length ?? 0]) : 'base';
  const handRef = useRef(hand), toneRef = useRef(tone);
  useLayoutEffect(() => { handRef.current = hand; toneRef.current = tone; });   // before the scene effect reads them
  // slider moves rebuild the hand after a short pause, not on every step
  useEffect(() => {
    if (!draft) return;
    const id = setTimeout(() => setDraft(d => d && (d.morph.middle !== d.measured * tune.size || d.morph.fingerLength !== tune.fingers)
      ? { ...d, morph: { ...d.morph, middle: d.measured * tune.size, fingerLength: tune.fingers } } : d), 280);
    return () => clearTimeout(id);
  }, [tune.size, tune.fingers, draft]);
  useEffect(() => { api.current?.tone(tone); }, [tone]);

  // --- the scene: rebuilt only when the hand or the piece changes, never on tracking updates -----------------------
  useEffect(() => {
    const canvas = canvasRef.current, host = box.current;
    if (!canvas || !host || scanning || !template) return;
    let stopped = false, raf = 0;
    const disposables: { dispose(): void }[] = [];
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    disposables.push(renderer);
    const scene = new Scene();
    const camera = new PerspectiveCamera(30, 1, 5, 5000);
    let distance = DEFAULT_DISTANCE, targetDistance = DEFAULT_DISTANCE;
    // Studio light matched to the boutique: the jewellery tent HDR for reflections, a soft key that casts shadows.
    const pmrem = new PMREMGenerator(renderer); disposables.push(pmrem);
    new HDRLoader().load('/ames-engine/environments/jewellery-tent-v3.hdr', hdr => {
      if (stopped) { hdr.dispose(); return; }
      const env = pmrem.fromEquirectangular(hdr); hdr.dispose(); scene.environment = env.texture; disposables.push(env);
      if (skinMat) { skinMat.envMap = env.texture; skinMat.envMapIntensity = 0.38; skinMat.needsUpdate = true; }   // skin: same tent light, softer
    });
    const key = new DirectionalLight('#fff6ee', 2.4); key.position.set(-120, 260, 420); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -170; key.shadow.camera.right = key.shadow.camera.top = 170;
    key.shadow.camera.near = 50; key.shadow.camera.far = 1200; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.6; key.shadow.radius = 4;
    scene.add(key, new AmbientLight('#ffffff', 0.25));
    const metalStudio = createMetalStudioEnvironment(renderer); disposables.push(metalStudio);
    let skinMat: import('three').MeshPhysicalMaterial | null = null;

    // view (gestures + showcase) > hand (follows the live wrist) > mirror > skinned hand + jewellery
    const view = new Group(), hand = new Group(), mirror = new Group();
    scene.add(view); view.add(hand); hand.add(mirror);
    const real = template !== 'failed' ? template : null;
    const current = handRef.current;
    const shape = current?.morph && real ? shapeFromMorph(templateMeasure(real), current.morph) : current?.shape ?? (real ? templateShape(real) : genericShape);
    let photoTexture: Texture | undefined;
    if (current?.texture?.image) { photoTexture = new TextureLoader().load(current.texture.image); disposables.push(photoTexture); }
    const skinTone = toneRef.current;
    let skinUniforms: SkinUniforms | null = null, relaxed: Quaternion[] | null = null, liveTone: (hex: string) => void = () => {};
    let built: { mesh: import('three').SkinnedMesh; bones: Bone[]; rest: Vector3[] };
    if (real) {
      // Realistic hand: sculpted template fitted to the customer, lit by the same studio as the metal.
      const detail = new TextureLoader().load('/hand-twin/skin-detail.jpg');
      detail.wrapS = detail.wrapT = RepeatWrapping; detail.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); disposables.push(detail);
      // skin takes the boutique tent light (the scene environment), like the stones
      const sk = realisticSkin(skinTone, null, real.chainS, photoTexture, detail), nailMat = realisticNails(skinTone, metalStudio.texture);
      liveTone = (hex: string) => { sk.tone.set(hex); (nailMat.userData.tone as Color).set(hex); };
      const r = buildRealHand(real, shape, sk.material, nailMat, current?.texture?.uv);
      skinUniforms = sk.uniforms; relaxed = r.relaxed; built = r; skinMat = sk.material;
      if (scene.environment) { skinMat.envMap = scene.environment; skinMat.envMapIntensity = 0.38; }
      disposables.push(sk.material, nailMat, r.mesh.geometry, r.nails.geometry);
    } else {
      const skin = skinMaterial(skinTone, photoTexture); disposables.push(skin);
      built = buildHand(shape, skin, current?.texture?.uv); disposables.push(built.mesh.geometry);
    }
    built.mesh.castShadow = true; built.mesh.receiveShadow = true;
    mirror.add(built.mesh);
    // Framing from the model: the posed hand (and, once attached, the piece) fills ~60 % of the frame, centred.
    const centre = new Vector3(), preset = FRAMING_PRESETS[presetFor(category)];
    let fit = { distance: DEFAULT_DISTANCE }, fitCentre = new Vector3();
    const refit = (snap = false) => {
      const wasFlipped = mirror.scale.x < 0;
      mirror.position.set(0, 0, 0); mirror.scale.x = 1; mirror.updateMatrixWorld(true);
      const pts: Vector3[] = [], toLocal = new Matrix4().copy(mirror.matrixWorld).invert();
      // the posed skin itself (fingertips, nails, thumb, knuckles), down to the preset's share of forearm
      const wristP = built.bones[0].getWorldPosition(new Vector3()).applyMatrix4(toLocal), midP = built.bones[9].getWorldPosition(new Vector3()).applyMatrix4(toLocal);
      const along = midP.clone().sub(wristP).normalize(), v = new Vector3(), count = built.mesh.geometry.getAttribute('position').count;
      built.mesh.skeleton.update();
      for (let i = 0; i < count; i += 7) {
        built.mesh.getVertexPosition(i, v); v.applyMatrix4(built.mesh.matrixWorld).applyMatrix4(toLocal);
        if (v.clone().sub(wristP).dot(along) >= -preset.forearm) pts.push(v.clone());
      }
      if (piece && mount.parent) { const b = new Box3().setFromObject(piece); if (!b.isEmpty()) for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new Vector3(x, y, z).applyMatrix4(toLocal)); }
      const f = fitPoints(pts, camera.fov, camera.aspect || 1, preset.fill);
      const ratio = fit.distance ? targetDistance / fit.distance : 1;
      fit = f; fitCentre.set(f.centre.x, f.centre.y, f.centre.z);
      if (snap) centre.copy(fitCentre);
      mirror.position.copy(centre).multiplyScalar(-1);
      if (wasFlipped) { mirror.scale.x = -1; mirror.position.x = centre.x; }
      const z = zoomRange(f); targetDistance = Math.max(z.min, Math.min(z.max, f.distance * (snap ? 1 : ratio))); if (snap) distance = targetDistance;
    };

    // --- jewellery on the 3D hand -----------------------------------------------------------------------------------
    const mount = new Group(); mount.matrixAutoUpdate = false;
    let fingerIndex = 3, piece: Object3D | null = null, loop: ReturnType<typeof fitLoop> | null = null;
    let contact: { bone: Bone; at: Vector3; axis: Vector3; radius: number; half: number } | null = null;
    const attach = () => {
      if (!piece || !loop) return;
      mount.parent?.remove(mount);
      const entry = fittingFor(category) ?? fittingFor(wrist ? 'watch' : 'ring')!;
      const frame = handAnchor(entry, shape, built.rest, fingerIndex);
      const [sSide, sAlong, sUp] = fitScale(entry, frame, loop);
      const B = new Matrix4(), S = new Matrix4(), A = new Matrix4(), T = new Matrix4(), bone: Bone = built.bones[frame.bone];
      A.makeBasis(loop.side, loop.axis, loop.up).transpose().multiply(new Matrix4().makeTranslation(-loop.centre.x, -loop.centre.y, -loop.centre.z));
      contact = { bone, at: frame.at.clone(), axis: frame.axis.clone(), radius: (frame.halfSide + frame.halfUp) / 2, half: Math.max(1, (loop.width ?? 4) * sAlong / 2) };
      mount.matrix.copy(T.makeTranslation(frame.at.x, frame.at.y, frame.at.z)).multiply(B.makeBasis(frame.side, frame.axis, frame.up)).multiply(S.makeScale(sSide, sAlong, sUp)).multiply(A);
      bone.add(mount);
      refit();
    };
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(model, gltf => {
      if (stopped) return;
      piece = gltf.scene; dress(piece, metalStudio.texture); piece.updateMatrixWorld(true);
      let head: Object3D | undefined, clasp: Object3D | undefined;
      piece.traverse(o => { if (o.name.replace(/_/g, ' ') === 'Watch head') head = o; if (!clasp && o.userData?.ames_link === 0) clasp = o; });
      loop = fitLoop(piece, head ? { up: head.getWorldPosition(new Vector3()) } : clasp && wrist ? { down: clasp.getWorldPosition(new Vector3()) } : undefined);
      piece.traverse(o => { if ((o as Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      mount.add(piece); attach();
    }, undefined, () => setStatus('This piece could not be loaded.'));

    // --- live puppet + gestures ------------------------------------------------------------------------------------
    const restQuats = relaxed ?? built.bones.map(b => b.quaternion.clone()), targets = restQuats.map(q => q.clone());
    built.bones.forEach((b, i) => b.quaternion.copy(restQuats[i]));       // rest: a relaxed hand, never splayed
    refit(true);
    const handTarget = new Vector3(), handPos = new Vector3();
    const viewTurn = new Quaternion(), viewTarget = new Quaternion();
    let showcase = 0, showcaseBlend = 0, quietUntil = 0, handSeen = false, frozen = false, pausedShowcase = false, resetting = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const tumble = (t: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), t * Math.PI / 6 + 0.09 * Math.sin(t * Math.PI / 6))
      .premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 18 * Math.sin(2 * Math.PI * t / 20)))
      .premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 36 * Math.sin(2 * Math.PI * t / 29.3)));

    let stream: MediaStream | undefined, tracker: HandLandmarker | undefined, frameHandle = 0;
    const video = document.createElement('video'); video.muted = true; video.playsInline = true;
    const worldFilter = new OneEuro(1.1, 4), imageFilter = new OneEuro(1.1, 18);
    const gate = new TrackingGate(), dorsalSide = new DorsalSide(), controls = new GestureController(gestureDebugEnabled());
    let debugAt = 0;
    const setDebug = (g: GestureOutput) => { const t = performance.now(); if (t - debugAt > 100) { debugAt = t; setDebugReadout(g); } };   // TEMPORARY
    let previous: { x: number; y: number; size: number } | null = null, lastTime = 0, flipped = false, lastGesture = '';
    const resetFrom = new Quaternion(); let resetDistance = DEFAULT_DISTANCE;

    function onFrame(now: number) {
      if (!tracker || stopped) return;
      const result = tracker.detectForVideo(video, now);
      const image = result.landmarks?.[0], world = result.worldLandmarks?.[0], label = result.handedness?.[0]?.[0];
      const cam = cameraFor(video.videoWidth, video.videoHeight);
      let confident = !!image && !!world && image.length === 21 && (label?.score ?? 1) >= 0.6;
      if (confident && image) {
        const span = Math.hypot((image[5].x - image[17].x) * cam.width, (image[5].y - image[17].y) * cam.height) / cam.width;
        const next = { x: image[0].x, y: image[0].y, size: span };
        confident = span > 0.03 && plausibleStep(previous, next, now - lastTime); previous = next;
      } else previous = null;
      lastTime = now;
      const state = gate.update(confident, now);
      if (state === 'tracking' && image && world) {
        const unpack = (a: number[]) => Array.from({ length: 21 }, (_, i) => ({ x: a[3 * i], y: a[3 * i + 1], z: a[3 * i + 2] }));
        const img = unpack(imageFilter.filter(image.flatMap(p => [p.x, p.y, p.z]), now)), wld = unpack(worldFilter.filter(world.flatMap(p => [p.x, p.y, p.z]), now));
        const lifted = liftHand(img, wld, cam);
        if (lifted) {
          const pts = lifted.points.map(p => new Vector3(p[0], p[1], p[2]).multiplyScalar(1000));
          const dorsal = dorsalSide.update(lifted.points, label?.categoryName === 'Left' ? 1 : -1);
          const flip = handednessFlip(pts, new Vector3(...dorsal), shape.side);
          if (flip !== flipped) { flipped = flip; mirror.scale.x = flip ? -1 : 1; mirror.position.x = flip ? centre.x : -centre.x; }
          // Solve in the model's handedness: a mirrored model sees the live hand mirrored too.
          const live = flip ? pts.map(p => new Vector3(-p.x, p.y, p.z)) : pts;
          const local = clampPose(solvePose(built.rest, live), built.rest);   // anatomical limits: never bends backwards
          local.forEach((q, i) => targets[i].copy(q));
          // Follow the hand across the frame, gently (the view stays centred on the piece).
          handTarget.set((pts[0].x + pts[9].x) / 2 * 0.35, (pts[0].y + pts[9].y) / 2 * 0.35, 0);
          // Gestures: fingertips, mirrored image coordinates.
          const world = lifted.points.map(p => ({ x: p[0], y: p[1], z: p[2] }));
          const two = controls.pose === 'two', tipIndex = img[8], tipMiddle = img[12];
          const x = 1 - (two ? (tipIndex.x + tipMiddle.x) / 2 : tipIndex.x), y = two ? (tipIndex.y + tipMiddle.y) / 2 : tipIndex.y;
          const g = controls.step(world, x, y, now);
          frozen = g.state === 'FROZEN';
          if (g.dx) viewTarget.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), g.dx * Math.PI));
          if (g.dy) viewTarget.premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), g.dy * Math.PI));
          if (g.zoom !== 1) { const z = zoomRange(fit); targetDistance = Math.max(z.min, Math.min(z.max, targetDistance / g.zoom)); }
          if (g.reset) { resetting = now; resetFrom.copy(viewTurn); resetDistance = distance; }
          if (controls.debug) setDebug(g);
          const label2 = g.pose === 'point' ? 'Turning' : g.pose === 'two' ? 'Tilting' : g.pose === 'pinch' ? 'Zoom' : g.pose === 'palm' ? 'Frozen' : g.pose === 'fist' ? 'Resetting…' : '';
          if (label2 !== lastGesture) { lastGesture = label2; setGesture(label2); }
        }
        handSeen = true; quietUntil = now + 5000;
      } else if (state === 'hidden') {
        imageFilter.reset(); worldFilter.reset(); dorsalSide.reset();
        targets.forEach((q, i) => q.copy(restQuats[i]));                  // hand gone: settle back to the relaxed pose
        if (controls.state !== 'SHOWCASE') { const g = controls.lost(now); frozen = false; if (controls.debug) setDebug(g); }
        if (handSeen) { handSeen = false; quietUntil = now + 5000; if (lastGesture) { lastGesture = ''; setGesture(''); } }
      }
    }
    function schedule() {
      if (stopped) return;
      const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number) => void) => number };
      if (v.requestVideoFrameCallback) frameHandle = v.requestVideoFrameCallback(now => { try { onFrame(now); } catch (e) { console.warn('Hand tracking stopped:', e); return; } schedule(); });
      else { let t = -1; const tick = (now: number) => { if (stopped) return; if (video.currentTime !== t) { t = video.currentTime; onFrame(now); } requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
    }
    async function startTracking() {
      setStatus('Starting the camera…');
      const assets = trackingAssets(); void assets.catch(() => {});
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } });
      if (stopped || !trackingOn) { stream.getTracks().forEach(t => t.stop()); stream = undefined; return; }
      video.srcObject = stream; await video.play();
      setStatus('Loading hand tracking…');
      const { HandLandmarker, files, bytes } = await assets;
      if (stopped) return;
      tracker = await HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetBuffer: bytes.slice(), delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6 });
      if (stopped || !trackingOn) { tracker.close(); tracker = undefined; return; }
      setStatus(''); schedule();
    }
    function stopTracking() {
      const v = video as HTMLVideoElement & { cancelVideoFrameCallback?: (h: number) => void }; if (frameHandle) v.cancelVideoFrameCallback?.(frameHandle);
      frameHandle = 0; stream?.getTracks().forEach(t => t.stop()); stream = undefined; video.srcObject = null; tracker?.close(); tracker = undefined;
      gate.reset(); handSeen = false; quietUntil = performance.now() + 5000; setStatus(''); setGesture('');
    }

    // Touch / mouse still works: drag to turn, wheel to zoom.
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; quietUntil = performance.now() + 5000; canvas.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!drag) return; const r = canvas.getBoundingClientRect();
      viewTarget.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (e.clientX - drag.x) / r.width * Math.PI));
      viewTarget.premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (e.clientY - drag.y) / r.height * Math.PI));
      drag = { x: e.clientX, y: e.clientY }; quietUntil = performance.now() + 5000;
    };
    const up = () => { drag = null; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const z = zoomRange(fit); targetDistance = Math.max(z.min, Math.min(z.max, targetDistance * Math.exp(e.deltaY * 0.001))); quietUntil = performance.now() + 5000; };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('wheel', wheel, { passive: false });

    // --- render loop: ease bones and view toward their targets (EMA 0.3 at 30 fps, frame-rate independent) ------
    let last = performance.now();
        function render(now: number) {
      if (stopped) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const ease = 1 - Math.pow(0.7, dt * 30);
      built.bones.forEach((b, i) => b.quaternion.slerp(targets[i], ease));
      if (skinUniforms) {
        jointBends(built.bones, skinUniforms.bends.value);
        if (contact && piece) {
          view.updateMatrixWorld(true);
          const c = contact.bone.localToWorld(contact.at.clone()), a = contact.bone.localToWorld(contact.at.clone().add(contact.axis)).sub(c).normalize();
          skinUniforms.contactCentre.value[0].copy(c); skinUniforms.contactAxis.value[0].copy(a);
          skinUniforms.contactSize.value[0].set(contact.radius, contact.half, wrist ? 3.2 : 2.2, 0); skinUniforms.contactCount.value = 1;
        } else skinUniforms.contactCount.value = 0;
      }
      handPos.lerp(handTarget, ease); hand.position.copy(handPos);
      if (resetting) {
        // Fist held: ease back to the default view over one second.
        const t = Math.min(1, (now - resetting) / 1000), s = t * t * (3 - 2 * t);
        viewTarget.slerpQuaternions(resetFrom, new Quaternion(), s); viewTurn.copy(viewTarget);
        targetDistance = distance = resetDistance + (fit.distance - resetDistance) * s;
        if (t >= 1) resetting = 0;
      }
      viewTurn.slerp(viewTarget, 1 - Math.pow(0.85, dt * 60));
      // Showcase: only with no hand in view, no hand on the piece, after 5 quiet seconds, blending in over 1 s.
      const idle = !handSeen && !drag && now > quietUntil && !frozen && !pausedShowcase && !reduced.matches && !document.hidden;
      showcaseBlend = Math.max(0, Math.min(1, showcaseBlend + (idle ? dt : -1)));
      if (idle) showcase += dt * showcaseBlend * showcaseBlend * (3 - 2 * showcaseBlend);
      view.quaternion.copy(viewTurn).multiply(showcaseBlend > 0 ? new Quaternion().slerp(tumble(showcase), showcaseBlend) : new Quaternion());
      if (centre.distanceToSquared(fitCentre) > 0.01) {                    // smooth reframing (finger or piece change)
        centre.lerp(fitCentre, 1 - Math.pow(0.85, dt * 60));
        mirror.position.set(mirror.scale.x < 0 ? centre.x : -centre.x, -centre.y, -centre.z);
      }
      distance += (targetDistance - distance) * (1 - Math.pow(0.8, dt * 60));
      camera.position.set(0, 0, distance); camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    }
    const resize = () => { const r = host.getBoundingClientRect(); if (!r.width || !r.height) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); refit(); };   // refit on every size / orientation change
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    raf = requestAnimationFrame(render);

    let trackingOn = false;
    api.current = {
      track: on => {
        if (on === trackingOn) return; trackingOn = on;
        if (on) void startTracking().catch(() => { stopTracking(); trackingOn = false; setStatus('The camera is not available. You can still turn the piece by dragging.'); setTracking(false); });
        else stopTracking();
      },
      finger: f => { fingerIndex = f; attach(); },
      pause: p => { pausedShowcase = p; },
      tone: hex => liveTone(hex),
      snap: async () => {
        const size = renderer.getSize(new Vector2()), ratio = renderer.getPixelRatio();
        const w = 2048, h = Math.round(2048 * size.y / size.x);
        renderer.setPixelRatio(1); renderer.setSize(w, h, false); renderer.render(scene, camera);
        const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/png'));
        renderer.setPixelRatio(ratio); renderer.setSize(size.x, size.y, false); renderer.render(scene, camera);
        return blob;
      },
    };
    api.current.finger(finger); api.current.pause(paused); api.current.track(tracking);

    return () => {
      stopped = true; cancelAnimationFrame(raf); observer.disconnect(); api.current = null;
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('wheel', wheel);
      stopTracking();
      piece?.traverse(o => { const m = o as Mesh; if (m.isMesh) { m.geometry?.dispose(); [m.material].flat().forEach(x => (x as Material)?.dispose()); } });
      disposables.forEach(d => d.dispose());
    };
    // finger, paused and tracking are pushed through api.current; they must not rebuild the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, category, wrist, handKey, scanning, template]);

  async function finishScan(scan: ScanResult) {
    // The measured hand goes to the preview first; the saved hand changes only when the customer confirms it.
    setTune({ size: 1, fingers: 1, tone: 0 });
    setDraft({ morph: scan.morph, tone: scan.tone, texture: scan.texture, shape: scan.shape, measured: scan.morph.middle, isNew: true });
    setScanning(false);
    return true;
  }
  function fineTune() {
    if (!profile?.morph) return;
    const m = profile.morph, measured = m.middle;
    setTune({ size: 1, fingers: m.fingerLength, tone: m.toneShift });
    setDraft({ morph: m, tone: profile.tone, texture: profile.texture, shape: profile.shape, measured, isNew: false }); setSheet(false);
  }
  function confirmHand() {
    if (!draft) return;
    const morph: HandMorph = { ...draft.morph, middle: draft.measured * tune.size, fingerLength: tune.fingers, toneShift: tune.tone };
    try {
      const real = template && template !== 'failed' ? template : null;
      const shape = real ? shapeFromMorph(templateMeasure(real), morph) : draft.shape;
      saveProfile({ shape, tone: draft.tone, texture: draft.texture, morph });
      setDraft(null); setNotice(draft.isNew ? 'Your hand is saved on this device.' : 'Your hand is updated.');
    } catch { setNotice('Your hand could not be saved on this device. Your previous hand is unchanged.'); }
  }
  function setScannedToneShift(shift: number) {
    if (!profile?.morph) return;
    try { saveProfile({ shape: profile.shape, tone: profile.tone, texture: profile.texture, morph: { ...profile.morph, toneShift: shift } }); } catch { /* keep the shown tone */ }
  }
  async function takePhoto() {
    const blob = await api.current?.snap(); if (!blob) return;
    setPhoto(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
  }

  if (scanning) return <HandScan onDone={finishScan} onCancel={() => setScanning(false)} />;
  // The stage is the product: everything else is a floating icon, a sheet or a menu, opened only when asked.
  const bubble = 'flex h-11 w-11 items-center justify-center rounded-full shadow-lg';
  const bubbleStyle = { background: '#ffffff', color: '#0c3b2e' };
  const firstVisit = !profile;
  return <div className="relative h-full w-full overflow-hidden text-white" data-try-on-stage>
    <div ref={box} className="absolute inset-0">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" aria-label={profile ? 'Your 3D hand wearing the piece' : 'A 3D hand wearing the piece'} />
    </div>
    {debugReadout && <GestureDebug g={debugReadout} />}

    {/* top: close, (first visit) the name, one status line, settings and more */}
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
      {onClose ? <button type="button" aria-label="Close try-on" onClick={onClose} className={`pointer-events-auto ${bubble}`} style={bubbleStyle}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button> : <span />}
      <div className="min-w-0 flex-1 pt-1 text-center" style={{ textShadow: '0 1px 6px rgba(0,0,0,.6)' }}>
        {firstVisit && title && <p className="truncate" style={{ fontFamily: 'var(--font-satoshi)', fontSize: 17 }}>{title}</p>}
        {(status || gesture || notice) && <p role="status" className="truncate text-xs">{status || gesture || notice}</p>}
      </div>
      <div className="pointer-events-auto flex gap-2">
        <button type="button" aria-label="Customize" aria-expanded={sheet} onClick={() => { setSheet(true); setMenu(false); }} className={bubble} style={bubbleStyle} data-customize>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg></button>
        <button type="button" aria-label="More" aria-expanded={menu} onClick={() => setMenu(m => !m)} className={bubble} style={bubbleStyle} data-more>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg></button>
      </div>
    </div>

    {/* ••• : utilities */}
    {menu && <div role="menu" className="absolute right-3 top-16 z-20 min-w-48 overflow-hidden rounded-2xl bg-black/85 py-1 text-sm shadow-xl backdrop-blur" data-more-menu>
      <button role="menuitem" type="button" className="block w-full px-4 py-3 text-left" onClick={() => { setMenu(false); void takePhoto(); }}>Take photo</button>
      {onLiveCamera && <button role="menuitem" type="button" className="block w-full px-4 py-3 text-left" onClick={() => { setMenu(false); onLiveCamera(); }}>Live camera view</button>}
      {onClose && <button role="menuitem" type="button" className="block w-full px-4 py-3 text-left" onClick={() => { setMenu(false); onClose(); }}>Piece only</button>}
    </div>}

    {/* one primary action, only until a hand is saved */}
    {firstVisit && !sheet && !draft && <button type="button" onClick={() => setScanning(true)} className="absolute bottom-6 left-1/2 min-h-12 -translate-x-1/2 rounded-full px-6 text-sm font-medium shadow-lg" style={bubbleStyle} data-primary>Scan your hand</button>}

    {/* gesture tips, once */}
    {coach && <button type="button" onClick={() => { setCoach(false); store.set(TIPS_KEY, '1'); }} className="absolute inset-x-6 bottom-6 z-20 rounded-2xl bg-black/80 p-4 text-left text-xs leading-5 shadow-xl" data-coach-marks>
      <span className="mb-1 block text-sm">Move the piece with your hand</span>
      <span className="grid grid-cols-2 gap-x-4"><span>☝️ Point · turn</span><span>✌️ Two fingers · tilt</span><span>🤏 Pinch · zoom</span><span>✋ Palm · freeze</span><span>✊ Fist · reset</span><span className="opacity-70">Tap to close</span></span>
    </button>}

    {/* Preview: the measured hand on screen, three fine-tuning sliders, saved only when confirmed */}
    {draft && <div role="dialog" aria-label="Your 3D hand" className="absolute inset-x-0 bottom-0 z-30 rounded-t-3xl bg-[#0b2f26]/95 p-5 pb-6 text-sm shadow-2xl" data-hand-preview>
      <p style={{ fontFamily: 'var(--font-satoshi)', fontSize: 18 }}>{draft.isNew ? 'Is this your hand?' : 'Fine-tune your hand'}</p>
      <p className="mb-3 text-xs opacity-90">Hold your hand next to the screen and compare. {draft.morph.sizeFrom === 'average' && draft.isNew ? 'The size starts from an average adult hand: set it to match yours.' : ''}</p>
      <label className="mb-3 block text-xs">Hand size <span className="opacity-80">· middle finger {Math.round(draft.measured * tune.size)} mm</span>
        <input type="range" min={0.85} max={1.15} step={0.01} value={tune.size} onChange={e => setTune(t => ({ ...t, size: Number(e.target.value) }))} className="mt-1 w-full" style={{ accentColor: '#ffffff' }} data-tune-size /></label>
      <label className="mb-3 block text-xs">Finger length <span className="opacity-80">· {tune.fingers >= 1 ? '+' : ''}{Math.round((tune.fingers - 1) * 100)}%</span>
        <input type="range" min={0.9} max={1.1} step={0.01} value={tune.fingers} onChange={e => setTune(t => ({ ...t, fingers: Number(e.target.value) }))} className="mt-1 w-full" style={{ accentColor: '#ffffff' }} data-tune-fingers /></label>
      <label className="mb-4 block text-xs">Skin tone <span className="opacity-80">· from your photo, lighter or darker</span>
        <input type="range" min={-0.25} max={0.25} step={0.01} value={tune.tone} onChange={e => setTune(t => ({ ...t, tone: Number(e.target.value) }))} className="mt-1 w-full"
          style={{ accentColor: '#ffffff', background: `linear-gradient(90deg, ${shiftTone(draft.tone, -0.25)}, ${draft.tone}, ${shiftTone(draft.tone, 0.25)})`, height: 10, borderRadius: 6 }} data-tune-tone /></label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={confirmHand} className="min-h-11 rounded-full px-6 font-medium shadow-lg" style={bubbleStyle} data-confirm-hand>{draft.isNew ? 'Save my hand' : 'Save'}</button>
        {draft.isNew && <button type="button" className="min-h-10 px-2 text-xs underline" onClick={() => { setDraft(null); setScanning(true); }}>Retake</button>}
        <button type="button" className="min-h-10 px-2 text-xs underline" onClick={() => setDraft(null)}>{draft.isNew ? 'Cancel' : 'Back'}</button>
      </div>
      {!draft.texture && draft.isNew && <p className="mt-2 text-[11px] opacity-80">The photo was not sharp or bright enough to use as your skin, so the standard skin detail is used with your tone.</p>}
    </div>}

    {/* Customize: set-up controls, closed by default */}
    {sheet && <div className="absolute inset-0 z-30 flex items-end bg-black/40" onClick={() => setSheet(false)}>
      <div role="dialog" aria-label="Customize" className="max-h-[80%] w-full overflow-y-auto rounded-t-3xl bg-[#0b2f26] p-5 pb-7 text-sm shadow-2xl" onClick={e => e.stopPropagation()} data-customize-sheet>
        <div className="mb-3 flex items-center justify-between"><p style={{ fontFamily: 'var(--font-satoshi)', fontSize: 18 }}>Customize</p>
          <button type="button" aria-label="Close" onClick={() => setSheet(false)} className={bubble} style={bubbleStyle}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button></div>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ames-pill min-h-10 rounded-full px-4" onClick={() => { setSheet(false); setScanning(true); }}>{profile ? 'Re-scan my hand' : 'Scan my hand'}</button>
            {profile && !confirmDelete && <button type="button" className="min-h-10 px-2 underline" onClick={() => setConfirmDelete(true)}>Delete saved hand</button>}
          </div>
          {confirmDelete && <div role="group" aria-label="Confirm hand deletion" className="text-xs"><p>Delete your saved hand, its measurements and photo, from this device?</p>
            <button type="button" className="min-h-10 px-2 underline" onClick={() => { try { deleteProfile(); setNotice('Saved hand deleted.'); } catch { setNotice('Deletion failed. Try again.'); } setConfirmDelete(false); }}>Delete</button>
            <button type="button" autoFocus className="min-h-10 px-2 underline" onClick={() => setConfirmDelete(false)}>Cancel</button></div>}
          <p className="flex items-center gap-1 text-xs opacity-90">
            <span>{profile ? 'Your hand is saved only on this device.' : 'Your scan stays on this device.'}</span>
            <button type="button" aria-label="About your hand data" aria-expanded={privacyOpen} onClick={() => setPrivacyOpen(o => !o)} className="flex h-5 w-5 items-center justify-center rounded-full border border-white/60 text-[10px]">i</button>
          </p>
          {privacyOpen && <p className="text-xs opacity-90">The photo of your hand, its measurements and skin tone are kept in this browser only and never uploaded. Delete them here at any time.</p>}
          {profile?.morph
            ? <label className="block"><span className="text-xs">Skin tone <span className="opacity-80">(from your scan: lighter or darker)</span></span>
                <input type="range" min={-0.25} max={0.25} step={0.01} value={profile.morph.toneShift} aria-valuetext={tone}
                  onChange={e => setScannedToneShift(Number(e.target.value))} className="mt-1 w-full" data-skin-tone
                  style={{ accentColor: '#ffffff', background: `linear-gradient(90deg, ${shiftTone(profile.tone, -0.25)}, ${profile.tone}, ${shiftTone(profile.tone, 0.25)})`, height: 10, borderRadius: 6 }} />
                <button type="button" className="mt-2 text-xs underline" onClick={fineTune} data-fine-tune>Fine-tune my hand</button>
              </label>
            : <label className="block"><span className="text-xs">Skin tone</span>
                <input type="range" min={0} max={TONES.length - 1} step={1} value={Math.max(0, TONES.indexOf(tone))} aria-valuetext={tone}
                  onChange={e => { const hex = TONES[Number(e.target.value)]; setToneChoice(hex); store.set(TONE_KEY, hex); }} className="mt-1 w-full" data-skin-tone
                  style={{ accentColor: '#ffffff', background: `linear-gradient(90deg, ${TONES.join(',')})`, height: 10, borderRadius: 6 }} />
                {toneChoice && profile && <button type="button" className="mt-1 text-xs underline" onClick={() => { setToneChoice(null); store.set(TONE_KEY, null); }}>Use my scanned tone</button>}
              </label>}
          <label className="flex items-center justify-between gap-3"><span>Move the piece with my hand <span className="block text-xs opacity-80">Uses the camera on this device</span></span>
            <input type="checkbox" checked={tracking} onChange={e => setTracking(e.target.checked)} className="h-5 w-5" data-gestures-toggle /></label>
          {!wrist && <label className="flex items-center justify-between gap-3">Ring finger <select value={finger} onChange={e => setFinger(Number(e.target.value))} className="rounded bg-black/30 px-2 py-1">{FINGERS.map((n, i) => <option key={n} value={i}>{n}</option>)}</select></label>}
          <label className="flex items-center justify-between gap-3">Turn slowly when idle <input type="checkbox" checked={!paused} onChange={e => setPaused(!e.target.checked)} className="h-5 w-5" /></label>
          <button type="button" className="text-xs underline" onClick={() => { store.set(TIPS_KEY, null); setSheet(false); if (tracking) setCoach(true); else setTracking(true); }}>Show gesture tips again</button>
        </div>
      </div>
    </div>}

    {photo && <figure className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/85 p-4 text-center text-xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo} alt="Your try-on photo" className="max-h-[75%] max-w-full rounded-xl" />
      <figcaption className="flex justify-center gap-4"><a className="underline" href={photo} download="houseofames-try-on.png">Save photo</a>
        {typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" className="underline" onClick={() => { void fetch(photo).then(r => r.blob()).then(b => navigator.share({ files: [new File([b], 'houseofames-try-on.png', { type: 'image/png' })] })).catch(() => {}); }}>Share</button>}
        <button type="button" className="underline" onClick={() => setPhoto('')}>Close</button></figcaption>
    </figure>}
  </div>;
}
