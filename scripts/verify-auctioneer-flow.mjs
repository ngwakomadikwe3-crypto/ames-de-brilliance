/** Real Next routes and file storage; loopback identity fixtures, never production users. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,appendFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHmac} from 'node:crypto';
const root=resolve('.ames-cad/tests','auctioneer-'+randomUUID());await mkdir(root,{recursive:true});
const accounts={'qa-a':'auctioneer-a','qa-b':'auctioneer-b','qa-unverified':'unverified'};
const identity=createServer((req,res)=>{res.setHeader('Content-Type','application/json');const id=accounts[req.headers['x-appwrite-session']];if(req.url==='/v1/account'&&id)res.end(JSON.stringify({$id:id,name:'Fixture applicant',email:id+'@example.invalid',emailVerification:id!=='unverified',prefs:{}}));else{res.statusCode=401;res.end(JSON.stringify({code:401,type:'user_unauthorized',message:'Fixture session expired'}));}});
await new Promise(r=>identity.listen(0,'127.0.0.1',r));
const origin='http://localhost:3012',secret='isolated-auctioneer-session-secret-not-production';
const cookie=(s)=>'ames_customer_session='+s;
const signed=(role)=>{const p=JSON.stringify({ts:Date.now(),role});return `adb_session=${Buffer.from(p).toString('base64url')}.${createHmac('sha256',secret).update(p).digest('base64url')}`;};const owner=signed('owner');
const env={...process.env,VERCEL:'',SESSION_SECRET:secret,APPWRITE_ENDPOINT:`http://127.0.0.1:${identity.address().port}/v1`,APPWRITE_PROJECT_ID:'isolated-qa',AMES_AUCTIONEER_STORAGE:'local',AMES_AUCTIONEER_ROOT:join(root,'profiles'),AMES_LISTING_STORAGE:'local',AMES_LISTING_ROOT:join(root,'listing-locks'),AMES_QA_DIST_DIR:'.next-auctioneer-qa'};
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port','3012','--hostname','localhost'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});for(const s of[child.stdout,child.stderr])s.on('data',b=>appendFile(join(root,'next.log'),b).catch(()=>{}));
async function call(path,{who='qa-a',method='GET',body,form,originHeader=origin}={}){return fetch(origin+path,{method,headers:{...(who?{Cookie:who==='staff'?owner:who==='cousin'?signed('cousin'):cookie(who)}:{}),...(method!=='GET'?{Origin:originHeader}:{}),...(body?{'Content-Type':'application/json'}:{})},body:form||(body?JSON.stringify(body):undefined),signal:AbortSignal.timeout(300000)});}
async function json(path,opts={},status=200){const r=await call(path,opts),b=await r.json();assert.equal(r.status,status,path+': '+JSON.stringify(b));return b;}
const details={businessName:'Auctioneer fixture studio',legalName:'PRIVATE fixture representative',registrationNumber:'PRIVATE-REG',email:'fixture@example.invalid',phone:'+26777123456',country:'Botswana',city:'Fixture city',address:'PRIVATE-STREET',biography:'This is an isolated professional profile fixture, not a real auction business.',specialties:['Gemstones'],auctionHistory:'Professional auction experience and reference history described for this isolated fixture.',consignmentPolicy:'Seller identity, ownership, reserves, commissions and written consignment authority are checked before a fixture lot.',buyerTerms:'Buyer fees, payment deadlines, taxes, collection, delivery and returns are described before bidding in this fixture.',eligibilityReason:'Isolated fixture eligibility explanation only, not an actual licensing finding.',consentConfirmed:true};
try{
 const end=Date.now()+300000;while(true){try{if((await call('/api/auctioneer/onboarding',{who:''})).status===401)break;}catch{}if(Date.now()>end)throw Error('Next readiness timeout');await new Promise(r=>setTimeout(r,1000));}
 await json('/api/auctioneers',{who:''},401);await json('/api/auctioneers',{who:'cousin'},403);
 await json('/api/auctioneer/onboarding',{who:'qa-unverified',method:'POST',body:{action:'create',details}},403);
 await json('/api/auctioneer/onboarding',{method:'POST',originHeader:'https://elsewhere.invalid',body:{action:'create',details}},403);
 await json('/api/auctioneer/onboarding',{method:'POST',body:{action:'create',details:{...details,status:'verified'}}},400);
 let p=(await json('/api/auctioneer/onboarding',{method:'POST',body:{action:'create',details}},201)).profile;assert.equal(p.status,'draft');
 assert.equal((await json('/api/auctioneer/onboarding',{method:'POST',body:{action:'create',details}},201)).profile.id,p.id);
 assert.equal((await json('/api/auctioneer/onboarding',{who:'qa-b'})).profile,null);
 await json('/api/auctioneers/'+p.id,{who:'qa-b'},401);
 await json('/api/auctioneer/onboarding',{method:'POST',body:{action:'verify',version:p.version}},400);
 await json('/api/auctioneer/onboarding',{method:'POST',body:{action:'submit',version:p.version}},400);
 const files=[];
 async function upload(kind,content){const form=new FormData();form.set('file',new Blob([content],{type:'application/pdf'}),kind+'.pdf');form.set('kind',kind);form.set('version',String(p.version));const b=await json('/api/auctioneer/onboarding/files',{method:'POST',form});p=b.profile;files.push(p.files.at(-1));}
 await upload('identity','%PDF-1.4\nPRIVATE-IDENTITY-FIXTURE\n%%EOF');await upload('business','%PDF-1.4\nPRIVATE-BUSINESS-FIXTURE\n%%EOF');await upload('reference','%PDF-1.4\nPRIVATE-REFERENCE-FIXTURE\n%%EOF');
 const filePath='/api/auctioneer/onboarding/files/'+files[0].id;
 assert.ok((await(await call(filePath)).text()).includes('PRIVATE-IDENTITY'));
 assert.notEqual((await call(filePath,{who:'qa-b'})).status,200);assert.equal((await call(filePath,{who:''})).status,401);
 assert.equal((await call(`/api/auctioneers/${p.id}/files/${files[0].id}`,{who:'staff'})).status,200);
 await json('/api/auctioneer/onboarding',{method:'POST',body:{action:'save',version:p.version-1,details}},400);
 p=(await json('/api/auctioneer/onboarding',{method:'POST',body:{action:'submit',version:p.version}})).profile;
 await json('/api/auctioneer/onboarding',{method:'POST',body:{action:'save',version:p.version,details}},400);
 const checks=Object.fromEntries(['identity','business','contact','experience','consignment','eligibility','qualifications','consent'].map(k=>[k,true]));
 await json('/api/auctioneers/'+p.id,{who:'staff',method:'PATCH',body:{version:p.version,review:{action:'verify',checks:{...checks,consignment:false},reason:'Fixture only staff finding, not genuine verification.',validUntil:'2027-01-28'}}},400);
 let reviewed=await json('/api/auctioneers/'+p.id,{who:'staff',method:'PATCH',body:{version:p.version,review:{action:'verify',checks,reason:'Fixture only staff finding, not genuine verification.',validUntil:'2027-01-28'}}});
 p=(await json('/api/auctioneer/onboarding')).profile;assert.equal(p.effectiveStatus,'verified');assert.equal('checks' in p,false);assert.equal('audit' in p,false);assert.equal('portalUserId' in p,false);assert.equal('canBid' in p,false);
 console.log('PASS real session/email checks, self ownership, private uploads/downloads, cross-owner denial, CSRF, staff approval and expiry');
 for(const path of ['/auctioneer','/dashboard/auctioneers']){const r=await call(path,{who:path.includes('dashboard')?'staff':'qa-a'}),html=await r.text();assert.equal(r.status,200);const scripts=[...html.matchAll(/src="(\/_next\/[^"<>]+\.js[^"<>]*)"/g)].map(m=>m[1].replaceAll('&amp;','&'));for(let i=0;i<scripts.length;i+=3)await Promise.all(scripts.slice(i,i+3).map(async s=>{const r=await call(s);assert.equal(r.status,200);await r.arrayBuffer();}));}
 await writeFile(join(root,'browser.json'),JSON.stringify({origin,owner,output:root}));
 const browser=spawn('python',['scripts/verify-auctioneer-ui.py',join(root,'browser.json')],{windowsHide:true,stdio:'inherit'});await new Promise((done,fail)=>{browser.on('error',fail);browser.on('close',c=>c===0?done():fail(Error('Auctioneer browser check failed')));});
 await json('/api/auctioneer/onboarding',{method:'POST',body:{action:'save',version:p.version,details}},400);
 p=(await json('/api/auctioneer/onboarding',{method:'POST',body:{action:'save',version:p.version,details:{...details,businessName:'Updated fixture name'},confirmReverification:true}})).profile;assert.equal(p.status,'draft');assert.equal(p.verifiedUntil,'');
 p=(await json('/api/auctioneer/onboarding',{method:'POST',body:{action:'submit',version:p.version}})).profile;
 reviewed=await json('/api/auctioneers/'+p.id,{who:'staff',method:'PATCH',body:{version:p.version,review:{action:'request_revision',reason:'Please provide updated fixture professional references.'}}});
 p=(await json('/api/auctioneer/onboarding')).profile;assert.equal(p.status,'needs_revision');assert.ok(p.feedback.includes('updated fixture'));
 assert.equal((await(await call('/api/auction/catalogue',{who:''})).text()).includes('PRIVATE-'),false);
 await writeFile(join(root,'report.json'),JSON.stringify({passed:true,productionData:false,identity:'loopback fixture',application:'real Next routes and private file storage',checks:['ownership and CSRF','private evidence uploads and downloads','version conflicts','staff-only review','expiry and reverification','mobile and tablet applicant/staff UI'],at:new Date().toISOString()},null,2));
 console.log('PASS renewal, revision feedback and profile isolation from public auction catalogue. Evidence:',root);
}finally{if(child.pid){const kill=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await new Promise(r=>kill.on('close',r));}identity.closeAllConnections();await new Promise(r=>identity.close(r));}
