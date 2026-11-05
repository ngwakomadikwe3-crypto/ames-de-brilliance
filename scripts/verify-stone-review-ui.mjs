import { reviewedLicensing } from './fixtures/botswana-licensing.mjs';
// Browser checks with real authorization guards and simulated review storage responses.
import assert from 'node:assert/strict';
import { emptyStoneReview, publicStoneRecord } from '../src/lib/stone-verification.ts';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const origin=process.env.AMES_TEST_URL || 'http://localhost:3010';
const cookieFor=role=>{const payload=JSON.stringify({ts:Date.now(),role});return Buffer.from(payload).toString('base64url')+'.'+createHmac('sha256',process.env.SESSION_SECRET).update(payload).digest('base64url')};
assert.equal((await fetch(origin+'/api/stone-reviews/fixture')).status,401);
for (const [path,method] of [['/api/stones','POST'],['/api/stones','PATCH'],['/api/stones/approve','POST']]) {
 assert.equal((await fetch(origin+path,{method})).status,401,`${method} ${path} must reject anonymous writes`);
}
assert.equal((await fetch(origin+'/api/stones',{method:'POST',headers:{cookie:'adb_session='+cookieFor('cousin')}})).status,403);
assert.equal((await fetch(origin+'/api/stones',{method:'PATCH',headers:{cookie:'adb_session='+cookieFor('owner'),origin:'https://other.example'}})).status,403);
assert.equal((await fetch(origin+'/api/stone-reviews/fixture',{headers:{cookie:'adb_session='+cookieFor('cousin')}})).status,403);
const review={...emptyStoneReview(),botswanaLicensing:reviewedLicensing(),title:'Reviewed test ruby',species:'ruby',form:'polished',origin:'natural',treatments:'none-reported',carats:1.2,measurements:'6 x 5 x 3 mm',reportStatus:'not-issued',reportEvidence:'Private physical identification evidence',tradeScope:'domestic',checks:Object.fromEntries(['identity','physicalMatch','sellerAuthority','provenance','licensing'].map(key=>[key,{checked:true,evidence:'Private test reference'}]))};
let detail={draft:{id:'v1',createdAt:'2026-10-24',review,actor:'Fixture reviewer',reason:'Draft'},blockers:[],published:false,receipt:null};
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=9253','--user-data-dir='+resolve('.ames-cad/qa-stone-browser'),'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ws,sequence=0,submitted;const pending=new Map(),exceptions=[];
try{
 let target;
 for(let i=0;i<60;i++){try{target=(await(await fetch('http://127.0.0.1:9253/json/list')).json()).find(p=>p.type==='page');if(target)break}catch{}await pause(250)}
 assert.ok(target,'Browser unavailable');ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
 const send=(method,params={})=>new Promise((res,rej)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);rej(new Error('CDP timeout: '+method))},120000);pending.set(id,{res,rej,timer});ws.send(JSON.stringify({id,method,params}))});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value};
 const wait=async(expression,label)=>{for(let i=0;i<240;i++){if(await evaluate(expression))return;await pause(500)}throw new Error('Timeout: '+label)};
 const intercept=async params=>{
  const path=new URL(params.request.url).pathname;let body=[],type='application/json';
  if(path==='/api/staff')body={role:'owner'};
  else if(path==='/api/traders')body=[{id:'qa-trader',name:'QA trader',status:'Active'}];
  else if(path==='/api/stones')body=[{id:'s1',ref:'TEST-001',status:'Available'}];
  else if(path==='/api/stone-reviews/s1'){
    if(params.request.method==='POST'){
      submitted=JSON.parse(params.request.postData);
      if(submitted.action==='publish'){assert.equal(submitted.confirmed,true);assert.equal(submitted.draftId,'v1');detail={...detail,published:true,receipt:{actor:submitted.reviewer,approvedAt:'2026-10-24'}};}
      if(submitted.action==='withdraw')detail={...detail,published:false,receipt:null,draft:{...detail.draft,id:'v2',reason:submitted.reason}};
    }body=detail;
  }
  else if(path==='/api/auction/catalogue')body={items:detail.published?[publicStoneRecord('s1','TEST-001',review)]:[]};
  await send('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:type}],body:(Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body))).toString('base64')});
 };
 ws.onmessage=event=>{const data=JSON.parse(event.data);if(data.method==='Fetch.requestPaused'){intercept(data.params).catch(e=>exceptions.push(e.message));return}if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails.text);if(data.id&&pending.has(data.id)){const c=pending.get(data.id);pending.delete(data.id);clearTimeout(c.timer);if(data.error)c.rej(new Error(data.error.message));else c.res(data.result)}};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Network.setCookie',{name:'adb_session',value:cookieFor('owner'),url:origin,httpOnly:true,sameSite:'Lax'});
 await send('Fetch.enable',{patterns:[{urlPattern:origin+'/api/*'}]});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:950,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/dashboard'});

 await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Stone verification')`,'verification tab');
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Stone verification').click()`);
 await wait(`!!document.querySelector('select option[value="s1"]')`,'inventory');
 await evaluate(`(()=>{const el=document.querySelector('select');el.value='s1';el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
 await wait(`!!document.querySelector('[data-stone-verification]')`,'review form');
 await wait(`document.querySelector('[data-stone-verification] input')?.value==='Reviewed test ruby'`,'review loaded');
 const publish=`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Approve and publish catalogue record')`;
 assert.equal(await evaluate(publish+'.disabled'),true);
 await evaluate(`(()=>{const label=Array.from(document.querySelectorAll('label')).find(e=>e.textContent.startsWith('Responsible reviewer'));const el=label.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'QA reviewer');el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 await evaluate(`Array.from(document.querySelectorAll('label')).find(e=>e.textContent.startsWith('I reviewed the saved')).querySelector('input').click()`);
 await evaluate(publish+'.click()');
 await wait(`document.querySelector('[data-stone-verification] [role="status"]')?.textContent.includes('Published')`,'publication');
 assert.equal(submitted.action,'publish');
 const shot=async name=>{await mkdir('.ames-cad/qa',{recursive:true});const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve('.ames-cad/qa',name),Buffer.from(r.data,'base64'))};
 await shot('stone-review-desktop.png');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(500);await shot('stone-review-mobile.png');
 assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false);
 await evaluate(`(()=>{const label=Array.from(document.querySelectorAll('label')).find(e=>e.textContent.startsWith('Withdrawal reason'));const el=label.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Recheck source');el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Withdraw from catalogue').click()`);
 await wait(`document.querySelector('[data-stone-verification] [role="status"]')?.textContent.includes('Not published')`,'withdrawal');
 await send('Page.navigate',{url:origin+'/app'});
 await wait(`!!document.querySelector('[data-auction-panel]')`,'app');
 await wait(`document.querySelector('[data-auction-panel]')?.textContent.includes('No diamonds or precious stones')`,'withdrawn empty catalogue');
 assert.equal(await evaluate(`document.querySelectorAll('[data-auction-stone]').length`),0);
 assert.deepEqual(exceptions,[]);
 console.log('PASS: real API owner guards; simulated storage UI confirmation/publication/withdrawal; mobile layout; public empty catalogue.');
}finally{for(const call of pending.values())clearTimeout(call.timer);ws?.close();browser.kill()}
