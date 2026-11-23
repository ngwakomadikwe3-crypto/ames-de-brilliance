// node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/test-uv-flow.mjs
// System 2's dense alignment (skin-bake-v2.ts uvFlow/warp) on a synthetic freckled skin patch: a frame shifted and
// gently warped by up to ~9 texels, with different broad shading, is brought back onto the reference to under 1 texel,
// and the warped frame's fine detail matches the reference.
import assert from 'node:assert/strict';
import { uvFlow, warp } from '../src/lib/skin-bake-v2.ts';
const W = 320, H = 240; let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const spots = Array.from({ length: 260 }, () => [rnd() * W, rnd() * H, 0.8 + rnd() * 1.8, 0.25 + rnd() * 0.4]);
const skin = (x, y, shade) => { let v = 1; for (const [a, b, r, d] of spots) { const q = ((x - a) ** 2 + (y - b) ** 2) / (r * r); if (q < 9) v -= d * Math.exp(-q); } return Math.max(0.05, v) * shade; };
const img = (dx, dy, shadeF) => { const f = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const v = skin(x + dx(x, y), y + dy(x, y), shadeF(x, y)) * 180, o = (y * W + x) * 4; f[o] = v; f[o + 1] = v * 0.8; f[o + 2] = v * 0.65; f[o + 3] = x > 8 && y > 8 && x < W - 8 && y < H - 8 ? 255 : 0; } return f; };
const tx = (x, y) => 6 + 3 * Math.sin(y / 60), ty = (x, y) => -4 + 2 * Math.cos(x / 70);
const ref = img(() => 0, () => 0, () => 1);
// the frame sees the skin point p at position p - t: frame(x) = skin(x + t(x))... here frame texel x shows skin at x + t
const frm = img((x, y) => -tx(x, y), (x, y) => -ty(x, y), (x, y) => 0.8 + 0.3 * x / W);
const fl = uvFlow(ref, frm, W, H);
let err = 0, n = 0; for (let y = 30; y < H - 30; y++) for (let x = 30; x < W - 30; x++) { const i = y * W + x; err += Math.hypot(fl[i * 2] - tx(x, y), fl[i * 2 + 1] - ty(x, y)); n++; }
err /= n; console.log(`   mean flow error ${err.toFixed(2)} texels (true shift up to ${Math.hypot(9, 6).toFixed(1)})`);
assert.ok(err < 1, 'aligned to under one texel');
const al = warp(frm, fl, W, H);
const hp = a => { const L = Float32Array.from({ length: W * H }, (_, i) => Math.log(1 + a[i * 4])), o = new Float32Array(W * H);
  for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) { let m = 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) m += L[(y + dy) * W + x + dx]; o[y * W + x] = L[y * W + x] - m / 81; } return o; };
const corrHP = (a, b) => { const p = hp(a), q = hp(b); let sab = 0, saa = 0, sbb = 0; for (let y = 30; y < H - 30; y++) for (let x = 30; x < W - 30; x++) { const i = y * W + x; sab += p[i] * q[i]; saa += p[i] * p[i]; sbb += q[i] * q[i]; } return sab / Math.sqrt(saa * sbb); };
const corr = (a, b) => { let sa = 0, sb = 0, sab = 0, saa = 0, sbb = 0, k = 0; for (let y = 30; y < H - 30; y++) for (let x = 30; x < W - 30; x++) { const o = (y * W + x) * 4; const p = Math.log(1 + a[o]), q = Math.log(1 + b[o]); sa += p; sb += q; sab += p * q; saa += p * p; sbb += q * q; k++; }
  return (sab - sa * sb / k) / Math.sqrt((saa - sa * sa / k) * (sbb - sb * sb / k)); };
const before = corrHP(ref, frm), after = corrHP(ref, al);
console.log(`   fine-detail correlation with the reference: before ${before.toFixed(2)}, after alignment ${after.toFixed(2)}`);
assert.ok(after > 0.9 && after > before + 0.3);
console.log('ok - dense UV alignment: under one texel, fine detail lines up');
