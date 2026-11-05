import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const phase = process.env.AMES_QA_PHASE || 'before';
const output = resolve('docs/qa/representative-ring',phase);
await mkdir(output,{recursive:true});
const origin = process.env.AMES_TEST_URL || 'http://localhost:3010';
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=9263','--user-data-dir='+resolve('.ames-cad/qa-ring-browser'),'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ws,sequence=0;const pending=new Map(),exceptions=[];
try{
 let target;
 for(let i=0;i<60;i++){try{target=(await(await fetch('http://127.0.0.1:9263/json/list')).json()).find(p=>p.type==='page');if(target)break}catch{}await pause(250)}
 assert.ok(target,'Browser unavailable');ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
 const send=(method,params={})=>new Promise((res,rej)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);rej(new Error('CDP timeout: '+method))},120000);pending.set(id,{res,rej,timer});ws.send(JSON.stringify({id,method,params}))});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value};
 const wait=async(expression,label)=>{for(let i=0;i<240;i++){if(await evaluate(expression))return;await pause(500)}throw new Error('Timeout: '+label)};
 const intercept=async params=>send('Fetch.continueRequest',{requestId:params.requestId});
 ws.onmessage=event=>{const data=JSON.parse(event.data);if(data.method==='Fetch.requestPaused'){intercept(data.params).catch(e=>exceptions.push(e.message));return}if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails.text);if(data.id&&pending.has(data.id)){const c=pending.get(data.id);pending.delete(data.id);clearTimeout(c.timer);if(data.error)c.rej(new Error(data.error.message));else c.res(data.result)}};
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"sessionStorage.setItem('ames_intro_seen','1')"});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

 const metrics=[];
 await send('Network.enable');
 await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`
 const queued=new WeakSet();
 for(const Type of [window.WebGLRenderingContext,window.WebGL2RenderingContext]) if(Type) for(const key of ['drawArrays','drawElements']) {
 const original=Type.prototype[key];Type.prototype[key]=function(...args){const result=original.apply(this,args);
 if(window.__captureFrame && this.canvas.closest('[data-panel="1"] [data-ames-engine-host]') && !queued.has(this)) {
 queued.add(this);queueMicrotask(()=>{queued.delete(this);if(this.getParameter(this.FRAMEBUFFER_BINDING)||!window.__captureFrame)return;
 const w=this.drawingBufferWidth,h=this.drawingBufferHeight,p=new Uint8Array(w*h*4);this.readPixels(0,0,w,h,this.RGBA,this.UNSIGNED_BYTE,p);
 let left=w,right=0,top=h,bottom=0,count=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(p[(y*w+x)*4+3]>32){count++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,h-y-1);bottom=Math.max(bottom,h-y-1);}
 if(count>1000){window.__frameBounds={w,h,bounds:[left,top,right,bottom]};window.__captureFrame=false;}
 });}return result;};}
 const nativeFetch=window.fetch.bind(window);
 window.fetch=(url,options)=>String(url)==='/api/chats'?Promise.resolve(Response.json([])):nativeFetch(url,options);
 `});
 async function snap(name) { const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(resolve(output,name+'.png'),Buffer.from(shot.data,'base64')); }
 const host='[data-panel="1"] [data-ames-engine-host]';
 for(const mobile of [false,true]) {
  const label=mobile?'mobile':'desktop';
  await send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1440,height:mobile?844:1000,deviceScaleFactor:mobile?3:1,mobile});
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
  const start=Date.now();
  await send('Page.navigate',{url:origin+'/app?quality=SAFE'});
  await wait(`!!document.querySelector('${host} canvas')`,'engine canvas');
  await wait(`!document.querySelector('${host} > img')`,'live ring');
  const readyMs=Date.now()-start;
  await evaluate(`(()=>{window.__captureFrame=true;const b=[...document.querySelectorAll('[aria-label="Jewelry viewer actions"] button')]; b.find(x=>x.textContent==='Reset').click();b.find(x=>x.textContent==='Stop').click()})()`);
  await pause(1000);
  const measurement=await evaluate(`(async()=>{const c=document.querySelector('${host} canvas');const r=c.getBoundingClientRect();const samples=[];let last=performance.now();await new Promise(resolve=>{function tick(t){samples.push(t-last);last=t;if(samples.length<90)requestAnimationFrame(tick);else resolve()}requestAnimationFrame(tick)});samples.sort((a,b)=>a-b);return {quality:document.querySelector('${host} [data-quality-tier]')?.dataset.qualityTier,canvas:{width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height},heapBytes:performance.memory?.usedJSHeapSize,rafMedianMs:samples[45],rafP95Ms:samples[85],resources:performance.getEntriesByType('resource').filter(x=>x.name.endsWith('jewelry.glb')).map(x=>({path:new URL(x.name).pathname,encodedBytes:x.encodedBodySize,decodedBytes:x.decodedBodySize,durationMs:x.duration}))}})()`);
  if(phase==='after') {
   await wait(`!!window.__frameBounds`,'framing capture');
   const frame=await evaluate(`(async()=>{const f=window.__frameBounds;const img=new Image();img.src='/ames-engine/dev-test-candidate-ring/web/presentation-ring-v2.png';await img.decode();const canvas=document.createElement('canvas');canvas.width=f.w;canvas.height=f.h;const ctx=canvas.getContext('2d');ctx.drawImage(img,(f.w-f.h)/2,0,f.h,f.h);const p=ctx.getImageData(0,0,f.w,f.h).data;let left=f.w,right=0,top=f.h,bottom=0;for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)if(p[(y*f.w+x)*4+3]>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}const expected=[left,top,right,bottom];return {...f,expected,difference:expected.map((v,i)=>Math.abs(v-f.bounds[i]))}})()`);
   assert.ok(frame.difference.every(v=>v<=3),'Poster/live framing mismatch: '+JSON.stringify(frame));
   measurement.framing=frame;
  }
  metrics.push({label,readyMs,...measurement});
  await snap(label+'-chat');
  await evaluate(`document.querySelector('[data-page-tab="0"]').click()`);
  await wait(`!!document.querySelector('[data-boutique-tile="dev-test-candidate-ring"]')`,'ring tile');
  await pause(500); await snap(label+'-boutique-tile');
  await evaluate(`document.querySelector('[data-boutique-tile="dev-test-candidate-ring"]').click()`);
  await wait(`!!document.querySelector('[data-boutique-detail] canvas') && !document.querySelector('[data-boutique-detail] [data-ames-engine-host] > img')`,'detail ring');
  await pause(1000);await snap(label+'-boutique');
  await evaluate(`document.querySelector('[data-page-tab="2"]').click()`);
  await wait(`!!document.querySelector('[data-media-item]')`,'media');
  await pause(1000);await evaluate(`document.querySelectorAll('video').forEach(v=>{v.pause();v.currentTime=0})`);
  await pause(300); await snap(label+'-media');
  await evaluate(`document.querySelector('[data-page-tab="1"]').click()`);
  await pause(700);
  const loss=await evaluate(`(()=>{const c=document.querySelector('${host} canvas');const gl=c.getContext('webgl2')||c.getContext('webgl');const ext=gl?.getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true})()`);
  assert.ok(loss,'Context loss extension available');
  await pause(800);await snap(label+'-context-loss');
  if(phase==='after') {
   assert.equal(await evaluate(`document.querySelector('${host}').dataset.viewerState`),'fallback');
   assert.ok(await evaluate(`!!document.querySelector('${host} img')`));
   await evaluate(`document.querySelector('${host} button').click()`);
   await wait(`document.querySelector('${host}').dataset.viewerState==='ready'`,'context retry');
  }
 }
 await writeFile(resolve(output,'metrics.json'),JSON.stringify({metrics,exceptions,notes:['Chromium desktop and touch emulation; not physical iPhone measurements.','SAFE tier forced for matched comparison.','RAF times measure main-thread animation scheduling, not GPU draw rate.','Local dev server, cache disabled. Only Chat history bootstrap is mocked; actual engine and content are loaded.']},null,2));
 if(phase==='after') assert.deepEqual(exceptions,[]);
 console.log(JSON.stringify({phase,metrics,exceptions}));
} finally {for(const call of pending.values())clearTimeout(call.timer);ws?.close();browser.kill()}
