import test from 'node:test';
import assert from 'node:assert/strict';
import {startFixture} from './appwrite-fixture.mjs';
import {createAppwriteGateway} from '../src/lib/customer/appwrite.mjs';
import {customerConfig} from '../src/lib/customer/config.mjs';
import {createCustomerService} from '../src/lib/customer/service.mjs';
test('actual node-appwrite SDK over HTTP: session, durable remote rows, owner isolation, logout and private stream',async()=>{
 const f=await startFixture();try{
 const c=customerConfig({APPWRITE_ENDPOINT:f.endpoint,APPWRITE_PROJECT_ID:f.project,APPWRITE_API_KEY:f.key,AMES_APP_ORIGIN:'https://ames.example',ASSET_DELIVERY_SECRET:'fixture-only-'.repeat(8)});let service=createCustomerService(c,createAppwriteGateway(c));
 const req=(p,method='GET',body,token='')=>service.handle(new Request(c.origin+'/api/customer/'+p,{method,headers:{origin:c.origin,cookie:'__Host-ames_customer='+token},body:body===undefined?undefined:JSON.stringify(body)}));
 const login=await req('login','POST',{email:'alice@example.test',password:f.password});assert.equal(login.status,200);const token=login.headers.get('set-cookie').split(';')[0].split('=')[1];
 assert.equal((await req('favorites','PUT',{assetId:'fixture-ring'},token)).status,200);assert.equal((await req('saved','PUT',{assetId:'stone-002'},token)).status,200);
 service=createCustomerService(c,createAppwriteGateway(c));const state=await (await req('state','GET',undefined,token)).json();assert.equal(state.favorites[0].assetId,'fixture-ring');assert.equal(state.saved[0].assetId,'stone-002');
 assert.equal((await req('assets/fixture-premium.glb','GET',undefined,token)).status,403);
 assert.equal(await (await req('assets/stone-001.glb')).text(),'fixture bytes');assert.equal(await createAppwriteGateway(c).health(),true);
 assert.equal((await req('logout','POST',{},token)).status,200);assert.equal((await req('session','GET',undefined,token)).status,401);
 const registered=await req('register','POST',{email:'newcustomer@example.test',password:f.password,name:'Customer'});assert.equal(registered.status,200);const newToken=registered.headers.get('set-cookie').split(';')[0].split('=')[1];assert.equal((await (await req('state','GET',undefined,newToken)).json()).profile.userId,'newcustomer');
 f.bucketPermissions.push('read("any")');assert.equal((await req('assets/stone-001.glb')).status,503);await assert.rejects(()=>createAppwriteGateway(c).health());
 }finally{await f.close();}
});
