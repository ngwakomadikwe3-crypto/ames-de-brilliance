import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const width = Number(process.env.BOUTIQUE_QA_WIDTH || 390);
const height = Number(process.env.BOUTIQUE_QA_HEIGHT || 844);
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = width > 600 ? 9240 : 9239;
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=' + resolve('.chrome-chat-qa'), `--window-size=${width},${height}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
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
  if (!target) throw new Error('Chrome target unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') {
      const detail = data.params.exceptionDetails;
      exceptions.push({ text: detail.text, description: detail.exception?.description?.slice(0, 240), url: detail.url });
    }
    if (data.id && pending.has(data.id)) {
      const item = pending.get(data.id); pending.delete(data.id);
      data.error ? item.reject(new Error(data.error.message)) : item.resolve(data.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const current = id++; pending.set(current, { resolve, reject }); ws.send(JSON.stringify({ id: current, method, params })); });
  const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  const shot = async name => {
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const path = resolve('screenshots', name);
    await mkdir(resolve('screenshots'), { recursive: true });
    await writeFile(path, Buffer.from(result.data, 'base64'));
    console.log(path);
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Page.navigate', { url: 'http://localhost:3010/app' });
  await pause(5000);
  await evaluate(`(() => {document.querySelector('div[style*="scroll-snap-type"]')?.scrollTo({left:0,behavior:'instant'});window.scrollTo(0,0)})()`);
  await pause(300);
  const gallery = await evaluate(`(() => {const p=document.querySelector('[data-panel="0"]');const s=p.querySelector('[data-boutique-scroll]');return {groups:p.querySelectorAll('[data-boutique-group]').length,tiles:p.querySelectorAll('[data-boutique-tile]').length,footer:[...p.querySelectorAll('[aria-label="Boutique categories"] button')].map(x=>x.textContent),snap:getComputedStyle(s).scrollSnapType,review:p.textContent.includes('approval pending'),fake:p.textContent.includes('DEMO-001'),price:p.textContent.includes('Price on request')};})()`);
  if (gallery.groups !== 1 || gallery.tiles !== 1 || gallery.footer.join(',') !== 'Rings,Earrings,Necklaces,Bracelets,Diamonds' || gallery.snap !== 'y mandatory' || !gallery.review || gallery.fake || gallery.price) throw new Error('Boutique gallery verification failed: ' + JSON.stringify(gallery));
  console.log('gallery=' + JSON.stringify(gallery));
  console.log('galleryLayout=' + JSON.stringify(await evaluate(`(() => {const p=document.querySelector('[data-panel="0"]'); const f=p.querySelector('[aria-label="Boutique categories"]'); const s=p.querySelector('[data-boutique-scroll]'); return {innerHeight, panel:p.getBoundingClientRect().toJSON(), footer:f.getBoundingClientRect().toJSON(), scroll:s.getBoundingClientRect().toJSON()};})()`)));
  console.log('exceptionsAfterGallery=' + exceptions.length);
  const baselineExceptions = exceptions.length;
  await shot(`ames-boutique-${width}.png`);
  await evaluate(`([...document.querySelectorAll('[aria-label="Boutique categories"] button')].find(x=>x.textContent==='Earrings'))?.click()`);
  await pause(200);
  if (!(await evaluate(`document.querySelector('[data-panel="0"]')?.textContent?.includes('No pieces in this category yet.')`))) throw new Error('Empty category failed');
  await evaluate(`([...document.querySelectorAll('[aria-label="Boutique categories"] button')].find(x=>x.textContent==='Rings'))?.click()`);
  await pause(200);
  await evaluate(`document.querySelector('[data-boutique-tile]')?.click()`);
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await evaluate(`document.querySelector('[data-panel="0"] model-viewer')?.loaded === true`)) break;
    await pause(500);
  }
  const detail = await evaluate(`(() => {const p=document.querySelector('[data-panel="0"]');const v=p.querySelector('model-viewer');return {open:!!p.querySelector('[data-boutique-detail]'),glb:v?.src,loaded:v?.loaded,defined:!!customElements.get('model-viewer'),fallback:p.textContent.includes('3D preview unavailable'),ask:!![...p.querySelectorAll('button')].find(x=>x.textContent==='Ask SAME'),price:p.textContent.includes('Price on request'),review:p.textContent.includes('approval pending')};})()`);
  await shot(`ames-boutique-detail-${width}.png`);
  if (!detail.open || !detail.glb?.endsWith('/web/jewelry.glb') || !detail.loaded || !detail.ask || detail.price || !detail.review) throw new Error('Boutique detail verification failed: ' + JSON.stringify(detail));
  console.log('detail=' + JSON.stringify(detail));
  console.log('detailLayout=' + JSON.stringify(await evaluate(`(() => {const p=document.querySelector('[data-panel="0"]'); const d=p.querySelector('[data-boutique-detail]'); const ask=[...d.querySelectorAll('button')].find(x=>x.textContent==='Ask SAME'); return {innerHeight,panel:p.getBoundingClientRect().toJSON(),detail:d.getBoundingClientRect().toJSON(),ask:ask.getBoundingClientRect().toJSON()};})()`)));
  console.log('exceptionsAfterDetail=' + exceptions.length);
  if (exceptions.length !== baselineExceptions) throw new Error('Boutique interaction caused browser exceptions: ' + JSON.stringify(exceptions.slice(baselineExceptions, baselineExceptions + 3)));
  await evaluate(`([...document.querySelectorAll('[data-panel="0"] button')].find(x=>x.textContent==='Ask SAME'))?.click()`);
  await pause(300);
  const handoff = await evaluate(`(() => {const p=document.querySelector('[data-panel="1"]');return {draft:[...p.querySelectorAll('input')].map(x=>x.value).find(x=>x.includes('dev-test-candidate-ring')),scrollLeft:document.querySelector('div[style*="scroll-snap-type"]')?.scrollLeft};})()`);
  if (!handoff.draft) throw new Error('Ask SAME did not carry asset context');
  console.log('handoff=' + JSON.stringify(handoff));
  console.log('boutique browser exceptions=0; preexisting/Chat exceptions=' + exceptions.length);
} finally {
  ws?.close();
  browser.kill();
}
