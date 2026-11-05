import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function resolver({published=true,verified=true,visible=true}={}) {
 const exports={};
 const dependencies={
  'node:fs/promises':{readFile:async()=>'{"ok":true}'},'node:path':require('node:path'),
  './jeweller-listing-store':{getListing:async id=>({id,published})},
  './jeweller-access':{verifiedListingProfile:async()=>{if(!verified)throw Error('Unverified');return{businessName:'Fixture'};}},
  './jeweller-listing':{publicListing:listing=>{if(!listing.published)throw Error('Not public');return{assetId:'listing-'+listing.id,price:null};}},
  './ames-boutique-content':{loadBoutiqueContent:async()=>[{assetId:'fixture-ring'}]},
  './customer-jewelry-display':{showCustomerJewelry:()=>visible},
 };
 vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/community-piece.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,process,Response,require:name=>{if(!(name in dependencies))throw Error(name);return dependencies[name];}});
 return exports.resolveCommentPiece;
}
test('public pieces can receive comments without a selling price; draft and unverified pieces cannot',async()=>{
 const key='piece:listing-01900000-0000-4000-8000-000000000001';
 assert.equal((await resolver()(key)).price,null);
 await assert.rejects(resolver({published:false})(key),/Not public/);
 await assert.rejects(resolver({verified:false})(key),/Unverified/);
});
test('only visible indexed engine pieces resolve, and malformed identities are rejected',async()=>{
 assert.equal((await resolver()('piece:fixture-ring')).assetId,'fixture-ring');
 await assert.rejects(resolver({visible:false})('piece:fixture-ring'));
 for(const key of ['piece:missing-ring','piece:../private','piece:listing-invalid','video:fixture-ring'])await assert.rejects(resolver()(key));
});
