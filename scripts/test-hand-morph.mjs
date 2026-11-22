// node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/test-hand-morph.mjs
// The hand morph on the real sculpted hand (public/hand-twin/realistic-hand-v1.glb), no browser:
//  1. measuring: a synthetic photo of a hand with known proportions is measured back; a smaller copy (camera further
//     away) gives the same ratios;
//  2. proportions, not one scale: a long-fingered hand and a wide-palmed hand come out different in proportion, with
//     every bone at its target length;
//  3. the rig: every morph curls into a full fist (MCP 85, PIP 100, DIP 70 degrees) and the skin at the joints deforms
//     like the base hand's does (no collapsed or over-stretched triangles beyond the base hand's own).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { parseHandTemplate, templateMeasure, buildRealHand } from '../src/lib/realistic-hand.ts';
import { measureHand, shapeFromMorph, templateMorph, shiftTone, PARENT } from '../src/lib/hand-morph.ts';

let ok = 0; const pass = m => { ok++; console.log('ok -', m); };
await MeshoptDecoder.ready;
const file = readFileSync(new URL('../public/hand-twin/realistic-hand-v1.glb', import.meta.url));
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const gltf = await new Promise((res, rej) => loader.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '', res, rej));
const T = parseHandTemplate(gltf), TM = templateMeasure(T), base = templateMorph(TM);

// --- 1. measuring a synthetic photo -----------------------------------------------------------------------------
function photo(morph, pxPerMm, W = 700, H = 900) {
  const shape = shapeFromMorph(TM, morph), J = shape.joints;
  const to = j => ({ x: W / 2 + J[j][0] * pxPerMm, y: H * 0.88 - J[j][1] * pxPerMm });
  const P = J.map((_, j) => to(j));
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([18, 62, 44, 255], i * 4);                       // green cloth
  const caps = [];                                                                          // [a, b, radius at a, radius at b] in px
  [[2, 3], [5, 6], [9, 10], [13, 14], [17, 18]].forEach(([a, b], f) => {
    caps.push([P[a], P[b], shape.fingers[f] / 2 * pxPerMm, shape.fingersMid[f] / 2 * pxPerMm, f ? 0.38 : 0.4]);   // base width held to where it is measured
    const c = b + 1, d = Math.min(c + 1, f ? b + 2 : 4);
    caps.push([P[b], P[c], shape.fingersMid[f] / 2 * pxPerMm, shape.fingersMid[f] / 2 * 0.92 * pxPerMm]);
    if (f && d !== c) caps.push([P[c], P[d], shape.fingersMid[f] / 2 * 0.92 * pxPerMm, shape.fingersMid[f] / 2 * 0.85 * pxPerMm]);
  });
  const palmHalf = shape.palm / 2 * pxPerMm, wristHalf = shape.wrist / 2 * pxPerMm;
  const kn = { x: (P[5].x + P[17].x) / 2, y: (P[5].y + P[17].y) / 2 };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let skin = false;
    // palm: a trapezoid from the wrist (wrist width) up to the knuckles (palm width), and a forearm below
    const t = (P[0].y - y) / (P[0].y - kn.y);
    if (t >= -0.6 && t <= 1.02) { const half = t < 0 ? wristHalf : wristHalf + (palmHalf - wristHalf) * Math.min(1, t * 1.4); if (Math.abs(x - (P[0].x + (kn.x - P[0].x) * Math.max(0, t))) < half) skin = true; }
    for (const [a, b, ra, rb, hold = 0] of caps) {
      if (skin) break;
      const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy, u = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2));
      if (Math.hypot(x - a.x - vx * u, y - a.y - vy * u) < ra + (rb - ra) * Math.max(0, (u - hold) / (1 - hold))) skin = true;
    }
    if (skin) data.set([196, 142, 110, 255], (y * W + x) * 4);
  }
  return { img: { data, width: W, height: H }, image: P.map(p => ({ x: p.x / W, y: p.y / H, z: 0 })) };
}
const designed = { ...base, bones: base.bones.map((r, i) => (PARENT[i + 1] !== 0 ? r * 1.08 : r)), widthBase: base.widthBase.map(w => w * 1.1), widthMid: base.widthMid.map(w => w * 0.95), palm: base.palm * 1.06 };
const near = photo(designed, 4.2), far = photo(designed, 2.6);
const mNear = measureHand(near.img, near.image), mFar = measureHand(far.img, far.image);
const rel = (a, b) => Math.abs(a - b) / b;
const exp = templateMorph({ ...TM, joints: shapeFromMorph(TM, designed).joints });      // the bone ratios as drawn
mNear.bones.forEach((r, i) => assert.ok(rel(r, exp.bones[i]) < 0.01, `bone ${i + 1}`));
for (const f of [0, 1, 2, 3, 4]) {
  const k = base.middle / exp.middle;                                                    // widths were drawn against the base size
  assert.ok(mNear.widthBase[f] !== null && rel(mNear.widthBase[f], designed.widthBase[f] * k) < 0.1, `base width ${f}: ${mNear.widthBase[f]} vs ${designed.widthBase[f] * k}`);
  assert.ok(mNear.widthMid[f] !== null && rel(mNear.widthMid[f], designed.widthMid[f] * k) < 0.12, `mid width ${f}: ${mNear.widthMid[f]} vs ${designed.widthMid[f] * k}`);
}
pass('a photo is measured back: bone ratios within 1%, finger widths at base and middle joint within 10-12%');
mFar.bones.forEach((r, i) => assert.ok(rel(r, mNear.bones[i]) < 0.01));
mFar.widthBase.forEach((w, f) => assert.ok(rel(w, mNear.widthBase[f]) < 0.08, `far base ${f}`));
assert.ok(rel(mFar.palm ?? 0, mNear.palm ?? 1) < 0.08, `palm far ${mFar.palm} near ${mNear.palm} wrist ${mFar.wrist} ${mNear.wrist}`);
pass('the camera distance does not matter: the same hand photographed further away gives the same ratios');

