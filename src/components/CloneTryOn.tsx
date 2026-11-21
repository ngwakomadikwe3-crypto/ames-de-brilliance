'use client';
// HOUSEofAMES try-on on the customer's own 3D hand. The hand is built once from their saved scan (shape and
// photo texture) or a generic hand; the front camera then drives it like a puppet (every finger joint and the
// wrist), while gestures move the view: pinch = zoom, index = turn, index + middle = tumble, open palm = freeze,
// fist held 500 ms = reset. With no hand in view the piece and hand turn slowly in the showcase motion.
// One WebGL scene: the jewellery wraps the 3D wrist or finger, so occlusion, shadows and light are real.
import { useEffect, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping, AmbientLight, DirectionalLight, Group, Material, Matrix4, Mesh, Object3D, PCFSoftShadowMap, PMREMGenerator,
  PerspectiveCamera, Quaternion, Scene, SRGBColorSpace, TextureLoader, Vector2, Vector3, WebGLRenderer, type Bone, type Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { trackingAssets } from '../lib/hand-tracking-assets';
import { buildHand, solvePose, handednessFlip } from '../lib/clone-hand';
import { skinMaterial } from '../lib/clone-skin';
import { readProfile, saveProfile, deleteProfile, genericShape, genericTone, type HandProfileV2 } from '../lib/hand-profile';
import { OneEuro } from '../lib/ar/one-euro';
import { TrackingGate, plausibleStep } from '../lib/ar/tracking-gate';
import { cameraFor, liftHand, DorsalSide } from '../lib/ar/hand-pose';
import { fitLoop } from '../lib/ar/model-fit';
import { fittingFor, handAnchor, fitScale } from '../lib/atelier/fitting-registry';
import { dress } from '../lib/ar/jewel-dress';
import { createMetalStudioEnvironment } from '../lib/metal-studio-env';
import { FingerControls, fingerPose } from '../lib/finger-controls';
import HandScan, { type ScanResult } from './HandScan';

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
const DEFAULT_DISTANCE = 600;                                         // mm from the camera to the hand

export default function CloneTryOn({ model, category, onLiveCamera }: { model: string; category: string; onLiveCamera?: () => void }) {
  const box = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null);
  const [profile, setProfile] = useState<HandProfileV2 | null>(null);
  const [scanning, setScanning] = useState(false), [confirmDelete, setConfirmDelete] = useState(false);
  const [tracking, setTracking] = useState(false), [status, setStatus] = useState(''), [gesture, setGesture] = useState('');
  const [finger, setFinger] = useState(3), [paused, setPaused] = useState(false), [photo, setPhoto] = useState('');
  const [notice, setNotice] = useState('');
  const api = useRef<{ snap: () => Promise<Blob | null>; finger: (f: number) => void; pause: (p: boolean) => void; track: (on: boolean) => void } | null>(null);
  const wrist = category === 'watch' || category === 'bracelet';

  useEffect(() => {
    const load = () => setProfile(readProfile());
    load(); window.addEventListener('ames-hand-fit', load); window.addEventListener('ames-hand-deleted', load);
    return () => { window.removeEventListener('ames-hand-fit', load); window.removeEventListener('ames-hand-deleted', load); };
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  useEffect(() => { api.current?.finger(finger); }, [finger]);
  useEffect(() => { api.current?.pause(paused); }, [paused]);
  useEffect(() => { api.current?.track(tracking); }, [tracking]);

  // --- the scene: rebuilt only when the hand or the piece changes, never on tracking updates -----------------------
  useEffect(() => {
    const canvas = canvasRef.current, host = box.current;
    if (!canvas || !host || scanning) return;
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
    });
    const key = new DirectionalLight('#fff6ee', 2.4); key.position.set(-120, 260, 420); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -170; key.shadow.camera.right = key.shadow.camera.top = 170;
    key.shadow.camera.near = 50; key.shadow.camera.far = 1200; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.6; key.shadow.radius = 4;
    scene.add(key, new AmbientLight('#ffffff', 0.25));
    const metalStudio = createMetalStudioEnvironment(renderer); disposables.push(metalStudio);

    // view (gestures + showcase) > hand (follows the live wrist) > mirror > skinned hand + jewellery
    const view = new Group(), hand = new Group(), mirror = new Group();
    scene.add(view); view.add(hand); hand.add(mirror);
    const shape = profile?.shape ?? genericShape;
    let photoTexture: Texture | undefined;
    if (profile?.texture?.image) { photoTexture = new TextureLoader().load(profile.texture.image); disposables.push(photoTexture); }
    const skin = skinMaterial(profile?.tone ?? genericTone, photoTexture); disposables.push(skin);
    const built = buildHand(shape, skin, profile?.texture?.uv);
    built.mesh.castShadow = true; built.mesh.receiveShadow = true;
    disposables.push(built.mesh.geometry);
    mirror.add(built.mesh);
    // Centre the hand in view: rest pose middle of the palm at the origin.
    const centre = built.rest[0].clone().lerp(built.rest[9], 0.55);
    if (wrist) centre.copy(built.rest[0]).addScaledVector(built.rest[0].clone().sub(built.rest[9]).normalize(), 10);
    mirror.position.copy(centre).multiplyScalar(-1);

    // --- jewellery on the 3D hand -----------------------------------------------------------------------------------
    const mount = new Group(); mount.matrixAutoUpdate = false;
    let fingerIndex = 3, piece: Object3D | null = null, loop: ReturnType<typeof fitLoop> | null = null;
    const attach = () => {
      if (!piece || !loop) return;
      mount.parent?.remove(mount);
      const entry = fittingFor(category) ?? fittingFor(wrist ? 'watch' : 'ring')!;
      const frame = handAnchor(entry, shape, built.rest, fingerIndex);
      const [sSide, sAlong, sUp] = fitScale(entry, frame, loop);
      const B = new Matrix4(), S = new Matrix4(), A = new Matrix4(), T = new Matrix4(), bone: Bone = built.bones[frame.bone];
      A.makeBasis(loop.side, loop.axis, loop.up).transpose().multiply(new Matrix4().makeTranslation(-loop.centre.x, -loop.centre.y, -loop.centre.z));
      mount.matrix.copy(T.makeTranslation(frame.at.x, frame.at.y, frame.at.z)).multiply(B.makeBasis(frame.side, frame.axis, frame.up)).multiply(S.makeScale(sSide, sAlong, sUp)).multiply(A);
      bone.add(mount);
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
    const restQuats = built.bones.map(b => b.quaternion.clone()), targets = restQuats.map(q => q.clone());
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
    const gate = new TrackingGate(), dorsalSide = new DorsalSide(), controls = new FingerControls();
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
          const local = solvePose(built.rest, live);
          local.forEach((q, i) => targets[i].copy(q));
          // Follow the hand across the frame, gently (the view stays centred on the piece).
          handTarget.set((pts[0].x + pts[9].x) / 2 * 0.35, (pts[0].y + pts[9].y) / 2 * 0.35, 0);
          // Gestures: fingertips, mirrored image coordinates.
          const pose = fingerPose(lifted.points.map(p => ({ x: p[0], y: p[1], z: p[2] })), controls.mode === 'Pinch' || controls.candidate === 'Pinch');
          const tipIndex = img[8], tipMiddle = img[12];
          const x = 1 - (pose === 'Tumble' ? (tipIndex.x + tipMiddle.x) / 2 : tipIndex.x), y = pose === 'Tumble' ? (tipIndex.y + tipMiddle.y) / 2 : tipIndex.y;
          const palm = Math.hypot(lifted.points[5][0] - lifted.points[17][0], lifted.points[5][1] - lifted.points[17][1], lifted.points[5][2] - lifted.points[17][2]);
          const pinch = Math.hypot(lifted.points[4][0] - lifted.points[8][0], lifted.points[4][1] - lifted.points[8][1], lifted.points[4][2] - lifted.points[8][2]) / palm;
          const g = controls.step(pose, x, y, pinch, cam.width / cam.height, now);
          frozen = controls.frozen;
          if (g.dx) viewTarget.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), g.dx * Math.PI));
          if (g.dy) viewTarget.premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), g.dy * Math.PI));
          if (g.zoom !== 1) targetDistance = Math.max(160, Math.min(900, targetDistance / g.zoom));
          if (g.reset) { resetting = now; resetFrom.copy(viewTurn); resetDistance = distance; }
          const label2 = g.state === 'Ready' ? '' : g.state;
          if (label2 !== lastGesture) { lastGesture = label2; setGesture(label2 === 'Yaw' ? 'Turning' : label2 === 'Tumble' ? 'Tilting' : label2 === 'Pinch' ? 'Zoom' : label2 === 'Frozen' ? 'Frozen · pinch still zooms' : label2 === 'Reset' ? 'Resetting…' : ''); }
        }
        handSeen = true; quietUntil = now + 5000;
      } else if (state === 'hidden') {
        imageFilter.reset(); worldFilter.reset(); dorsalSide.reset();
        const drift = controls.step('None', 0, 0, 0, 1, now);           // let a flick finish
        if (drift.dx) viewTarget.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), drift.dx * Math.PI));
        if (drift.dy) viewTarget.premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), drift.dy * Math.PI));
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
    const wheel = (e: WheelEvent) => { e.preventDefault(); targetDistance = Math.max(160, Math.min(900, targetDistance * Math.exp(e.deltaY * 0.001))); quietUntil = performance.now() + 5000; };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('wheel', wheel, { passive: false });

    // --- render loop: ease bones and view toward their targets (EMA 0.3 at 30 fps, frame-rate independent) ------
    let last = performance.now();
        function render(now: number) {
      if (stopped) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const ease = 1 - Math.pow(0.7, dt * 30);
      built.bones.forEach((b, i) => b.quaternion.slerp(targets[i], ease));
      handPos.lerp(handTarget, ease); hand.position.copy(handPos);
      if (resetting) {
        // Fist held: ease back to the default view over one second.
        const t = Math.min(1, (now - resetting) / 1000), s = t * t * (3 - 2 * t);
        viewTarget.slerpQuaternions(resetFrom, new Quaternion(), s); viewTurn.copy(viewTarget);
        targetDistance = distance = resetDistance + (DEFAULT_DISTANCE - resetDistance) * s;
        if (t >= 1) resetting = 0;
      }
      viewTurn.slerp(viewTarget, 1 - Math.pow(0.85, dt * 60));
      // Showcase: only with no hand in view, no hand on the piece, after 5 quiet seconds, blending in over 1 s.
      const idle = !handSeen && !drag && now > quietUntil && !frozen && !pausedShowcase && !reduced.matches && !document.hidden;
      showcaseBlend = Math.max(0, Math.min(1, showcaseBlend + (idle ? dt : -1)));
      if (idle) showcase += dt * showcaseBlend * showcaseBlend * (3 - 2 * showcaseBlend);
      view.quaternion.copy(viewTurn).multiply(showcaseBlend > 0 ? new Quaternion().slerp(tumble(showcase), showcaseBlend) : new Quaternion());
      distance += (targetDistance - distance) * (1 - Math.pow(0.8, dt * 60));
      camera.position.set(0, 0, distance); camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    }
    const resize = () => { const r = host.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
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
  }, [model, category, wrist, profile, scanning]);

  async function finishScan(scan: ScanResult) {
    // Build the new hand first; only a successful build replaces the saved one.
    try {
      buildHand(scan.shape, skinMaterial(scan.tone)).mesh.geometry.dispose();
      saveProfile({ shape: scan.shape, tone: scan.tone, texture: scan.texture });
      setScanning(false); setNotice('Your hand is saved on this device.');
      return true;
    } catch { return false; }
  }
  async function takePhoto() {
    const blob = await api.current?.snap(); if (!blob) return;
    setPhoto(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
  }

  if (scanning) return <HandScan onDone={finishScan} onCancel={() => setScanning(false)} />;
  return <div className="flex flex-col text-white">
    <div ref={box} className="relative w-full" style={{ height: 'clamp(300px, 52svh, 640px)' }}>
      <canvas ref={canvasRef} className="block h-full w-full touch-none" aria-label={profile ? 'Your 3D hand wearing the piece' : 'A 3D hand wearing the piece'} />
      {(status || gesture) && <p role="status" className="pointer-events-none absolute inset-x-0 top-2 text-center text-xs drop-shadow">{status || gesture}</p>}
      <button type="button" className="ames-pill absolute bottom-2 left-2 rounded-full px-3 py-1 text-xs" aria-pressed={paused} onClick={() => setPaused(p => !p)}>{paused ? 'Play showcase' : 'Pause showcase'}</button>
    </div>
    <div className="flex flex-wrap items-center justify-center gap-3 py-2 text-xs">
      <button type="button" className="ames-pill rounded-full px-4 py-2" aria-pressed={tracking} onClick={() => setTracking(t => !t)}>{tracking ? 'Stop hand camera' : 'Move with my hand'}</button>
      <button type="button" className="ames-pill rounded-full px-4 py-2" onClick={() => void takePhoto()}>Take photo</button>
      {!wrist && <label className="flex items-center gap-2">Finger <select value={finger} onChange={e => setFinger(Number(e.target.value))}>{FINGERS.map((n, i) => <option key={n} value={i}>{n}</option>)}</select></label>}
      {onLiveCamera && <button type="button" className="underline" onClick={onLiveCamera}>Live camera view</button>}
    </div>
    {tracking && <p className="text-center text-xs">Pinch to zoom · point to turn · two fingers to tilt · open palm to freeze · hold a fist to reset.</p>}
    <section aria-label="Your hand" className="space-y-1 py-2 text-center text-xs">
      <p>{profile ? 'This is your hand, saved only on this device.' : 'Showing a standard hand. Scan yours to see the piece on your own hand; the photo stays on this device.'}</p>
      {confirmDelete
        ? <div role="group" aria-label="Confirm hand deletion"><p>Delete your saved hand, its measurements and photo, from this device?</p>
            <button type="button" className="min-h-10 px-2 underline" onClick={() => { try { deleteProfile(); setNotice('Saved hand deleted. Scan again any time.'); } catch { setNotice('Deletion failed. Try again.'); } setConfirmDelete(false); }}>Delete</button>
            <button type="button" autoFocus className="min-h-10 px-2 underline" onClick={() => setConfirmDelete(false)}>Cancel</button></div>
        : <div className="flex justify-center gap-4">
            <button type="button" className="min-h-10 underline" onClick={() => setScanning(true)}>{profile ? 'Re-scan my hand' : 'Scan my hand'}</button>
            {profile && <button type="button" className="min-h-10 underline" onClick={() => setConfirmDelete(true)}>Delete saved hand</button>}
          </div>}
      {notice && <p role="status">{notice}</p>}
    </section>
    {photo && <figure className="mx-auto w-full max-w-sm pb-2 text-center text-xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo} alt="Your try-on photo" className="w-full rounded-xl" />
      <figcaption className="flex justify-center gap-4 py-2"><a className="underline" href={photo} download="houseofames-try-on.png">Save photo</a>
        {typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" className="underline" onClick={() => { void fetch(photo).then(r => r.blob()).then(b => navigator.share({ files: [new File([b], 'houseofames-try-on.png', { type: 'image/png' })] })).catch(() => {}); }}>Share</button>}
        <button type="button" className="underline" onClick={() => setPhoto('')}>Discard</button></figcaption>
    </figure>}
  </div>;
}
