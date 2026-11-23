// node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/test-room-blend.mjs
// Room light (room-blend.ts): the camera's read of the room moves the studio key toward it, never all the way, never
// from below or behind, keeps the key's brightness, and bounds the exposure change.
import assert from 'node:assert/strict';
import { blendRoom } from '../src/lib/room-blend.ts';
const studio = [0, 0.63, 0.77], len = v => Math.hypot(...v);
const left = blendRoom({ luminance: 0.2, direction: [-0.8, 0.3, 0.5], colour: [1, 0.85, 0.7] }, studio, 1.2);
assert.ok(left.keyDir[0] < -0.2 && left.keyDir[0] > -0.6, `a window on the left pulls the key left, halfway (${left.keyDir[0].toFixed(2)})`);
assert.ok(Math.abs(len(left.keyDir) - 1) < 1e-9 && left.keyDir[1] > 0 && left.keyDir[2] > 0);
assert.ok(Math.max(...left.keyColour) <= 1 + 1e-9 && left.keyColour[2] < left.keyColour[0], 'warm room, warmer key, brightness kept');
const below = blendRoom({ luminance: 0.2, direction: [0, -0.9, 0.1], colour: [1, 1, 1] }, studio, 1.2);
assert.ok(below.keyDir[1] > 0.3, 'light from below (a screen glow) never lights the twin from below');
for (const lum of [0, 0.01, 0.2, 1]) { const b = blendRoom({ luminance: lum, direction: [0, 0, 1], colour: [1, 1, 1] }, studio, 1.2); assert.ok(b.exposure >= 1.2 * 0.75 - 1e-9 && b.exposure <= 1.2 * 1.25 + 1e-9, `exposure bounded at luminance ${lum}`); }
const none = blendRoom({ luminance: 0.2, direction: [0.5, 0.5, 0.7], colour: [0.6, 0.8, 1] }, studio, 1.2, 0);
assert.deepEqual(none.keyColour, [1, 1, 1]); assert.ok(Math.abs(none.keyDir[1] - studio[1] / len(studio)) < 1e-9, 'mix 0 is the studio');
console.log('ok - room light: direction halfway toward the room, never from below, colour without brightness change, exposure within 25 %');
