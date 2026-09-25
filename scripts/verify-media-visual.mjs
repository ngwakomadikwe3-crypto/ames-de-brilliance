import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const width = Number(process.env.MEDIA_QA_WIDTH || 390);
const height = Number(process.env.MEDIA_QA_HEIGHT || 844);
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = width > 600 ? 9244 : 9243;
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=' + resolve('.chrome-media-qa'), `--window-size=${width},${height}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws;
let id = 1;
const pending = new Map();
const exceptions = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let target;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'); if (target) break; } catch {}
    await pause(250);
  }
  if (!target) throw new Error('Chrome unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails.exception?.description?.slice(0, 180) || data.params.exceptionDetails.text);
    if (data.id && pending.has(data.id)) { const item = pending.get(data.id); pending.delete(data.id); data.error ? item.reject(new Error(data.error.message)) : item.resolve(data.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const current = id++; pending.set(current, { resolve, reject }); ws.send(JSON.stringify({ id: current, method, params })); });
  const evalJs = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  const shot = async name => { const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const path = resolve('screenshots', name); await mkdir(resolve('screenshots'), { recursive: true }); await writeFile(path, Buffer.from(result.data, 'base64')); console.log('screenshot=' + path); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Page.navigate', { url: 'http://localhost:3010/app' });
  await pause(5000);
  await evalJs(`document.querySelector('div[style*="scroll-snap-type"]')?.scrollTo({left:2*innerWidth,behavior:'instant'})`);
  await pause(1500);
  const initial = await evalJs(`(() => {const p=document.querySelector('[data-media-panel]'),f=p?.querySelector('[data-media-feed]'),v=f?.querySelector('video');return {items:f?.querySelectorAll('[data-media-item]').length,snap:f&&getComputedStyle(f).scrollSnapType,video:v&&{paused:v.paused,ready:v.readyState,error:v.error?.code},review:p?.textContent.includes('approval pending'),panelWidth:p?.getBoundingClientRect().width,viewport:innerWidth};})()`);
  if (initial.items !== 5 || initial.snap !== 'y mandatory' || !initial.review || initial.panelWidth !== initial.viewport || initial.video?.error) throw new Error('Initial Media verification failed: ' + JSON.stringify(initial));
  console.log('initial=' + JSON.stringify(initial));
  await shot(`ames-media-${width}.png`);
  await evalJs(`document.querySelector('[data-media-feed]').scrollTo({top:innerHeight,behavior:'instant'})`);
  await pause(700);
  const scrolled = await evalJs(`(() => {const v=[...document.querySelectorAll('[data-media-feed] video')];return {top:document.querySelector('[data-media-feed]').scrollTop,firstPaused:v[0]?.paused,secondPaused:v[1]?.paused,firstTime:v[0]?.currentTime};})()`);
  if (scrolled.top < height * .75 || !scrolled.firstPaused || scrolled.secondPaused) throw new Error('Playback/snap verification failed: ' + JSON.stringify(scrolled));
  console.log('scrolled=' + JSON.stringify(scrolled));
  await evalJs(`document.querySelector('[data-media-feed]').scrollTo({top:0,behavior:'instant'})`);
  await pause(500);
  const beforeToggles = await evalJs(`(() => {const i=document.querySelector('[data-media-item]');return {like:i.querySelector('[aria-label="Like"]').getAttribute('aria-pressed'),save:i.querySelector('[aria-label="Save"]').getAttribute('aria-pressed')}})()`);
  await evalJs(`document.querySelector('[data-media-item] [aria-label="Like"]').click();document.querySelector('[data-media-item] [aria-label="Save"]').click()`);
  const toggles = await evalJs(`(() => {const i=document.querySelector('[data-media-item]');return {like:i.querySelector('[aria-label="Like"]').getAttribute('aria-pressed'),save:i.querySelector('[aria-label="Save"]').getAttribute('aria-pressed')}})()`);
  if (toggles.like === beforeToggles.like || toggles.save === beforeToggles.save) throw new Error('Like/Save failed: ' + JSON.stringify({beforeToggles,toggles}));
  await evalJs(`document.querySelector('[data-media-item] [aria-label="Comment"]').click()`);
  await pause(150);
  await evalJs(`(() => {const d=document.querySelector('[data-media-comments]');const input=d.querySelector('input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'A local comment');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await pause(100);
  await evalJs(`([...document.querySelectorAll('[data-media-comments] button')].find(b=>b.textContent==='Post'))?.click()`);
  await pause(200);
  const comment = await evalJs(`document.querySelector('[data-media-comments]')?.textContent?.includes('A local comment')`);
  if (!comment) throw new Error('Comment posting failed');
  await shot(`ames-media-comments-${width}.png`);
  await evalJs(`document.querySelector('[aria-label="Close comments"]').click()`);
  await evalJs(`(() => {const input=document.querySelector('#ames-media-search');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'yellow gold');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await pause(250);
  const noMatch = await evalJs(`document.querySelector('[data-media-panel]')?.textContent?.includes('No media matches this search.')`);
  if (!noMatch) throw new Error('Unverified search metadata matched');
  await evalJs(`(() => {const input=document.querySelector('#ames-media-search');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'solitaire');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await pause(250);
  if ((await evalJs(`document.querySelectorAll('[data-media-item]').length`)) !== 5) throw new Error('Verified search failed');
  await evalJs(`document.querySelector('[data-media-item] [aria-label^="Buy"]').click()`);
  await pause(700);
  const buy = await evalJs(`!!document.querySelector('[data-boutique-detail="dev-test-candidate-ring"]')`);
  if (!buy) throw new Error('Buy did not open exact Boutique detail');
  console.log('buyExactAsset=' + buy);
  await evalJs(`document.querySelector('div[style*="scroll-snap-type"]')?.scrollTo({left:2*innerWidth,behavior:'instant'})`);
  await pause(600);
  await evalJs(`([...document.querySelectorAll('[data-media-item] button')].find(b=>b.textContent==='Ask SAME'))?.click()`);
  await pause(400);
  const ask = await evalJs(`[...document.querySelectorAll('[data-panel="1"] input')].map(x=>x.value).some(x=>x.includes('dev-test-candidate-ring'))`);
  if (!ask) throw new Error('Ask SAME asset context missing');
  console.log('askSameAssetContext=' + ask);
  console.log('browserExceptions=' + exceptions.length + '; unique=' + JSON.stringify([...new Set(exceptions)].slice(0, 3)));
} finally { ws?.close(); browser.kill(); }
