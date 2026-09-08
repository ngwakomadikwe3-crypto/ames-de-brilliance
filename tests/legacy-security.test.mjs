import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {legacyPolicy,publicStone,publicVideo} from '../src/lib/legacy-policy.mjs';
import {signedPayload,staffIdentity,portalCookie,cookieValue,customerIdentity,sameOrigin} from '../src/lib/legacy-auth.mjs';
import {startFixture} from './appwrite-fixture.mjs';
import {customerConfig} from '../src/lib/customer/config.mjs';
import {createAppwriteGateway,documentId} from '../src/lib/customer/appwrite.mjs';
import {publicUploadName} from '../src/lib/public-upload.mjs';
test('public media hooks reject GLBs and scripts even with forged image/video extensions',()=>{for(const kind of ['image','video']){assert.throws(()=>publicUploadName('photo.png',Buffer.from('glTF'),kind));assert.throws(()=>publicUploadName('video.mp4',Buffer.from('<script>alert(1)</script>'),kind));}assert.equal(publicUploadName('misleading.glb',Buffer.from([137,80,78,71,13,10,26,10])),'misleading.png');});
test('legacy route matrix fails closed for private tables and exposes only intended public reads',()=>{
 for(const p of ['orders','requests','reports/weekly','balances','staff','usage','intelligence/issues','intelligence/products','intelligence/orders','traders','models','unknown'])for(const m of ['GET','POST','PATCH','DELETE'])assert.equal(legacyPolicy('https://ames.example/api/'+p,m),p==='orders'&&m==='POST'?'customer':'staff');
 for(const [p,m] of [['stones','GET'],['videos?published=1','GET'],['chat','POST'],['model/public/code','GET']])assert.equal(legacyPolicy('https://ames.example/api/'+p,m),'public');
 assert.equal(legacyPolicy('https://ames.example/api/videos?published=1','DELETE'),'staff');assert.equal(legacyPolicy('https://ames.example/api/videos?pending=1','GET'),'staff');
 assert.equal(legacyPolicy('https://ames.example/api/trader/profile','POST'),'trader');assert.equal(legacyPolicy('https://ames.example/api/models/disable','POST'),'staff');
});
test('public projections exclude private contact, finance, credentials and future unknown fields',()=>{const privateFields={whatsapp:'private',trader_whatsapp:'private',trader_licence:'private',portal_code:'private',commission:10,commission_earned:10,sales_value:200,internalSecret:'private'};assert.deepEqual(publicStone({id:'s',shape:'Oval',...privateFields}),{id:'s',shape:'Oval'});assert.deepEqual(publicVideo({id:'v',caption:'Public',...privateFields}),{id:'v',caption:'Public'});});
test('signed portal and staff sessions reject missing key, tampering, expired/future timestamps and role confusion',async()=>{
 const env={SESSION_SECRET:randomBytes(48).toString('hex')},req=new Request('https://ames.example/api/model/profile');
 const cookie=await portalCookie(req,'model',{id:'a',portal_code:'code'},env),token=cookie.split(';')[0].split('=')[1];assert.match(cookie,/HttpOnly.*Secure/);
 assert.equal((await signedPayload(token,env)).id,'a');assert.equal(await signedPayload(token+'x',env),null);assert.equal(await signedPayload(token,{}),null);
 assert.equal(await staffIdentity(new Request(req.url,{headers:{cookie:'adb_session='+token}}),env),null);
 for(const ts of [Date.now()-8*3600000,Date.now()+60000]){const raw=JSON.stringify({ts,role:'owner'}),value=Buffer.from(raw).toString('base64url')+'.'+createHmac('sha256',env.SESSION_SECRET).update(raw).digest('base64url');assert.equal(await signedPayload(value,env),null);}
 assert.equal(cookieValue(new Request(req.url,{headers:{cookie:'a=one;a=two'}}),'a'),'');assert.equal(sameOrigin(new Request(req.url,{headers:{origin:'https://evil.example'}}),{}),false);
});
test('legacy customer identity verifies Appwrite session and disabled profile, ignores spoofed headers',async()=>{
 const f=await startFixture();try{const env={APPWRITE_ENDPOINT:f.endpoint,APPWRITE_PROJECT_ID:f.project,APPWRITE_API_KEY:f.key,AMES_APP_ORIGIN:'https://ames.example',ASSET_DELIVERY_SECRET:'test-only-'.repeat(8)},gateway=createAppwriteGateway(customerConfig(env));
 const session=await gateway.login('alice@example.test',f.password),req=new Request('https://ames.example/api/chats',{headers:{cookie:'__Host-ames_customer='+encodeURIComponent(session.secret),'x-user-id':'bob','x-admin':'true'}});
 assert.deepEqual(await customerIdentity(req,env),{id:'alice',admin:false});await gateway.put('profiles',documentId('alice'),{userId:'alice',accountState:'disabled'});assert.equal(await customerIdentity(req,env),null);
 assert.equal(await customerIdentity(new Request(req.url,{headers:{'x-user-id':'alice','x-admin':'true'}}),env),null);
 }finally{await f.close();}
});
test('single-bucket configuration remains independently overridable per storage class',()=>{const c=customerConfig({});assert.deepEqual([...new Set(Object.values(c.buckets))],['media']);assert.equal(customerConfig({APPWRITE_BUCKET_STONES:'future-private-stones'}).buckets.stones,'future-private-stones');});
test('portal cookie remains Secure behind an HTTPS origin with internal HTTP forwarding',async()=>{const cookie=await portalCookie(new Request('http://127.0.0.1/api/models/login'),'model',{id:'qa',portal_code:'qa'},{SESSION_SECRET:randomBytes(48).toString('hex'),AMES_APP_ORIGIN:'https://preview.example.test'});assert.match(cookie,/HttpOnly; SameSite=Lax; Max-Age=28800; Secure$/);});
