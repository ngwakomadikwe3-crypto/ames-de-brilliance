'use client';
// HOUSEofAMES live try-on: the customer's real hand from the front camera, with the selected ring, watch or
// bracelet rendered onto it in 3D. The camera picture and the jewellery are drawn in one WebGL pass, from the
// same video frame the hand was detected in, so they never drift apart. Invisible depth-only stand-ins for the
// wrist, palm and fingers hide the far side of a band behind the hand at every angle.
//
// Per frame (once per decoded video frame): detect -> mirror -> One Euro smoothing -> metric 3D lift ->
// wrist / finger frame -> pose filter -> transforms written straight into three.js objects -> render.
// No React state changes while tracking; React only renders the controls around the canvas.
import { useEffect, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping, AmbientLight, BufferGeometry, CylinderGeometry, DirectionalLight, DoubleSide, Group, Material, Matrix4, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Quaternion, Scene, ShaderMaterial, SRGBColorSpace, Texture, Vector3, VideoTexture, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { trackingAssets } from '../lib/hand-tracking-assets';
import { OneEuro } from '../lib/ar/one-euro';
import { TrackingGate, plausibleStep } from '../lib/ar/tracking-gate';
import { PinchZoom } from '../lib/ar/pinch-zoom';
import { cameraFor, liftHand, DorsalSide, wristFrame, fingerFrame, length, sub, normalize, orthogonal, cross, lerp, type V3 } from '../lib/ar/hand-pose';
import { fitLoop, type LoopFit } from '../lib/ar/model-fit';
import { estimateRoomLight, exposureFor } from '../lib/ar/room-light';
import { CameraEnvironment, RealityCompositor, drawRoom, easeLook, measureLook, supersampledPhoto } from '../lib/ar/reality';
import { dress } from '../lib/ar/jewel-dress';
import { classifyPose } from '../lib/gesture-controller';
import { SENSITIVITY } from '../lib/view-gesture';
import type { HandFit } from '../lib/fitting-hand';

type Props = { model: string; category: string; fit?: HandFit | null; onUnavailable?: () => void };
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];

// --- materials -----------------------------------------------------------------------------------------------------
const depthOnly = () => { const m = new MeshBasicMaterial(); m.colorWrite = false; return m; };

const videoMaterial = (map: Texture) => new ShaderMaterial({
  uniforms: { map: { value: map }, zoom: { value: 1 } },
  vertexShader: 'varying vec2 vUv; uniform float zoom; void main(){ vUv=vec2(1.0-uv.x,uv.y); gl_Position=vec4(position.xy*2.0*zoom,0.0,1.0); }',
  fragmentShader: 'varying vec2 vUv; uniform sampler2D map;\nvec3 lin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }\nvoid main(){ gl_FragColor=vec4(lin(texture2D(map,vUv).rgb),1.0); }',
  depthTest: false, depthWrite: false, toneMapped: false,
});

// A soft dark band on the skin either side of the metal; strongest at the middle of the band.
const contactShadow = () => new ShaderMaterial({
  uniforms: { strength: { value: 0.32 } },
  vertexShader: 'varying float v; void main(){ v=uv.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'varying float v; uniform float strength; void main(){ float d=(v-0.5)/0.3; gl_FragColor=vec4(0.0,0.0,0.0,strength*exp(-d*d)); }',
  transparent: true, depthWrite: false, side: DoubleSide,
});

