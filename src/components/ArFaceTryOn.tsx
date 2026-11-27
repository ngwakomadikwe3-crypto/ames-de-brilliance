'use client';
// HOUSEofAMES live face try-on: earrings and necklaces on the customer's real face from the front camera,
// rendered to look filmed by that camera (lib/ar/reality.ts): lit by the room, graded to the camera's look,
// and saved as a supersampled photo. Automatic: no markers, no setup.
//
// Per video frame: FaceLandmarker -> facial transformation matrix (head pose, cm, 63° camera) -> One Euro
// smoothing -> the head frame. The first ~24 near-frontal frames learn this customer's own ear lobes, chin and
// neck (face-anchor.ts); then the portrait's own hangEarrings / setNecklace put the piece on. Earrings swing on a
// damped pendulum under real gravity; a depth-only head and neck hide the far earring and the back of the chain.
import { useEffect, useRef, useState } from 'react';
import {
  AmbientLight, CylinderGeometry, DataTexture, LinearFilter, RedFormat, DirectionalLight, Group, Material, Matrix4, Mesh, MeshBasicMaterial, Object3D,
  PerspectiveCamera, PlaneGeometry, Quaternion, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Texture, Vector3,
  VideoTexture, WebGLRenderer, Euler,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { FaceLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';
import { faceTrackingAssets } from '../lib/hand-tracking-assets';
import { OneEuro } from '../lib/ar/one-euro';
import { dress } from '../lib/ar/jewel-dress';
import { estimateRoomLight, exposureFor } from '../lib/ar/room-light';
import { CameraEnvironment, RealityCompositor, drawRoom, easeLook, measureLook, supersampledPhoto } from '../lib/ar/reality';
import { FACE_FOV, FaceCalibration, Pendulum } from '../lib/ar/face-anchor';
import { realGems, stoneLight, type RealGems } from '../lib/ar/real-gems';
import { hangEarrings, setNecklace } from './PortraitTryOn';

type Props = { model: string; category: string; onUnavailable?: () => void };

const depthOnly = () => { const m = new MeshBasicMaterial(); m.colorWrite = false; return m; };
// The raw camera picture, unmirrored (the composite mirrors the whole frame like a selfie).
const videoMaterial = (map: Texture) => new ShaderMaterial({
  uniforms: { map: { value: map } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy*2.0,0.0,1.0); }',
  fragmentShader: 'varying vec2 vUv; uniform sampler2D map;\nvec3 lin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }\nvoid main(){ gl_FragColor=vec4(lin(texture2D(map,vUv).rgb),1.0); }',
  depthTest: false, depthWrite: false, toneMapped: false,
});

export default function ArFaceTryOn({ model, category, onUnavailable }: Props) {
  const host = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('Starting the camera…');
  const [tip, setTip] = useState('');
  const [aspect, setAspect] = useState(3 / 4);
  const [photo, setPhoto] = useState('');
  const snap = useRef<() => Promise<Blob | null>>(async () => null);
  const failed = useRef(onUnavailable);
  useEffect(() => { failed.current = onUnavailable; }, [onUnavailable]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  const necklace = category === 'necklace' || category === 'pendant';

  useEffect(() => {
    const canvas = canvasRef.current, box = host.current;
    if (!canvas || !box) return;
    let stopped = false, stream: MediaStream | undefined, tracker: FaceLandmarker | undefined, raf = 0, frameHandle = 0;
    const disposables: { dispose(): void }[] = [];
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.disablePictureInPicture = true;

    const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    disposables.push(renderer);
    const reality = new RealityCompositor(renderer); reality.mirror = true; disposables.push(reality);
    const scene = new Scene();
    const camera = new PerspectiveCamera(FACE_FOV, 3 / 4, 1, 5000);   // centimetres, as MediaPipe's face geometry
    const texture = new VideoTexture(video);   // raw camera values; the backdrop shader decodes them to linear
    disposables.push(texture);
    const backdrop = new Mesh(new PlaneGeometry(1, 1), videoMaterial(texture));
    backdrop.frustumCulled = false; backdrop.renderOrder = -10; scene.add(backdrop);
    disposables.push(backdrop.geometry, backdrop.material as Material);

    // Light from the room: a key from its bright side, a soft fill, and an HDR environment from the camera.
    const key = new DirectionalLight('#ffffff', 2); key.position.set(30, 60, 80); scene.add(key);
    const fill = new AmbientLight('#ffffff', 0.3); scene.add(fill);
    const environment = new CameraEnvironment(renderer); disposables.push(environment);
    const room = document.createElement('canvas'); room.width = 128; room.height = 64;
    const sample = document.createElement('canvas'); sample.width = 64; sample.height = 48;
    let lastRoom = -Infinity;
    function readRoom(now: number) {
      if (now - lastRoom < 700 || !video.videoWidth) return;
      lastRoom = now;
      const sc = sample.getContext('2d', { willReadFrequently: true }), rc = room.getContext('2d', { willReadFrequently: true });
      if (!sc || !rc) return;
      sc.save(); sc.scale(-1, 1); sc.drawImage(video, -sample.width, 0, sample.width, sample.height); sc.restore();
      const pixels = sc.getImageData(0, 0, sample.width, sample.height).data;
      const light = estimateRoomLight(pixels, sample.width, sample.height);
      reality.exposure = exposureFor(light.luminance);
      reality.look = easeLook(reality.look, measureLook(pixels, sample.width, sample.height), lastRoom > 0 ? 0.35 : 1);
      key.position.set(light.direction[0] * 80, 30 + light.direction[1] * 80, 70);
      key.color.setRGB(...light.colour); key.intensity = 1 + 2.2 * Math.sqrt(light.luminance); fill.color.copy(key.color);
      drawRoom(rc, video, room.width, room.height, false);   // the face scene is the unmirrored camera picture
      scene.environment = environment.update(rc.getImageData(0, 0, room.width, room.height).data);
    }

    // The head frame (cm, the matrix), its millimetre child (the anchors' units), and a body frame for the necklace.
    const head = new Group(); head.matrixAutoUpdate = false; head.visible = false; scene.add(head);
    const headMm = new Group(); headMm.scale.setScalar(0.1); head.add(headMm);
    const body = new Group(); body.visible = false; scene.add(body);
    const bodyMm = new Group(); bodyMm.scale.setScalar(0.1); body.add(bodyMm);
    const occluder = depthOnly(); disposables.push(occluder);

    // Hair in front of the ears: MediaPipe's selfie segmenter (hair = 1) on the live frame. Hair only hides an
    // earring when it also covers that ear's lobe (hair falling over the ear), never hair hanging behind it.
    let segmenter: ImageSegmenter | undefined, segFrame = 0;
    const coverSize = 256, coverData = new Uint8Array(coverSize * coverSize);
    const cover = new DataTexture(coverData, coverSize, coverSize, RedFormat); cover.magFilter = cover.minFilter = LinearFilter; disposables.push(cover);
    const lobeScreen = new Vector3();
    async function loadSegmenter() {
      try {
        let r = await fetch('/hand-tracking/segment-v1.tflite');
        if (!r.ok || r.headers.get('content-type')?.includes('text/html')) r = await fetch('/api/segment-model');
        if (!r.ok) return;
        const bytes = new Uint8Array(await r.arrayBuffer());
        const { ImageSegmenter, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const files = await FilesetResolver.forVisionTasks('/hand-tracking/wasm');
        if (stopped) return;
        segmenter = await ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetBuffer: bytes, delegate: 'GPU' }, runningMode: 'VIDEO', outputCategoryMask: true, outputConfidenceMasks: false });
        if (stopped) segmenter.close();
      } catch { /* no hair occlusion on this device; everything else works */ }
    }
    function updateCover(now: number) {
      if (!segmenter || !swings.length || (segFrame++ % (lowQuality ? 4 : 2))) return;
      segmenter.segmentForVideo(video, now, result => {
        const m = result.categoryMask; if (!m) return;
        const labels = m.getAsUint8Array(), mw = m.width, mh = m.height;
        coverData.fill(0);
        let any = false;
        for (const s of swings) {
          // the lobe on the (unmirrored) camera picture
          s.holder.getWorldPosition(lobeScreen).project(camera);
          const lx = (lobeScreen.x + 1) / 2, ly = (1 - lobeScreen.y) / 2;
          const at = (x: number, y: number) => labels[Math.min(mh - 1, Math.max(0, Math.round(y * mh))) * mw + Math.min(mw - 1, Math.max(0, Math.round(x * mw)))] === 1;
          let hair = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) hair += at(lx + dx * 0.006, ly + dy * 0.006) ? 1 : 0;
          if (hair < 13) continue;                                     // the lobe shows: the earring is in front of any hair
          any = true;
          // copy the hair around this earring (it hangs ~5 cm: a generous box below the lobe)
          const x0 = Math.max(0, Math.floor((lx - 0.08) * coverSize)), x1 = Math.min(coverSize - 1, Math.ceil((lx + 0.08) * coverSize));
          const y0 = Math.max(0, Math.floor((ly - 0.04) * coverSize)), y1 = Math.min(coverSize - 1, Math.ceil((ly + 0.22) * coverSize));
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (at(x / coverSize, y / coverSize)) coverData[y * coverSize + x] = 255;
        }
        m.close();
        cover.needsUpdate = true;
        reality.setCover(any ? cover : null);
      });
    }

    // Slower phones: measured, not guessed. A sustained frame time over ~45 ms drops multisampling and halves
    // the hair-mask rate; the look and the lighting stay.
    let lowQuality = false, frameMs = 33, lastFrameAt = 0;
    function adapt(now: number) {
      if (lastFrameAt) frameMs += ((now - lastFrameAt) - frameMs) * 0.05;
      lastFrameAt = now;
      if (!lowQuality && frameMs > 45) { lowQuality = true; reality.setLowQuality(true); renderer.setPixelRatio(1); resize(); }
    }
    const calibration = new FaceCalibration();
    const swings: { holder: Object3D; pivot: Group; pendulum: Pendulum }[] = [];
    let piece: Object3D | null = null, placed = false, neckPoint = new Vector3(), gems: RealGems | undefined, stones: { dispose(): void } | undefined;

    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(model, gltf => { if (stopped) return; piece = gltf.scene; piece.scale.setScalar(1000); dress(piece); }, undefined,
      () => { if (!stopped) setStatus('This piece could not be loaded for try-on.'); });

    function place() {
      if (!piece || placed || !calibration.ready) return;
      placed = true;
      const { bust, head: h, neckBase } = calibration.anchors();
      // depth-only stand-ins: the head (hides the far earring when you turn) and the neck (the back of the chain)
      const skull = new Mesh(new SphereGeometry(1, 40, 28), occluder); skull.position.set(...h.centre); skull.scale.set(...h.radii);
      skull.renderOrder = -1; headMm.add(skull); disposables.push(skull.geometry);
      const neck = new Mesh(new CylinderGeometry(1, 1, 1, 36), occluder);
      neck.position.set(bust.neck.centre[0], bust.neck.centre[1] - 40, bust.neck.centre[2]);
      neck.scale.set(bust.neck.half_width * 0.95, 190, bust.neck.half_depth * 0.95); neck.renderOrder = -1; disposables.push(neck.geometry);
      neckPoint = new Vector3(...bust.neck.centre);
      // the ear post goes through the lobe: on a real ear it is never seen from the front
      piece.traverse(o => { if (/^ear[ _]post|butterfly|ear[ _]back/i.test(o.name)) o.visible = false; });
      piece.updateMatrixWorld(true);
      if (necklace) {
        // The body frame sits at the base of the neck. The worn loop is laid on the slope of the shoulders and
        // chest (back high behind the neck, front low on the breastbone) rather than the bust's gentler tilt,
        // and the neck stand-in rises from there so the chain's back passes behind it.
        neckPoint = new Vector3(...neckBase);
        // sized to the base of the neck (wider than its middle: the chain rests on the shoulders' slope)
        const holder = setNecklace(piece, { ...bust, neck: { ...bust.neck, centre: [0, 0, 0], half_width: bust.neck.half_width * 0.98 } });
        holder.position.set(0, 4, 0); holder.rotation.x = -0.5;
        // the neck widens into the shoulders at its base: a flared stand-in, just inside the chain, hides the
        // chain where it curves round behind the neck
        neck.geometry.dispose(); neck.geometry = new CylinderGeometry(1, 1.22, 1, 36); disposables.push(neck.geometry);
        bodyMm.add(holder); bodyMm.add(neck);
        neck.position.set(0, 75, 0); neck.scale.set(bust.neck.half_width * 0.95, 150, bust.neck.half_depth * 1.05);
      } else {
        headMm.add(neck);
        for (const holder of hangEarrings(piece, bust)) {
          // in a selfie the camera is in front: show the earring's face, turned only a little toward the ear
          holder.rotation.y = Math.sign(holder.position.x) * 0.35;
          // a pivot at the stud so the earring can swing under gravity
          const pivot = new Group(); [...holder.children].forEach(c => pivot.add(c)); holder.add(pivot); headMm.add(holder);
          swings.push({ holder, pivot, pendulum: new Pendulum() });
        }
      }
      scene.traverse(o => { if ((o as Mesh).isMesh && o !== backdrop && (o as Mesh).material !== occluder) { o.renderOrder = 1; o.frustumCulled = false; } });
      // the stones: ray-traced like the Boutique's, lit by this room
      void stoneLight(renderer).then(light => { if (stopped || !piece) { light.dispose(); return; } stones = light; scene.updateMatrixWorld(true); gems = realGems(necklace ? bodyMm : headMm, light.environment, light.radiance, navigator.hardwareConcurrency <= 4 ? 16 : 40, light.metal); }).catch(() => {});
      setTip('Turn your head slowly. Take a photo when it looks right.');
    }

    // pose smoothing: position and rotation separately
    const poseFilter = new OneEuro(1.2, 0.012), M = new Matrix4(), P = new Vector3(), Q = new Quaternion(), S = new Vector3(1, 1, 1);
    const down = new Vector3(), inv = new Matrix4(), anchor = new Vector3(), yaw = new Euler(0, 0, 0, 'YXZ');
    let lastSeen = 0, lastTime = 0;

    function frame(now: number) {
      if (stopped || !video.videoWidth) return;
      readRoom(now);
      if (tracker) {
        const res = tracker.detectForVideo(video, now);
        const lm = res.faceLandmarks?.[0], mat = res.facialTransformationMatrixes?.[0]?.data;
        if (lm && mat) {
          lastSeen = now;
          if (!calibration.ready) {
            calibration.add(lm, mat, video.videoWidth / video.videoHeight);
            setTip(`Look at the camera… ${Math.round(calibration.progress * 100)}%`);
          }
          place();
          M.fromArray(mat as unknown as number[]); M.decompose(P, Q, S);
          const f = poseFilter.filter([P.x, P.y, P.z, Q.x, Q.y, Q.z, Q.w], now);
          Q.set(f[3], f[4], f[5], f[6]).normalize();
          head.matrix.compose(P.set(f[0], f[1], f[2]), Q, S.set(1, 1, 1));
          head.matrixWorldNeedsUpdate = true;
          // the necklace's body frame: at the neck, turning only part of the way with the head (the torso lags)
          if (placed && necklace) {
            anchor.copy(neckPoint).multiplyScalar(0.1).applyMatrix4(head.matrix);
            body.position.copy(anchor);
            yaw.setFromQuaternion(Q); body.rotation.set(0, yaw.y * 0.55, 0);
          }
        }
      }
      const visible = placed && now - lastSeen < 250;
      head.visible = visible; body.visible = visible && necklace;
      if (!tracker || lastSeen === 0) { if (tracker) setTip('Face the camera, in good light.'); }
      // earrings: each drop hangs toward the real floor and swings as the head moves
      const dt = lastTime ? (now - lastTime) / 1000 : 0; lastTime = now;
      if (visible && swings.length) {
        scene.updateMatrixWorld(true);
        for (const s of swings) {
          inv.copy(s.holder.matrixWorld).invert();
          down.set(0, -1, 0).transformDirection(inv);
          const target: [number, number] = [Math.atan2(-down.z, -down.y), Math.atan2(down.x, -down.y)];
          const at = s.holder.getWorldPosition(anchor);
          const [ax, az] = s.pendulum.step(target, [at.x, at.y, at.z], dt);
          s.pivot.rotation.set(ax, 0, az);
        }
      }
      updateCover(now);
      adapt(now);
      reality.render(scene, camera, [backdrop]);
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
    }
    const observer = new ResizeObserver(resize); observer.observe(box);

    function fail(error?: unknown) {
      if (stopped) return;
      console.warn('Live face try-on stopped:', error);
      const name = error instanceof Error ? error.name : '';
      setStatus(({ NotAllowedError: 'Camera access is blocked. Allow the camera for HOUSEofAMES in your browser, then try again.', NotFoundError: 'No camera was found on this device.', NotReadableError: 'The camera is busy. Close other camera apps and try again.' } as Record<string, string>)[name] ?? 'The live try-on is not available on this device.');
      failed.current?.();
    }

    snap.current = async () => {
      if (!video.videoWidth) return null;
      const w = video.videoWidth, h = video.videoHeight;
      return supersampledPhoto(renderer, camera, w, h, target => reality.render(scene, camera, [backdrop], [], target), 8);
    };

    async function start() {
      const assets = faceTrackingAssets(); void assets.catch(() => {});
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
      if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream; await video.play();
      const a = video.videoWidth / video.videoHeight || 3 / 4;
      setAspect(a); camera.aspect = a; camera.updateProjectionMatrix();
      resize(); schedule();
      setStatus('Loading face tracking…');
      const { FaceLandmarker, files, bytes } = await assets;
      if (stopped) return;
      tracker = await FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetBuffer: bytes.slice(), delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true });
      if (stopped) { tracker.close(); return; }
      setStatus(''); setTip('Face the camera, in good light.');
      void loadSegmenter();
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
      tracker?.close(); segmenter?.close(); gems?.dispose(); stones?.dispose();
      piece?.traverse(o => { const m = o as Mesh; if (m.isMesh) { m.geometry?.dispose(); [m.material].flat().forEach(x => (x as Material)?.dispose()); } });
      disposables.forEach(d => d.dispose());
    };
  }, [model, category, necklace]);

  async function takePhoto() {
    const blob = await snap.current();
    if (!blob) { setTip('Wait for the camera, then take the photo.'); return; }
    setPhoto(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
  }

  return <div className="flex h-full flex-col" data-ar-face>
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden" style={{ containerType: 'size', minHeight: 'clamp(260px,46svh,620px)' }}>
      <div ref={host} className="relative overflow-hidden rounded-2xl bg-black" style={{ width: `min(100cqw, ${aspect * 100}cqh)`, aspectRatio: aspect }}>
        <canvas ref={canvasRef} className="block h-full w-full" aria-label="Live try-on: your face with the selected piece" />
        {status && <p role="status" className="absolute inset-x-0 bottom-3 px-4 text-center text-sm text-white">{status}</p>}
        {!status && tip && <p aria-live="polite" className="pointer-events-none absolute inset-x-0 top-3 px-4 text-center text-xs text-white drop-shadow">{tip}</p>}
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-center gap-3 py-2 text-xs text-white">
      <button type="button" className="ames-pill min-h-11 rounded-full px-5" onClick={() => void takePhoto()}>Take photo</button>
    </div>
    {photo && <figure className="mx-auto w-full max-w-sm pb-2 text-center text-xs text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo} alt="Your try-on photo" className="w-full rounded-xl" />
      <figcaption className="flex justify-center gap-4 py-2"><a className="underline" href={photo} download="houseofames-try-on.jpg">Save photo</a><button type="button" className="underline" onClick={() => setPhoto('')}>Discard</button></figcaption>
    </figure>}
  </div>;
}
