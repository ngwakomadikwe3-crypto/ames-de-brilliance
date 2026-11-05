// Browser integration with real converted geometry and mocked Appwrite responses.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHmac } from 'node:crypto';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const origin=process.env.AMES_TEST_URL || 'http://localhost:3010';
const cookieFor=role=>{const payload=JSON.stringify({ts:Date.now(),role});return Buffer.from(payload).toString('base64url')+'.'+createHmac('sha256',process.env.SESSION_SECRET).update(payload).digest('base64url')};
assert.equal((await fetch(origin+'/api/jewelry-products/fixture/cad')).status,401);
assert.equal((await fetch(origin+'/api/jewelry-products/fixture/cad',{headers:{cookie:'adb_session='+cookieFor('cousin')}})).status,403);
let job,dir;
for(const test of await readdir('.ames-cad/tests')){
 if(!test.startsWith('blender-'))continue;
 const jobs=resolve('.ames-cad/tests',test,'.ames-cad/jobs');
 for(const id of await readdir(jobs)){
  const candidate=JSON.parse(await readFile(join(jobs,id,'job.json'),'utf8'));
  if(candidate.status==='ready' && Object.values(candidate.assignments).includes('platinum')){job=candidate;dir=join(jobs,id)}
 }
}
assert.ok(job,'Run scripts/test-cad-blender.mjs first');
const product={id:job.productId,trader_id:'qa-trader',name:'CAD material review test',category:'earrings',source_mode:'cloud_source_upload',source_files:[{fileId:job.sourceFileId,filename:job.sourceFilename,sha256:job.sourceSha256,bytes:4019984,kind:'source'}],source_hashes:[job.sourceSha256],workflow_status:'submitted',asset_id:job.assetId,revision_id:'',pack_hash:'',content_hash:'',technical_pass:false,visual_approval:'pending',publication_status:'review',review_reason:'',status_history:[],verified_metadata:{},created_at:'',updated_at:''};
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=9252','--user-data-dir='+resolve('.ames-cad/qa-browser'),'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ws,sequence=0,submitted;const pending=new Map(),exceptions=[];
try{
 let target;
 for(let i=0;i<60;i++){try{target=(await(await fetch('http://127.0.0.1:9252/json/list')).json()).find(p=>p.type==='page');if(target)break}catch{}await pause(250)}
 assert.ok(target,'Browser unavailable');ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
 const send=(method,params={})=>new Promise((res,rej)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);rej(new Error('CDP timeout: '+method))},120000);pending.set(id,{res,rej,timer});ws.send(JSON.stringify({id,method,params}))});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value};
 const wait=async(expression,label)=>{for(let i=0;i<240;i++){if(await evaluate(expression))return;await pause(500)}throw new Error('Timeout: '+label)};
 const intercept=async params=>{
  const path=new URL(params.request.url).pathname;let body=[],type='application/json';
  if(path==='/api/staff')body={role:'owner'};
  else if(path==='/api/traders')body=[{id:'qa-trader',name:'QA trader',status:'Active'}];
  else if(path==='/api/jewelry-products')body=[product];
  else if(path===`/api/jewelry-products/${product.id}`)body={product,pack:null,packError:'Test fixture before content-pack review'};
  else if(path.endsWith('/cad')){if(params.request.method==='POST'){submitted=JSON.parse(params.request.postData);body={...job,status:'queued'}}else body={jobs:[job],worker:{online:true}}}
  else if(path.endsWith('/preview.glb')){body=await readFile(join(dir,'preview.glb'));type='model/gltf-binary'}
  else if(path.endsWith('/poster.png')){body=await readFile(join(dir,'poster.png'));type='image/png'}
  await send('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:type}],body:(Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body))).toString('base64')});
 };
 ws.onmessage=event=>{const data=JSON.parse(event.data);if(data.method==='Fetch.requestPaused'){intercept(data.params).catch(e=>exceptions.push(e.message));return}if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails.text);if(data.id&&pending.has(data.id)){const c=pending.get(data.id);pending.delete(data.id);clearTimeout(c.timer);if(data.error)c.rej(new Error(data.error.message));else c.res(data.result)}};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Network.setCookie',{name:'adb_session',value:cookieFor('owner'),url:origin,httpOnly:true,sameSite:'Lax'});
 await send('Fetch.enable',{patterns:[{urlPattern:origin+'/api/*'}]});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:950,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/dashboard'});
 await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Jewelry')`,'Jewelry tab');
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Jewelry').click()`);
 await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('CAD material review test'))`,'product');
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('CAD material review test')).click()`);
 await wait(`document.querySelector('[data-cad-review] model-viewer')?.loaded`,'real converted GLB');
 const shot=async name=>{await mkdir('.ames-cad/qa',{recursive:true});const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve('.ames-cad/qa',name),Buffer.from(r.data,'base64'))};
 await evaluate(`document.querySelector('[data-cad-review]').scrollIntoView()`);await shot('cad-review.png');
 await evaluate(`Array.from(document.querySelectorAll('[data-cad-review] button')).find(b=>b.textContent==='Review component materials').click()`);
 assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-cad-review] button')).find(b=>b.textContent==='Generate with confirmed materials').disabled`),true);
 await evaluate(`document.querySelector('[data-cad-review] input[type="checkbox"]').click()`);
 await evaluate(`Array.from(document.querySelectorAll('[data-cad-review] button')).find(b=>b.textContent==='Generate with confirmed materials').click()`);
 await pause(1000);assert.equal(submitted.baseJobId,job.id);assert.equal(Object.keys(submitted.assignments).length,4);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await evaluate(`document.querySelector('[data-cad-review]').scrollIntoView()`);await pause(500);await shot('cad-review-mobile.png');
 assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false);
 assert.deepEqual(exceptions,[]);
 console.log('PASS: real API 401/403; mocked Appwrite UI; real converted GLB loaded; confirmation gate; material request identity; mobile width. Screenshots: .ames-cad/qa');
}finally{for(const call of pending.values())clearTimeout(call.timer);ws?.close();browser.kill()}