// --- component -----------------------------------------------------------------------------------------------------
export default function ArTryOn({ model, category, fit, onUnavailable }: Props) {
  const host = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('Starting the camera…');
  const [aspect, setAspect] = useState(3 / 4);
  const [finger, setFinger] = useState(3);
  const [photo, setPhoto] = useState('');
  const [tip, setTip] = useState('');
  const snap = useRef<() => Promise<Blob | null>>(async () => null);
  const fingerRef = useRef(finger), failed = useRef(onUnavailable);
  useEffect(() => { fingerRef.current = finger; failed.current = onUnavailable; }, [finger, onUnavailable]);
  const wrist = category === 'watch' || category === 'bracelet';

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  useEffect(() => {
    const canvas = canvasRef.current, box = host.current;
    if (!canvas || !box) return;
    let stopped = false, stream: MediaStream | undefined, tracker: HandLandmarker | undefined, raf = 0, frameHandle = 0;
    const disposables: { dispose(): void }[] = [];
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.disablePictureInPicture = true;

    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    disposables.push(renderer);
    // Camera-accurate compositing (reality.ts): the jewellery graded to this camera's look, lit by the room in HDR.
    const reality = new RealityCompositor(renderer); disposables.push(reality);
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 3 / 4, 0.01, 10);
    const texture = new VideoTexture(video);   // raw camera values; the backdrop shader decodes them to linear
    disposables.push(texture);
    const backdrop = new Mesh(new PlaneGeometry(1, 1), videoMaterial(texture));
    backdrop.frustumCulled = false; backdrop.renderOrder = -10; scene.add(backdrop);
    disposables.push(backdrop.geometry, backdrop.material as Material);

    // Light: a key from the bright side of the room, soft fill, and reflections made from the camera picture.
    const key = new DirectionalLight('#ffffff', 2.2); key.position.set(0.4, 0.8, 0.6); scene.add(key);
    const fill = new AmbientLight('#ffffff', 0.35); scene.add(fill);
    const environment = new CameraEnvironment(renderer); disposables.push(environment);
    const roomCanvas = document.createElement('canvas'); roomCanvas.width = 128; roomCanvas.height = 64;
    const sampleCanvas = document.createElement('canvas'); sampleCanvas.width = 64; sampleCanvas.height = 48;
    let lastRoom = -Infinity, luminance = 0.2, looked = false;
    function readRoom(now: number) {
      if (now - lastRoom < 1000 || !video.videoWidth) return;
      lastRoom = now;
      const sc = sampleCanvas.getContext('2d', { willReadFrequently: true }), rc = roomCanvas.getContext('2d', { willReadFrequently: true });
      if (!sc || !rc) return;
      sc.save(); sc.scale(-1, 1); sc.drawImage(video, -sampleCanvas.width, 0, sampleCanvas.width, sampleCanvas.height); sc.restore();
      const pixels = sc.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
      const light = estimateRoomLight(pixels, sampleCanvas.width, sampleCanvas.height);
      luminance = light.luminance;
      reality.exposure = exposureFor(luminance);
      reality.look = easeLook(reality.look, measureLook(pixels, sampleCanvas.width, sampleCanvas.height), looked ? 0.35 : 1); looked = true;
      key.position.set(light.direction[0] * 1.2, 0.4 + light.direction[1] * 1.2, 0.8);
      key.color.setRGB(light.colour[0], light.colour[1], light.colour[2]);
      key.intensity = 1.2 + 2.4 * Math.sqrt(luminance);
      fill.color.copy(key.color);
      // The room as the jewellery sees it, in HDR: the camera picture all round, its highlights restored.
      drawRoom(rc, video, roomCanvas.width, roomCanvas.height, true);
      scene.environment = environment.update(rc.getImageData(0, 0, roomCanvas.width, roomCanvas.height).data);
      shadowMaterials.forEach(m => (m.uniforms.strength.value = 0.18 + 0.22 * Math.min(1, luminance * 3)));
    }

    // The worn piece and its stand-ins.
    const worn = new Group(); worn.matrixAutoUpdate = false; worn.visible = false; scene.add(worn);
    const holder = new Group(); holder.matrixAutoUpdate = false; worn.add(holder);
    const occluders = new Group(); occluders.visible = false; scene.add(occluders);
    const proxyMaterial = depthOnly(); disposables.push(proxyMaterial);
    const unit = new CylinderGeometry(1, 1, 1, 40, 1, false); disposables.push(unit);
    const proxy = () => { const m = new Mesh(unit, proxyMaterial); m.renderOrder = -1; m.matrixAutoUpdate = false; occluders.add(m); return m; };
    const forearm = proxy(), palmProxy = proxy();
    const digits = Array.from({ length: 15 }, proxy);
    const shadowMaterials: ShaderMaterial[] = [];
    const shadowGeometry = new CylinderGeometry(1, 1, 1, 48, 1, true); disposables.push(shadowGeometry);
    const shadowMaterial = contactShadow(); shadowMaterials.push(shadowMaterial); disposables.push(shadowMaterial);
    const shadow = new Mesh(shadowGeometry, shadowMaterial); shadow.renderOrder = 0; shadow.matrixAutoUpdate = false; scene.add(shadow); shadow.visible = false;

    let loop: LoopFit | null = null;
    let piece: Object3D | null = null;
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(model, gltf => {
      if (stopped) return;
      piece = gltf.scene;
      dress(piece);
      piece.updateMatrixWorld(true);
      const find = (test: (o: Object3D) => boolean) => { let hit: Object3D | undefined; piece!.traverse(o => { if (!hit && test(o)) hit = o; }); return hit; };
      const head = find(o => o.name.replace(/_/g, ' ') === 'Watch head'), clasp = find(o => o.userData?.ames_link === 0);
      const at = (o?: Object3D) => o ? o.getWorldPosition(new Vector3()) : undefined;
      loop = fitLoop(piece, head ? { up: at(head) } : clasp && !wrist ? undefined : clasp ? { down: at(clasp) } : undefined);
      holder.add(piece);
      piece.traverse(o => { if ((o as Mesh).isMesh) { o.renderOrder = 1; o.frustumCulled = false; } });
    }, undefined, () => { if (!stopped) setStatus('This piece could not be loaded for try-on.'); });

    // --- pose filtering ---------------------------------------------------------------------------------------------
    const imageFilter = new OneEuro(1.1, 18), worldFilter = new OneEuro(1.1, 4), poseFilter = new OneEuro(1.4, 2.5);
    const gate = new TrackingGate(), dorsalSide = new DorsalSide(), pinch = new PinchZoom(SENSITIVITY);
    let previous: { x: number; y: number; size: number } | null = null, lastTime = 0, shown = false;
    const B = new Matrix4(), S = new Matrix4(), A = new Matrix4(), T = new Matrix4(), M = new Matrix4();
    const vSide = new Vector3(), vAxis = new Vector3(), vUp = new Vector3(), yAxis = new Vector3(0, 1, 0), q = new Quaternion();
    const setBasis = (m: Matrix4, side: V3, axis: V3, up: V3) => m.makeBasis(vSide.fromArray(side), vAxis.fromArray(axis), vUp.fromArray(up));
    const placeCylinder = (mesh: Mesh, a: V3, b: V3, rx: number, rz = rx) => {
      const d = sub(b, a), len = length(d); if (len < 1e-5) { mesh.visible = false; return; }
      mesh.visible = true;
      q.setFromUnitVectors(yAxis, vAxis.fromArray(normalize(d)));
      mesh.matrix.compose(vSide.fromArray(lerp(a, b, 0.5)), q, vUp.set(rx, len, rz));
    };

    function pose(points: V3[], handedness: number, now: number) {
      const dorsal = dorsalSide.update(points, handedness);
      const palm = length(sub(points[5], points[17]));
      // Stand-ins: palm and every finger bone, slightly inside the skin.
      const ratios = fit?.outline?.digits ?? [0.25, 0.21, 0.22, 0.21, 0.18];
      for (let d = 0; d < 5; d++) for (let k = 0; k < 3; k++) {
        const i = 1 + 4 * d + k;
        placeCylinder(digits[d * 3 + k], points[i], points[i + 1], ratios[d] * palm * 0.47 * (1 - 0.08 * k));
      }
      const w = wristFrame(points, dorsal, fit?.outline?.wrist ?? 0.74);
      const raw = wrist
        ? [...w.origin, ...w.axis, ...w.up, w.halfWidth, w.halfDepth]
        : (() => { const r = fingerFrame(points, dorsal, fingerRef.current, fit?.outline?.digits?.[fingerRef.current]); return [...r.origin, ...r.axis, ...r.up, r.radius, r.radius]; })();
      const f = poseFilter.filter(raw, now);
      const origin = f.slice(0, 3) as V3, axis = normalize(f.slice(3, 6) as V3), up = orthogonal(f.slice(6, 9) as V3, axis), side = normalize(cross(axis, up));
      const [ra, rb] = [f[9], f[10]];
      // Palm stand-in: a flattened cylinder from the wrist to the knuckles.
      setBasis(B, w.side, w.axis, w.up);
      palmProxy.matrix.copy(T.makeTranslation(...lerp(points[0], points[9], 0.5))).multiply(B).multiply(S.makeScale(palm * 0.5, length(sub(points[9], points[0])) * 0.95, palm * 0.14));
      forearm.visible = wrist;
      if (wrist) forearm.matrix.copy(T.makeTranslation(...lerp(w.origin, sub(w.origin, [w.axis[0] * palm, w.axis[1] * palm, w.axis[2] * palm]), 0.35)))
        .multiply(B).multiply(S.makeScale(w.halfWidth * 0.97, palm * 1.3, w.halfDepth * 0.97));
      if (!loop) return;
      // Fit the piece's bore to the wrist ellipse / finger, keeping the band's own proportions.
      let sSide = ra / loop.innerSide, sUp = rb / loop.innerUp;
      if (!wrist) sSide = sUp = (sSide + sUp) / 2;
      else { const g = Math.sqrt(sSide * sUp), k = Math.min(1.3, Math.max(0.78, sSide / sUp)); sSide = g * Math.sqrt(k); sUp = g / Math.sqrt(k); }
      const sAxis = Math.sqrt(sSide * sUp);
      A.makeBasis(loop.side, loop.axis, loop.up).transpose().multiply(M.makeTranslation(-loop.centre.x, -loop.centre.y, -loop.centre.z));
      setBasis(B, side, axis, up);
      holder.matrix.copy(T.makeTranslation(...origin)).multiply(B).multiply(S.makeScale(sSide * 1.015, sAxis, sUp * 1.015)).multiply(A);
      worn.matrix.identity();
      // Contact shade: a little wider than the band where it meets the skin (a watch case is longer than its strap).
      const band = Math.min(loop.width * sAxis, (wrist ? 0.32 : 0.12) * palm);
      shadow.matrix.copy(T.makeTranslation(...origin)).multiply(B).multiply(S.makeScale(ra * 1.02, band * 1.6, rb * 1.02));
    }

    function frame(now: number) {
      if (stopped || !video.videoWidth) return;
      if (!tracker) { readRoom(now); reality.render(scene, camera, [backdrop], [shadow]); return; }   // the customer sees themselves while tracking loads
      const result = tracker.detectForVideo(video, now);                  // once per decoded video frame
      const image = result.landmarks?.[0], world = result.worldLandmarks?.[0];
      const label = result.handedness?.[0]?.[0];
      const cam = cameraFor(video.videoWidth, video.videoHeight);
      let confident = !!image && image.length === 21 && !!world && world.length === 21 && (label?.score ?? 1) >= 0.6;
      if (confident && image) {
        const span = Math.hypot((image[5].x - image[17].x) * cam.width, (image[5].y - image[17].y) * cam.height) / cam.width;
        const next = { x: image[0].x, y: image[0].y, size: span };
        confident = span > 0.035 && plausibleStep(previous, next, now - lastTime);
        previous = next;
      } else previous = null;
      lastTime = now;
      const state = gate.update(confident, now);
      if (state === 'tracking' && image && world) {
        const img = imageFilter.filter(image.flatMap(p => [p.x, p.y, p.z]), now), wld = worldFilter.filter(world.flatMap(p => [p.x, p.y, p.z]), now);
        const unpack = (a: number[]) => Array.from({ length: 21 }, (_, i) => ({ x: a[3 * i], y: a[3 * i + 1], z: a[3 * i + 2] }));
        const lifted = liftHand(unpack(img), unpack(wld), cam);
        if (lifted) {
          // MediaPipe labels assume a mirrored input; on the raw frame "Left" is the customer's right hand.
          pose(lifted.points, label?.categoryName === 'Left' ? 1 : -1, now);
          const palm = length(sub(lifted.points[5], lifted.points[17]));
          const hand = lifted.points.map(p => ({ x: p[0], y: p[1], z: p[2] }));
          const z = pinch.step(classifyPose(hand, pinch.zoom > 1) === 'pinch', length(sub(lifted.points[4], lifted.points[8])) / palm, now);
          camera.zoom = z.zoom; camera.updateProjectionMatrix(); (backdrop.material as ShaderMaterial).uniforms.zoom.value = z.zoom;
        }
      } else if (state === 'hidden') {
        imageFilter.reset(); worldFilter.reset(); poseFilter.reset(); dorsalSide.reset();
        pinch.step(false, 0, now);
      }
      const visible = state !== 'hidden' && !!loop;
      worn.visible = occluders.visible = shadow.visible = visible;
      if (visible !== shown) { shown = visible; setTip(visible ? 'Pinch to zoom. Take a photo when it looks right.' : wrist ? 'Show the back of your hand and your wrist.' : 'Show the back of your hand, fingers slightly apart.'); }
      readRoom(now);
      reality.render(scene, camera, [backdrop], [shadow]);
    }

    function schedule() {
      if (stopped) return;
      const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number) => void) => number };
      if (v.requestVideoFrameCallback) frameHandle = v.requestVideoFrameCallback(now => { try { frame(now); } catch (e) { fail(e); return; } schedule(); });
      else {
        let lastVideoTime = -1;
        const tick = (now: number) => { if (stopped) return; if (video.currentTime !== lastVideoTime) { lastVideoTime = video.currentTime; try { frame(now); } catch (e) { fail(e); return; } } raf = requestAnimationFrame(tick); };
        raf = requestAnimationFrame(tick);
      }
    }

    function resize() {
      const r = box!.getBoundingClientRect();
      if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize); observer.observe(box);

    function fail(error?: unknown) {
      if (stopped) return;
      console.warn('Live try-on stopped:', error);
      const name = error instanceof Error ? error.name : '';
      setStatus(({ NotAllowedError: 'Camera access is blocked. Allow the camera for HOUSEofAMES in your browser, then try again.', NotFoundError: 'No camera was found on this device.', NotReadableError: 'The camera is busy. Close other camera apps and try again.' } as Record<string, string>)[name] ?? 'Live try-on could not start on this device.');
      failed.current?.();
    }

    snap.current = async () => {
      if (!video.videoWidth) return null;
      // the camera's full resolution, supersampled (reality.ts)
      const w = video.videoWidth, h = video.videoHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      const blob = await supersampledPhoto(renderer, camera, w, h, target => reality.render(scene, camera, [backdrop], [shadow], target), 8);
      resize();
      return blob;
    };

    async function start() {
      const assets = trackingAssets(); void assets.catch(() => {});
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
      if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream; await video.play();
      setAspect(video.videoWidth / video.videoHeight || 3 / 4);
      const cam = cameraFor(video.videoWidth, video.videoHeight);
      camera.fov = 2 * Math.atan(cam.height / 2 / cam.focal) * 180 / Math.PI; camera.updateProjectionMatrix();
      resize(); schedule();
      setStatus('Loading hand tracking…');
      const { HandLandmarker, files, bytes } = await assets;
      if (stopped) return;
      tracker = await HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetBuffer: bytes.slice(), delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6 });
      if (stopped) { tracker.close(); return; }
      setStatus(''); setTip(wrist ? 'Show the back of your hand and your wrist.' : 'Show the back of your hand, fingers slightly apart.');
    }
    void start().catch(fail);
    const visibility = () => { if (document.hidden) video.pause(); else void video.play().catch(() => {}); };
    document.addEventListener('visibilitychange', visibility);

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', visibility);
      observer.disconnect(); cancelAnimationFrame(raf);
      const v = video as HTMLVideoElement & { cancelVideoFrameCallback?: (h: number) => void };
      if (frameHandle) v.cancelVideoFrameCallback?.(frameHandle);
      stream?.getTracks().forEach(t => t.stop()); video.srcObject = null;
      tracker?.close();
      piece?.traverse(o => { const m = o as Mesh; if (m.isMesh) { (m.geometry as BufferGeometry)?.dispose(); [m.material].flat().forEach(x => (x as Material)?.dispose()); } });
      disposables.forEach(d => d.dispose());
    };
  }, [model, category, wrist, fit]);

  async function takePhoto() {
    const blob = await snap.current();
    if (!blob) { setTip('Wait for the camera, then take the photo.'); return; }
    setPhoto(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
  }

  return <div className="flex h-full flex-col" data-ar-hand>
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden" style={{ containerType: 'size', minHeight: 'clamp(260px,46svh,620px)' }}>
      <div ref={host} className="relative overflow-hidden rounded-2xl bg-black" style={{ width: `min(100cqw, ${aspect * 100}cqh)`, aspectRatio: aspect }}>
        <canvas ref={canvasRef} className="block h-full w-full" aria-label="Live try-on: your hand with the selected piece" />
        {status && <p role="status" className="absolute inset-x-0 bottom-3 px-4 text-center text-sm text-white">{status}</p>}
        {!status && tip && <p aria-live="polite" className="pointer-events-none absolute inset-x-0 top-3 px-4 text-center text-xs text-white drop-shadow">{tip}</p>}
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-center gap-3 py-2 text-xs text-white">
      <button type="button" className="ames-pill rounded-full px-4 py-2" onClick={() => void takePhoto()}>Take photo</button>
      {!wrist && <label className="flex items-center gap-2">Finger <select value={finger} onChange={e => setFinger(Number(e.target.value))}>{FINGERS.map((n, i) => <option key={n} value={i}>{n}</option>)}</select></label>}
    </div>
    {photo && <figure className="mx-auto w-full max-w-sm pb-2 text-center text-xs text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo} alt="Your try-on photo" className="w-full rounded-xl" />
      <figcaption className="flex justify-center gap-4 py-2"><a className="underline" href={photo} download="houseofames-try-on.jpg">Save photo</a><button type="button" className="underline" onClick={() => setPhoto('')}>Discard</button></figcaption>
    </figure>}
  </div>;
}
