// Metric 3D hand pose in camera space from MediaPipe HandLandmarker output.
// Camera space follows three.js: x right, y up, z toward the viewer; the camera sits at the origin looking down -z.
// Everything here is plain arithmetic so it runs (and is tested) without a browser.
export type V3 = [number, number, number];
export type Landmark = { x: number; y: number; z: number };

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: V3): V3 => { const l = length(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** a with its component along unit vector n removed, renormalised. */
export const orthogonal = (a: V3, n: V3): V3 => normalize(sub(a, scale(n, dot(a, n))));

export type Camera = { width: number; height: number; focal: number };
/** A phone front camera covers roughly 65 degrees across its long side. */
export const cameraFor = (width: number, height: number): Camera => ({ width, height, focal: 0.8 * Math.max(width, height) });

/**
 * Mirror the raw (unmirrored) detector output for a selfie view and lift it into metric camera space.
 * image: normalised 0..1 landmarks of the raw frame; world: MediaPipe world landmarks in metres (hand-centred).
 * A weak-perspective fit of the world shape to the image points gives the scale, hence the depth of the hand.
 */
export function liftHand(image: Landmark[], world: Landmark[], cam: Camera): { points: V3[]; depth: number; pixelsPerMetre: number } | null {
  if (image.length !== 21 || world.length !== 21) return null;
  const cx = cam.width / 2, cy = cam.height / 2;
  const u = image.map(p => (1 - p.x) * cam.width - cx);              // mirrored, from the centre, px
  const v = image.map(p => -(p.y * cam.height - cy));                // y up
  const W: V3[] = world.map(p => [-p.x, -p.y, -p.z]);                // mirrored, y up, z toward the camera
  let um = 0, vm = 0; const Wm: V3 = [0, 0, 0];
  for (let i = 0; i < 21; i++) { um += u[i] / 21; vm += v[i] / 21; Wm[0] += W[i][0] / 21; Wm[1] += W[i][1] / 21; Wm[2] += W[i][2] / 21; }
  let num = 0, den = 0;
  for (let i = 0; i < 21; i++) {
    const X = W[i][0] - Wm[0], Y = W[i][1] - Wm[1];
    num += (u[i] - um) * X + (v[i] - vm) * Y; den += X * X + Y * Y;
  }
  const s = den > 1e-12 ? num / den : 0;                            // pixels per metre at the hand's depth
  if (!(s > 1) || !Number.isFinite(s)) return null;
  const depth = cam.focal / s;
  const centre: V3 = [um / s, vm / s, -depth];
  const points = W.map(p => add(centre, sub(p, Wm)));
  if (points.some(p => p.some(n => !Number.isFinite(n)))) return null;
  return { points, depth, pixelsPerMetre: s };
}

/** Back-of-hand (dorsal) direction. Thumb and bent fingers sit on the palm side of the 0-5-17 plane. */
export class DorsalSide {
  private score = 0; private sign = 0;
  reset() { this.score = 0; this.sign = 0; }
  /** prior: +1 when the raw normal is expected to be dorsal for this hand (from MediaPipe handedness), else -1. */
  update(points: V3[], prior: number): V3 {
    const n = normalize(cross(sub(points[5], points[17]), sub(points[9], points[0])));
    const span = length(sub(points[5], points[17])) || 1;
    let s = 0;
    for (const i of [2, 3, 4, 7, 8, 11, 12, 15, 16, 19, 20]) s += dot(sub(points[i], points[0]), n) / span;
    // s < 0: those joints lie on -n, so -n is the palm and n the back of the hand.
    const evidence = Math.max(-1, Math.min(1, -s / 1.2));
    this.score += 0.15 * (evidence - this.score);
    if (!this.sign) this.sign = Math.abs(this.score) > 0.2 ? Math.sign(this.score) : prior || 1;
    else if (Math.abs(this.score) > 0.25 && Math.sign(this.score) !== this.sign) this.sign = Math.sign(this.score);
    return scale(n, this.sign);
  }
}

export type Frame = { origin: V3; axis: V3; up: V3; side: V3 };   // axis = along the arm/finger, up = back of hand
export function handFrame(points: V3[], dorsal: V3) {
  const axis = normalize(sub(points[9], points[0]));
  const up = orthogonal(dorsal, axis);
  const side = normalize(cross(axis, up));
  const palm = length(sub(points[5], points[17]));
  return { axis, up, side, palm };
}

/** Wrist anchor: at landmark 0, slid a little toward the forearm, oriented along 0 -> 9. */
export function wristFrame(points: V3[], dorsal: V3, wristRatio = 0.74) {
  const f = handFrame(points, dorsal);
  const origin = add(points[0], scale(f.axis, -0.16 * f.palm));
  const width = wristRatio * f.palm, depth = 0.68 * width;
  return { origin, axis: f.axis, up: f.up, side: f.side, palm: f.palm, halfWidth: width / 2, halfDepth: depth / 2 };
}

/** Ring anchor: on the proximal phalanx of the chosen finger (ring finger = 3: landmarks 13 -> 14). */
export function fingerFrame(points: V3[], dorsal: V3, finger = 3, widthRatio?: number) {
  const base = 1 + 4 * finger;
  const axis = normalize(sub(points[base + 1], points[base]));
  // A finger bends about the line across the knuckles, so its back is that line crossed with its own bone; the
  // hand's normal alone fails when the finger curls toward the camera (it lies along the bone, leaving the ring's
  // head pointing sideways).
  const across = sub(points[5], points[17]);
  const handSign = Math.sign(dot(dorsal, cross(across, sub(points[9], points[0])))) || 1;
  const bent = scale(cross(across, axis), handSign);
  const up = length(bent) > 1e-9 ? orthogonal(bent, axis) : orthogonal(dorsal, axis);
  const side = normalize(cross(axis, up));
  const palm = length(sub(points[5], points[17]));
  const ratio = widthRatio ?? [0.25, 0.21, 0.22, 0.21, 0.18][finger];
  return { origin: lerp(points[base], points[base + 1], 0.5), axis, up, side, palm, radius: ratio * palm / 2, segment: length(sub(points[base + 1], points[base])) };
}
