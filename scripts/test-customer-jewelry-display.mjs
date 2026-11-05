import test from 'node:test';
import assert from 'node:assert/strict';
import { showCustomerJewelry, hasUnfinishedJewelryImages } from '../src/lib/customer-jewelry-display.ts';
import { loadBoutiqueContent } from '../src/lib/ames-boutique-content.ts';
import { loadMediaContent } from '../src/lib/ames-media-content.ts';
import { readFile } from 'node:fs/promises';
const fetcher=async path=>new Response(await readFile(new URL('../public'+String(path),import.meta.url),'utf8'));
test('customer catalogue excludes white mounts, while gold earring and source packs remain',async()=>{
 const all=await loadBoutiqueContent(fetcher);
 assert.ok(all.some(piece=>piece.assetId==='dev-test-solitaire-mount'));
 assert.ok(all.some(piece=>piece.assetId==='dev-test-pendant-001'));
 assert.deepEqual(all.filter(piece=>showCustomerJewelry(piece.assetId)).map(piece=>piece.assetId),['dev-test-candidate-ring','dev-test-earring-001']);
 for(const id of ['dev-test-solitaire-mount','dev-test-pendant-001'])assert.equal(showCustomerJewelry(id),false);
 assert.equal(hasUnfinishedJewelryImages('dev-test-earring-001'),true);
 assert.equal(hasUnfinishedJewelryImages('dev-test-candidate-ring'),false);
});
test('white archived earring media is withheld even though its live gold preview remains',async()=>{
 const visible=(await loadMediaContent(fetcher)).filter(item=>showCustomerJewelry(item.assetId,'media'));
 assert.ok(visible.length>0);
 assert.deepEqual([...new Set(visible.map(item=>item.assetId))],['dev-test-candidate-ring']);
});
