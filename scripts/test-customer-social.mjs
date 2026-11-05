import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import * as social from '../src/lib/customer-social.ts';
const require=createRequire(import.meta.url),ts=require('typescript'),{NextRequest,NextResponse}=require('next/server');
let calls,failSession,user,session;
class Client{setEndpoint(){return this;}setProject(){return this;}setKey(v){this.key=v;return this;}setSession(v){this.secret=v;return this;}}
class Account{constructor(c){this.c=c;}async createSession(input){calls.push(['create',input,this.c]);if(failSession)throw Error('PRIVATE-PROVIDER-ERROR');return session;}async get(){calls.push(['get',this.c]);return user;}async deleteSession(){calls.push(['revoke',this.c]);}}
function load(path){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,Buffer,process,require:name=>name==='next/server'?{NextResponse}:name==='node-appwrite'?{Account,Client}:name.includes('customer-social')?social:name.includes('chat-security')?{checkChatOrigin:()=>{},readChatJson:r=>r.json(),privateHeaders:{'Cache-Control':'private, no-store'},consumeQuota:async()=>calls.push(['quota'])}:(()=>{throw Error(name);})()});return exports;}
const start=load('src/app/api/customer/oauth/route.ts'),callback=load('src/app/api/customer/oauth/callback/route.ts');
const origin='https://houseofames.com';
function request(path,{body,cookie='',originHeader=origin}={}){return new NextRequest(origin+path,{method:body?'POST':'GET',headers:{origin:originHeader,cookie},...(body?{body:JSON.stringify(body)}:{})});}
function attemptRequest(attempt,extra='',cookieOverride){return request('/api/customer/oauth/callback?ames_state='+attempt.nonce+'&userId=fixture-user&secret=one-use-token'+extra,{cookie:cookieOverride??`${social.SOCIAL_COOKIE}=${encodeURIComponent(JSON.stringify(attempt))}`});}
beforeEach(()=>{process.env.NODE_ENV='production';process.env.AMES_SOCIAL_PROVIDERS='google,tiktok';process.env.AMES_AUTH_ORIGIN=origin;process.env.APPWRITE_ENDPOINT='https://fixture.appwrite.invalid/v1';process.env.APPWRITE_PROJECT_ID='fixture-project';process.env.APPWRITE_API_KEY='server-only-fixture';calls=[];failSession=false;user={$id:'fixture-user',email:'fixture@example.invalid',emailVerification:true,status:true};session={userId:'fixture-user',secret:'http-only-session',expire:new Date(Date.now()+86400000).toISOString()};});
test('only explicit providers are enabled; unsupported and disabled options make no provider calls',async()=>{
 process.env.AMES_SOCIAL_PROVIDERS='';assert.deepEqual(social.enabledSocialProviders(),[]);
 assert.equal((await start.POST(request('/api/customer/oauth',{body:{provider:'google'}}))).status,503);
 assert.equal((await start.POST(request('/api/customer/oauth',{body:{provider:'instagram'}}))).status,400);assert.equal(calls.length,0);
 const status=await start.GET();assert.match(status.headers.get('cache-control'),/no-store/);assert.ok((await status.json()).providers.every(p=>!p.enabled));
});
test('origin restrictions reject session substitution and untrusted callback hosts before provider access',async()=>{
 for(const originHeader of ['', 'https://evil.invalid'])assert.equal((await start.POST(request('/api/customer/oauth',{body:{provider:'google'},originHeader}))).status,403);
 assert.throws(()=>social.socialOrigin('https://evil.invalid/api/customer/oauth'));
 assert.throws(()=>social.socialOrigin('http://houseofames.com/api/customer/oauth'));
 assert.equal(calls.length,0);
});
test('start supports Google/TikTok REST provider IDs, fixes redirects, and stores a ten-minute HttpOnly state cookie',async()=>{
 for(const provider of ['google','tiktok']){const r=await start.POST(request('/api/customer/oauth',{body:{provider,returnTo:'https://evil.invalid'}}));assert.equal(r.status,200);const b=await r.json(),url=new URL(b.redirect);assert.equal(url.origin,'https://fixture.appwrite.invalid');assert.equal(url.pathname,'/v1/account/tokens/oauth2/'+provider);const success=new URL(url.searchParams.get('success'));assert.equal(success.origin,origin);assert.equal(success.pathname,'/api/customer/oauth/callback');assert.match(success.searchParams.get('ames_state'),/^[a-f0-9]{64}$/);for(const flag of['HttpOnly','Secure','SameSite=lax','Max-Age=600','Path=/api/customer/oauth'])assert.ok(r.headers.get('set-cookie').includes(flag));assert.ok(!JSON.stringify(b).includes('server-only-fixture'));}
});
test('existing authenticated sessions cannot be silently replaced',async()=>{
 const r=await start.POST(request('/api/customer/oauth',{body:{provider:'google'},cookie:'ames_customer_session=existing'}));assert.equal(r.status,409);assert.equal(calls.length,0);
 const a=social.newSocialAttempt('google');const cb=await callback.GET(attemptRequest(a,'',`${social.SOCIAL_COOKIE}=${encodeURIComponent(JSON.stringify(a))}; ames_customer_session=existing`));assert.match(cb.headers.get('location'),/oauth=failed/);assert.equal(calls.length,0);assert.doesNotMatch(cb.headers.get('set-cookie'),/ames_customer_session/);
});
test('missing, wrong, expired, future and malformed state cannot create a session',async()=>{
 const a=social.newSocialAttempt('google');const invalid=['',JSON.stringify({...a,nonce:'0'.repeat(64)}),JSON.stringify({...a,createdAt:Date.now()-601000}),JSON.stringify({...a,createdAt:Date.now()+60000}),'null'];
 for(const raw of invalid){const r=await callback.GET(attemptRequest(a,'',raw?`${social.SOCIAL_COOKIE}=${encodeURIComponent(raw)}`:''));assert.match(r.headers.get('location'),/oauth=failed/);assert.match(r.headers.get('referrer-policy'),/no-referrer/);assert.ok(!r.headers.get('location').includes('one-use-token'));}assert.equal(calls.length,0);
});
test('successful exchange uses the server key only for session creation, validates identity, and never exposes secrets',async()=>{
 const r=await callback.GET(attemptRequest(social.newSocialAttempt('google')));assert.equal(r.status,303);assert.equal(r.headers.get('location'),origin+'/workspace');assert.equal(calls[0][2].key,'server-only-fixture');assert.equal(calls[1][1].key,undefined);assert.equal(calls[1][1].secret,'http-only-session');const cookies=r.headers.get('set-cookie');for(const flag of['ames_customer_session=','HttpOnly','Secure','SameSite=lax'])assert.ok(cookies.includes(flag));assert.match(cookies,/ames_social_login=;/);assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('referrer-policy'),/no-referrer/);assert.equal(await r.text(),'');
});
test('missing email or unverified email requires account completion, never fake verification',async()=>{
 for(const patch of[{email:''},{emailVerification:false}]){user={...user,...patch};const r=await callback.GET(attemptRequest(social.newSocialAttempt('tiktok')));assert.equal(r.headers.get('location'),origin+'/app/account?oauth=complete');assert.match(r.headers.get('set-cookie'),/ames_customer_session=/);}
});
test('cancellation, duplicate parameters and disabled provider do not exchange credentials',async()=>{
 const a=social.newSocialAttempt('google');const cancelled=await callback.GET(attemptRequest(a,'&cancelled=1'));assert.match(cancelled.headers.get('location'),/oauth=cancelled/);
 for(const extra of['&ames_state='+a.nonce,'&userId=other','&secret=other'])assert.match((await callback.GET(attemptRequest(a,extra))).headers.get('location'),/oauth=failed/);
 process.env.AMES_SOCIAL_PROVIDERS='';assert.match((await callback.GET(attemptRequest(a))).headers.get('location'),/oauth=failed/);assert.equal(calls.length,0);
});
test('identity mismatch, disabled user and invalid session expiry revoke a newly created session',async()=>{
 for(const mode of['identity','disabled','expiry']){user={$id:mode==='identity'?'other':'fixture-user',status:mode!=='disabled',email:'fixture@example.invalid',emailVerification:true};session.expire=mode==='expiry'?'invalid':new Date(Date.now()+86400000).toISOString();calls=[];const r=await callback.GET(attemptRequest(social.newSocialAttempt('google')));assert.match(r.headers.get('location'),/oauth=failed/);assert.ok(calls.some(c=>c[0]==='revoke'));assert.doesNotMatch(r.headers.get('set-cookie'),/ames_customer_session/);}
});
test('provider failure does not expose internal errors or replace the customer session',async()=>{
 failSession=true;const r=await callback.GET(attemptRequest(social.newSocialAttempt('google')));assert.match(r.headers.get('location'),/oauth=failed/);assert.ok(!JSON.stringify([...r.headers]).includes('PRIVATE-PROVIDER-ERROR'));assert.doesNotMatch(r.headers.get('set-cookie'),/ames_customer_session/);
});
