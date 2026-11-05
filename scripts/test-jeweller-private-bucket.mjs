import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url), ts = require('typescript');
function load(storage) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/jeweller-private-bucket.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,process:{env:{}},require:()=>({getStorage:()=>storage})});
 return exports;
}
test('reuses existing private document storage without adding a bucket or broadening permissions',async()=>{
 let change;
 const api=load({getBucket:async()=>({$permissions:[],name:'Existing private documents',allowedFileExtensions:['jpg','pdf'],maximumFileSize:4194304}),updateBucket:async v=>{change=v;}});
 await api.ensureJewellerPrivateBucket();assert.equal(change.bucketId,'jewelry-sources');assert.ok(change.allowedFileExtensions.includes('bin'));assert.ok(change.allowedFileExtensions.includes('pdf'));assert.equal(change.permissions,undefined);assert.equal(change.fileSecurity,undefined);
});
test('rejects publicly permitted buckets before any upload or settings change',async()=>{
 let changed=false;const api=load({getBucket:async()=>({$permissions:['read("any")']}),updateBucket:async()=>{changed=true;}});
 await assert.rejects(api.ensureJewellerPrivateBucket(),/private storage/);assert.equal(changed,false);
});
test('leaves an unrestricted private bucket and its existing size limit intact',async()=>{
 let changed=false;const api=load({getBucket:async()=>({$permissions:[],allowedFileExtensions:[],maximumFileSize:0}),updateBucket:async()=>{changed=true;}});
 await api.ensureJewellerPrivateBucket();assert.equal(changed,false);
});
test('concurrent first provision resolves the conflict and validates the winning bucket',async()=>{
 let calls=0;const api=load({getBucket:async()=>{if(!calls++)throw{code:404};return{$permissions:[],allowedFileExtensions:[],maximumFileSize:4194304};},createBucket:async()=>{throw{code:409};}});
 await api.ensureJewellerPrivateBucket();assert.equal(calls,2);
});
