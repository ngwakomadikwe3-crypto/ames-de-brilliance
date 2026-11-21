// Atelier Fitting Registry: each category says WHERE it sits on a twin and HOW it fits, as data.
// The renderer reads an entry, asks the twin for the anchor frame, scales the piece's measured bore to the
// customer's own size, and (if the entry asks) hands the moving parts to the physics solver. Adding a category
// is adding an entry here; no try-on code changes.
import { Vector3 } from 'three';
import type { HandShape } from '../hand-profile';

export type AnchorId =
  | 'hand.finger.ring.baseJoint'   // proximal phalanx, between knuckle and middle joint (the selected finger)
  | 'hand.wrist'                   // just above the wrist crease, wrapped around the wrist oval
  | 'bust.earlobe'                 // portrait twin (stage 3)
  | 'bust.neck'
  | 'bust.noseBridge';

export type Fit =
  | { kind: 'band'; ease: number }                        // round band, uniform scale to finger width + ease
  | { kind: 'wrap'; ease: number; maxOval: number }       // oval wrap to wrist width x depth, aspect clamped
  | { kind: 'hang' }                                       // hangs from the anchor (earrings, pendants)
  | { kind: 'drape' }                                      // chain drape over the bust (necklaces)
  | { kind: 'rest' };                                      // sits on two or three contact points (shades)

export type Physics = { chain?: 'closed' | 'open'; pendulum?: boolean; damping?: number };

export interface FittingEntry {
  categories: string[];
  anchor: AnchorId;
  /** Offset along the anchor axis, in mm (wrist: negative = up the arm) or as a fraction of the bone (finger). */
  along: { mm?: number; fraction?: number };
  fit: Fit;
  physics?: Physics;
  /** Which way the piece's "show" side faces: up = back of hand / outward. */
  face: 'up';
  stage: 1 | 2 | 3 | 4;
  /** Only the twin types that can wear it. */
  twin: 'hand' | 'portrait';
}

export const FITTING_REGISTRY: FittingEntry[] = [
  { categories: ['ring'], anchor: 'hand.finger.ring.baseJoint', along: { fraction: 0.38 }, fit: { kind: 'band', ease: 1.02 }, face: 'up', stage: 2, twin: 'hand' },
  { categories: ['watch'], anchor: 'hand.wrist', along: { mm: -26 }, fit: { kind: 'wrap', ease: 1.02, maxOval: 1.3 }, physics: { chain: 'closed', damping: 0.06 }, face: 'up', stage: 2, twin: 'hand' },
  { categories: ['bracelet', 'bangle'], anchor: 'hand.wrist', along: { mm: -22 }, fit: { kind: 'wrap', ease: 1.04, maxOval: 1.3 }, physics: { chain: 'closed', damping: 0.04 }, face: 'up', stage: 2, twin: 'hand' },
  { categories: ['earring', 'earrings'], anchor: 'bust.earlobe', along: {}, fit: { kind: 'hang' }, physics: { pendulum: true, damping: 0.025 }, face: 'up', stage: 4, twin: 'portrait' },
  { categories: ['necklace', 'pendant'], anchor: 'bust.neck', along: {}, fit: { kind: 'drape' }, physics: { chain: 'open', pendulum: true, damping: 0.04 }, face: 'up', stage: 4, twin: 'portrait' },
  { categories: ['shades', 'sunglasses', 'eyewear'], anchor: 'bust.noseBridge', along: {}, fit: { kind: 'rest' }, face: 'up', stage: 4, twin: 'portrait' },
];

export function fittingFor(category: string): FittingEntry | undefined {
  const c = category.toLowerCase();
  return FITTING_REGISTRY.find(e => e.categories.includes(c));
}

/** The frame a piece is placed in, in the hand twin's rest space (mm): bone to parent to, origin, axis, and the
 *  two half-sizes of the opening the piece must fit (side = across the back of the hand, up = through it). */
export interface AnchorFrame { bone: number; at: Vector3; axis: Vector3; up: Vector3; side: Vector3; halfSide: number; halfUp: number }

export function handAnchor(entry: FittingEntry, shape: HandShape, rest: Vector3[], finger = 3): AnchorFrame {
  let bone: number, at: Vector3, axis: Vector3, halfSide: number, halfUp: number;
  if (entry.anchor === 'hand.wrist') {
    bone = 0;
    axis = rest[9].clone().sub(rest[0]).normalize();                       // along the arm toward the fingers
    at = axis.clone().multiplyScalar(entry.along.mm ?? -26);               // bone 0 sits at joint 0
    halfSide = shape.wrist / 2; halfUp = shape.wristDepth / 2;
  } else if (entry.anchor === 'hand.finger.ring.baseJoint') {
    bone = 1 + 4 * finger;
    const seg = rest[bone + 1].clone().sub(rest[bone]);
    axis = seg.clone().normalize();
    at = seg.multiplyScalar(entry.along.fraction ?? 0.38);
    halfSide = halfUp = shape.fingers[finger] / 2;
  } else throw new Error(`${entry.anchor} needs the portrait twin`);
  const up = new Vector3(0, 0, 1).addScaledVector(axis, -axis.z).normalize();  // back of the hand is +z
  const side = new Vector3().crossVectors(axis, up);
  return { bone, at, axis, up, side, halfSide, halfUp };
}

/** Scale factors (side, along, up) that take a piece's measured inner bore to the anchor opening. */
export function fitScale(entry: FittingEntry, frame: AnchorFrame, bore: { innerSide: number; innerUp: number }): [number, number, number] {
  const f = entry.fit;
  if (f.kind === 'band') {
    const s = ((frame.halfSide * f.ease) / bore.innerSide + (frame.halfUp * f.ease) / bore.innerUp) / 2;
    return [s, s, s];
  }
  if (f.kind === 'wrap') {
    const sSide = frame.halfSide * f.ease / bore.innerSide, sUp = frame.halfUp * (f.ease + 0.01) / bore.innerUp;
    const g = Math.sqrt(sSide * sUp), k = Math.min(f.maxOval, Math.max(1 / f.maxOval + 0.01, sSide / sUp));
    const side = g * Math.sqrt(k), up = g / Math.sqrt(k);
    return [side, Math.sqrt(side * up), up];
  }
  return [1, 1, 1];
}
