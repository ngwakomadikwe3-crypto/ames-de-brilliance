/** Loopback-only integration. Identity is mocked; routes, storage and permissions are real. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,appendFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHmac} from 'node:crypto';
const fixture=resolve(process.argv[2]||'');
assert.ok(fixture.startsWith(resolve('.ames-cad/tests')+'\\listing-flow-'));
const sourceRows=await Promise.all((await readdir(join(fixture,'listings'))).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f)).map(async f=>JSON.parse(await readFile(join(fixture,'listings',f),'utf8'))));
const listing=sourceRows.find(r=>r.status==='published'); assert.ok(listing,'Use the isolated published listing fixture');
const root=resolve('.ames-cad/tests','workspace-'+randomUUID());await mkdir(root,{recursive:true});
const runId=randomUUID().slice(0,8),slug='qa-maker-'+runId;
const prefs=new Map();const sessions={'qa-a':'qa-account-0','qa-b':'qa-account-1','qa-new':'qa-new-'+runId,'qa-buyer':'qa-buyer-'+runId};
const identity=createServer(async(req,res)=>{
 const id=sessions[req.headers['x-appwrite-session']];res.setHeader('Content-Type','application/json');
 if(!id){res.statusCode=401;return res.end(JSON.stringify({message:'Unauthorized',code:401,type:'user_unauthorized'}));}
 if(req.url==='/v1/account/prefs'&&req.method==='PATCH'){let raw='';for await(const c of req)raw+=c;prefs.set(id,JSON.parse(raw).prefs);}
 if(['/v1/account','/v1/account/prefs'].includes(req.url))return res.end(JSON.stringify({$id:id,name:'Isolated QA account',email:id+'@example.test',emailVerification:true,prefs:prefs.get(id)||{}}));
 res.statusCode=404;res.end('{}');
});await new Promise(r=>identity.listen(0,'127.0.0.1',r));
const secret='isolated-jeweller-flow-session-secret-not-production',origin='http://localhost:3012';
const data=JSON.stringify({ts:Date.now(),role:'owner'}),owner=`adb_session=${Buffer.from(data).toString('base64url')}.${createHmac('sha256',secret).update(data).digest('base64url')}`;
const cookie=s=>'ames_customer_session='+s;
const env={...process.env,VERCEL:'',SESSION_SECRET:secret,APPWRITE_ENDPOINT:`http://127.0.0.1:${identity.address().port}/v1`,APPWRITE_PROJECT_ID:'isolated-qa',AMES_JEWELLER_STORAGE:'local',AMES_JEWELLER_ROOT:join(fixture,'profiles'),AMES_LISTING_STORAGE:'local',AMES_LISTING_ROOT:join(fixture,'listings'),AMES_QA_DIST_DIR:'.next-workspace-qa-final'};
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port','3012','--hostname','localhost'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});for(const s of[child.stdout,child.stderr])s.on('data',b=>appendFile(join(root,'next.log'),b).catch(()=>{}));
async function call(path,{who='qa-buyer',method='GET',body}={}){return fetch(origin+path,{method,headers:{Cookie:who==='staff'?owner:cookie(who),...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(300000)});}
async function json(path,opts={},status=200){const r=await call(path,opts),b=await r.json();assert.equal(r.status,status,path+': '+JSON.stringify(b));return b;}
try{
 const end=Date.now()+300000;while(true){try{if((await call('/api/jeweller/onboarding',{who:'qa-new'})).status===200)break;}catch{}if(Date.now()>end)throw Error('Next readiness timeout');await new Promise(r=>setTimeout(r,1000));}
 const details={businessName:'Isolated maker fixture',legalName:'PRIVATE QA representative',registrationNumber:'PRIVATE-QA-REG',email:'fixture@example.test',phone:'+26777123456',country:'Botswana',city:'QA city',address:'PRIVATE-STREET',biography:'Isolated fixture biography. This is not a real commercial business.',specialties:['CAD'],consentConfirmed:true,eligibilityReason:'Isolated fixture eligibility statement only.'};
 let p=(await json('/api/jeweller/onboarding',{who:'qa-new',method:'POST',body:{action:'create',details}},201)).profile;
 assert.equal(p.status,'draft');assert.ok(p.id);assert.equal((await call('/api/jeweller',{who:'qa-new'})).status,403);
 await json('/api/jeweller/onboarding',{who:'qa-new',method:'POST',body:{action:'verify',version:p.version,details}},400);
 await json('/api/jeweller/onboarding',{who:'qa-new',method:'POST',body:{action:'storefront',version:p.version,storefront:{slug:'qa-private-maker',published:true,rightsConfirmed:true}}},400);
 p=(await json('/api/jeweller/onboarding',{who:'qa-new',method:'POST',body:{action:'storefront',version:p.version,storefront:{slug,bio:'Public introduction only',published:false,rightsConfirmed:true}}})).profile;
 await json('/api/makers/'+slug,{},404);
 assert.equal((await json('/api/jeweller/onboarding',{who:'qa-buyer'})).profile,null);
 // Real staff verification, using fixture evidence metadata only: never production data.
 const profilePath=join(fixture,'profiles',p.id+'.json');let record=JSON.parse(await readFile(profilePath,'utf8'));
 record.files=['identity','business','portfolio','portfolio','portfolio'].map((kind,i)=>({id:randomUUID(),kind,filename:'fixture.png',mime:'image/png',bytes:20,sha256:String(i).repeat(64),uploadedAt:new Date().toISOString(),expiresOn:''}));
 await writeFile(profilePath,JSON.stringify(record));
 p=(await json('/api/jeweller/onboarding',{who:'qa-new',method:'POST',body:{action:'submit',version:p.version}})).profile;
 const checks=Object.fromEntries(['identity','business','contact','portfolio','eligibility','qualifications','consent'].map(k=>[k,true]));
 record=await json('/api/jewellers/'+p.id,{who:'staff',method:'PATCH',body:{version:p.version,review:{action:'verify',checks,reason:'Isolated QA fixture finding only, not actual commercial verification.',validUntil:new Date(Date.now()+90*86400000).toISOString().slice(0,10)}}});
 p=(await json('/api/jeweller/onboarding',{who:'qa-new'})).profile;assert.equal(p.effectiveStatus,'verified');
 await json('/api/jeweller/onboarding',{who:'qa-new',method:'POST',body:{action:'storefront',version:p.version,storefront:{slug,published:true,rightsConfirmed:true,logoId:record.files[0].id}}},400);
 p=(await json('/api/jeweller/onboarding',{who:'qa-new',method:'POST',body:{action:'storefront',version:p.version,storefront:{slug,bio:'Public introduction only',showLocation:true,published:true,rightsConfirmed:true}}})).profile;
 const shop=await json('/api/makers/'+slug);assert.equal(shop.name,details.businessName);assert.equal(shop.location,'QA city, Botswana');assert.ok(!JSON.stringify(shop).includes('PRIVATE-'));assert.ok(!JSON.stringify(shop).includes('portalUserId'));
 console.log('PASS self-onboarding, ownership binding, staff-only verification and private storefront projection');
 await json('/api/workspace',{method:'POST',body:{action:'profile',role:'jeweller',country:'Botswana',phone:''}});
 assert.equal((await call('/api/jeweller')).status,403,'UI role cannot grant verified merchant authority');
 await json('/api/workspace',{method:'POST',body:{action:'save',assetId:'listing-'+listing.id}});
 let workspace=await json('/api/workspace');assert.equal(workspace.saved[0].assetId,'listing-'+listing.id);assert.deepEqual((await json('/api/workspace',{who:'qa-new'})).saved,[]);
 await json('/api/enquiries',{method:'POST',body:{listingId:listing.id,message:'I would like to ask about this piece.',contactConsent:false}},400);
 let e=await json('/api/enquiries',{method:'POST',body:{listingId:listing.id,message:'I would like to ask about this piece.',contactConsent:true}},201);
 await json('/api/enquiries/'+e.id,{who:'qa-b',method:'PATCH',body:{version:e.version,action:'reply',message:'Not my customer'}},404);
 await json('/api/enquiries/'+e.id,{method:'PATCH',body:{version:e.version,action:'quote',amount:'2500',currency:'BWP',message:'Buyer cannot quote.'}},400);
 assert.equal((await json('/api/enquiries?role=jeweller',{who:'qa-a'})).enquiries.some(r=>r.id===e.id),true);
 e=await json('/api/enquiries/'+e.id,{who:'qa-a',method:'PATCH',body:{version:e.version,action:'quote',amount:'2500.00',currency:'BWP',message:'Isolated QA quotation only.'}});
 await json('/api/enquiries/'+e.id,{method:'PATCH',body:{version:e.version-1,action:'accept'}},409);
 e=await json('/api/enquiries/'+e.id,{method:'PATCH',body:{version:e.version,action:'accept'}});assert.equal(e.status,'accepted');assert.ok(e.messages.at(-1).text.includes('not recorded'));
 await json('/api/workspace',{method:'POST',body:{action:'remove',assetId:'listing-'+listing.id}});assert.deepEqual((await json('/api/workspace')).saved,[]);
 console.log('PASS private saved pieces, role boundaries, consent, cross-merchant denial, quotation and version-safe purchase request');
 await writeFile(join(root,'browser.json'),JSON.stringify({origin,slug,output:root}));
 for(const path of ['/workspace','/jeweller/onboarding','/makers/'+slug]){
  const r=await call(path),html=await r.text();assert.equal(r.status,200);
  const scripts=[...html.matchAll(/src="(\/_next\/[^"<>]+\.js[^"<>]*)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
  for(let i=0;i<scripts.length;i+=3)await Promise.all(scripts.slice(i,i+3).map(async s=>{const r=await call(s);assert.equal(r.status,200);await r.arrayBuffer();}));
 }
 await json('/api/enquiries');
 const browser=spawn('python',['scripts/verify-workspace-ui.py',join(root,'browser.json')],{windowsHide:true,stdio:'inherit'});
 await new Promise((done,fail)=>{browser.on('error',fail);browser.on('close',c=>c===0?done():fail(Error('Workspace browser verification failed')));});
 await writeFile(join(root,'report.json'),JSON.stringify({passed:true,productionData:false,identity:'loopback test double',application:'real Next routes and private storage',at:new Date().toISOString()}));
 console.log('Evidence:',root);
}finally{if(child.pid){const kill=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await new Promise(r=>kill.on('close',r));}identity.closeAllConnections();await new Promise(r=>identity.close(r));}
