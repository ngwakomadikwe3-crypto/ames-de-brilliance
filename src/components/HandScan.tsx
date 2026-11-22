'use client';
// Guided photo of the back of the hand: framing guide, automatic checks (sharpness, light, whole hand in frame,
// fingers spread and flat), confirm before use, and an optional second photo at a slight angle.
import { useEffect, useRef, useState } from 'react';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { trackingAssets } from '../lib/hand-tracking-assets';
import { photoQuality, shapeFromPhoto, skinTone, textureCrop, type Pixels, type Pt } from '../lib/hand-photo';
import { genericShape, type HandShape, type HandTexture } from '../lib/hand-profile';
import { measureHand, textureWorthy, type HandMorph } from '../lib/hand-morph';

export type ScanResult = { morph: HandMorph; shape: HandShape; tone: string; texture?: HandTexture };
type Shot = { canvas: HTMLCanvasElement; pixels: Pixels; image?: Pt[]; world?: Pt[]; issues: string[]; quality: { sharpness: number; brightness: number } };

let detector: Promise<HandLandmarker> | undefined;
function imageDetector() {
  return detector ??= trackingAssets().then(({ HandLandmarker, files, bytes }) => HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetBuffer: bytes.slice() }, runningMode: 'IMAGE', numHands: 1, minHandDetectionConfidence: 0.5,
  })).catch(e => { detector = undefined; throw e; });
}

async function analyse(source: CanvasImageSource, w: number, h: number): Promise<Shot> {
  const scale = Math.min(1, 1600 / Math.max(w, h));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = { data: data.data, width: canvas.width, height: canvas.height };
  const result = (await imageDetector()).detect(canvas);
  const image = result.landmarks?.[0], world = result.worldLandmarks?.[0];
  const q = photoQuality(pixels, image);
  return { canvas, pixels, image, world, issues: q.issues, quality: { sharpness: q.sharpness, brightness: q.brightness } };
}

