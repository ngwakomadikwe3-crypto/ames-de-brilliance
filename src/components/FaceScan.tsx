'use client';
// The guided face scan for the portrait twin. Front-facing camera, an oval guide, five frames (front, each side,
// chin up, a natural smile) and an optional slow sweep. A frame is taken only when it passes every gate (sharp, even
// light, whole face, close enough, the step's angle confirmed by the landmarks) and is held for half a second;
// a rejected frame says why at once. Then every frame is fitted together, the twin is shown beside the photo, and
// nothing is saved until the customer confirms. "Your twin": a likeness from photos, not an exact scan.
import { useEffect, useRef, useState } from 'react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { faceTrackingAssets } from '../lib/hand-tracking-assets';
import { STEPS, checkFrame, headAngle, regionalTones, stubbleDensity, irisColour, photoColours, pack, type Lm, type Px, type Step } from '../lib/face-scan';
import { fromImage, type P3 } from '../lib/face-morph';
import { fitHead, fitExpression, irisScale, applyPose, type ScanFrame } from '../lib/portrait-fit';
import { loadPortraitHead, basisFor, bakeIdentity, meshPointsMm, anchoredPoints, eyeCentres, measureSpectacles } from '../lib/portrait-head';
import { sampleHairColor } from '../lib/portrait-grooming';
import type { FaceIdentity } from '../lib/twin-profile';

type Shot = { step: Step | 'sweep'; l: Lm[]; px: Px; photo?: string };
const STABLE = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 33, 133, 263, 362, 234, 454, 127, 356];

export default function FaceScan({ onDone, onCancel }: { onDone: (face: FaceIdentity, photo: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null), work = useRef<HTMLCanvasElement | null>(null);
  const [stepIx, setStepIx] = useState(0), [hint, setHint] = useState('Starting the camera…'), [phase, setPhase] = useState<'capture' | 'sweep-offer' | 'sweep' | 'fitting' | 'error'>('capture');
  const [progress, setProgress] = useState(0);
  const shots = useRef<Shot[]>([]), state = useRef({ stepIx: 0, phase: 'capture' as string, held: 0, sweepUntil: 0 });
  useEffect(() => { state.current.stepIx = stepIx; state.current.phase = phase; }, [stepIx, phase]);

  useEffect(() => {
    let stopped = false, raf = 0, tracker: FaceLandmarker | undefined, stream: MediaStream | undefined;
    (async () => {
      try {
        const assets = faceTrackingAssets();
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } } });
        const v = video.current!; v.srcObject = stream; await v.play();
        const { FaceLandmarker, files, bytes } = await assets;
        tracker = await FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetBuffer: bytes.slice(), delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1 });
        if (stopped) return;
        setHint(STEPS[0].tip);
        const loop = () => {
          raf = requestAnimationFrame(loop);
          if (!tracker || v.readyState < 2) return;
          const st = state.current; if (st.phase !== 'capture' && st.phase !== 'sweep') return;
          const res = tracker.detectForVideo(v, performance.now()), l = (res.faceLandmarks?.[0] ?? null) as Lm[] | null;
          const c = (work.current ??= document.createElement('canvas')), w = 480, h = Math.round(480 * v.videoHeight / v.videoWidth);
          c.width = w; c.height = h; const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(v, 0, 0, w, h);
          const px = ctx.getImageData(0, 0, w, h) as unknown as Px;
          if (st.phase === 'sweep') {
            if (performance.now() > st.sweepUntil) { setPhase('fitting'); return; }
            const g = checkFrame('side-a', px, l);
            const turn = l ? headAngle(l).turn : 0;
            if (l && (g.ok || g.reason === 'Turn a little further.' || g.reason === 'One side of your face is in shadow: turn toward the light.') && g.sharpness >= 45
              && !shots.current.some(s => s.step === 'sweep' && Math.abs(headAngle(s.l).turn - turn) < 0.06) && shots.current.filter(s => s.step === 'sweep').length < 10)
              shots.current.push({ step: 'sweep', l: l.map(p => ({ ...p })), px: snapshot(v) });
            return;
          }
          const step = STEPS[st.stepIx].id;
          const front = shots.current.find(s => s.step === 'front')?.l, sideA = shots.current.find(s => s.step === 'side-a')?.l;
          const g = checkFrame(step, px, l, step === 'front' ? undefined : front, sideA);
          if (!g.ok) { st.held = 0; setHint(g.reason ?? STEPS[st.stepIx].tip); setProgress(0); return; }
          st.held++; setProgress(Math.min(1, st.held / 14)); setHint('Hold still…');
          if (st.held >= 14 && l) {                                             // about half a second, steady
            const snap = snapshot(v);
            shots.current = shots.current.filter(s => s.step !== step).concat({ step, l: l.map(p => ({ ...p })), px: snap, photo: step === 'front' ? photoOf(v) : undefined });
            st.held = 0; setProgress(0);
            if (st.stepIx + 1 < STEPS.length) { setStepIx(st.stepIx + 1); setHint(STEPS[st.stepIx + 1].tip); }
            else setPhase('sweep-offer');
          }
        };
        loop();
      } catch { setPhase('error'); setHint('The camera or face tracking is not available on this device.'); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); tracker?.close(); stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  useEffect(() => {
    if (phase !== 'fitting') return;
    let cancelled = false;
    (async () => {
      try {
        setHint('Building your twin from every photo…');
        const face = await fitTwin(shots.current);
        if (!cancelled) onDone(face, shots.current.find(s => s.step === 'front')!.photo!);
      } catch { if (!cancelled) { setPhase('error'); setHint('Your twin could not be built from these photos. Please try again in even light.'); } }
    })();
    return () => { cancelled = true; };
  }, [phase, onDone]);

  const step = STEPS[stepIx];
  const turn = step.id === 'side-a' ? -18 : step.id === 'side-b' ? 18 : 0;
  return <div className="fixed inset-0 z-[90] flex flex-col bg-[#062a21] text-white" role="dialog" aria-modal="true" aria-label="Face scan" data-face-scan>
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <g transform={`rotate(${turn} 50 66)`}>
          <ellipse cx="50" cy="66" rx={turn ? 24 : 28} ry="38" fill="none" stroke="#ffffff" strokeWidth="0.8" strokeDasharray={progress ? `${progress * 210} 400` : '3 2'} />
          {!turn && <line x1="30" x2="70" y1="56" y2="56" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="0.4" />}
        </g>
      </svg>
      <button type="button" onClick={onCancel} aria-label="Close the scan" className="absolute left-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#0c3b2e] shadow-lg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      <p className="absolute inset-x-0 top-4 text-center text-xs">{phase === 'capture' ? `${stepIx + 1} of ${STEPS.length}` : ''}</p>
    </div>
    <div className="space-y-3 p-5 pb-7">
      {phase === 'capture' && <p style={{ fontFamily: 'var(--font-satoshi)', fontSize: 18 }}>{step.title}</p>}
      <p className="text-sm" role="status" aria-live="polite">{hint}</p>
      {phase === 'sweep-offer' && <div className="flex flex-wrap gap-3">
        <button type="button" className="min-h-11 rounded-full bg-white px-5 font-medium text-[#0c3b2e]" onClick={() => { state.current.sweepUntil = performance.now() + 7000; setPhase('sweep'); setHint('Turn your head slowly from one side to the other…'); }}>Add a slow sweep (better likeness)</button>
        <button type="button" className="min-h-11 px-2 text-sm underline" onClick={() => setPhase('fitting')}>Build my twin now</button>
      </div>}
      <p className="text-[11px] opacity-80">Your twin is a likeness built from your photos, not an exact 3D scan. Everything stays on this device.</p>
    </div>
  </div>;
}

