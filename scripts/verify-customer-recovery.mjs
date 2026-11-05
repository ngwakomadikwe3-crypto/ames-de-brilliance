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

 await send('Page.addScriptToEvaluateOnNewDocument',{source:`
 const realFetch=window.fetch.bind(window); let bootstrap=0;
 window.fetch=async(input,init={})=>{
 const url=String(input);
 if(url==='/api/chats') {
 if(init.method==='POST') return Response.json({id:'qa-chat',title:'QA'},{status:201});
 bootstrap++; window.__qaBootstrap=bootstrap;
 return bootstrap===1 ? Response.json({error:'Unavailable'},{status:503}) : Response.json([]);
 }
 if(url==='/api/chats/qa-chat/messages') return Response.json({id:'qa-user',role:'user',text:JSON.parse(init.body).text},{status:201});
 if(url==='/api/ames') return Response.json({answer:'Hello',message:{id:'qa-answer',role:'assistant',text:'Hello'}});
 return realFetch(input,init);
 };
 `});
 await send('Page.navigate',{url:origin+'/app?quality=SAFE'});
 await wait(`!!document.querySelector('[role="alert"]')`,'bootstrap error');
 await evaluate(`(()=>{const input=document.querySelector('[aria-label="Message SAME"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Hello');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 await wait(`!document.querySelector('[aria-label="Send message"]').disabled`,'enabled composer');
 await evaluate(`document.querySelector('[aria-label="Send message"]').click()`);
 await wait(`!!document.querySelector('[data-chat-message="assistant"]')`,'session retry and reply');
 assert.ok(await evaluate(`window.__qaBootstrap>=2`));
 assert.equal(await evaluate(`!!document.querySelector('[role="alert"]')`),false);
 await evaluate(`document.querySelector('[aria-label="Browse jewelry"]').click()`);
 await wait(`!!document.querySelector('[data-page-tab="0"][aria-current]')`,'browse jewelry action');
 await send('Page.navigate',{url:origin+'/app/settings'});
 await wait(`!!document.querySelector('.settings-save')`,'settings');
 await pause(1200);
 await evaluate(`window.__qaSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(){throw new DOMException('Blocked','SecurityError')};document.querySelector('.settings-save').click()`);
 await wait(`!!document.querySelector('[role="alert"]')`,'save failure');
 assert.equal(await evaluate(`document.querySelector('.settings-save').textContent`),'Save');
 await evaluate(`Storage.prototype.setItem=window.__qaSetItem;document.querySelector('.settings-save').click()`);
 await wait(`document.querySelector('.settings-save').textContent.includes('Saved')`,'successful retry');
 assert.equal(await evaluate(`!!document.querySelector('[role="alert"]')`),false);
 assert.deepEqual(exceptions,[]);
 console.log('PASS: failed session startup retries, Chat sends and renders reply, browse button opens Boutique, blocked storage reports failure and settings retry succeeds. Chat API responses are mocked.');
} finally {for(const call of pending.values())clearTimeout(call.timer);ws?.close();browser.kill()}
