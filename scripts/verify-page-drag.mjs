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


 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Page.navigate',{url:origin+'/app?quality=SAFE'});
 await wait(`!!document.querySelector('.ames-curl-corner')`,'corners');
 await pause(3500);
 // Confirm hydration and interactive navigation before sending a native touch.
 await evaluate(`document.querySelector('[data-page-tab="0"]').click()`);
 await wait(`!!document.querySelector('[data-page-tab="0"][aria-current]')`,'hydrated navigation');
 await wait(`!document.querySelector('[data-page-curl]')`,'initial turn');
 await evaluate(`document.querySelector('[data-page-tab="1"]').click()`);
 await wait(`!!document.querySelector('[data-page-tab="1"][aria-current]') && !document.querySelector('[data-page-curl]')`,'return to Chat');
 const active=()=>evaluate(`Number(document.querySelector('[data-page-tab][aria-current]').dataset.pageTab)`);
 const settle=()=>wait(`!document.querySelector('[data-page-curl]')`,'settled');
 async function dragCorner(back, distance, cancel=false) {
  const p=await evaluate(`(()=>{const r=document.querySelector('${back?'.ames-curl-corner-left':'.ames-curl-corner:not(.ames-curl-corner-left)'}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});
  for(let i=1;i<=5;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+(back?1:-1)*distance*i/5,y:p.y,id:1}]});await pause(30)}
  const progress=await evaluate(`Number(document.querySelector('[data-page-curl]')?.dataset.curlProgress || 0)`);
  await send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  await pause(350);await settle();return progress;
 }
 assert.equal(await active(),1);
 assert.ok(await dragCorner(false,45)>0,'fold follows finger');
 assert.equal(await active(),1,'short drag cancels');
 assert.ok(await dragCorner(false,180)>0.4);
 assert.equal(await active(),2,'forward');
 await dragCorner(true,180);assert.equal(await active(),1,'backward');
 await dragCorner(false,180,true);assert.equal(await active(),1,'cancelled pointer restores page');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert.equal(await dragCorner(false,180),0,'reduced motion has no animated fold');
 assert.equal(await active(),2);
 await dragCorner(false,180);assert.equal(await active(),3,'last page');
 assert.equal(await evaluate(`!!document.querySelector('.ames-curl-corner:not(.ames-curl-corner-left)')`),false);
 assert.deepEqual(exceptions,[]);
 console.log('PASS: real touch drags follow finger, forward/back, short-drag cancel, touch cancellation, reduced motion and last-page boundary.');
} finally {for(const call of pending.values())clearTimeout(call.timer);ws?.close();browser.kill()}
