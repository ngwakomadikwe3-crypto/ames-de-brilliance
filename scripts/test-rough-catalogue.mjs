import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { roughStonesOnly, searchRoughStones } from '../src/lib/rough-stone-catalogue.ts';
import { emptyStoneReview, publicStoneRecord, stoneReviewSchema } from '../src/lib/stone-verification.ts';

const rows=['diamond','quartz','tourmaline','garnet','amethyst','aquamarine'].map((species,i)=>publicStoneRecord(`s${i}`,`R${i}`,{...emptyStoneReview(),title:`Rough ${species}`,species:'other-precious-stone',otherSpecies:species,form:'rough',carats:i+1}));
rows.push({...rows[0],stoneId:'cut',form:'polished'},{...rows[0],stoneId:'unknown',form:'unknown'});
test('all named rough gemstone species are retained; polished and unknown forms are excluded',()=>{
 assert.deepEqual(roughStonesOnly(rows).map(r=>r.species),['diamond','quartz','tourmaline','garnet','amethyst','aquamarine']);
 assert.equal(stoneReviewSchema.parse({...emptyStoneReview(),species:'other-precious-stone',otherSpecies:'tourmaline',form:'rough'}).otherSpecies,'tourmaline');
 assert.equal(searchRoughStones(rows,'QUARTZ')[0].ref,'R1');
 assert.equal(searchRoughStones(rows,'r2','tourmaline').length,1);
 assert.equal(searchRoughStones(rows,'quartz','diamond').length,0);
 assert.deepEqual(roughStonesOnly([]),[]);
});
function api(store){
 const exports={};const source=readFileSync('src/app/api/rough-stones/route.ts','utf8');
 const deps={'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},'@/lib/stone-review-store':{publicStoneCatalogue:store},'@/lib/rough-stone-catalogue':{roughStonesOnly}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.ok(n in deps,n);return deps[n]}});return exports;
}
test('actual public route filters after the review store and never caches inventory',async()=>{
 let calls=0;const response=await api(async()=>{calls++;return rows}).GET();
 assert.equal(calls,1);assert.equal(response.body.items.length,6);assert.ok(response.body.items.every(r=>r.form==='rough'));assert.equal(response.headers['Cache-Control'],'no-store');
});
test('store outage is distinguishable from empty stock and leaks no backend detail',async()=>{
 const failed=await api(async()=>{throw Error('private backend detail')}).GET();assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed).includes('private backend'));
 const empty=await api(async()=>[]).GET();assert.equal(empty.body.items.length,0);assert.notEqual(empty.status,503);
});