function snapshot(v: HTMLVideoElement): Px {
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(v, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height) as unknown as Px;
}
function photoOf(v: HTMLVideoElement) {
  const c = document.createElement('canvas'), w = 640, h = Math.round(640 * v.videoHeight / v.videoWidth); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!; ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(v, 0, 0, w, h); return c.toDataURL('image/jpeg', 0.8);
}

/** Fit the parametric head to every frame and measure everything the twin keeps. */
export async function fitTwin(shots: Shot[]): Promise<FaceIdentity> {
  const H = await loadPortraitHead();
  const basis = basisFor(H.skin, H.head, H.anchors, H.meta.identity);
  const frame = (s: Shot): ScanFrame => ({ kind: s.step === 'side-a' ? 'left' : s.step === 'side-b' ? 'right' : s.step === 'sweep' ? 'sweep' : s.step, points: s.l.map(p => fromImage(p, s.px.width, s.px.height)) });
  const frames = shots.map(frame), fit = fitHead(basis, frames);
  const weights = Object.fromEntries(H.meta.identity.map((n, i) => [n, fit.weights[i]]));
  // the customer's own smile: expression mix on the smile frame, identity fixed
  const smileShot = shots.find(s => s.step === 'smile');
  let smile: Record<string, number> | undefined;
  if (smileShot) {
    const E = basisFor(H.skin, H.head, H.anchors, H.meta.expressions.filter(n => /smile|cheeks|part|open|squint/.test(n)));
    const w = fitExpression(fit.landmarks, E, frame(smileShot), STABLE);
    smile = Object.fromEntries(E.names.map((n, i) => [n, Math.round(w[i] * 100) / 100]).filter(([, v]) => (v as number) > 0.02));
  }
  // bake to measure: spectacles (scaled by the irises), photo colours
  bakeIdentity(H.head, weights);
  const pts = meshPointsMm(H.skin, H.head), lm = anchoredPoints(pts, H.anchors), eyes = eyeCentres(H.parts, H.head);
  const frontShot = shots.find(s => s.step === 'front')!, front = frame(frontShot);
  const mmPerPx = irisScale(front);
  const pdPx = Math.hypot(front.points[468][0] - front.points[473][0], front.points[468][1] - front.points[473][1]);
  const spectacles = measureSpectacles(pts, lm, eyes, mmPerPx ? pdPx * mmPerPx : undefined);
  const pose = fit.poses[shots.indexOf(frontShot)];
  const nrm = H.skin.geometry.getAttribute('normal'), normals: P3[] = [];
  for (let i = 0; i < nrm.count; i++) normals.push([nrm.getX(i), nrm.getY(i), nrm.getZ(i)]);
  const toCam: P3 = [pose.R[2][0], pose.R[2][1], pose.R[2][2]];
  const photo = photoColours(frontShot.px, pts, normals, p => { const q = applyPose(pose, p); return [q[0] / frontShot.px.width, -q[1] / frontShot.px.height]; }, toCam);
  return {
    weights, smile, spectacles, tones: regionalTones(frontShot.px, frontShot.l), hairColor: sampleHairColor(frontShot.px, frontShot.l), hairStyle: 'medium',
    stubble: stubbleDensity(frontShot.px, frontShot.l), irisColor: irisColour(frontShot.px, frontShot.l), photo: pack(photo), savedAt: Date.now(),
  };
}
