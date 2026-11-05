import test from 'node:test';
import assert from 'node:assert/strict';
import { customerAnswer } from '../src/lib/same-answer.ts';

test('hides provider reasoning, including truncated answers', () => {
  assert.equal(customerAnswer('<think><!--dify-deepseek-reasoning-->Private analysis</think>Hello, I’m SAME.'), 'Hello, I’m SAME.');
  assert.equal(customerAnswer('<think>unfinished private analysis'), '');
  assert.equal(customerAnswer('<analysis>private</analysis>Welcome'), 'Welcome');
});
test('unsupported engine instructions cannot leak or claim a material change', () => {
  const result = customerAnswer('I changed it to emerald. [[ames-engine:{"action":"change_material_preview"}]]');
  assert.ok(result.includes('cannot change'));
  assert.ok(!result.includes('ames-engine'));
  assert.ok(!result.includes('I changed'));
});
test('ordinary customer-facing text stays intact', () => {
  assert.equal(customerAnswer('A 2 ct ring, priced on request.'), 'A 2 ct ring, priced on request.');
  assert.equal(customerAnswer(null), '');
});
