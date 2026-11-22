// Build the face twin from the scan frames: the identity solve, the measurements and the customer's own skin.
// Kept out of the scan's UI so it can be run (and tested) on any set of frames.
import { Color } from 'three';
import { regionalTones, stubbleDensity, irisColour, type Lm, type Px, type Step } from './face-scan';
import { fromImage, type P3 } from './face-morph';
import { fitHead, fitExpression, irisScale, type ScanFrame } from './portrait-fit';
import { loadPortraitHead, basisFor, bakeIdentity, meshPointsMm, anchoredPoints, eyeCentres, measureSpectacles } from './portrait-head';
import { sampleHairColor } from './portrait-grooming';
import { bakeSkinMap, FACE_OVAL } from './skin-bake';
import type { FaceIdentity } from './twin-profile';

export type Shot = { step: Step | 'sweep'; l: Lm[]; px: Px; photo?: string };
const STABLE = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 33, 133, 263, 362, 234, 454, 127, 356];
/** The eye openings (MediaPipe lid contours), kept out of the skin map. */
export const EYE_OPENINGS = [[33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7], [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249]];
/** Adult interpupillary distance used when the irises cannot give a scale (the population mean, ~63 mm). */
export const MEAN_PD_MM = 63;

/** The fine-tune sliders: each moves a pair of the head's morphs (decrease / increase) on top of the solved face. */
export const FACE_TUNE: { id: string; label: string; decr: string; incr: string }[] = [
  { id: 'jaw', label: 'Jaw width', decr: 'id:chin-bones-decr', incr: 'id:chin-bones-incr' },
  { id: 'chin', label: 'Chin height', decr: 'id:chin-height-decr', incr: 'id:chin-height-incr' },
  { id: 'cheek', label: 'Cheekbones', decr: 'id:cheek-bones-decr', incr: 'id:cheek-bones-incr' },
  { id: 'brow', label: 'Brow ridge', decr: 'id:eyebrows-trans-backward', incr: 'id:eyebrows-trans-forward' },
  { id: 'forehead', label: 'Forehead slope', decr: 'id:forehead-trans-backward', incr: 'id:forehead-trans-forward' },
  { id: 'bridge', label: 'Nose bridge', decr: 'id:nose-hump-decr', incr: 'id:nose-hump-incr' },
  { id: 'nosew', label: 'Nose width', decr: 'id:nose-scale-horiz-decr', incr: 'id:nose-scale-horiz-incr' },
  { id: 'tip', label: 'Nose tip', decr: 'id:nose-point-down', incr: 'id:nose-point-up' },
  { id: 'lips', label: 'Lip fullness', decr: 'id:mouth-lowerlip-volume-decr', incr: 'id:mouth-lowerlip-volume-incr' },
  { id: 'mouth', label: 'Mouth width', decr: 'id:mouth-scale-horiz-decr', incr: 'id:mouth-scale-horiz-incr' },
  { id: 'eyes', label: 'Eye size', decr: 'id:eye-scale-decr', incr: 'id:eye-scale-incr' },
  { id: 'spacing', label: 'Eye spacing', decr: 'id:eye-trans-in', incr: 'id:eye-trans-out' },
  { id: 'age', label: 'Age', decr: '', incr: 'id:age-old' },
  { id: 'neck', label: 'Neck', decr: 'id:neck-scale-horiz-decr', incr: 'id:neck-scale-horiz-incr' },
];
/** The solved weights with the customer's fine-tune applied; every weight stays within its sane range [0, 1]. */
export function tunedWeights(weights: Record<string, number>, tune?: Record<string, number>) {
  const w = { ...weights };
  for (const t of FACE_TUNE) {
    const v = tune?.[t.id] ?? 0; if (!v) continue;
    // a pair is one axis: net value = incr - decr; the slider moves it and the result is split back into the pair
    const net = Math.max(-1, Math.min(1, (w[t.incr] ?? 0) - (t.decr ? w[t.decr] ?? 0 : 0) + v));
    w[t.incr] = Math.max(0, net); if (t.decr) w[t.decr] = Math.max(0, -net);
  }
  for (const k in w) w[k] = Math.max(0, Math.min(1, w[k]));
  return w;
}

