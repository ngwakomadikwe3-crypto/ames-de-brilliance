import { reviewedLicensing } from './fixtures/botswana-licensing.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import {Query} from 'node-appwrite';
import * as workflow from '../src/lib/stone-verification.ts';
async function load(path,dependencies){const exports={};const source=await readFile(new URL(path,import.meta.url),'utf8');vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{assert.ok(name in dependencies,name);return dependencies[name]},Date,JSON,Set,Number,Error});return exports}
function complete(){return {...workflow.emptyStoneReview(),botswanaLicensing:reviewedLicensing(),title:'Reviewed ruby',species:'ruby',form:'polished',origin:'natural',treatments:'none-reported',carats:1.2,measurements:'6 x 5 x 3 mm',reportStatus:'not-issued',reportEvidence:'Private evidence: physical identification, no lab report issued',tradeScope:'domestic',checks:Object.fromEntries(workflow.reviewChecks.map(key=>[key,{checked:true,evidence:'Private DOC-1'}]))}}
async function setup(){
 const rows=new Map([['stones',new Map([['s1',{$id:'s1',ref:'R1',status:'Available',carat:1.2,source:'Consigned',trader_id:'t1',$updatedAt:'initial'}]])],['traders',new Map([['t1',{$id:'t1',status:'Active',$updatedAt:'initial'}]])]]);let sequence=0;
 const error=code=>Object.assign(new Error('Mock storage failure'),{code});
 const db={
  getCollection:async({collectionId})=>{if(!rows.has(collectionId))throw error(404);return {$permissions:[],documentSecurity:false}},
  createCollection:async({collectionId})=>{if(rows.has(collectionId))throw error(409);rows.set(collectionId,new Map());},
  listAttributes:async()=>({attributes:['stoneId','payload'].map(key=>({key,status:'available'}))}),
  getDocument:async({collectionId,documentId})=>{const row=rows.get(collectionId)?.get(documentId);if(!row)throw error(404);return structuredClone(row)},
  createDocument:async({collectionId,documentId,data})=>{const map=rows.get(collectionId);if(map.has(documentId))throw error(409);const row={$id:documentId,$sequence:++sequence,$createdAt:'same-timestamp',...data};map.set(documentId,row);return structuredClone(row)},
  listDocuments:async({collectionId,queries})=>{if(!rows.has(collectionId))throw error(404);let result=[...rows.get(collectionId).values()];for(const raw of queries||[]){const q=JSON.parse(raw);if(q.method==='equal')result=result.filter(r=>q.values.includes(r[q.attribute]));if(q.method==='orderDesc')result.sort((a,b)=>a[q.attribute]<b[q.attribute]?1:-1);if(q.method==='limit')result=result.slice(0,q.values[0]);}return {documents:structuredClone(result)}}
 };
 const store=await load('../src/lib/stone-review-store.ts',{'node:crypto':crypto,'node-appwrite':{Query},'./appwrite':{DB_ID:'ames',getDb:()=>db},'./stone-verification':workflow});return {store,rows,db};
}
test('actual store gates publication, uses latest immutable draft, invalidates inventory/seller edits and withdraws',async()=>{
 const {store,rows}=await setup();assert.equal((await store.publicStoneCatalogue()).length,0);
 let detail=await store.saveReview('s1',workflow.emptyStoneReview(),'Reviewer','draft');await assert.rejects(store.publishReview('s1',detail.draft.id,'Reviewer'));
 detail=await store.saveReview('s1',complete(),'Reviewer','evidence reviewed');const approvedId=detail.draft.id;
 detail=await store.publishReview('s1',approvedId,'Reviewer');assert.equal(detail.published,true);assert.equal((await store.publicStoneCatalogue()).length,1);
 assert.equal(JSON.stringify(await store.publicStoneCatalogue()).includes('Private'),false);
 await store.publishReview('s1',approvedId,'Reviewer');assert.equal(rows.get('stone_publications').size,1);
 rows.get('traders').get('t1').$updatedAt='changed';assert.equal((await store.publicStoneCatalogue()).length,0);
 detail=await store.saveReview('s1',complete(),'Reviewer','rechecked seller');await assert.rejects(store.publishReview('s1',approvedId,'Reviewer'),/changed/);
 await store.publishReview('s1',detail.draft.id,'Reviewer');
 await store.saveReview('s1',complete(),'Reviewer','Withdrawn: evidence needs recheck');assert.equal((await store.publicStoneCatalogue()).length,0);
 detail=await store.reviewDetail('s1');rows.get('stones').get('s1').status='Sold';await assert.rejects(store.publishReview('s1',detail.draft.id,'Reviewer'));assert.equal((await store.publicStoneCatalogue()).length,0);
});
test('private API enforces owner guard before storage and explicit publication confirmation',async()=>{
 let calls=0;const response={json:(body,options={})=>({body,status:options.status||200})};
 const deps={'next/server':{NextResponse:response},'@/lib/jewelry-auth':{jewelryOwnerGuard:req=>req.denied?response.json({error:'Forbidden'},{status:403}):null},'@/lib/stone-review-store':{reviewDetail:()=>{calls++;return {}},saveReview:()=>{calls++;return {}},publishReview:()=>{calls++;return {}}}};
 const api=await load('../src/app/api/stone-reviews/[id]/route.ts',deps);const params={params:Promise.resolve({id:'s1'})};
 assert.equal((await api.POST({denied:true},params)).status,403);assert.equal(calls,0);
 assert.equal((await api.GET({denied:true},params)).status,403);assert.equal(calls,0);
 const res=await api.POST({json:async()=>({action:'publish',reviewer:'Reviewer',draftId:'v1',confirmed:false})},params);assert.equal(res.status,400);assert.equal(calls,0);
});

test('deleted inventory is omitted without hiding other approved stones',async()=>{
 const {store,rows}=await setup();
 const first=await store.saveReview('s1',complete(),'Reviewer','review');
 await store.publishReview('s1',first.draft.id,'Reviewer');
 rows.get('stones').set('s2',{...rows.get('stones').get('s1'),$id:'s2',ref:'R2'});
 const second=await store.saveReview('s2',complete(),'Reviewer','review');
 await store.publishReview('s2',second.draft.id,'Reviewer');
 rows.get('stones').delete('s1');
 const items=await store.publicStoneCatalogue();
 assert.equal(items.length,1);assert.equal(items[0].stoneId,'s2');
});

test('unsafe collection permissions and storage failures fail closed',async()=>{
 const {store,db}=await setup();
 const draft=await store.saveReview('s1',complete(),'Reviewer','review');
 await store.publishReview('s1',draft.draft.id,'Reviewer');
 const original=db.getCollection;
 for(const permissions of [{$permissions:['read("any")'],documentSecurity:false},{$permissions:[],documentSecurity:true}]) {
  db.getCollection=async()=>permissions;
  await assert.rejects(store.publicStoneCatalogue(),/permissions are unsafe/);
  await assert.rejects(store.saveReview('s1',complete(),'Reviewer','review'),/permissions are unsafe/);
 }
 db.getCollection=original;
 db.getDocument=async()=>{throw Object.assign(new Error('Unavailable'),{code:503})};
 await assert.rejects(store.publicStoneCatalogue(),/Unavailable/);
});
