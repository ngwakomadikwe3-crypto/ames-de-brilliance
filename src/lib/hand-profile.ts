// The customer's saved hand: one record, in one place (localStorage 'ames-saved-hand'), on this device only.
// Version 2 holds the shape (rest joints and widths, in millimetres) and the photo texture the 3D clone is built
// from. It also keeps the version 1 fields (joints, outline) so older views still read it.
import { savedHandKey, readSavedHand, deleteSavedHand } from './fitting-hand';
import type { HandMorph } from './hand-morph';

export type Mm3 = [number, number, number];
export type HandShape = {
  /** 21 joints in the rest pose (flat hand, back toward +z, fingers toward +y), millimetres, wrist at the origin. */
  joints: Mm3[];
  /** Finger widths at the proximal phalanx (thumb..little), palm width at the knuckles, wrist width and depth, mm. */
  fingers: number[]; palm: number; wrist: number; wristDepth: number;
  /** 'right' | 'left': which hand was scanned. */
  side: 'right' | 'left';
};
export type HandTexture = { image: string; uv: [number, number][] };
/** morph: the customer's own proportions as a morph of the base hand (src/lib/hand-morph.ts). It is what builds the
 *  hand on every screen; shape is kept alongside for older views. */
export type HandProfileV2 = { version: 2; shape: HandShape; tone: string; texture?: HandTexture; morph?: HandMorph; savedAt: number };

/** A generic adult hand for when no scan exists (right hand, about 80 mm across the knuckles). */
export const genericShape: HandShape = (() => {
  const j: Mm3[] = [];
  j[0] = [0, 0, 0];
  const thumb: Mm3[] = [[-22, 18, 4], [-38, 36, 6], [-50, 54, 6], [-58, 70, 5]];
  thumb.forEach((p, i) => (j[1 + i] = p));
  const fingers = [[-30, 88, 46, 26, 22], [-10, 92, 50, 31, 24], [10, 89, 47, 30, 23], [29, 82, 38, 22, 20]];
  fingers.forEach(([x, base, a, b, c], f) => {
    const k = 5 + 4 * f, lean = (f - 1.5) * 0.06;
    j[k] = [x, base, 0];
    let y = base, px = x;
    for (const [n, len] of [[1, a], [2, b], [3, c]] as const) { y += len; px += len * lean; j[k + n] = [px, y, 0]; }
  });
  return { joints: j, fingers: [21, 18.5, 18.5, 17.5, 15.5], palm: 80, wrist: 58, wristDepth: 40, side: 'right' };
})();
export const genericTone = '#b07a5a';

export function readProfile(): HandProfileV2 | null {
  try {
    const raw = JSON.parse(localStorage.getItem(savedHandKey) || 'null');
    if (raw?.version === 2 && Array.isArray(raw.shape?.joints) && raw.shape.joints.length === 21) return raw as HandProfileV2;
  } catch { /* fall through */ }
  return null;
}

/** Version 1 joints (unit-less, palm width .88) so the older viewers keep working on a version 2 record. */
function legacyJoints(shape: HandShape) {
  const s = 0.88 / Math.max(1, shape.palm);
  return shape.joints.map(([x, y, z]) => [x * s, y * s - 0.66, z * s]);
}

/** Save a new hand. Callers capture and build the new scan first and only then call this (re-scan never loses the old hand on failure). */
export function saveProfile(profile: Omit<HandProfileV2, 'version' | 'savedAt'>) {
  const record = {
    version: 2, savedAt: Date.now(), ...profile,
    joints: legacyJoints(profile.shape), colour: profile.tone, tone: 50,
    outline: { digits: profile.shape.fingers.map(w => w / profile.shape.palm), palm: 1, wrist: profile.shape.wrist / profile.shape.palm },
  };
  localStorage.setItem(savedHandKey, JSON.stringify(record));
  window.dispatchEvent(new Event('ames-hand-fit'));
}

export { deleteSavedHand as deleteProfile, readSavedHand as readAnySavedHand };
