// LOCKED features regression test: the approved wispy brows and upper/lower lashes are built by portrait-features.ts,
// and must stay present, in place and wispy (thin strands, not a block). Every view (try-on, twin lab) uses that builder.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Color, Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { anchorsFromUV, bakeIdentity, meshPointsMm, anchoredPoints, eyeCentres } from '../src/lib/portrait-head.ts';
import { growFeatures, FEATURE_NAMES } from '../src/lib/portrait-features.ts';

await MeshoptDecoder.ready;
const meta = JSON.parse(readFileSync(new URL('../public/portrait-twin/portrait-head-v2.json', import.meta.url), 'utf8'));
const f = readFileSync(new URL('../public/portrait-twin/portrait-head-v2.glb', import.meta.url)); const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
const g = await new Promise((r, j) => l.parse(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength), '', r, j));
const frame = new Group(), head = g.scene; frame.add(head); head.scale.setScalar(1000); frame.updateMatrixWorld(true);
const parts = {}; head.traverse(o => { if (o.isMesh) parts[o.name.replace(/_/g, ' ').toLowerCase()] = o; });
const skin = parts['head skin'];
bakeIdentity(head, Object.fromEntries(['afr-female', 'afr-male', 'asi-female', 'asi-male', 'cau-female', 'cau-male'].map(n => [`id:base-${n}`, 1 / 6])));
const pts = meshPointsMm(skin, frame), lm = anchoredPoints(pts, anchorsFromUV(skin.geometry, meta.landmarks.uv)), eyes = eyeCentres(parts, frame);
const { brows, lashes } = growFeatures(skin, frame, pts, lm, eyes, new Color('#2a1d15'));
assert.equal(brows.name, FEATURE_NAMES.brows); assert.equal(lashes.name, FEATURE_NAMES.lashes);
assert.ok(frame.children.includes(brows) && frame.children.includes(lashes), 'both are added to the frame');
const strands = m => m.geometry.getAttribute('position').count;
assert.ok(strands(brows) > 3000, `brows have many strands (${strands(brows)} vertices)`);
assert.ok(strands(lashes) > 600, `upper and lower lashes present (${strands(lashes)} vertices)`);
// in place: brows above the eyes on both sides, lashes around the eyes
const eyeY = (eyes.left[1] + eyes.right[1]) / 2, bb = new Box3().setFromBufferAttribute(brows.geometry.getAttribute('position')), lb = new Box3().setFromBufferAttribute(lashes.geometry.getAttribute('position'));
assert.ok(bb.min.y > eyeY + 4 && bb.max.y < eyeY + 30, `brows sit above the eyes (${(bb.min.y - eyeY).toFixed(1)}..${(bb.max.y - eyeY).toFixed(1)} mm)`);
assert.ok(bb.min.x < -25 && bb.max.x > 25, 'brows on both sides');
assert.ok(lb.min.y > eyeY - 12 && lb.max.y < eyeY + 14 && lb.min.x < -25 && lb.max.x > 25, 'lashes around both eyes');
// wispy, not a block: each brow strand is thin
const w = brows.geometry.getAttribute('aW'); let maxW = 0; for (let i = 0; i < w.count; i++) maxW = Math.max(maxW, w.getX(i));
assert.ok(maxW <= 0.2, `brow strands are fine (width ${maxW} mm)`);
console.log('ok - locked features: brows and upper/lower lashes present, in place, wispy');
// every view builds them through the one locked builder (no second copy that could drift or drop them)
{ const { readdirSync } = await import('node:fs');
  const src = readdirSync('src/components').filter(n => n.endsWith('.tsx')).map(n => [n, readFileSync('src/components/' + n, 'utf8')]);
  for (const [n, s] of src) assert.ok(!/growBrows\(|growLashes\(/.test(s), `${n} builds brows/lashes directly: use growFeatures`);
  for (const n of ['PortraitTryOn.tsx', 'TwinLab.tsx']) assert.ok(src.find(([m]) => m === n)[1].includes('growFeatures('), `${n} uses the locked features`);
  console.log('ok - every twin view uses the locked features builder'); }