function vertexNormals(points: P3[], index: ArrayLike<number>) {
  const n = points.map(() => [0, 0, 0]);
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = [index[i], index[i + 1], index[i + 2]], A = points[a], B = points[b], C = points[c];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const k of [a, b, c]) { n[k][0] += f[0]; n[k][1] += f[1]; n[k][2] += f[2]; }
  }
  // seams: vertices at the same place share one normal
  const key = (p: P3) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`, sum = new Map<string, number[]>();
  points.forEach((p, i) => { const s = sum.get(key(p)) ?? [0, 0, 0]; s[0] += n[i][0]; s[1] += n[i][1]; s[2] += n[i][2]; sum.set(key(p), s); });
  return points.map(p => { const s = sum.get(key(p))!, l = Math.hypot(s[0], s[1], s[2]) || 1; return [s[0] / l, s[1] / l, s[2] / l] as P3; });
}

/** Fit the parametric head to every frame and measure everything the twin keeps. */
export async function buildTwin(shots: Shot[], opt: { onProgress?: (msg: string) => void } = {}): Promise<FaceIdentity> {
  const H = await loadPortraitHead();
  // overall head scale is not a shape: one camera cannot tell it from distance (true size comes from the pupils)
  const names = H.meta.identity.filter(n => !/head-scale-/.test(n));
  const basis = basisFor(H.skin, H.head, H.anchors, names);
  const frame = (s: Shot): ScanFrame => ({ kind: s.step === 'side-a' ? 'left' : s.step === 'side-b' ? 'right' : s.step === 'sweep' ? 'sweep' : s.step, points: s.l.map(p => fromImage(p, s.px.width, s.px.height)) });
  const used = shots.filter(s => s.step !== 'smile'), frames = used.map(frame);
  opt.onProgress?.('Matching your proportions…');
  const fit = fitHead(basis, frames);
  const weights = Object.fromEntries(names.map((n, i) => [n, Math.round(fit.weights[i] * 1000) / 1000]));
  // the customer's own smile, when the smile frame was taken: expression mix with the identity fixed
  const smileShot = shots.find(s => s.step === 'smile');
  let smile: Record<string, number> | undefined;
  if (smileShot) {
    const E = basisFor(H.skin, H.head, H.anchors, H.meta.expressions.filter(n => /smile|cheeks|part|open|squint/.test(n)));
    const w = fitExpression(fit.landmarks, E, frame(smileShot), STABLE);
    smile = Object.fromEntries(E.names.map((n, i) => [n, Math.round(w[i] * 100) / 100]).filter(([, v]) => (v as number) > 0.02));
  }
  // true size: the head scaled so its pupils are as far apart as the customer's (from the irises, or the mean)
  bakeIdentity(H.head, weights);
  let eyes = eyeCentres(H.parts, H.head);
  const frontShot = shots.find(s => s.step === 'front')!, front = frame(frontShot);
  const mmPerPx = irisScale(front);
  const pdPx = front.points.length >= 478 ? Math.hypot(front.points[468][0] - front.points[473][0], front.points[468][1] - front.points[473][1]) : 0;
  const measured = mmPerPx && pdPx ? pdPx * mmPerPx : 0, pd = measured >= 54 && measured <= 74 ? measured : MEAN_PD_MM;
  const pdModel = Math.hypot(eyes.left[0] - eyes.right[0], eyes.left[1] - eyes.right[1], eyes.left[2] - eyes.right[2]);
  const headScale = Math.max(0.9, Math.min(1.1, pd / pdModel));
  // measure on the head at that size
  const base = H.head.scale.x; H.head.scale.setScalar(base * headScale); H.head.updateMatrixWorld(true);
  const pts = meshPointsMm(H.skin, H.head), lm = anchoredPoints(pts, H.anchors); eyes = eyeCentres(H.parts, H.head);
  const spectacles = measureSpectacles(pts, lm, eyes, pd);
  const tones = regionalTones(frontShot.px, frontShot.l);
  // the skin map, from the photos (fitted poses are for the unscaled head: undo the size for the projection)
  opt.onProgress?.('Laying your skin on your twin…');
  const ptsFit = pts.map(p => p.map(v => v / headScale) as P3);
  const index = H.skin.geometry.index!.array, uvAttr = H.skin.geometry.getAttribute('uv');
  const uv = new Float32Array(uvAttr.count * 2); for (let i = 0; i < uvAttr.count; i++) { uv[i * 2] = uvAttr.getX(i); uv[i * 2 + 1] = uvAttr.getY(i); }
  const views = used.map((s, i) => ({ s, pose: fit.poses[i] })).filter(v => v.s.step !== 'sweep' || used.indexOf(v.s) < 8)
    .map(v => ({ img: v.s.px, pose: v.pose, favour: v.s.step === 'front' ? 2.5 : v.s.step === 'up' ? 0.4 : 0.7,
      oval: FACE_OVAL.map(i => [v.s.l[i].x * v.s.px.width, v.s.l[i].y * v.s.px.height] as [number, number]) }));
  const toneLin = new Color(tones.base); // three converts hex (sRGB) to linear working colour
  let skin: { map: string; conf: string; coverage: number } | undefined;
  try {
    skin = bakeSkinMap({ points: ptsFit, normals: vertexNormals(ptsFit, index), uv, index, views: views.slice(0, 4), tone: [toneLin.r, toneLin.g, toneLin.b],
      eyes: EYE_OPENINGS.map(c => c.map(i => lm[i].map(v => v / headScale) as P3)) });
  } catch (e) { console.warn('The skin map could not be made on this device:', e); }
  return {
    weights, smile, spectacles, tones, hairColor: sampleHairColor(frontShot.px, frontShot.l), hairStyle: 'cap',
    stubble: stubbleDensity(frontShot.px, frontShot.l), irisColor: irisColour(frontShot.px, frontShot.l),
    headScale, skinMap: skin?.map, skinConf: skin?.conf, savedAt: Date.now(),
  };
}
