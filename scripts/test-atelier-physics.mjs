// node --experimental-strip-types scripts/test-atelier-physics.mjs
import assert from 'node:assert/strict';
import { Chain, Pendulum, FixedStep } from '../src/lib/atelier/physics.ts';
const g = [0, -9.81, 0];
// 1. Tennis bracelet (60 links, 190 mm loop) settles on a 56x40 mm wrist and hangs low under gravity, no penetration.
const wrist = { kind: 'oval', centre: [0, 0, 0], axis: [0, 0, 1], side: [1, 0, 0], halfWidth: 0.028, halfDepth: 0.02, halfLength: 0.05 };
const n = 60, R = 0.19 / (2 * Math.PI);
const ring = Array.from({ length: n }, (_, i) => { const a = i / n * 2 * Math.PI; return [R * Math.cos(a), R * Math.sin(a), 0]; });
const chain = new Chain(ring, true);
const run = new FixedStep(dt => chain.step(dt, g, [wrist], 0.001));
const t0 = performance.now(); for (let f = 0; f < 240; f++) run.advance(1 / 60); const ms = (performance.now() - t0) / 480;
const ys = chain.points.map(p => p[1]), top = Math.max(...ys), bottom = Math.min(...ys);
assert.ok(top < 0.0225 && top > 0.019, `rests on top of wrist (${top})`);
assert.ok(bottom < -0.035, `hangs below the wrist (${bottom})`);
for (const p of chain.points) assert.ok((p[0] / 0.028) ** 2 + (p[1] / 0.02) ** 2 >= 0.98, 'no link inside the wrist');
console.log('ok bracelet drape', { top: +top.toFixed(4), bottom: +bottom.toFixed(4), msPerStep: +ms.toFixed(4) });
// 2. Pendulum: an earring drop kicked sideways swings and settles back under the pivot within ~3 s.
const pivot = [0, 0, 0], drop = new Pendulum(pivot, 0.03);
drop.bob = [0.01, -0.028, 0];
let maxX = 0; const swing = new FixedStep(dt => drop.step(dt, pivot, g));
for (let f = 0; f < 30; f++) { swing.advance(1 / 60); maxX = Math.max(maxX, Math.abs(drop.bob[0])); }
for (let f = 0; f < 180; f++) swing.advance(1 / 60);
assert.ok(Math.abs(drop.bob[0]) < 0.0008, `settled (${drop.bob[0]})`);
assert.ok(Math.abs(Math.hypot(...drop.bob) - 0.03) < 1e-9, 'length kept');
console.log('ok pendulum settles', { x: +drop.bob[0].toFixed(5) });
// 3. Fixed step is frame-rate independent: 30 fps and 144 fps give the same state.
const a = new Pendulum(pivot, 0.03), b = new Pendulum(pivot, 0.03); a.bob = [0.01, -0.028, 0]; b.bob = [0.01, -0.028, 0];
const fa = new FixedStep(dt => a.step(dt, pivot, g)), fb = new FixedStep(dt => b.step(dt, pivot, g));
for (let f = 0; f < 30; f++) fa.advance(1 / 30); for (let f = 0; f < 144; f++) fb.advance(1 / 144);
assert.ok(Math.abs(a.bob[0] - b.bob[0]) < 2e-4, 'same motion at 30 and 144 fps');
console.log('ok fixed timestep');
