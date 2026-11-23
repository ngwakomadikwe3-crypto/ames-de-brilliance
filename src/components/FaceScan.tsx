'use client';
// The guided face scan for the portrait twin. Front-facing camera, an oval guide and three required frames: straight
// ahead, about 45 degrees to one side, about 45 degrees to the other; then, optionally, chin up and a natural smile
// (which teaches the twin the customer's own smile) or a slow sweep. A frame is taken only when it passes every gate
// (sharp, not too dark or bright, even light, whole face, close enough, the step's angle confirmed by the landmarks)
// and is held for half a second; a rejected frame says why at once. Then every frame is fitted together
// (twin-build.ts), the twin is shown beside the photo, and nothing is saved until the customer confirms.
import { useEffect, useRef, useState } from 'react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { faceTrackingAssets } from '../lib/hand-tracking-assets';
import { STEPS, REQUIRED_STEPS, checkFrame, headAngle, type Lm, type Px } from '../lib/face-scan';
import { buildTwin, type Shot } from '../lib/twin-build';
import type { FaceIdentity } from '../lib/twin-profile';
import { TextureCapture, clippedFraction } from '../lib/texture-capture';
import { flag } from '../lib/twin-flags';

export default function FaceScan({ onDone, onCancel }: { onDone: (face: FaceIdentity, photo: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null), work = useRef<HTMLCanvasElement | null>(null);
  const [stepIx, setStepIx] = useState(0), [hint, setHint] = useState('Starting the camera…'), [phase, setPhase] = useState<'capture' | 'sweep-offer' | 'sweep' | 'turn' | 'fitting' | 'error'>('capture');
  const [progress, setProgress] = useState(0);
  const shots = useRef<Shot[]>([]), state = useRef({ stepIx: 0, phase: 'capture' as string, held: 0, sweepUntil: 0, turnUntil: 0 });
  // System 2 (flag 'skin-v2'): after the three photos, a slow guided head turn of 10-15 frames for the skin texture
  const turnCap = useRef(new TextureCapture<{ l: Shot['l']; px: Shot['px'] }>()), [turnCount, setTurnCount] = useState(0);
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
          const st = state.current; if (st.phase !== 'capture' && st.phase !== 'sweep' && st.phase !== 'turn') return;
          const res = tracker.detectForVideo(v, performance.now()), l = (res.faceLandmarks?.[0] ?? null) as Lm[] | null;
          const c = (work.current ??= document.createElement('canvas')), w = 480, h = Math.round(480 * v.videoHeight / v.videoWidth);
          c.width = w; c.height = h; const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(v, 0, 0, w, h);
          const px = ctx.getImageData(0, 0, w, h) as unknown as Px;
          if (st.phase === 'turn') {
            const cap = turnCap.current, g = checkFrame('side-a', px, l);
            const r = cap.offer(l, g, l ? clippedFraction(px, l) : 0, () => ({ l: l!.map(p => ({ ...p })), px: snapshot(v) }));
            setHint(r.prompt); setTurnCount(cap.count());
            if (cap.done() || (performance.now() > st.turnUntil && cap.count() >= 6)) {
              shots.current = shots.current.filter(s => s.step !== 'sweep').concat(cap.result().map(f => ({ step: 'sweep' as const, l: f.data.l, px: f.data.px })));
              setPhase('fitting');
            }
            return;
          }
          if (st.phase === 'sweep') {
            if (performance.now() > st.sweepUntil) { setPhase('fitting'); return; }
            const g = checkFrame('side-a', px, l);
            const turn = l ? headAngle(l).turn : 0;
            if (l && (g.ok || g.reason?.startsWith('Turn a little further') || g.reason === 'One side of your face is in shadow: turn toward the light.') && g.sharpness >= 45
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
            if (st.stepIx + 1 === REQUIRED_STEPS && flag('skin-v2')) { st.turnUntil = performance.now() + 25000; setPhase('turn'); setHint('Now a slow turn for your skin: look at the camera, then turn slowly to your left.'); }
            else if (st.stepIx + 1 === REQUIRED_STEPS) { setPhase('sweep-offer'); setHint('Three photos taken. Build your twin now, or add the optional frames for a closer likeness.'); }           // the three required frames are in
            else if (st.stepIx + 1 < STEPS.length) { setStepIx(st.stepIx + 1); setHint(STEPS[st.stepIx + 1].tip); }
            else setPhase('fitting');
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
        const face = await buildTwin(shots.current, { onProgress: m => { if (!cancelled) setHint(m); } });
        if (!cancelled) onDone(face, shots.current.find(s => s.step === 'front')!.photo!);
      } catch { if (!cancelled) { setPhase('error'); setHint('Your twin could not be built from these photos. Please try again in even light.'); } }
    })();
    return () => { cancelled = true; };
  }, [phase, onDone]);

  const step = STEPS[stepIx];
  const turn = step.id === 'side-a' ? -28 : step.id === 'side-b' ? 28 : 0;
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
      <p className="absolute inset-x-0 top-4 text-center text-xs">{phase === 'capture' ? (stepIx < REQUIRED_STEPS ? `${stepIx + 1} of ${REQUIRED_STEPS}` : `Optional ${stepIx - REQUIRED_STEPS + 1} of ${STEPS.length - REQUIRED_STEPS}`) : ''}</p>
    </div>
    <div className="space-y-3 p-5 pb-7">
      {phase === 'capture' && <p style={{ fontFamily: 'var(--font-satoshi)', fontSize: 18 }}>{step.title}</p>}
      {phase === 'turn' && <p style={{ fontFamily: 'var(--font-satoshi)', fontSize: 18 }}>Slow head turn · {turnCount} of 10+</p>}
      <p className="text-sm" role="status" aria-live="polite">{hint}</p>
      {phase === 'sweep-offer' && <div className="flex flex-wrap gap-3">
        <button type="button" className="min-h-11 rounded-full bg-white px-5 font-medium text-[#0c3b2e]" onClick={() => { setStepIx(REQUIRED_STEPS); setHint(STEPS[REQUIRED_STEPS].tip); setPhase('capture'); }} data-scan-extras>Add chin-up and smile (optional)</button>
        <button type="button" className="min-h-11 px-2 text-sm underline" onClick={() => { state.current.sweepUntil = performance.now() + 7000; setPhase('sweep'); setHint('Turn your head slowly from one side to the other…'); }}>Add a slow sweep</button>
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
