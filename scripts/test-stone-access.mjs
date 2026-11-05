import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function load(path, dependencies) {
 const exports={};
 const source=await readFile(new URL(path,import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,require:name=>{assert.ok(name in dependencies,name);return dependencies[name]}});
 return exports;
}
const NextResponse={json:(body,options={})=>({body,status:options.status||200})};
test('inventory writes enforce staff role and reject cross-site requests',async()=>{
 const {stoneWriteGuard}=await load('../src/lib/stone-auth.ts',{'next/server':{NextResponse},'@/lib/staff-session':{getSessionRole:cookie=>cookie||null}});
 const request=(role,headers={})=>new Request('http://localhost:3010/api/stones',{headers:{...(role?{cookie:role}:{}),...headers}});
 assert.equal(stoneWriteGuard(request()).status,401);
 for(const role of ['trader','model','unknown'])assert.equal(stoneWriteGuard(request(role)).status,403);
 assert.equal(stoneWriteGuard(request('owner'),true),null);
 assert.equal(stoneWriteGuard(request('cousin')),null);
 assert.equal(stoneWriteGuard(request('cousin'),true).status,403);
 assert.equal(stoneWriteGuard(request('owner',{origin:'https://other.example'})).status,403);
 assert.equal(stoneWriteGuard(request('owner',{'sec-fetch-site':'cross-site'})).status,403);
 assert.equal(stoneWriteGuard(request('owner',{origin:'http://localhost:3010'})),null);
});
test('inventory handlers reject writes before parsing bodies or touching storage; model reads remain available',async()=>{
 let calls=0;const denied={status:401};
 const db=new Proxy({}, {get:()=>async()=>{calls++;return []}});
 const dependencies={'next/server':{NextResponse},'@/lib/db':db,'@/lib/stone-auth':{stoneWriteGuard:()=>denied}};
 const inventory=await load('../src/app/api/stones/route.ts',dependencies);
 const approval=await load('../src/app/api/stones/approve/route.ts',dependencies);
 for(const handler of [inventory.POST,inventory.PATCH,approval.POST])assert.equal(await handler({}),denied);
 assert.equal(calls,0);
 assert.equal((await inventory.GET()).status,200);assert.equal(calls,1);
});
