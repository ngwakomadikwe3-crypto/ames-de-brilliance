import test from 'node:test';
import assert from 'node:assert/strict';
import { SRGBColorSpace } from 'three';
import { createAMESStoneStage } from '../src/three/AMESStoneStage.ts';

test('stone backdrop matches approved emerald on every edge and stays subtly lit', () => {
  const texture = createAMESStoneStage();
  const {data, width, height} = texture.image;
  assert.equal(texture.colorSpace, SRGBColorSpace);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
    if (!x || !y || x === width - 1 || y === height - 1) assert.deepEqual(pixel, [6, 60, 59, 255]);
    assert.ok(pixel[0] >= 6 && pixel[0] <= 15);
    assert.ok(pixel[1] >= 60 && pixel[1] <= 72);
    assert.ok(pixel[2] >= 59 && pixel[2] <= 71);
    assert.equal(pixel[3], 255);
  }
  assert.ok(data[(64 * width + 64) * 4 + 1] > 60);
  let disposed = false;
  texture.addEventListener('dispose', () => { disposed = true; });
  texture.dispose();
  assert.ok(disposed);
});
