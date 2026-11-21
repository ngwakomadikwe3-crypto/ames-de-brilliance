// node --experimental-strip-types --test scripts/test-clone-hand.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBasicMaterial, Vector3, Quaternion } from 'three';
import { photoQuality, shapeFromPhoto, skinTone, textureCrop } from '../src/lib/hand-photo.ts';
import { buildHand, solvePose, affine } from '../src/lib/clone-hand.ts';

// A flat right hand seen from above (back of the hand), MediaPipe style: image landmarks 0..1, world in metres.
function flatHand(cx = 0.5, cy = 0.85, scale = 0.0022) {
  const mm = [[0, 0], [-22, 18], [-38, 36], [-50, 54], [-58, 70]];
  [[-30, 88, 46, 26, 22], [-10, 92, 50, 31, 24], [10, 89, 47, 30, 23], [29, 82, 38, 22, 20]].forEach(([x, b, a, c, d]) => {
    mm.push([x, b]); let y = b; for (const l of [a, c, d]) { y += l; mm.push([x * (1 + (y - b) / 120), y]); }
  });
  const image = mm.map(([x, y]) => ({ x: cx + x * scale, y: cy - y * scale * 4 / 3, z: 0 }));
  const world = mm.map(([x, y]) => ({ x: x / 1000, y: -y / 1000, z: 0 }));
  return { image, world };
}
function picture(w, h, blur = false) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 4 * (y * w + x), edge = blur ? 0 : ((x >> 3) + (y >> 3)) % 2 * 60;
    data.set([150 + edge, 110 + edge / 2, 90, 255], i);
  }
  return { data, width: w, height: h };
}

test('photo checks: sharp, well lit, whole hand, fingers spread', () => {
  const { image } = flatHand();
  assert.deepEqual(photoQuality(picture(400, 300), image).issues, []);
  assert.ok(photoQuality(picture(400, 300, true), image).issues.some(i => /blurred/.test(i)));
  assert.ok(photoQuality(picture(400, 300), undefined).issues.some(i => /No hand/.test(i)));
  const cut = image.map(p => ({ ...p, y: p.y - 0.35 }));
  assert.ok(photoQuality(picture(400, 300), cut).issues.some(i => /inside the frame/.test(i)));
});

test('shape from the photo: millimetres, the right hand, a texture crop that covers the hand', () => {
  const { image, world } = flatHand();
  const shape = shapeFromPhoto(picture(400, 300), image, world);
  assert.ok(shape);
  assert.equal(shape.side, 'right');
  const palm = Math.hypot(shape.joints[5][0] - shape.joints[17][0], shape.joints[5][1] - shape.joints[17][1]);
  assert.ok(Math.abs(palm - 60) < 3, `knuckle span ${palm}`);
  assert.ok(shape.joints[12][1] > 150, 'middle finger toward +y');
  const crop = textureCrop(400, 300, image);
  assert.ok(crop.uv.every(([u, v]) => u > 0 && u < 1 && v > 0 && v < 1));
  assert.match(skinTone(picture(400, 300), image.map(p => ({ x: p.x * 400, y: p.y * 300 }))), /^#[0-9a-f]{6}$/);
});

test('the 3D hand: watertight-looking surface, one skin weight per vertex, rest pose solves to no rotation', () => {
  const { image, world } = flatHand();
  const shape = shapeFromPhoto(picture(400, 300), image, world);
  const { mesh, rest } = buildHand(shape, new MeshBasicMaterial(), textureCrop(400, 300, image).uv, 64);
  const w = mesh.geometry.getAttribute('skinWeight');
  for (let i = 0; i < w.count; i += 37) assert.ok(Math.abs(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i) - 1) < 1e-4);
  assert.ok(mesh.geometry.getAttribute('position').count > 1000);
  const q = solvePose(rest, rest.map(p => p.clone()));
  assert.ok(q.every(x => Math.abs(Math.abs(x.w) - 1) < 1e-6));
  const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1);
  const q2 = solvePose(rest, rest.map(p => p.clone().applyQuaternion(turn)));
  assert.ok(Math.abs(q2[0].angleTo(turn)) < 1e-6, 'wrist turn carried by the root');
  assert.ok(q2.slice(1).every(x => Math.abs(Math.abs(x.w) - 1) < 1e-6), 'fingers stay unbent');
});

test('affine photo mapping is exact for an affine relation', () => {
  const a = [[0, 0], [10, 0], [0, 10], [5, 7]], b = a.map(([x, y]) => [0.1 + 0.02 * x - 0.01 * y, 0.5 + 0.003 * x + 0.03 * y]);
  const m = affine(a, b);
  assert.ok(Math.abs(m[0] * 5 + m[1] * 7 + m[2] - b[3][0]) < 1e-9 && Math.abs(m[3] * 5 + m[4] * 7 + m[5] - b[3][1]) < 1e-9);
});
