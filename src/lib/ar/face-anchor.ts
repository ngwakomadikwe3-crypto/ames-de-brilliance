// Live face try-on geometry. MediaPipe's FaceLandmarker gives, per frame, a facial transformation matrix: the
// pose of its canonical face (centimetres) in a perspective camera with a 63° vertical field of view. We learn
// this customer's own ear lobes, chin and neck in that canonical frame from the first frames (each landmark
// un-projected at its estimated depth and taken back through the matrix, then averaged), so the jewellery
// follows *their* face, not an average one. The anchors are returned in millimetres for the portrait's
// hangEarrings / setNecklace, which already know how a pair of earrings or a necklace is worn.
import type { BustAnchors } from '../../components/PortraitTryOn';

export const FACE_FOV = 63;   // MediaPipe face geometry's default perspective camera (vertical degrees)
type V3 = [number, number, number];
export type Landmark = { x: number; y: number; z: number };

/** Column-major 4x4 (as MediaPipe gives it) inverse of a rigid (+ uniform scale) transform, applied to a point. */
function inverseApply(m: ArrayLike<number>, p: V3): V3 {
  const t: V3 = [p[0] - m[12], p[1] - m[13], p[2] - m[14]];
  // columns of the rotation*scale part
  const c0: V3 = [m[0], m[1], m[2]], c1: V3 = [m[4], m[5], m[6]], c2: V3 = [m[8], m[9], m[10]];
  const s2 = c0[0] ** 2 + c0[1] ** 2 + c0[2] ** 2 || 1;
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [dot(c0, t) / s2, dot(c1, t) / s2, dot(c2, t) / s2];
}

/** A landmark in camera centimetres: its pixel ray, at the head's depth plus its own relative depth. */
export function unproject(l: Landmark, matrix: ArrayLike<number>, aspect: number): V3 {
  const ty = Math.tan((FACE_FOV * Math.PI) / 360), tx = ty * aspect;
  const depth0 = Math.max(5, -matrix[14]);
  const widthAtHead = 2 * depth0 * tx;
  const depth = depth0 + l.z * widthAtHead;
  return [(2 * l.x - 1) * tx * depth, (1 - 2 * l.y) * ty * depth, -depth];
}

const IDS = { forehead: 10, nose: 1, chin: 152, tragusL: 234, tragusR: 454, jawL: 132, jawR: 361 } as const;
type Key = keyof typeof IDS;

/** Averages this customer's landmarks in the canonical frame over the first frames, then holds them. */
export class FaceCalibration {
  private sum = new Map<Key, V3>(); private n = 0;
  readonly frames: number;
  constructor(frames = 24) { this.frames = frames; }
  get ready() { return this.n >= this.frames; }
  get progress() { return Math.min(1, this.n / this.frames); }
  add(landmarks: Landmark[], matrix: ArrayLike<number>, aspect: number) {
    if (this.ready || landmarks.length < 468) return;
    // only near-frontal frames: both sides of the face at a similar depth
    const l = landmarks[IDS.tragusL], r = landmarks[IDS.tragusR];
    if (Math.abs(l.z - r.z) > 0.06) return;
    for (const k of Object.keys(IDS) as Key[]) {
      const c = inverseApply(matrix, unproject(landmarks[IDS[k]], matrix, aspect));
      const s = this.sum.get(k) ?? [0, 0, 0];
      this.sum.set(k, [s[0] + c[0], s[1] + c[1], s[2] + c[2]]);
    }
    this.n++;
  }
  /** cm, canonical frame */
  point(k: Key): V3 { const s = this.sum.get(k) ?? [0, 0, 0], n = Math.max(1, this.n); return [s[0] / n, s[1] / n, s[2] / n]; }