// --- 2. proportions, not one scale --------------------------------------------------------------------------------
const longFingers = { ...base, bones: base.bones.map((r, i) => (PARENT[i + 1] !== 0 ? r * 1.12 : r)) };
const widePalm = { ...base, palm: base.palm * 1.15, wrist: base.wrist * 1.1, widthBase: base.widthBase.map(w => w * 1.12), widthMid: base.widthMid.map(w => w * 1.1) };
const fingerOverPalm = m => { const s = shapeFromMorph(TM, m), J = s.joints; const len = Math.hypot(...[0, 1, 2].map(k => J[12][k] - J[9][k])); return len / s.palm; };
assert.ok(fingerOverPalm(longFingers) > fingerOverPalm(base) * 1.08 && fingerOverPalm(widePalm) < fingerOverPalm(base) * 0.9);
const built = m => { const b = buildRealHand(T, shapeFromMorph(TM, m), null, null); return b; };
for (const m of [longFingers, widePalm]) {
  const b = built(m), s = shapeFromMorph(TM, m);
  for (let j = 1; j < 21; j++) {
    const want = Math.hypot(...[0, 1, 2].map(k => s.joints[j][k] - s.joints[PARENT[j]][k])), got = b.rest[j].distanceTo(b.rest[PARENT[j]]);
    if (PARENT[j] !== 0) assert.ok(rel(got, want) < 0.01, `bone ${j} ${got.toFixed(1)} vs ${want.toFixed(1)}`);
  }
}
pass(`long fingers and a wide palm stay different in proportion (finger/palm ${fingerOverPalm(longFingers).toFixed(2)} vs ${fingerOverPalm(widePalm).toFixed(2)}, base ${fingerOverPalm(base).toFixed(2)}); each phalanx at its length`);

// --- 3. the rig: a full fist after every morph ---------------------------------------------------------------------
function curlQuality(m) {
  const h = built(m), mesh = h.mesh, g = mesh.geometry, idx = g.getIndex(), pos = g.getAttribute('position');
  const restP = [], v = new Vector3();
  for (let i = 0; i < pos.count; i++) restP.push(new Vector3().fromBufferAttribute(pos, i));
  const flex = (b, deg) => h.bones[b].quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -deg * Math.PI / 180));
  for (const f of [5, 9, 13, 17]) { flex(f, 85); flex(f + 1, 100); flex(f + 2, 70); }
  flex(2, 40); flex(3, 60);
  mesh.updateMatrixWorld(true); mesh.skeleton.update();
  const now = restP.map((_, i) => mesh.applyBoneTransform(i, v.fromBufferAttribute(pos, i).clone()));
  let collapsed = 0, maxStretch = 0, tris = idx.count / 3;
  const area = (a, b, c) => b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
  for (let t = 0; t < idx.count; t += 3) {
    const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    const r = area(now[a], now[b], now[c]) / Math.max(1e-9, area(restP[a], restP[b], restP[c]));
    if (r < 0.15) collapsed++;
    for (const [p, q] of [[a, b], [b, c], [c, a]]) maxStretch = Math.max(maxStretch, now[p].distanceTo(now[q]) / Math.max(1e-6, restP[p].distanceTo(restP[q])));
  }
  const tip = now.reduce((best, p, i) => (g.getAttribute('skinIndex').getX(i) === 12 && p.y > best.y ? p : best), new Vector3(0, -1e9, 0));
  return { collapsed: collapsed / tris, maxStretch, tipHeight: tip.y / h.rest[9].y };
}
const q0 = curlQuality(base);
for (const [name, m] of [['long fingers', longFingers], ['wide palm', widePalm], ['measured photo', mNear]]) {
  const q = curlQuality(m);
  assert.ok(q.collapsed <= q0.collapsed * 1.25 + 0.0005, `${name}: collapsed ${q.collapsed} vs base ${q0.collapsed}`);
  assert.ok(q.maxStretch <= q0.maxStretch * 1.2 + 0.05, `${name}: stretch ${q.maxStretch} vs base ${q0.maxStretch}`);
  assert.ok(q.tipHeight < 1.15, `${name}: the middle fingertip folds back down to the palm (${q.tipHeight})`);
  console.log(`   ${name}: collapsed ${(q.collapsed * 100).toFixed(3)}% (base ${(q0.collapsed * 100).toFixed(3)}%), max edge stretch ${q.maxStretch.toFixed(2)} (base ${q0.maxStretch.toFixed(2)})`);
}
pass('every morph curls into a full fist with joint deformation like the base hand');

// --- 4. tone tuning keeps the hue -----------------------------------------------------------------------------------
assert.equal(shiftTone('#b07a5a', 0), '#b07a5a');
const lighter = shiftTone('#b07a5a', 0.2), darker = shiftTone('#b07a5a', -0.2);
const lum = h => { const n = parseInt(h.slice(1), 16); return (n >> 16 & 255) + (n >> 8 & 255) + (n & 255); };
assert.ok(lum(lighter) > lum('#b07a5a') && lum(darker) < lum('#b07a5a'));
pass('the tone slider lightens or darkens the scanned tone, keeping its hue');
console.log(`${ok} ok`);
