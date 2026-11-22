// Brows, lashes and hair for the portrait twin, grown strand by strand on the fitted head (mm, head frame).
//
// Strands, not shells: brows are short hairs following each brow's arc (rising at the inner head, sweeping out along
// the tail), lashes curl up from the upper lid and down from the lower, and the hair grows from the scalp in clumps
// (a guide strand per clump, children around it converging toward the tips) with a little frizz, kept on the head by
// a collision shell. Styles: short, medium (a side-parted bob), long, tied back (into a ponytail). Rendered as
// camera-facing ribbons with a two-lobe hair highlight (Kajiya-Kay): a white primary shifted toward the root and a
// tinted secondary toward the tip, the way light runs along real hair.
import { BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, Vector3, type Texture } from 'three';
import type { P3 } from './face-morph';

export type HairStyle = 'cap' | 'short' | 'medium' | 'long' | 'tied';
export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'cap', label: 'Close crop' }, { id: 'short', label: 'Short' }, { id: 'medium', label: 'Medium' }, { id: 'long', label: 'Long' }, { id: 'tied', label: 'Tied back' }];

const V = (p: P3) => new Vector3(p[0], p[1], p[2]);
/** A point a fraction t (0..1) of the way along a polyline (by segment count). */
const along = (pl: Vector3[], t: number) => { const f = t * (pl.length - 1), i = Math.min(pl.length - 2, Math.floor(f)); return pl[i].clone().lerp(pl[i + 1], f - i); };
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/** A spatial lookup of the skin: nearest surface point and its normal. */
export class SkinField {
  cells = new Map<string, number[]>(); size = 6;
  constructor(public p: P3[], public n: P3[]) { p.forEach((q, i) => { const k = this.key(q); (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(i); }); }
  key(q: P3) { return `${Math.floor(q[0] / this.size)},${Math.floor(q[1] / this.size)},${Math.floor(q[2] / this.size)}`; }
  nearest(q: P3) {
    let best = -1, bd = Infinity; const [cx, cy, cz] = [0, 1, 2].map(j => Math.floor(q[j] / this.size));
    for (let r = 1; r <= 3 && best < 0; r++) for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++)
      for (const i of this.cells.get(`${x},${y},${z}`) ?? []) { const d = (this.p[i][0] - q[0]) ** 2 + (this.p[i][1] - q[1]) ** 2 + (this.p[i][2] - q[2]) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }
}

type Strand = { pts: Vector3[]; width: number; shade: number; follow?: [Vector3, Vector3] };
export type Follow = (rootIndex: number) => [Vector3, Vector3];

function ribbons(strands: Strand[], color: Color, opt: { spec?: number; env?: Texture | null } = {}) {
  let count = 0; for (const s of strands) count += s.pts.length * 2;
  const d1 = new Float32Array(count * 3), d2 = new Float32Array(count * 3);
  const pos = new Float32Array(count * 3), tan = new Float32Array(count * 3), side = new Float32Array(count), t = new Float32Array(count), wid = new Float32Array(count), shade = new Float32Array(count);
  const index: number[] = []; let v = 0;
  for (const s of strands) {
    const n = s.pts.length;
    for (let i = 0; i < n; i++) {
      const a = s.pts[Math.max(0, i - 1)], b = s.pts[Math.min(n - 1, i + 1)], d = b.clone().sub(a).normalize();
      for (const sd of [-1, 1]) {
        pos.set([s.pts[i].x, s.pts[i].y, s.pts[i].z], v * 3); tan.set([d.x, d.y, d.z], v * 3);
        side[v] = sd; t[v] = i / (n - 1); wid[v] = s.width; shade[v] = s.shade;
        if (s.follow) { d1.set([s.follow[0].x, s.follow[0].y, s.follow[0].z], v * 3); d2.set([s.follow[1].x, s.follow[1].y, s.follow[1].z], v * 3); }
        v++;
      }
      if (i < n - 1) { const k = v - 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3)); g.setAttribute('aTan', new BufferAttribute(tan, 3));
  g.setAttribute('aSide', new BufferAttribute(side, 1)); g.setAttribute('aT', new BufferAttribute(t, 1)); g.setAttribute('aW', new BufferAttribute(wid, 1)); g.setAttribute('aShade', new BufferAttribute(shade, 1));
  g.setAttribute('aD1', new BufferAttribute(d1, 3)); g.setAttribute('aD2', new BufferAttribute(d2, 3));
  g.setIndex(index); g.computeBoundingSphere();
  const m = new ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uLight: { value: new Vector3(-0.35, 0.65, 0.65).normalize() }, uSpec: { value: opt.spec ?? 1 }, uW1: { value: 0 }, uW2: { value: 0 }, uFade: { value: -1e6 } },
    vertexShader: `
      attribute vec3 aTan, aD1, aD2; attribute float aSide, aT, aW, aShade; uniform float uW1, uW2; varying vec3 vT; varying vec3 vV; varying float vt, vShade; varying vec2 vP;
      void main() {
        vec4 wp = modelMatrix * vec4(position + aD1 * uW1 + aD2 * uW2, 1.0);   /* follow the skin expressions */ vec3 T = normalize(mat3(modelMatrix) * aTan);
        vec3 toCam = normalize(cameraPosition - wp.xyz); vec3 side = normalize(cross(T, toCam));
        float scale = length(modelMatrix[0].xyz);
        wp.xyz += side * aSide * aW * 0.5 * scale * (1.0 - 0.85 * aT);           // tapers to the tip
        vT = T; vV = toCam; vt = aT; vShade = aShade; vP = position.xy;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uColor, uLight; uniform float uSpec, uFade; varying vec3 vT; varying vec3 vV; varying float vt, vShade; varying vec2 vP;
      void main() {
        // the same portrait fade as the skin (below the chest, past the shoulders), dithered: hair stays opaque and sorted
        float dy = max(0.0, uFade + 40.0 - vP.y) / 45.0, dx = max(0.0, abs(vP.x) - 95.0) / 80.0, keep = 1.0 - smoothstep(0.55, 1.0, length(vec2(dx, dy)));
        if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > keep) discard;
        vec3 T = normalize(vT), L = normalize(uLight), H = normalize(L + normalize(vV));
        float tl = dot(T, L), diff = sqrt(max(0.0, 1.0 - tl * tl));
        float th1 = dot(normalize(T + vec3(0.0, 0.08, 0.0)), H), th2 = dot(normalize(T - vec3(0.0, 0.12, 0.0)), H);
        float s1 = pow(sqrt(max(0.0, 1.0 - th1 * th1)), 90.0), s2 = pow(sqrt(max(0.0, 1.0 - th2 * th2)), 28.0);
        vec3 base = uColor * vShade * mix(0.55, 1.0, smoothstep(0.0, 0.35, vt));    // darker toward the roots: depth
        vec3 col = base * (0.3 + 0.7 * diff) + uSpec * vShade * (vec3(0.1) * s1 + uColor * 0.45 * s2);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new Mesh(g, m);
}

/** Brows along MediaPipe's brow contours: upper and lower arcs per brow. */
export function growBrows(skin: SkinField, lm: P3[], color: Color, density = 1, follow?: Follow) {
  seed = 7;
  const brows = [{ upper: [107, 66, 105, 63, 70], lower: [55, 65, 52, 53, 46] }, { upper: [336, 296, 334, 293, 300], lower: [285, 295, 282, 283, 276] }];
  const strands: Strand[] = [];
  for (const b of brows) {
    const U = b.upper.map(i => V(lm[i])), L = b.lower.map(i => V(lm[i]));
    const along = (arr: Vector3[], u: number) => { const f = u * (arr.length - 1), i = Math.min(arr.length - 2, Math.floor(f)); return arr[i].clone().lerp(arr[i + 1], f - i); };
    const lateral = Math.sign(U[4].x - U[0].x);
    for (let k = 0; k < 820 * density; k++) {
      const u = rnd(), w = rnd() * (1 - 0.55 * u);                         // the tail thins
      const root = along(L, u).lerp(along(U, u), 0.15 + 0.7 * w);
      const i = skin.nearest([root.x, root.y, root.z]); if (i < 0) continue;
      const p0 = V(skin.p[i]), n = V(skin.n[i]);
      // inner head: hairs stand up; along the body and tail they lie outward and slightly down
      const dir = new Vector3(lateral * (0.45 + 0.9 * u), 0.8 - 1.1 * u + 0.25 * w, 0).normalize();
      const len = 3.6 + 2.6 * rnd() - 1.2 * u;                         // short hairs, lying close to the skin
      const pts: Vector3[] = [];
      for (let s = 0; s <= 5; s++) { const f = s / 5; pts.push(p0.clone().addScaledVector(dir, len * f).addScaledVector(n, 0.12 + 0.35 * f * (1 - f))); }
      strands.push({ pts, width: 0.16, shade: 0.75 + 0.35 * rnd(), follow: follow?.(i) });
    }
  }
  return ribbons(strands, color, { spec: 0.4 });
}

/** Lashes on the upper and lower lids, curling away from the eye. */
export function growLashes(lm: P3[], color: Color, eyes: { left: P3; right: P3 }, skin?: SkinField, follow?: Follow) {
  seed = 11;
  const lids = [
    { line: [33, 246, 161, 160, 159, 158, 157, 173, 133], up: 1, eye: eyes.right, n: 95 }, { line: [33, 7, 163, 144, 145, 153, 154, 155, 133], up: -1, eye: eyes.right, n: 22 },
    { line: [263, 466, 388, 387, 386, 385, 384, 398, 362], up: 1, eye: eyes.left, n: 95 }, { line: [263, 249, 390, 373, 374, 380, 381, 382, 362], up: -1, eye: eyes.left, n: 22 }];
  const strands: Strand[] = [];
  for (const lid of lids) {
    const P = lid.line.map(i => V(lm[i])), E = V(lid.eye);
    for (let k = 0; k < lid.n; k++) {
      const u = 0.04 + 0.92 * rnd(), f = u * (P.length - 1), i = Math.min(P.length - 2, Math.floor(f));
      const root = P[i].clone().lerp(P[i + 1], f - i);
      const out = root.clone().sub(E).setY(0).normalize();                 // away from the eyeball, outward
      const fullness = Math.sin(Math.PI * u);                               // longest at the middle, short at the corners
      const len = (lid.up > 0 ? 7.5 : 2.2) * (0.55 + 0.45 * fullness) * (0.85 + 0.3 * rnd());
      const pts: Vector3[] = [];
      for (let s = 0; s <= 5; s++) { const t = s / 5;
        pts.push(root.clone().addScaledVector(out, len * (0.75 * t)).add(new Vector3(0, lid.up * len * (0.15 * t + 0.55 * t * t), 0))); }
      const ri = skin ? skin.nearest([root.x, root.y, root.z]) : -1;
      strands.push({ pts, width: lid.up > 0 ? 0.16 : 0.1, shade: lid.up > 0 ? 0.9 : 1.3, follow: ri >= 0 ? follow?.(ri) : undefined });
    }
  }
  return ribbons(strands, color, { spec: 0.3 });
}

/** Hair on the scalp: which skin points carry hair (above the hairline, behind and above the ears, down to the nape). */
export function scalpRoots(skin: SkinField, lm: P3[], eyes: { left: P3; right: P3 }) {
  const top = lm[10][1], eyeY = (eyes.left[1] + eyes.right[1]) / 2, eyeZ = (eyes.left[2] + eyes.right[2]) / 2, mouthY = lm[13][1];
  return skin.p.map((p, i) => {
    const ax = Math.abs(p[0]);
    const front = p[2] > eyeZ - 25;
    const hairline = front ? Math.max(eyeY + 24, top - 4 - Math.max(0, ax - 38) * 0.8) : p[2] > eyeZ - 85 ? eyeY + 12 : mouthY - 8;
    return p[1] > hairline && !(front && ax < 30 && p[1] < top - 6) && skin.n[i][1] > -0.6 ? i : -1;
  }).filter(i => i >= 0);
}

/** Grow a hairstyle. */
export function growHair(skin: SkinField, roots: number[], style: Exclude<HairStyle, 'cap'>, color: Color, lm: P3[], shoulders: { y: number }, ears?: { left: P3; right: P3 }) {
  seed = 23;
  // a collision shell: the head as an ellipsoid fitted to the scalp, the neck and shoulders below it
  const R = roots.map(i => V(skin.p[i]));
  const c = R.reduce((a, b) => a.add(b), new Vector3()).divideScalar(R.length);
  const rad = new Vector3(); R.forEach(p => { rad.x = Math.max(rad.x, Math.abs(p.x - c.x)); rad.z = Math.max(rad.z, Math.abs(p.z - c.z)); rad.y = Math.max(rad.y, p.y - c.y); });
  const centre = new Vector3(c.x, c.y - rad.y * 0.25, c.z);
  const radii = new Vector3(rad.x * 1.02, rad.y * 1.2, rad.z * 1.04);
  const keepOut = (p: Vector3, gap: number) => {
    const q = p.clone().sub(centre); const k = Math.hypot(q.x / (radii.x + gap), q.y / (radii.y + gap), q.z / (radii.z + gap));
    if (k < 1 && p.y > shoulders.y + 40) p.copy(centre.clone().add(q.divideScalar(k)));
    if (ears) for (const e of [ears.left, ears.right]) {                   // tucked behind the ears: earrings stay in view
      if (Math.sign(p.x) === Math.sign(e[0]) && p.y < e[1] + 38 && p.y > e[1] - 30 && p.z > e[2] - 22 && Math.abs(p.x) > Math.abs(e[0]) - 30) p.z = e[2] - 22;
    }
    if (p.y < shoulders.y + 60) {                                          // over the shoulders and back, not through them
      const r = Math.hypot(p.x, p.z - (centre.z - 10)), body = 70 + Math.max(0, shoulders.y + 60 - p.y) * 1.2;
      if (r < body) { const s = body / Math.max(1e-3, r); p.x *= s; p.z = centre.z - 10 + (p.z - (centre.z - 10)) * s; }
    }
  };
  const part = 14, tail = new Vector3(0, lm[10][1] - 70, centre.z - radii.z * 0.95);   // side part, ponytail tie point
  const spec = { short: { len: [28, 48], n: 18000, seg: 7 }, medium: { len: [95, 135], n: 20000, seg: 12 }, long: { len: [230, 300], n: 20000, seg: 14 }, tied: { len: [60, 110], n: 18000, seg: 10 } }[style];
  const strands: Strand[] = [];
  const clumps = Math.round(spec.n / 22);
  for (let g = 0; g < clumps; g++) {
    const ri = roots[Math.floor(rnd() * roots.length)], root = V(skin.p[ri]), n = V(skin.n[ri]);
    // the guide: out of the scalp, then along the style's flow, gravity, kept off the head
    const len = spec.len[0] + (spec.len[1] - spec.len[0]) * rnd();
    const away = root.x - part >= 0 ? 1 : -1;
    // away from the face: outward from the face's centre line and back, never across the face
    const outward = new Vector3(root.x - (root.x - part >= 0 ? -6 : 6) * 0, 0, Math.min(0, root.z - (centre.z + radii.z * 0.35))).setY(0);
    if (outward.lengthSq() < 1) outward.set(away, 0, -1);
    outward.normalize();
    // the front hairline is brushed up and back toward its side of the parting, never down over the eyes
    const frontRoot = root.z > centre.z + radii.z * 0.2;
    if (frontRoot && style !== 'tied') {
      const f = new Vector3((root.x - part >= 0 ? 1 : -1) * 0.4, 0.2, -1).normalize();
      const guideF: Vector3[] = [root.clone().addScaledVector(n, 0.3)]; let dF = n.clone().multiplyScalar(0.2).add(f).normalize();
      const lenF = spec.len[0] + (spec.len[1] - spec.len[0]) * rnd(), stepF = lenF / spec.seg;
      for (let s2 = 1; s2 <= spec.seg; s2++) { const p = guideF[s2 - 1].clone().addScaledVector(dF, stepF); keepOut(p, 1.5 + 2 * Math.min(1, s2 / 3)); guideF.push(p);
        dF = p.clone().sub(guideF[s2 - 1]).normalize().add(new Vector3(0, -(style === 'short' ? 0.12 : 0.3) * (s2 / spec.seg), -0.05)).normalize(); }
      for (let k = 0; k < 22; k++) { const off = new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(5), lf = 0.75 + 0.25 * rnd();
        const pts = guideF.map((_, s2) => along(guideF, s2 / spec.seg * lf).addScaledVector(off, 1 - 0.7 * s2 / spec.seg)); pts.forEach((p, s2) => { if (s2) keepOut(p, 0.8); });
        strands.push({ pts, width: 0.5, shade: 0.7 + 0.45 * rnd() }); }
      continue;
    }
    const flow = style === 'short' ? new Vector3(outward.x * 0.2, -0.55, -1)
      : style === 'tied' ? tail.clone().sub(root).normalize()
      : new Vector3(outward.x + away * 0.25, -0.2, outward.z - 0.55);
    void away;
    const guide: Vector3[] = [root.clone().addScaledVector(n, 0.3)];
    let dir = n.clone().multiplyScalar(0.6).add(flow.clone().normalize()).normalize();
    const step = len / spec.seg, layer = style === 'short' ? 1 + 2 * rnd() : 1.5 + 5 * rnd();       // short hair hugs the head
    for (let s = 1; s <= spec.seg; s++) {
      const p = guide[s - 1].clone().addScaledVector(dir, step);
      keepOut(p, layer * Math.min(1, s / 3));
      guide.push(p);
      const grav = style === 'short' ? 0.4 : style === 'tied' ? 0.05 : 0.45 + 0.4 * (s / spec.seg);
      dir = p.clone().sub(guide[s - 1]).normalize().add(new Vector3(0, -grav, 0)).normalize();
      if (style === 'tied' && p.distanceTo(tail) < 14) { while (guide.length <= spec.seg) guide.push(tail.clone().add(new Vector3(0, -(guide.length - s) * 18, -6))); break; }
    }
    // children around the guide, converging toward the tips, with a little frizz
    // (each child a little shorter or longer than its guide: soft, uneven ends instead of a blunt cut line)
    for (let k = 0; k < 22; k++) {
      const off = new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(7), lf = 0.72 + 0.28 * rnd();
      const pts = guide.map((_, s) => { const t = s / spec.seg, p = along(guide, t * lf), conv = 1 - 0.7 * t;
        return p.addScaledVector(off, conv).add(new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.7 * t)); });
      pts.forEach((p, s) => { if (s > 0) keepOut(p, 0.8); });
      strands.push({ pts, width: 0.5, shade: 0.7 + 0.45 * rnd() });
    }
  }
  if (style === 'tied') {                                                   // the ponytail itself
    for (let k = 0; k < 2600; k++) {
      const off = new Vector3(rnd() - 0.5, 0, rnd() - 0.5).multiplyScalar(9), len = 150 + 60 * rnd(), pts: Vector3[] = [];
      for (let s = 0; s <= 12; s++) { const t = s / 12; const p = tail.clone().add(off.clone().multiplyScalar(1 + 1.6 * t)).add(new Vector3(0, -len * t, -14 * t - 10 * t * t)); keepOut(p, 2); pts.push(p); }
      strands.push({ pts, width: 0.42, shade: 0.75 + 0.4 * rnd() });
    }
  }
  return ribbons(strands, color, { spec: 1 });
}

/** Hair colour from the scan: the median colour just above the forehead in the front frame, darkened slightly for
 *  depth; a natural dark brown when the photo does not show hair there. */
export function sampleHairColor(img: { data: Uint8ClampedArray; width: number; height: number }, lm: { x: number; y: number }[]) {
  const top = lm[10], chin = lm[152], h = Math.hypot((chin.x - top.x) * img.width, (chin.y - top.y) * img.height);
  const cols: number[][] = [];
  for (let dx = -0.12; dx <= 0.12; dx += 0.02) for (let dy = 0.06; dy <= 0.14; dy += 0.02) {
    const x = Math.round(top.x * img.width + dx * h), y = Math.round(top.y * img.height - dy * h);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    const i = 4 * (y * img.width + x); cols.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
  }
  if (cols.length < 8) return '#2b1d14';
  cols.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]);
  const m = cols[Math.floor(cols.length * 0.4)];
  return '#' + m.map(v => Math.round(v * 0.85).toString(16).padStart(2, '0')).join('');
}
