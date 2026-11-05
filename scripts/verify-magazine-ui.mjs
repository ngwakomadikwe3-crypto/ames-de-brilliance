import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const origin = process.env.AMES_TEST_URL || 'http://localhost:3010';
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=9255','--user-data-dir='+resolve('.ames-cad/qa-magazine-browser'),'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ws,sequence=0,submitted;const pending=new Map(),exceptions=[];
try{
 let target;
 for(let i=0;i<60;i++){try{target=(await(await fetch('http://127.0.0.1:9255/json/list')).json()).find(p=>p.type==='page');if(target)break}catch{}await pause(250)}
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
 await send('Page.navigate',{url:origin+'/app?quality=SAFE'});
 await wait(`!!document.querySelector('[data-page-tab="1"]')`,'magazine navigation');
 await wait(`!!document.querySelector('[data-ames-engine-host] canvas')`,'ring canvas');
 await pause(12000);
 const shot=async name=>{await mkdir('.ames-cad/qa',{recursive:true});const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve('.ames-cad/qa',name),Buffer.from(r.data,'base64'))};
 const turn=async i=>{await evaluate(`document.querySelector('[data-page-tab="${i}"]').click()`);await wait(`!document.querySelector('[data-page-curl]')`,'page turn settled');assert.equal(await evaluate(`document.querySelectorAll('[data-panel]:not([hidden])').length`),1);assert.equal(await evaluate(`document.querySelector('[data-panel="${i}"]').hidden`),false)};
 // Hold one real animation frame for a deterministic visual inspection of the fold.
 await evaluate(`(()=>{window.__originalRaf=window.requestAnimationFrame;window.__holdCurl=true;window.__curlTime=performance.now()+400;window.requestAnimationFrame=cb=>window.__originalRaf(t=>cb(window.__holdCurl?window.__curlTime:t));document.querySelector('[data-page-tab="0"]').click()})()`);
 await pause(500);
 console.log('Captured curl progress:',await evaluate(`document.querySelector('[data-page-curl]')?.dataset.curlProgress`));
 assert.equal(await evaluate(`!!document.querySelector('[data-page-curl]')`),true);
 assert.equal(await evaluate(`document.querySelector('[data-curl-source="true"]').getAttribute('aria-hidden')`),'true');
 await shot('magazine-curl-desktop.png');
 await evaluate(`window.__holdCurl=false;window.requestAnimationFrame=window.__originalRaf`);
 await pause(900);await turn(1);
 assert.equal(await evaluate(`document.querySelector('[data-panel="1"]').hidden`),false);
 console.log(await evaluate(`JSON.stringify(Array.from(document.querySelectorAll('[data-chat-asset-id], [data-ames-engine-host], canvas')).map(e=>({tag:e.tagName,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})))`));
 await shot('magazine-chat-desktop.png');
 await evaluate(`(()=>{const el=document.querySelector('[data-chat-panel] input');el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Keep this draft');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))})()`);
 assert.equal(await evaluate(`document.querySelector('[data-panel="1"]').hidden`),false);
 await turn(0);await turn(1);
 assert.equal(await evaluate(`document.querySelector('[data-chat-panel] input').value`),'Keep this draft');
 await turn(0);
 await wait(`!!document.querySelector('[data-boutique-tile]')`,'boutique');
 assert.equal(await evaluate(`document.querySelectorAll('[data-boutique-tile="dev-test-solitaire-mount"],[data-boutique-tile="dev-test-pendant-001"]').length`),0);
 await shot('magazine-boutique-desktop.png');
 await evaluate(`document.querySelector('[data-boutique-tile="dev-test-candidate-ring"]').click()`);
 await pause(12000);await shot('magazine-ring-desktop.png');
 await turn(1);await turn(0);
 assert.equal(await evaluate(`document.querySelector('[data-boutique-detail]').dataset.boutiqueDetail`),'dev-test-candidate-ring');
 await evaluate(`document.querySelector('[aria-label="Back to Boutique"]').click()`);
 for(const category of ['Earrings']){
  await evaluate(`Array.from(document.querySelectorAll('[aria-label="Boutique categories"] button')).find(b=>b.textContent.includes('${category}')).click()`);
  await evaluate(`document.querySelector('[data-boutique-tile]').click()`);
  await wait(`document.querySelector('[data-boutique-detail] model-viewer')?.loaded === true`,'model load '+category);
  const orbit=await evaluate(`document.querySelector('[data-boutique-detail] model-viewer').getAttribute('camera-orbit')`);assert.ok(orbit.includes('105%'));
  await shot('magazine-'+category.toLowerCase()+'.png');
  if(category==='Earrings') {
   const material=`document.querySelector('[data-boutique-detail] model-viewer').model.materials[0].pbrMetallicRoughness`;
   assert.equal(await evaluate(material+'.metallicFactor'),1);
   assert.equal(await evaluate(material+'.roughnessFactor'),0.24);
   assert.deepEqual(await evaluate(material+'.baseColorFactor'),[1,0.766,0.336,1]);
   await evaluate(`Array.from(document.querySelectorAll('[data-boutique-detail] button')).find(b=>b.textContent==='Ask SAME').click()`);
   await wait(`document.querySelector('[data-chat-asset-id="dev-test-earring-001"] model-viewer')?.loaded === true`,'same earring in Chat');
   assert.equal(await evaluate(`document.querySelector('[data-chat-asset-id] model-viewer').model.materials[0].pbrMetallicRoughness.metallicFactor`),1);
   await shot('magazine-earring-chat.png');
   await turn(0);
  }
  await evaluate(`document.querySelector('[aria-label="Back to Boutique"]').click()`);
 }
 await evaluate(`Array.from(document.querySelectorAll('[aria-label="Boutique categories"] button')).find(b=>b.textContent==='Rings').click()`);
 await evaluate(`document.querySelector('[data-boutique-tile="dev-test-candidate-ring"]').click()`);
 await evaluate(`Array.from(document.querySelectorAll('[data-boutique-detail] button')).find(b=>b.textContent==='Ask SAME').click()`);
 await wait(`!!document.querySelector('[data-chat-panel] [data-quality-tier]')`,'ring SAFE viewer');
 await turn(2);await turn(3);await turn(1);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(1500);
 assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false);
 assert.equal(await evaluate(`document.querySelector('[data-quality-tier]').dataset.qualityTier`),'SAFE');
 await shot('magazine-chat-mobile.png');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await turn(0);
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-panel="0"]')).animationName`),'none');
 await shot('magazine-boutique-mobile.png');
 assert.deepEqual(exceptions,[]);
 console.log('PASS: named pages, preserved Chat draft and Boutique selection, keyboard safety, real earring/pendant models, mobile SAFE, reduced motion, no overflow or runtime exceptions.');
} finally {for(const call of pending.values())clearTimeout(call.timer);ws?.close();browser.kill()}
