// The face scan's checks and measurements, kept free of React so they can be tested.
//  - gates: every frame must be sharp, evenly lit, whole, large enough and at the angle its step asks for;
//  - regional tones, hair colour, stubble density and iris colour from the front frame;
//  - the per-vertex photo colour of the fitted face where the front photo sees it well.
import type { P3 } from './face-morph';
import type { ToneMap } from './portrait-materials';

export type Px = { data: Uint8ClampedArray; width: number; height: number };
export type Lm = { x: number; y: number; z: number };
export type Step = 'front' | 'side-a' | 'side-b' | 'up' | 'smile';
export const STEPS: { id: Step; title: string; tip: string }[] = [
  { id: 'front', title: 'Look straight ahead', tip: 'Face in the oval, eyes on the line, mouth relaxed and closed.' },
  { id: 'side-a', title: 'Turn to one side', tip: 'Slowly turn your head until your nose nearly reaches the edge of the oval.' },
  { id: 'side-b', title: 'Now the other side', tip: 'Turn the other way, just as far.' },
  { id: 'up', title: 'Chin up a little', tip: 'Tilt your chin up slightly so the camera sees under your jaw.' },
  { id: 'smile', title: 'A natural smile', tip: 'Smile as you would in a photo you like.' },
];

const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
function patch(img: Px, x: number, y: number, r: number) {
  const out: number[][] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const px = Math.round(x + dx), py = Math.round(y + dy); if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
    const i = 4 * (py * img.width + px); out.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
  }
  return out;
}
/** Median-ish colour of a patch with its darkest and brightest quarter left out (shadows, highlights). */
export function trimmedColour(px: number[][]) {
  if (!px.length) return null;
  const s = [...px].sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]), m = s.slice(Math.floor(s.length * 0.25), Math.ceil(s.length * 0.75));
  return [0, 1, 2].map(c => m.reduce((a, p) => a + p[c], 0) / m.length);
}
const hex = (c: number[]) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** Head turn and tilt from the landmarks: the nose tip against the face's edges (turn), and against the eyes and
 *  chin (tilt). Signed: turn < 0 is one side, > 0 the other. */
export function headAngle(l: Lm[]) {
  const a = l[234], b = l[454], nose = l[1], eyes = (l[33].y + l[263].y) / 2, chin = l[152];
  const turn = (nose.x - (a.x + b.x) / 2) / Math.max(1e-4, Math.abs(b.x - a.x));
  const tilt = (nose.y - eyes) / Math.max(1e-4, chin.y - eyes);
  return { turn, tilt };
}

/** headAngle().tilt of a level head (MediaPipe's canonical face model). */
export const LEVEL_TILT = 0.31;
export type Gate = { ok: boolean; reason?: string; sharpness: number; balance: number; brightness: number };
/** The quality gates. `front` (the accepted front frame) is needed to judge the chin-up and the smile. */
export function checkFrame(step: Step, img: Px, l: Lm[] | null, front?: Lm[] | null, sideA?: Lm[] | null): Gate {
  const fail = (reason: string, g: Partial<Gate> = {}) => ({ ok: false, reason, sharpness: 0, balance: 1, brightness: 0, ...g });
  if (!l || l.length < 468) return fail('Looking for your face…');
  const xs = l.map(p => p.x), ys = l.map(p => p.y);
  if (Math.min(...xs) < 0.02 || Math.max(...xs) > 0.98 || Math.min(...ys) < 0.02 || Math.max(...ys) > 0.98) return fail('Keep your whole face inside the frame.');
  if (l[152].y - l[10].y < 0.33) return fail('Come a little closer.');
  // sharpness: variance of the Laplacian over the face
  const x0 = Math.floor(Math.min(...xs) * img.width), x1 = Math.ceil(Math.max(...xs) * img.width), y0 = Math.floor(Math.min(...ys) * img.height), y1 = Math.ceil(Math.max(...ys) * img.height);
  const step2 = Math.max(1, Math.floor((x1 - x0) / 220)); let s = 0, s2 = 0, n = 0, bright = 0;
  for (let y = y0 + step2; y < y1 - step2; y += step2) for (let x = x0 + step2; x < x1 - step2; x += step2) {
    const i = 4 * (y * img.width + x), c = lum(img.data, i);
    const lap = 4 * c - lum(img.data, i - 4 * step2) - lum(img.data, i + 4 * step2) - lum(img.data, i - 4 * img.width * step2) - lum(img.data, i + 4 * img.width * step2);
    s += lap; s2 += lap * lap; n++; bright += c;
  }
  const sharpness = n ? s2 / n - (s / n) ** 2 : 0, brightness = n ? bright / n / 255 : 0;
  // even light: the two cheeks (front-facing steps only)
  const cheek = (i: number) => { const c = trimmedColour(patch(img, l[i].x * img.width, l[i].y * img.height, 6)); return c ? (c[0] + c[1] + c[2]) / 3 : 0; };
  const balance = cheek(50) / Math.max(1, cheek(280));
  const g = { sharpness, balance, brightness };
  if (sharpness < 45) return fail('Too blurry: hold the phone still.', g);
  if (brightness < 0.22) return fail('Too dark: face a window or a lamp.', g);
  if (brightness > 0.88) return fail('Too bright: step out of direct sun.', g);
  const { turn, tilt } = headAngle(l);
  if (step === 'front' || step === 'smile' || step === 'up') {
    if (balance < 0.62 || balance > 1.6) return fail('One side of your face is in shadow: turn toward the light.', g);
    if (Math.abs(turn) > 0.07) return fail('Look straight at the camera.', g);
  }
  // level: on MediaPipe's canonical (neutral, level) face the nose tip sits 0.31 of the way from the eye line to the chin
  if (step === 'front' && front === undefined && Math.abs(tilt - LEVEL_TILT) > 0.14) return fail('Hold your head level.', g);
  if ((step === 'side-a' || step === 'side-b') && Math.abs(turn) < 0.22) return fail('Turn a little further.', g);
  if (step === 'side-b' && sideA && Math.sign(turn) === Math.sign(headAngle(sideA).turn)) return fail('Now turn the other way.', g);
  if (step === 'up') { const t0 = front ? headAngle(front).tilt : LEVEL_TILT; if (tilt > t0 - 0.08) return fail('Lift your chin a little more.', g); }
  if (step === 'smile') {
    const w = (q: Lm[]) => Math.hypot(q[291].x - q[61].x, q[291].y - q[61].y) / Math.hypot(q[454].x - q[234].x, q[454].y - q[234].y);
    if (front && w(l) < w(front) * 1.07) return fail('A natural smile, please.', g);
  }
  return { ok: true, ...g };
}