export default function HandScan({ onDone, onCancel }: { onDone: (scan: ScanResult) => Promise<boolean> | boolean; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [shot, setShot] = useState<Shot | null>(null), [angled, setAngled] = useState<Shot | null>(null);
  const [step, setStep] = useState<'camera' | 'review' | 'angle' | 'saving'>('camera');
  const [message, setMessage] = useState('');
  const live = step === 'camera' || step === 'angle';

  useEffect(() => { void imageDetector().catch(() => {}); }, []);
  useEffect(() => {
    if (!live) return;
    let stream: MediaStream | undefined, stopped = false;
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then(async s => { stream = s; if (stopped) { s.getTracks().forEach(t => t.stop()); return; } if (video.current) { video.current.srcObject = s; await video.current.play(); } })
      .catch(() => setMessage('The camera is not available. Choose a photo of the back of your hand instead.'));
    return () => { stopped = true; stream?.getTracks().forEach(t => t.stop()); };
  }, [live, facing]);

  async function take(source: CanvasImageSource, w: number, h: number) {
    setMessage('Checking the photo…');
    try {
      const s = await analyse(source, w, h);
      if (step === 'angle') {
        if (!s.world) { setMessage('No hand found in the angled photo. Try again, or skip it.'); return; }
        setAngled(s); setStep('review'); setMessage('Angled photo added.'); return;
      }
      setShot(s); setStep('review'); setMessage('');
    } catch { setMessage('Hand detection could not load. Check your connection and try again.'); }
  }
  function capture() { const v = video.current; if (v?.videoWidth) void take(v, v.videoWidth, v.videoHeight); }
  function upload(file?: File) {
    if (!file) return;
    const img = new Image(); img.onload = () => { void take(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(img.src); };
    img.src = URL.createObjectURL(file);
  }
  async function confirm() {
    if (!shot?.image || !shot.world) return;
    setStep('saving'); setMessage('Measuring your hand…');
    // the customer's proportions: every bone, finger width, palm and wrist as ratios to the middle finger
    const morph = measureHand(shot.pixels, shot.image, shot.world);
    if (!morph) { setStep('review'); setMessage('Could not measure this photo. Retake it a little closer.'); return; }
    const shape = shapeFromPhoto(shot.pixels, shot.image, shot.world, angled?.world) ?? genericShape;   // for older views
    const px = shot.image.map(p => ({ x: p.x * shot.pixels.width, y: p.y * shot.pixels.height }));
    const tone = skinTone(shot.pixels, px);
    // the photo itself becomes the skin (their creases and veins) only when it is sharp and well lit
    let texture: HandTexture | undefined;
    if (textureWorthy(shot.quality, shot.image, shot.pixels)) {
      const crop = textureCrop(shot.pixels.width, shot.pixels.height, shot.image);
      const out = document.createElement('canvas'); out.width = out.height = 1024;
      const ctx = out.getContext('2d')!; ctx.fillStyle = tone; ctx.fillRect(0, 0, 1024, 1024);
      ctx.drawImage(shot.canvas, crop.x0, crop.y0, crop.size, crop.size, 0, 0, 1024, 1024);
      texture = { image: out.toDataURL('image/jpeg', 0.86), uv: crop.uv };
    }
    const ok = await onDone({ morph, shape, tone, texture });
    if (!ok) { setStep('review'); setMessage('Your hand could not be saved on this device. Your previous hand is unchanged.'); }
  }

  const good = shot && !shot.issues.length;
  return <section aria-label="Scan your hand" className="space-y-2 text-center text-sm text-white">
    <p className="text-xs">Your hand photo stays on this device and is only used to build your try-on hand.</p>
    {live && <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl bg-black">
      <video ref={video} playsInline muted autoPlay className="h-full w-full object-cover" style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
      {/* Framing guide: a hand, fingers slightly spread, wrist at the bottom */}
      <svg viewBox="0 0 300 400" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <path d="M110 390 L105 300 C95 270 70 240 52 205 C44 190 58 178 72 190 L100 228 L92 110 C90 92 112 90 115 108 L124 190 L128 78 C129 60 152 60 152 78 L156 188 L168 90 C170 72 193 75 191 93 L184 196 L204 122 C208 106 230 112 226 128 L210 220 C204 260 196 290 192 300 L188 390"
          fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="3" strokeDasharray="8 6" />
      </svg>
      <p className="absolute inset-x-0 top-2 px-3 text-xs drop-shadow">{step === 'angle' ? 'Optional: tilt the camera slightly to one side and take the same view again.' : 'Back of your hand, flat on a plain surface, fingers slightly apart, in good light.'}</p>
    </div>}
    {!live && shot && <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.canvas.toDataURL('image/jpeg', 0.8)} alt="Your hand photo" className="w-full" />
    </div>}
    {step === 'review' && shot && (good
      ? <p role="status">Photo looks good{angled ? ' · angled photo added' : ''}.</p>
      : <ul role="alert" className="mx-auto max-w-sm text-left text-xs">{shot.issues.map(i => <li key={i}>• {i}</li>)}</ul>)}
    {message && <p role="status" className="text-xs">{message}</p>}
    <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
      {live && <button type="button" className="ames-pill rounded-full px-4 py-2" onClick={capture}>Take photo</button>}
      {live && <button type="button" className="underline" onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')}>Switch camera</button>}
      {live && <label className="cursor-pointer underline">Choose a photo<input type="file" accept="image/*" className="hidden" onChange={e => upload(e.target.files?.[0])} /></label>}
      {step === 'review' && good && <button type="button" className="ames-pill rounded-full px-4 py-2" onClick={() => void confirm()}>Use this photo</button>}
      {step === 'review' && good && !angled && <button type="button" className="underline" onClick={() => setStep('angle')}>Add an angled photo (optional)</button>}
      {step === 'review' && <button type="button" className="underline" onClick={() => { setShot(null); setAngled(null); setStep('camera'); setMessage(''); }}>Retake</button>}
      {step === 'angle' && <button type="button" className="underline" onClick={() => setStep('review')}>Skip</button>}
      <button type="button" className="underline" onClick={onCancel}>Cancel</button>
    </div>
  </section>;
}
