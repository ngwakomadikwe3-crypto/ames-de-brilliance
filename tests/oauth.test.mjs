import test from 'node:test';
import assert from 'node:assert/strict';
import {startFixture} from './appwrite-fixture.mjs';
import {customerConfig} from '../src/lib/customer/config.mjs';
import {createAppwriteGateway,documentId} from '../src/lib/customer/appwrite.mjs';
import {createCustomerService} from '../src/lib/customer/service.mjs';

async function fixture(origin='https://houseofames.com'){
 const f=await startFixture();let now=Date.now();
 const config=customerConfig({APPWRITE_ENDPOINT:f.endpoint,APPWRITE_PROJECT_ID:f.project,APPWRITE_API_KEY:f.key,AMES_APP_ORIGIN:origin,ASSET_DELIVERY_SECRET:'fixture-only-'.repeat(8)});
 const gateway=createAppwriteGateway(config),service=createCustomerService(config,gateway,()=>now);
 const req=(path,method='GET',cookie='',headers={})=>service.handle(new Request(new URL(path.startsWith('/')?path:'/api/customer/'+path,origin),{method,headers:{origin,cookie,...headers}}));
 const start=async(provider='google',cookie='')=>{const response=await req('oauth/'+provider,'POST',cookie);assert.equal(response.status,200);assert.ok(!(await response.clone().text()).includes(f.key));return {cookie:response.headers.getSetCookie()[0].split(';')[0],...f.oauthStarts.at(-1)};};
 const callback=(a,user='alice',cookie=a.cookie)=>{const secret='one-time-'+Math.random();f.oauthTokens.set(secret,user);const url=new URL(a.success);url.searchParams.set('userId',user);url.searchParams.set('secret',secret);return {url,run:()=>req(url.pathname+url.search,'GET',cookie)};};
 return {...f,config,gateway,req,start,callback,advance:ms=>now+=ms};
}
const sessionCookie=r=>r.headers.getSetCookie().find(c=>/^(__Host-)?ames_customer=/.test(c)).split(';')[0];

for(const provider of ['google','microsoft'])test(`${provider}: SDK token exchange preserves account data, roles and logout`,async()=>{
 const f=await fixture();try{
  await f.gateway.put('profiles',documentId('alice'),{userId:'alice',kind:'profile',accountState:'active',preferences:{sound:false},photo:{fileId:'existing-photo'}});
  await f.gateway.put('favorites','saved',{userId:'alice',assetId:'stone-001',kind:'stone'});
  const a=await f.start(provider),r=await f.callback(a).run();assert.equal(r.status,303);assert.equal(r.headers.get('location'),'https://houseofames.com/app');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(sessionCookie(r),/^__Host-ames_customer=/);
  const cookie=sessionCookie(r),s=await(await f.req('session','GET',cookie)).json();assert.equal(s.user.id,'alice');assert.equal(s.access.admin,false);assert.equal(s.access.jeweller,false);
  assert.equal((await f.req('admin/dashboard','GET',cookie)).status,403);assert.equal((await f.req('jewellers/me','GET',cookie)).status,403);
  const state=await(await f.req('state','GET',cookie)).json();assert.equal(state.profile.photo.fileId,'existing-photo');assert.equal(state.profile.preferences.sound,false);assert.equal(state.favorites.length,1);
  await f.gateway.put('jewellers','atelier',{userId:'alice',kind:'JEWELLER_APPLICATION',verificationStatus:'APPLIED'});assert.equal((await f.req('jewellers/me','GET',cookie)).status,403);
  await f.gateway.put('jewellers','atelier',{userId:'alice',kind:'JEWELLER_APPLICATION',verificationStatus:'VERIFIED'});assert.equal((await f.req('jewellers/me','GET',cookie)).status,200);
  const admin=sessionCookie(await f.callback(await f.start(provider),'admin').run());assert.equal((await f.req('admin/dashboard','GET',admin)).status,200);assert.equal((await f.req('jewellers/me','GET',admin)).status,403);
  assert.equal((await f.req('logout','POST',cookie)).status,200);assert.equal((await f.req('session','GET',cookie)).status,401);
 }finally{await f.close();}
});

test('OAuth CSRF, missing/tampered/expired state, replay, invalid credentials and provider failures fail closed',async()=>{
 const f=await fixture();try{
  assert.equal((await f.req('oauth/google','POST','',{origin:'https://evil.example'})).status,403);
  assert.equal((await f.req('oauth/google')).status,405);assert.equal((await f.req('oauth/github','POST')).status,404);
  const a=await f.start();assert.equal(new URL(a.success).origin,f.config.origin);assert.equal(new URL(a.failure).pathname,'/api/customer/oauth/failure');
  for(const cookie of ['',a.cookie+'x']){const r=await f.callback(a,'alice',cookie).run();assert.equal(r.headers.get('location'),f.config.origin+'/login?oauth=expired');assert.ok(!r.headers.get('set-cookie').includes('ames_customer'));}
  const cb=f.callback(a),good=await cb.run();assert.equal(good.headers.get('location'),f.config.origin+'/app');assert.equal((await cb.run()).headers.get('location'),f.config.origin+'/login?oauth=failed');
  const bad=await f.start(),badURL=new URL(bad.success);badURL.searchParams.set('userId','alice');badURL.searchParams.set('secret','invalid');const denied=await f.req(badURL.pathname+badURL.search,'GET',bad.cookie);assert.equal(denied.headers.get('location'),f.config.origin+'/login?oauth=failed');
  const failure=await f.start(),failureURL=new URL(failure.failure);failureURL.searchParams.set('error','private provider detail');const failed=await f.req(failureURL.pathname+failureURL.search,'GET',failure.cookie);assert.equal(failed.headers.get('location'),f.config.origin+'/login?oauth=failed');assert.ok(!(await failed.text()).includes('private provider'));
  const expired=await f.start();f.advance(600001);assert.equal((await f.callback(expired).run()).headers.get('location'),f.config.origin+'/login?oauth=expired');
 }finally{await f.close();}
});

test('signed-in provider linking passes Appwrite session and rejects a different returned identity',async()=>{
 const f=await fixture('http://localhost:3000');try{
  f.sessions.set('password-session','alice');
  const a=await f.start('microsoft','ames_customer=password-session');assert.equal(a.user,'alice');assert.match(a.cookie,/^ames_oauth=/);assert.equal(new URL(a.success).origin,'http://localhost:3000');
  const wrong=await f.callback(a,'bob').run();assert.equal(wrong.headers.get('location'),'http://localhost:3000/login?oauth=failed');assert.equal(f.oauthTokens.size,1);
  const right=await f.callback(await f.start('microsoft','ames_customer=password-session'),'alice').run();assert.equal(right.headers.get('location'),'http://localhost:3000/app');assert.match(sessionCookie(right),/^ames_customer=/);
  await f.gateway.put('profiles',documentId('bob'),{userId:'bob',kind:'profile',accountState:'disabled'});
  const disabled=await f.callback(await f.start(),'bob').run();assert.equal(disabled.headers.get('location'),'http://localhost:3000/login?oauth=failed');assert.ok(![...f.sessions.values()].includes('bob'));
 }finally{await f.close();}
});