  /** Ear lobes, neck and the head's size, in millimetres in the canonical frame (x to the face's left). */
  anchors(): { bust: BustAnchors; head: { centre: V3; radii: V3 } } {
    const mm = (p: V3): V3 => [p[0] * 10, p[1] * 10, p[2] * 10];
    const tl = mm(this.point('tragusL')), tr = mm(this.point('tragusR')), jl = mm(this.point('jawL')), jr = mm(this.point('jawR'));
    const chin = mm(this.point('chin')), nose = mm(this.point('nose')), brow = mm(this.point('forehead'));
    // The face contour points (234/454) sit just in front of the ear; the lobe hangs ~a third of the way down to
    // the jaw angle, a little outside and ~12 mm behind them.
    // A face is symmetric; single-camera depth is not. Use one half-width and one height for both lobes.
    const faceHalf = (Math.abs(tl[0]) + Math.abs(tr[0])) / 2;
    const lobeY = ((tl[1] + (jl[1] - tl[1]) * 0.38) + (tr[1] + (jr[1] - tr[1]) * 0.38)) / 2, lobeZ = (tl[2] + tr[2]) / 2 - 16;
    // the portrait's convention: earlobe_l on +x. The lobe sits ~1 cm outside the face contour point.
    const earlobe_l: V3 = [faceHalf + 10, lobeY, lobeZ], earlobe_r: V3 = [-(faceHalf + 10), lobeY, lobeZ];
    const ringY = chin[1] - 45, neckCentre: V3 = [(tl[0] + tr[0]) / 2, ringY, chin[2] - 62];
    const neck = { centre: neckCentre, half_width: Math.max(45, faceHalf * 0.72), half_depth: 52 };
    const eye: V3 = [0, (brow[1] + nose[1]) / 2, nose[2] - 20];
    return {
      bust: { earlobe_l, earlobe_r, eye_l: [faceHalf * 0.45, eye[1], eye[2]], eye_r: [-faceHalf * 0.45, eye[1], eye[2]], neck, neck_front: [neckCentre[0], ringY - 12, neckCentre[2] + 50] },
      // the head as an ellipsoid (for hiding the far earring when the head turns): well inside the face
      // contour at the sides so a lobe's earring is never clipped by it
      head: { centre: [0, (brow[1] + chin[1]) / 2 + 8, nose[2] - 100], radii: [faceHalf - 12, (brow[1] - chin[1]) / 2 + 22, 98] },
    };
  }
}

/**
 * Earrings hang from the lobe and swing: a damped pendulum per earring, driven by gravity and by how the ear
 * moves. Angles are tilts of the earring's hanging axis about its local x and z.
 */
export class Pendulum {
  private ax = 0; private az = 0; private vx = 0; private vz = 0; private last?: V3; private lastV: V3 = [0, 0, 0];
  private stiffness: number; private damping: number; private inertia: number;
  constructor(stiffness = 38, damping = 4.2, inertia = 0.9) { this.stiffness = stiffness; this.damping = damping; this.inertia = inertia; }
  /** target: the angles that point straight down; anchor: the ear's position (cm) this frame; dt seconds */
  step(target: [number, number], anchor: V3, dt: number): [number, number] {
    if (dt <= 0 || dt > 0.2) { this.ax = target[0]; this.az = target[1]; this.vx = this.vz = 0; this.last = anchor; return [this.ax, this.az]; }
    const v: V3 = this.last ? [(anchor[0] - this.last[0]) / dt, (anchor[1] - this.last[1]) / dt, (anchor[2] - this.last[2]) / dt] : [0, 0, 0];
    const acc: V3 = [(v[0] - this.lastV[0]) / dt, (v[1] - this.lastV[1]) / dt, (v[2] - this.lastV[2]) / dt];
    this.last = anchor; this.lastV = v;
    // the ear accelerating one way swings the drop the other way (clamped: tracking jitter is not motion)
    const kick = (a: number) => Math.max(-60, Math.min(60, a)) * this.inertia * 0.01;
    this.vx += (this.stiffness * (target[0] - this.ax) - this.damping * this.vx - kick(acc[2])) * dt;
    this.vz += (this.stiffness * (target[1] - this.az) - this.damping * this.vz + kick(acc[0])) * dt;
    this.ax += this.vx * dt; this.az += this.vz * dt;
    const lim = 0.9; this.ax = Math.max(-lim, Math.min(lim, this.ax)); this.az = Math.max(-lim, Math.min(lim, this.az));
    return [this.ax, this.az];
  }
}
