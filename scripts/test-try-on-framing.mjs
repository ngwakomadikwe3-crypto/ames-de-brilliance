// node --experimental-strip-types scripts/test-try-on-framing.mjs
import assert from 'node:assert/strict';
import { fitPoints, framedWithMargin, FRAMING_PRESETS, presetFor, zoomRange } from '../src/lib/try-on-framing.ts';
// a relaxed adult hand (mm): wrist at the origin, fingers up, back of the hand toward the camera, plus forearm
const hand = [{ x: 0, y: -45, z: 0 }, { x: 0, y: 0, z: 0 }, { x: -40, y: 35, z: -20 }, { x: -75, y: 85, z: -10 }, { x: -28, y: 89, z: 0 }, { x: -30, y: 175, z: -25 },
  { x: -6, y: 92, z: 0 }, { x: -8, y: 185, z: -30 }, { x: 13, y: 85, z: 0 }, { x: 16, y: 170, z: -35 }, { x: 31, y: 74, z: 0 }, { x: 38, y: 140, z: -40 }, { x: 0, y: 60, z: -30 }, { x: 0, y: 60, z: 12 }];
const screens = { 'phone portrait': 390 / 780, 'phone landscape': 844 / 360, tablet: 820 / 1100, desktop: 1440 / 640 };
for (const [name, aspect] of Object.entries(screens)) {
  const fit = fitPoints(hand, 30, aspect, FRAMING_PRESETS.hand.fill);
  assert.ok(framedWithMargin(hand, fit.centre, fit.distance, 30, aspect, 0.08), `${name}: whole hand inside the frame with margin`);
  // the hand's height takes roughly 60 % of the frame height when height is the limit
  const tan = Math.tan(15 * Math.PI / 180), share = fit.size.h / (2 * tan * (fit.distance - fit.size.d / 2));
  assert.ok(share <= 0.61 && share > 0.25, `${name}: hand height is ${(share * 100).toFixed(0)} % of the frame`);
  // turned side-on (depth across the screen) it still fits
  const turned = hand.map(p => ({ x: p.z, y: p.y, z: -p.x }));
  assert.ok(framedWithMargin(turned, { x: 0, y: fit.centre.y, z: 0 }, fit.distance, 30, aspect, 0.02), `${name}: still framed when turned side-on`);
  const zr = zoomRange(fit); assert.ok(zr.max > fit.distance && zr.max < fit.distance * 1.3 && zr.min < fit.distance);
  console.log(`ok ${name.padEnd(15)} distance ${fit.distance.toFixed(0)} mm, hand ${(share * 100).toFixed(0)} % of frame height`);
}
assert.equal(presetFor('ring'), 'ring'); assert.equal(presetFor('watch'), 'wrist'); assert.equal(presetFor('earrings'), 'portrait');
console.log('ok presets: ring -> ring finger, watch/bracelet -> wrist, necklace/earrings -> portrait');
