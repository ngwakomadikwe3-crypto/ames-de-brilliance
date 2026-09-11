import test from 'node:test';
import assert from 'node:assert/strict';
import { matchJeweller, rankJewellers, trustScore } from '../src/lib/jeweller-matching.ts';

const intent = { stage:'HIGH_INTENT', category:'ring', jewelry_type:'ring', shape:'oval', metal:'platinum', budget:6000, budget_max:6000, currency:'USD', urgency:'21', sourcing_intent:true, language:'en' };
const fit = { id:'fit', businessName:'Fit House', categories:['ring'], shapes:['oval'], metals:['platinum'], priceBands:[{min:4000,max:10000,currency:'USD'}], bespoke:true, leadTimeDays:14, verified:true, languages:['en'], responseReliability:.9, fulfillmentSuccess:.9, inventoryFreshness:1 };

test('high-fit source ranks with explainable reasons', () => { const result=matchJeweller(intent,fit); assert.ok(result.matchScore>=80); assert.ok(result.reasons.includes('correct category')); assert.ok(result.reasons.includes('within budget')); assert.equal(result.status,'CANDIDATE'); });
test('hard incompatibilities reduce suitability while trust stays separate', () => { const wrong={...fit,id:'wrong',metals:['yellow gold'],priceBands:[{min:20000,max:30000}],leadTimeDays:45,verified:false}; const result=matchJeweller(intent,wrong); assert.ok(result.matchScore<40); assert.ok(result.hardFailures.includes('required metal unavailable')); assert.ok(result.trustScore<trustScore(fit)); });
test('ranking is deterministic and supports zero, one, or many sources', () => { assert.deepEqual(rankJewellers(intent,[]),[]); const results=rankJewellers(intent,[fit,{...fit,id:'bespoke',businessName:'Bespoke House',verified:false,responseReliability:.5}]); assert.equal(results.length,2); assert.equal(results[0].jewellerId,'fit'); });
test('Chinese and Arabic language signals do not change capability matching', () => { const base=matchJeweller(intent,fit); for(const language of ['zh','ar']) assert.equal(matchJeweller({...intent,language},fit).matchScore,base.matchScore); });
test('bespoke capability can match sourcing with no stocked shape', () => { const result=matchJeweller({...intent,shape:'asscher'}, {...fit,id:'custom',shapes:[],bespoke:true}); assert.ok(result.reasons.includes('bespoke sourcing capability')); assert.ok(result.matchScore>0); });
