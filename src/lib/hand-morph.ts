// The customer's hand as a morph of the sculpted base hand: measured from one photo of the back of the hand,
// stored as small numbers, applied the same way on every screen.
//
// Every measurement is a ratio to the length of the middle finger (knuckle to tip) of the same photo, so the
// distance from the camera does not matter. Each of the 20 bones keeps its own length ratio (so long fingers and a
// wide palm stay long and wide: never one uniform scale), each finger keeps its own width at the base and at the
// middle joint, the palm its width and the wrist its width. One absolute number, the middle finger's length in mm,
// sets the size; it starts from the tracker's estimate and the customer can adjust it, like finger length and tone.
// Pure maths over pixels and landmarks: tested by scripts/test-hand-morph.mjs.
import type { HandShape, Mm3 } from './hand-profile';

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
export type Pt = { x: number; y: number; z?: number };

/** Bone b runs from joint PARENT[b] to joint b (MediaPipe's 21 landmarks). */
export const PARENT = [-1, 0, 1, 2, 3, 0, 5, 6, 7, 0, 9, 10, 11, 0, 13, 14, 15, 0, 17, 18, 19];
/** Per finger: the joints where the base width (on the proximal phalanx) and the middle-joint width are taken. */
export const BASE = [[2, 3], [5, 6], [9, 10], [13, 14], [17, 18]] as const;     // segment, measured at 38-40%
export const MID_JOINT = [3, 6, 10, 14, 18] as const;                            // thumb IP, finger PIP

export type HandMorph = {
  version: 1;
  side: 'right' | 'left';
  /** Length of bone b (b = 1..20, index b-1) over the middle finger's length. */
  bones: number[];
  /** Finger widths over the middle finger's length: at the base and at the middle joint (thumb..little). null = not measured. */
  widthBase: (number | null)[]; widthMid: (number | null)[];
  /** Palm width (just below the knuckles) and wrist width over the middle finger's length. null = not measured. */
  palm: number | null; wrist: number | null;
  /** The size: the middle finger's length in mm (the tracker's estimate until the customer adjusts it). */
  middle: number; sizeFrom: 'photo' | 'average';
  /** The customer's fine-tuning: finger length multiplier (0.9..1.1) and skin tone lightness shift (-0.25..0.25). */
  fingerLength: number; toneShift: number;
};

const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const d3 = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
export const middleLength = <T>(j: T[], d: (a: T, b: T) => number) => d(j[9], j[10]) + d(j[10], j[11]) + d(j[11], j[12]);

/** Width of the skin through `c` across direction `along` (pixels), found where the colour leaves the skin on both
 *  sides, or 0 when an edge is not found within maxPx. */
export function edgeWidth(img: Pixels, c: { x: number; y: number }, along: { x: number; y: number }, maxPx: number) {
  const [a, b] = edgeSides(img, c, along, maxPx);
  return a && b ? a + b : 0;
}

/** The distances (pixels) from `c` to the skin's edge on either side across `along`; 0 where no edge is found. */
export function edgeSides(img: Pixels, c: { x: number; y: number }, along: { x: number; y: number }, maxPx: number): [number, number] {
  const { data, width, height } = img;
  const l = Math.hypot(along.x, along.y); if (l < 1e-6) return [0, 0];
  const nx = along.y / l, ny = -along.x / l;
  const at = (px: number, py: number) => { const i = 4 * (Math.round(py) * width + Math.round(px)); return [data[i], data[i + 1], data[i + 2]]; };
  if (c.x < 1 || c.y < 1 || c.x >= width - 1 || c.y >= height - 1) return [0, 0];
  const ref = at(c.x, c.y);
  const side = (sign: number) => {
    let run = 0;
    for (let d = 1; d <= maxPx; d++) {
      const px = c.x + nx * sign * d, py = c.y + ny * sign * d;
      if (px < 1 || py < 1 || px >= width - 1 || py >= height - 1) return 0;
      const k = at(px, py);
      run = Math.hypot(k[0] - ref[0], k[1] - ref[1], k[2] - ref[2]) > 48 ? run + 1 : 0;
      if (run === 3) return d - 2;
    }
    return 0;
  };
  return [side(-1), side(1)];
}

/** Measure a hand from a flat photo of its back. image: normalised landmarks; world: the tracker's 3D landmarks
 *  (metres), used only for the starting size. Returns null when the photo cannot be measured. */
