// node --experimental-strip-types scripts/test-realistic-hand.mjs
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { clampPose } from '../src/lib/joint-limits.ts';
// flat rest hand: fingers along +y, back of hand +z
const rest = Array.from({ length: 21 }, (_, i) => new Vector3(i >= 5 ? ((i - 5) >> 2) * 20 : -30, i === 0 ? 0 : 60 + (i % 4) * 25, 0));
const about = (axis, deg) => new Quaternion().setFromAxisAngle(new Vector3(...axis), deg * Math.PI / 180);
const local = rest.map(() => new Quaternion());
local[6] = about([1, 0, 0], 40);      // PIP bent BACKWARDS by 40 deg (toward the back of the hand)
local[10] = about([1, 0, 0], -70);    // middle PIP flexed 70 deg toward the palm: allowed
local[5] = about([0, 0, 1], 50);      // index knuckle pushed 50 deg sideways
const out = clampPose(local, rest);
const tilt = (q, i) => { const d = rest[i + 1].clone().sub(rest[i]).normalize(), v = d.clone().applyQuaternion(q); return { flex: Math.atan2(-v.z, v.y) * 180 / Math.PI, side: Math.asin(Math.max(-1, Math.min(1, v.x))) * 180 / Math.PI }; };
assert.ok(tilt(out[6], 6).flex >= -3.01, 'a finger never bends backwards past 3 deg');
assert.ok(Math.abs(tilt(out[10], 10).flex - 70) < 0.5, 'normal flexion passes untouched');
assert.ok(Math.abs(tilt(out[5], 5).side) <= 25.01, 'knuckle sideways travel is limited to 25 deg');
console.log('ok joint limits', { backward: tilt(out[6], 6).flex.toFixed(1), flex: tilt(out[10], 10).flex.toFixed(1), side: tilt(out[5], 5).side.toFixed(1) });