/** Regional tones from the front frame: forehead, cheeks, nose, jaw, lips (shadows and highlights trimmed). */
export function regionalTones(img: Px, l: Lm[]): ToneMap {
  const at = (ids: number[], r = 5) => trimmedColour(ids.flatMap(i => patch(img, l[i].x * img.width, l[i].y * img.height, r)));
  const forehead = at([151, 9, 108, 337]), cheeks = at([50, 280, 205, 425]), nose = at([4, 5, 197]), jaw = at([175, 199, 32, 262]), lips = at([14, 17, 0, 13], 3);
  const base = cheeks ?? forehead ?? [180, 130, 100];
  return { base: hex(base), forehead: forehead ? hex(forehead) : undefined, cheeks: cheeks ? hex(cheeks) : undefined, nose: nose ? hex(nose) : undefined, jaw: jaw ? hex(jaw) : undefined, lips: lips ? hex(lips) : undefined };
}

/** Stubble density 0..1: how much darker and more textured the beard area is than the cheeks above it. */
export function stubbleDensity(img: Px, l: Lm[]) {
  const stats = (ids: number[]) => { const px = ids.flatMap(i => patch(img, l[i].x * img.width, l[i].y * img.height, 5)).map(p => (p[0] + p[1] + p[2]) / 3);
    const m = px.reduce((a, b) => a + b, 0) / px.length; return { m, v: Math.sqrt(px.reduce((a, b) => a + (b - m) ** 2, 0) / px.length) }; };
  const cheek = stats([50, 280]), beard = stats([175, 199, 428, 208, 0, 37, 267]);
  const dark = (cheek.m - beard.m) / Math.max(1, cheek.m), texture = (beard.v - cheek.v) / Math.max(1, cheek.m);
  const d = Math.max(0, Math.min(1, dark * 3 + texture * 4));
  return d < 0.15 ? 0 : d;
}

/** Iris colour: the iris ring (refined landmarks 468-477), pupil and glints left out. */
export function irisColour(img: Px, l: Lm[]) {
  if (l.length < 478) return '#4a3222';
  const px: number[][] = [];
  for (const c of [468, 473]) {
    const cx = l[c].x * img.width, cy = l[c].y * img.height, r = Math.hypot((l[c + 1].x - l[c + 3].x) * img.width, (l[c + 1].y - l[c + 3].y) * img.height) / 2;
    for (let a = 0; a < 24; a++) for (const f of [0.55, 0.75]) { const x = Math.round(cx + Math.cos(a * 0.26) * r * f), y = Math.round(cy + Math.sin(a * 0.26) * r * f);
      if (x >= 0 && y >= 0 && x < img.width && y < img.height) { const i = 4 * (y * img.width + x); px.push([img.data[i], img.data[i + 1], img.data[i + 2]]); } }
  }
  const c = trimmedColour(px); return c ? hex(c) : '#4a3222';
}

/** Photo colour per skin vertex from the front frame: each fitted vertex projected by the frame's pose; confidence
 *  from how squarely the photo sees it (normal toward the camera), zero for the far side, the eyes' cavities and
 *  anything outside the photo. Returned packed (rgb + confidence) for the profile. */
export function photoColours(img: Px, points: P3[], normals: P3[], project: (p: P3) => [number, number], toCamera: P3) {
  const out = new Uint8Array(points.length * 4);
  points.forEach((p, i) => {
    const [u, v] = project(p), x = Math.round(u * img.width), y = Math.round(v * img.height);
    const n = normals[i], facing = n[0] * toCamera[0] + n[1] * toCamera[1] + n[2] * toCamera[2];
    if (x < 1 || y < 1 || x >= img.width - 1 || y >= img.height - 1 || facing < 0.35) return;
    const c = trimmedColour(patch(img, x, y, 1)); if (!c) return;
    out.set([c[0], c[1], c[2], Math.round(255 * Math.min(1, (facing - 0.35) / 0.4))], i * 4);
  });
  return out;
}
export const pack = (a: Uint8Array) => { let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(s); };
export const unpack = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
