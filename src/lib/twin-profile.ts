// One identity for both twins: the face scan's shape and tones, the hand scan's proportions (hand-profile.ts), and
// ONE harmonised skin tone that both twins wear, so hands and face are always visibly the same person's skin.
// When only one scan exists, its tone dresses both twins (never a pale default hand on a deep-toned face, or the
// reverse). Stored on this device only. deleteTwin() wipes everything: face, hand, tones, preferences.
import { deleteProfile, readProfile } from './hand-profile';
import { shiftTone } from './hand-morph';
import type { Spectacles } from './portrait-head';
import type { ToneMap } from './portrait-materials';
import type { HairStyle } from './portrait-grooming';
import type { SmileMix } from './portrait-life';

export const TWIN_KEY = 'ames-twin';
export const TWIN_EVENT = 'ames-twin-changed';
export type FaceIdentity = {
  weights: Record<string, number>;        // identity morph weights of the parametric head
  smile?: SmileMix;                       // the customer's own smile, from the smile frame
  spectacles?: Spectacles;                // measured for frames
  tones: ToneMap;                         // regional tones from the scan (forehead, cheeks, nose, jaw, lips)
  hairColor: string; hairStyle: HairStyle; stubble: number; irisColor: string;
  photo?: string;                         // per-vertex photo colour + confidence of the fitted face (face-scan.ts pack)
  savedAt: number;
};
export type TwinProfile = { version: 1; face?: FaceIdentity; savedAt: number };

export function readTwin(): TwinProfile | null {
  try { const v = JSON.parse(localStorage.getItem(TWIN_KEY) ?? 'null'); return v?.version === 1 ? v : null; } catch { return null; }
}
function write(p: TwinProfile) { localStorage.setItem(TWIN_KEY, JSON.stringify(p)); window.dispatchEvent(new Event(TWIN_EVENT)); }
/** Save the face; the hand is saved by its own flow (hand-profile.ts). Throws when the device refuses (quota). */
export function saveFace(face: FaceIdentity) { write({ version: 1, face, savedAt: Date.now() }); }
export function saveFacePrefs(prefs: Partial<Pick<FaceIdentity, 'hairStyle' | 'hairColor'>>) {
  const t = readTwin(); if (!t?.face) return; write({ ...t, face: { ...t.face, ...prefs } });
}
/** One delete: face, hand and every twin preference. */
export function deleteTwin() {
  try { localStorage.removeItem(TWIN_KEY); } catch { /* private mode */ }
  deleteProfile();
  for (const k of ['ames-hand-tone', 'ames-face-shape']) { try { localStorage.removeItem(k); } catch { /* */ } }
  window.dispatchEvent(new Event(TWIN_EVENT));
}

const lin = (h: string) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); };
const hex = (c: number[]) => '#' + c.map(v => Math.round(255 * Math.max(0, Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)))).map(v => v.toString(16).padStart(2, '0')).join('');

/** The harmonised tone: the face's cheeks and the back of the hand reconciled (in linear light) into one skin; each
 *  twin keeps at most a slight natural offset from it (a hand's back is often a touch deeper and redder). */
export function harmonise(face?: string, hand?: string) {
  if (!face && !hand) return null;
  if (!face || !hand) { const t = (face ?? hand)!; return { base: t, face: t, hand: t }; }
  const f = lin(face), h = lin(hand), base = f.map((v, i) => 0.6 * v + 0.4 * h[i]);
  const offset = (c: number[]) => base.map((v, i) => v * Math.min(1.06, Math.max(0.94, c[i] / Math.max(1e-4, v)) ** 0.35));
  return { base: hex(base), face: hex(offset(f)), hand: hex(offset(h)) };
}

/** The skin each twin should wear right now. */
export function twinTones() {
  const twin = readTwin(), hand = readProfile();
  const handTone = hand ? (hand.morph ? shiftTone(hand.tone, hand.morph.toneShift) : hand.tone) : undefined;
  const faceTone = twin?.face?.tones.cheeks ?? twin?.face?.tones.base;
  return harmonise(faceTone, handTone);
}
/** The face's regional tones moved onto the harmonised base, keeping each region's relation to the cheeks. */
export function harmonisedFaceTones(face: FaceIdentity, target: string): ToneMap {
  const ref = lin(face.tones.cheeks ?? face.tones.base), to = lin(target);
  const move = (h?: string) => h && hex(lin(h).map((v, i) => v * to[i] / Math.max(1e-4, ref[i])));
  return { base: move(face.tones.base)!, forehead: move(face.tones.forehead), cheeks: move(face.tones.cheeks), nose: move(face.tones.nose), jaw: move(face.tones.jaw), lips: move(face.tones.lips) };
}
