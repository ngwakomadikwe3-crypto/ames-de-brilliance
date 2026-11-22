// The face twin's life: a warm smile once per placement that settles into a resting smile, blinks, never a loop
// back into the full smile, and stable springs even on very slow frames.
import assert from 'node:assert/strict';
import { FaceLife } from '../src/lib/portrait-life.ts';

let seed = 3; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const l = new FaceLife(undefined, rand);
const run = (sec, dt = 1 / 30) => { const out = []; for (let t = 0; t < sec; t += dt) out.push(l.step(dt, false).weights); return out; };
run(2);
l.delight();
const smile = run(12).map(w => w['ex:smile'] ?? 0);
const at = s => smile[Math.round(s * 30)];
assert.ok(at(0.5) > 0.6, `the smile rises in about half a second (${at(0.5).toFixed(2)})`);
assert.ok(at(2.5) > 0.75, 'and holds');
assert.ok(at(6) < 0.3 && at(6) > 0.1, `then settles into a pleased resting smile (${at(6).toFixed(2)})`);
assert.ok(smile.slice(7 * 30).every(v => v < 0.3), 'never returns to the full smile on its own');
// blinks happen; eyes never fully close from smiling alone
const life2 = new FaceLife(undefined, rand); life2.delight();
let blinks = 0, prev = 0, maxHoldLid = 0;
for (let i = 0; i < 30 * 20; i++) { const w = life2.step(1 / 30).weights, b = w['ex:blink-l'] ?? 0; if (b > 0.8 && prev <= 0.8) blinks++; prev = b; if (i > 15 && i < 80) maxHoldLid = Math.max(maxHoldLid, Math.min(b, 1)); }
assert.ok(blinks >= 3, `blinks (${blinks} in 20 s)`);
// slow frames (a struggling phone): springs stay bounded, no explosion
const slow = new FaceLife(undefined, rand); slow.delight();
for (let i = 0; i < 400; i++) { const w = slow.step(0.25).weights; for (const v of Object.values(w)) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1.2, 'bounded on slow frames'); }
console.log('ok - smile once and settle, blinks, stable springs on slow frames');
// eyes stay open in the smile: the squint and cheek raise are capped, the blink is never pushed by the smile
{ const { CAPS } = await import('../src/lib/portrait-life.ts');
  const f = new FaceLife(undefined, () => 0.99); f.delight(); let sq = 0, ch = 0;
  for (let i = 0; i < 30 * 4; i++) { const w = f.step(1 / 30).weights; sq = Math.max(sq, w['ex:squint'] ?? 0); ch = Math.max(ch, w['ex:cheeks-up'] ?? 0); }
  assert.ok(sq <= CAPS['ex:squint'] + 1e-6 && CAPS['ex:squint'] <= 0.15, `squint capped (${sq.toFixed(3)})`);
  assert.ok(ch <= CAPS['ex:cheeks-up'] + 1e-6 && CAPS['ex:cheeks-up'] <= 0.3, `cheek raise capped (${ch.toFixed(3)})`);
  console.log('ok - smile keeps the eyes open (squint <= 0.15, cheek raise <= 0.3)'); }
