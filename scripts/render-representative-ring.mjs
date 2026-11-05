import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const origin = process.env.AMES_TEST_URL || 'http://localhost:3010';
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=9264','--user-data-dir='+resolve('.ames-cad/qa-ring-render'),'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ws,sequence=0;const pending=new Map(),exceptions=[];
try{
 let target;
 for(let i=0;i<60;i++){try{target=(await(await fetch('http://127.0.0.1:9264/json/list')).json()).find(p=>p.type==='page');if(target)break}catch{}await pause(250)}
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

 await send('Page.addScriptToEvaluateOnNewDocument',{source:`
 const nativeFetch=window.fetch.bind(window);
 window.fetch=(url,options)=>String(url)==='/api/chats'?Promise.resolve(Response.json([])):nativeFetch(url,options);
 const queued=new WeakSet();
 for(const Type of [window.WebGLRenderingContext,window.WebGL2RenderingContext]) if(Type) for(const key of ['drawArrays','drawElements']) {
 const original=Type.prototype[key];Type.prototype[key]=function(...args){const result=original.apply(this,args);
 if(window.__captureRing && this.canvas.closest('[data-panel="1"] [data-ames-engine-host]') && !queued.has(this)) {
 queued.add(this);queueMicrotask(()=>{queued.delete(this);if(this.getParameter(this.FRAMEBUFFER_BINDING) || !window.__captureRing)return;
 const p=new Uint8Array(this.drawingBufferWidth*this.drawingBufferHeight*4);this.readPixels(0,0,this.drawingBufferWidth,this.drawingBufferHeight,this.RGBA,this.UNSIGNED_BYTE,p);
 let count=0;for(let i=3;i<p.length;i+=4)if(p[i]>32)count++;
 if(count>1000){window.__ringRender={png:this.canvas.toDataURL(),width:this.drawingBufferWidth,height:this.drawingBufferHeight,visiblePixels:count};window.__captureRing=false;}
 });}return result;};}
 `});
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await send('Page.navigate',{url:origin+'/app?quality=SAFE'});
 const host='[data-panel="1"] [data-ames-engine-host]';
 await wait(`document.querySelector('${host}')?.dataset.viewerState==='ready'`,'ring');
 await evaluate(`(()=>{const host=document.querySelector('${host}');host.style.width='1024px';host.style.height='1024px';const b=[...document.querySelectorAll('[aria-label="Jewelry viewer actions"] button')];b.find(x=>x.textContent==='Stop').click()})()`);
 await pause(2000);
 await evaluate(`(()=>{window.__captureRing=true;const b=[...document.querySelectorAll('[aria-label="Jewelry viewer actions"] button')];b.find(x=>x.textContent==='Reset').click();b.find(x=>x.textContent==='Stop').click()})()`);
 await wait(`!!window.__ringRender`,'transparent render');
 const result=await evaluate('window.__ringRender');
 assert.equal(result.width,1024);assert.equal(result.height,1024);assert.deepEqual(exceptions,[]);
 await writeFile(resolve('public/ames-engine/dev-test-candidate-ring/web/presentation-ring-v2.png'),Buffer.from(result.png.split(',')[1],'base64'));
 console.log(JSON.stringify({...result,png:undefined,source:'dev-test-candidate-ring:2',camera:'three_quarter',quality:'SAFE',note:'Actual Engine canvas render, not product photography; unchanged source geometry and lighting.'}));
} finally {for(const call of pending.values())clearTimeout(call.timer);ws?.close();browser.kill()}
