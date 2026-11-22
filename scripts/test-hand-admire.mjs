// The admire flutter: plays once for about a second, settles exactly back to the pose, never loops.
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { HandAdmire, ADMIRE_SECONDS } from '../src/lib/hand-admire.ts';

// a flat template hand: wrist at the origin, digits along +y, palm facing -z
const rest = [new Vector3(0, 0, 0)];
for (let f = 0; f < 5; f++) for (let j = 1; j <= 4; j++) rest.push(new Vector3((f - 2) * 18, 20 + j * 22, 0));
const bones = rest.map(() => ({ quaternion: new Quaternion() }));
const a = new HandAdmire();
assert.equal(a.offsets(0, rest), null, 'idle before any placement');
a.play(1000);
assert.equal(a.offsets(900, rest), null, 'nothing before it starts');
let maxFinger = 0, maxWrist = 0;
for (let ms = 1000; ms < 1000 + ADMIRE_SECONDS * 1000; ms += 16) {
  assert.ok(a.apply(ms, bones, rest));
  maxFinger = Math.max(maxFinger, 2 * Math.acos(Math.min(1, Math.abs(bones[5].quaternion.w))));
  maxWrist = Math.max(maxWrist, 2 * Math.acos(Math.min(1, Math.abs(bones[0].quaternion.w))));
  a.restore(bones);
  bones.forEach(b => assert.ok(Math.abs(b.quaternion.w - 1) < 1e-9, 'restore puts every bone back exactly'));
}
assert.ok(maxFinger > 0.15 && maxFinger < 0.45, `fingers flutter visibly but gently (${maxFinger.toFixed(2)} rad)`);
assert.ok(maxWrist > 0.15 && maxWrist < 0.3, `the wrist turns a little (${maxWrist.toFixed(2)} rad)`);
// flexion is toward the palm (-z) or back, never sideways
{ const q = a.offsets(1000 + 400, rest) ?? (a.play(1000), a.offsets(1400, rest)); const d = new Vector3(0, 1, 0).applyQuaternion(q.get(5)); assert.ok(Math.abs(d.x) < 1e-6, 'index finger flexes in its own plane'); }
a.play(5000); a.offsets(5000 + ADMIRE_SECONDS * 1000 + 1, rest);
assert.equal(a.offsets(5000 + ADMIRE_SECONDS * 1000 + 500, rest), null, 'never loops');
assert.equal(a.active, false);
// reduced motion: still fingers, a gentle wrist turn only
a.play(0); const r = a.offsets(550, rest, true);
assert.deepEqual([...r.keys()], [0], 'reduced motion: wrist only');
console.log('ok - admire plays once, settles exactly, never loops; reduced motion keeps fingers still');
