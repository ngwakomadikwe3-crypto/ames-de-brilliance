import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auctionStonePreviews } from '../src/lib/ames-auction-content.ts';

test('auction preview excludes mounted jewelry and unknown categories', () => {
  const categories = ['diamond', 'ruby', 'sapphire', 'emerald', 'precious-stone', 'ring', 'earrings', 'pendant', 'necklace', 'bracelet', 'unknown'];
  const pieces = categories.map(category => ({ category, name: 'Diamond jewelry', assetId: category }));
  assert.deepEqual(auctionStonePreviews(pieces).map(piece => piece.assetId), categories.slice(0, 5));
  assert.deepEqual(auctionStonePreviews([]), []);
});
