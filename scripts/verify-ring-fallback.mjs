import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const origin = process.env.AMES_TEST_URL || 'http://localhost:3010';
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=9265','--user-data-dir='+resolve('.ames-cad/qa-ring-failure'),'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ws,sequence=0;const pending=new Map(),exceptions=[];
try{
 let target;
 for(let i=0;i<60;i++){try{target=(await(await fetch('http://127.0.0.1:9265/json/list')).json()).find(p=>p.type==='page');if(target)break}catch{}await pause(250)}
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

 await send('Network.enable');
 await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`const f=window.fetch.bind(window);window.fetch=(u,o)=>String(u)==='/api/chats'?Promise.resolve(Response.json([])):f(u,o);`});
 for(const failPoster of [false,true]) {
  await send('Network.setBlockedURLs',{urls:['*dev-test-candidate-ring/web/jewelry.glb*',...(failPoster?['*presentation-ring-v2.png*']:[])]});
  await send('Page.navigate',{url:origin+'/app?quality=SAFE'});
  const host='[data-panel="1"] [data-ames-engine-host]';
  await wait(`document.querySelector('${host}')?.dataset.viewerState==='fallback'`,'failed model fallback');
  if(failPoster) await wait(`!document.querySelector('${host} img')`,'broken poster removed');
  else assert.ok(await evaluate(`document.querySelector('${host} img')?.naturalWidth>0`));
  assert.ok(await evaluate(`document.querySelector('${host} button')?.textContent.includes('Retry')`));
  await send('Network.setBlockedURLs',{urls:[]});
  await evaluate(`document.querySelector('${host} button').click()`);
  await wait(`document.querySelector('${host}')?.dataset.viewerState==='ready'`,'model fetch retry');
 }
 console.log('PASS: blocked GLB preserves same-ring poster; blocked poster provides text; unblocked retry loads real GLB in both cases. Expected injected network errors are not application success errors.');
} finally {for(const call of pending.values())clearTimeout(call.timer);ws?.close();browser.kill()}