export function measureHand(img: Pixels, image: Pt[], world?: Pt[]): HandMorph | null {
  if (image.length !== 21) return null;
  const px = image.map(p => ({ x: p.x * img.width, y: p.y * img.height }));
  const M = middleLength(px, d2);
  const span = d2(px[5], px[17]);
  if (M < 30 || span < 20) return null;
  const bones = PARENT.slice(1).map((p, i) => d2(px[i + 1], px[p]) / M);
  const lerp = (a: number, b: number, t: number) => ({ x: px[a].x + (px[b].x - px[a].x) * t, y: px[a].y + (px[b].y - px[a].y) * t });
  const vec = (a: number, b: number) => ({ x: px[b].x - px[a].x, y: px[b].y - px[a].y });
  const plausible = (w: number, lo: number, hi: number) => (w / M >= lo && w / M <= hi ? w / M : null);
  const widthBase = BASE.map(([a, b], f) => plausible(edgeWidth(img, lerp(a, b, f ? 0.38 : 0.4), vec(a, b), span * 0.3), 0.13, 0.42));
  const widthMid = MID_JOINT.map(j => plausible(edgeWidth(img, px[j], vec(PARENT[j], j + 1), span * 0.3), 0.08, 0.38));
  // palm: across the hand 8% of the wrist-to-knuckle line below the knuckles, centred between index and little knuckles
  const knuckles = { x: (px[5].x + px[17].x) / 2, y: (px[5].y + px[17].y) / 2 }, up = vec(0, 9);
  const palmAt = { x: knuckles.x - up.x * 0.08, y: knuckles.y - up.y * 0.08 };
  // the thumb's web can join the palm at this height: then the little-finger side, from the centre, counts twice
  const [pa, pb] = edgeSides(img, palmAt, up, span * 0.95), palmPx = pa && pb ? pa + pb : 2 * (pa || pb);
  const palm = plausible(palmPx, 0.85, 1.35);
  const wrist = plausible(edgeWidth(img, lerp(0, 9, -0.08), up, span * 0.8), 0.6, 1.05);
  // which hand: on the back of a right hand the index finger is to the left of the little finger
  const cross = (px[5].x - px[17].x) * (px[9].y - px[0].y) - (px[5].y - px[17].y) * (px[9].x - px[0].x);
  const worldM = world?.length === 21 ? middleLength(world, d3) * 1000 : 0;
  const fromPhoto = worldM >= 65 && worldM <= 100;
  return { version: 1, side: cross > 0 ? 'right' : 'left', bones, widthBase, widthMid, palm, wrist,
    middle: fromPhoto ? worldM : 80, sizeFrom: fromPhoto ? 'photo' : 'average', fingerLength: 1, toneShift: 0 };
}

export type TemplateMeasure = {
  joints: Mm3[];                                   // the base hand's rest joints, mm
  fingers: number[]; fingersMid: number[];         // base and middle-joint widths, mm
  palm: number; wrist: number; wristDepth: number;
};

/** The base hand's own proportions as a morph, measured the way a photo measures them: lengths and widths as seen
 *  from above the back of the flat hand (x, y), over the middle finger's length seen the same way. */
export function templateMorph(t: TemplateMeasure): HandMorph {
  const flat = (a: Mm3, b: Mm3) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const M = middleLength(t.joints, flat);
  return { version: 1, side: 'right', bones: PARENT.slice(1).map((p, i) => flat(t.joints[i + 1], t.joints[p]) / M), widthBase: t.fingers.map(w => w / M),
    widthMid: t.fingersMid.map(w => w / M), palm: t.palm / M, wrist: t.wrist / M, middle: M, sizeFrom: 'average', fingerLength: 1, toneShift: 0 };
}

const factor = (v: number | null | undefined, ref: number | null | undefined) =>
  v && ref ? Math.min(1.35, Math.max(0.75, v / ref)) : 1;

/** The morph as a HandShape in mm for the fitter. Every bone, width, the palm and the wrist is the base hand's own
 *  (3D) value times how the customer's ratio compares with the base hand's ratio measured the same way, times the size;
 *  phalanges also take the finger-length tuning. Unmeasured values keep the base hand's proportion. */
export function shapeFromMorph(t: TemplateMeasure, morph: HandMorph): HandShape & { fingersMid: number[] } {
  const base = templateMorph(t), size = morph.middle / base.middle;
  const joints: Mm3[] = new Array(21); joints[0] = [0, 0, 0];
  for (let b = 1; b < 21; b++) {
    const p = PARENT[b], T = t.joints;
    const dir = [0, 1, 2].map(k => T[b][k] - T[p][k]), l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const len = l * factor(morph.bones[b - 1], base.bones[b - 1]) * size * (p !== 0 ? morph.fingerLength : 1);
    joints[b] = [0, 1, 2].map(k => joints[p][k] + dir[k] / l * len) as Mm3;
  }
  const wrist = t.wrist * factor(morph.wrist, base.wrist) * size;
  return { joints, fingers: t.fingers.map((w, f) => w * factor(morph.widthBase[f], base.widthBase[f]) * size),
    fingersMid: t.fingersMid.map((w, f) => w * factor(morph.widthMid[f], base.widthMid[f]) * size),
    palm: t.palm * factor(morph.palm, base.palm) * size, wrist, wristDepth: t.wristDepth * (wrist / t.wrist), side: morph.side };
}

/** A skin tone made lighter or darker by `shift` (-1..1) keeping its hue and saturation: the tone slider tunes the
 *  scanned tone instead of replacing it. */
export function shiftTone(hex: string, shift: number) {
  const n = parseInt(hex.replace('#', ''), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const L = Math.min(0.95, Math.max(0.05, l + shift * 0.5)), C = (1 - Math.abs(2 * L - 1)) * s, X = C * (1 - Math.abs((h % 2) - 1)), m = L - C / 2;
  const [R, G, B] = h < 1 ? [C, X, 0] : h < 2 ? [X, C, 0] : h < 3 ? [0, C, X] : h < 4 ? [0, X, C] : h < 5 ? [X, 0, C] : [C, 0, X];
  return '#' + [R, G, B].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/** Is the photo good enough to project as the skin texture (creases and veins)? Otherwise the standard texture. */
export function textureWorthy(q: { sharpness: number; brightness: number }, image: Pt[], img: { width: number; height: number }) {
  const span = Math.hypot((image[5].x - image[17].x) * img.width, (image[5].y - image[17].y) * img.height) / Math.min(img.width, img.height);
  return q.sharpness >= 90 && q.brightness >= 0.3 && q.brightness <= 0.8 && span >= 0.2;
}
