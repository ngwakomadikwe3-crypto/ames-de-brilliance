import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMessageLanguage, matchBoutiquePiece, updateBuyingIntent } from '../src/lib/buying-intelligence.ts';

const assets = names => ({ schemaVersion: 1, assets: names.map(([id, name, category, price, metal = 'platinum']) => ({ id, name, category, price, metal, tags: [metal], specs: `${metal} · ${price} USD`, assetPath: `/api/customer/assets/${id}.glb`, previewPath: null, materialSlots: [], stoneReferences: [], metalCompatibility: [metal], accessTier: 'PUBLIC', status: 'published' })) });
test('vague browsing stays browsing and never surfaces a product', () => { const intent = updateBuyingIntent({ stage: 'BROWSING' }, "I'm just looking"); assert.equal(intent.stage, 'BROWSING'); assert.equal(matchBoutiquePiece(assets([['aurora','Aurora Solitaire','ring',6800]]), intent), null); });
test('category and budget select the closest real catalogue piece', () => { const catalogue = assets([['aurora','Aurora Solitaire','ring',6800],['halo','Halo Pendant','necklace',3900],['studs','Stellar Studs','earring',2400],['river','River Bracelet','bracelet',5200]]); assert.equal(matchBoutiquePiece(catalogue, updateBuyingIntent({stage:'BROWSING'}, 'I need a platinum ring around $7k')).name, 'Aurora Solitaire'); assert.equal(matchBoutiquePiece(catalogue, updateBuyingIntent({stage:'BROWSING'}, 'I need earrings around $2,500')).name, 'Stellar Studs'); assert.equal(matchBoutiquePiece(catalogue, updateBuyingIntent({stage:'BROWSING'}, 'I want a necklace around $4k')).name, 'Halo Pendant'); });
test('category changes replace the active recommendation and reserve intent is explicit', () => { let intent=updateBuyingIntent({stage:'BROWSING'}, 'platinum ring $7,000'); assert.equal(intent.category,'ring'); intent=updateBuyingIntent(intent, 'do you have earrings instead?'); assert.equal(intent.category,'earring'); assert.equal(intent.stage,'HIGH_INTENT'); intent=updateBuyingIntent(intent,'Can you hold this for me?'); assert.equal(intent.stage,'READY_TO_RESERVE'); });
test('cheaper request lowers the matching budget without inventing a piece', () => { const intent = updateBuyingIntent(updateBuyingIntent({stage:'BROWSING'}, 'platinum ring $7,000'), 'show me something cheaper'); assert.equal(intent.budget, 5250); const catalogue = assets([['aurora','Aurora Solitaire','ring',6800],['smaller','Smaller Solitaire','ring',5200]]); assert.equal(matchBoutiquePiece(catalogue, intent).name, 'Smaller Solitaire'); });
test('English, Chinese and Arabic requests produce equivalent buying intent', () => {
  const messages = ['I want an oval platinum ring around $6,000.', '我想找一枚6000美元左右的铂金椭圆形戒指。', 'أبحث عن خاتم بيضاوي من البلاتين بحوالي 6000 دولار.'];
  const intents = messages.map(message => updateBuyingIntent({ stage: 'BROWSING' }, message));
  assert.deepEqual(intents.map(intent => detectMessageLanguage(messages[intents.indexOf(intent)])), ['en', 'zh', 'ar']);
  for (const intent of intents) { assert.equal(intent.category, 'ring'); assert.equal(intent.budget, 6000); assert.equal(intent.metal, 'platinum'); assert.equal(intent.shape, 'oval'); assert.equal(intent.stage, 'HIGH_INTENT'); }
});
test('Chinese and Arabic reserve and sourcing language keeps the shared modes', () => {
  assert.equal(updateBuyingIntent({ stage: 'BROWSING' }, '请帮我预订这枚戒指').mode, 'reserving');
  assert.equal(updateBuyingIntent({ stage: 'BROWSING' }, 'أريد حجز هذا الخاتم').mode, 'reserving');
  assert.equal(updateBuyingIntent({ stage: 'BROWSING' }, '请咨询是否有货').mode, 'enquiring');
  assert.equal(updateBuyingIntent({ stage: 'BROWSING' }, 'هل القطعة متاحة؟').mode, 'enquiring');
});
