// Live face try-on geometry. MediaPipe's FaceLandmarker gives, per frame, a facial transformation matrix: the
// pose of its canonical face (centimetres) in a perspective camera with a 63° vertical field of view. The
// jewellery's anchors come from that canonical face and the ear's anatomy, in millimetres for the portrait's
// hangEarrings / setNecklace, which already know how a pair of earrings or a necklace is worn.
import type { BustAnchors } from '../../components/PortraitTryOn';

export const FACE_FOV = 63;   // MediaPipe face geometry's default perspective camera (vertical degrees)
type V3 = [number, number, number];
export type Landmark = { x: number; y: number; z: number };

/** A landmark in camera centimetres: its pixel ray, at the head's depth plus its own relative depth. */
export function unproject(l: Landmark, matrix: ArrayLike<number>, aspect: number): V3 {
  const ty = Math.tan((FACE_FOV * Math.PI) / 360), tx = ty * aspect;
  const depth0 = Math.max(5, -matrix[14]);
  const widthAtHead = 2 * depth0 * tx;
  const depth = depth0 + l.z * widthAtHead;
  return [(2 * l.x - 1) * tx * depth, (1 - 2 * l.y) * ty * depth, -depth];
}

// MediaPipe's canonical face (centimetres), the exact frame its transformation matrix maps into the camera,
// read from the face landmarker's geometry_pipeline_metadata (canonical mesh): the face contour at the ears
// (234/454), the jaw angle (132/361), the chin (152), the forehead (10) and the nose tip (1).
export const CANONICAL = {
  nose: [0, -1.127, 7.476], forehead: [0, 8.262, 4.482], chin: [0, -9.403, 4.264],
  earContour: [7.664, 0.673, -2.436], jawAngle: [7.271, -2.891, -2.252],
} as const;

/**
 * Where this face's jewellery goes, in the canonical frame (mm). MediaPipe already fits its canonical face to the
 * customer every frame (the matrix carries their pose and scale), so the anchors come from that face plus the
 * ear's anatomy: the lobe's piercing ~2 cm below the ear-level contour point, ~0.4 cm outside it and ~1.2 cm
 * behind it. The first frames only wait for a steady, frontal pose before the piece goes on.
 */
export class FaceCalibration {
  private n = 0;
  readonly frames: number;
  constructor(frames = 8) { this.frames = frames; }
  get ready() { return this.n >= this.frames; }
  get progress() { return Math.min(1, this.n / this.frames); }
  private widthSum = 0;
  /** How much wider (or narrower) this face is at the ears than MediaPipe's canonical face. */
  get width() { return this.n ? Math.min(1.3, Math.max(0.85, this.widthSum / this.n)) : 1; }
  add(landmarks: Landmark[], matrix: ArrayLike<number>, aspect = 4 / 3) {
    if (this.ready || landmarks.length < 468 || !matrix) return;
    // near-frontal only: both ear contour points at a similar depth
    if (Math.abs(landmarks[234].z - landmarks[454].z) >= 0.08) return;
    // the canonical ear-to-ear width projected through this frame's pose, against the width the camera sees
    const project = (p: readonly number[]) => {
      const x = matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12];
      const z = matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14];
      return x / (-z * Math.tan((FACE_FOV * Math.PI) / 360) * aspect);   // NDC x
    };
    const e = CANONICAL.earContour, model = Math.abs(project(e) - project([-e[0], e[1], e[2]]));
    const seen = Math.abs(landmarks[454].x - landmarks[234].x) * 2;
    if (model > 1e-3) { this.widthSum += seen / model; this.n++; }
  }
  anchors(): { bust: BustAnchors; head: { centre: V3; radii: V3 } } {
    const mm = (p: readonly number[]): V3 => [p[0] * 10, p[1] * 10, p[2] * 10];
    const ear = mm(CANONICAL.earContour), chin = mm(CANONICAL.chin), nose = mm(CANONICAL.nose), brow = mm(CANONICAL.forehead);
    const k = this.width;
    const lobe = (side: number): V3 => [side * (ear[0] * k + 4), ear[1] - 21, ear[2] - 12];
    const ringY = chin[1] - 45;
    const neckCentre: V3 = [0, ringY, chin[2] - 67];
    const neck = { centre: neckCentre, half_width: 55 * k, half_depth: 52 };
    const eyeY = (brow[1] + nose[1]) / 2;
    return {
      bust: { earlobe_l: lobe(1), earlobe_r: lobe(-1), eye_l: [32, eyeY, nose[2] - 25], eye_r: [-32, eyeY, nose[2] - 25], neck, neck_front: [0, ringY - 12, neckCentre[2] + 50] },
      // the head as an ellipsoid for hiding the far earring: inside the ear-level contour, ~19.6 cm deep
      head: { centre: [0, (brow[1] + chin[1]) / 2, nose[2] - 100], radii: [ear[0] * k - 10, (brow[1] - chin[1]) / 2 + 20, 98] },
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
