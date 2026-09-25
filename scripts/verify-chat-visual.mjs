import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9237;
const output = resolve('screenshots/ames-chat-stage.png');
const browser = spawn(chrome, ['--headless=new', '--disable-gpu-sandbox', `--remote-debugging-port=${port}`, '--user-data-dir=' + resolve('.chrome-chat-qa'), '--window-size=430,900', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws;
let nextId = 1;
const pending = new Map();
try {
  let target;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find(item => item.type === 'page');
      if (target) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!target) throw new Error('Chrome debugging target unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      data.error ? reject(new Error(data.error.message)) : resolve(data.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  const blockChat = process.env.AMES_QA_BLOCK_CHAT === '1';
  if (blockChat) {
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['*ames-engine/chat/index.json*'] });
  }
  await send('Page.navigate', { url: 'http://localhost:3010/app' });
  await new Promise(resolve => setTimeout(resolve, 4500));
  await send('Runtime.evaluate', { expression: "document.querySelector('[data-panel=\"1\"]')?.scrollIntoView({behavior:'instant',block:'nearest',inline:'start'})" });
  await new Promise(resolve => setTimeout(resolve, 5000));
  if (process.env.AMES_QA_ORBIT) {
    await send('Runtime.evaluate', { expression: `document.querySelector('[data-panel="1"] model-viewer')?.setAttribute('camera-orbit', ${JSON.stringify(process.env.AMES_QA_ORBIT)})` });
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  const result = await send('Runtime.evaluate', { expression: `(() => { const chat = document.querySelector('[data-panel="1"]'); const viewer = chat?.querySelector('model-viewer'); return { src: viewer?.src, poster: viewer?.poster, rotation: viewer?.hasAttribute('auto-rotate'), orbit: viewer?.getCameraOrbit?.(), target: viewer?.getCameraTarget?.(), fieldOfView: viewer?.getAttribute('field-of-view'), reviewVisible: chat?.textContent?.includes('Not approved for publication'), hasSAME: chat?.textContent?.includes('SAME'), glbLoaded: viewer?.loaded ?? null, scrollLeft: document.querySelector('div[style*="scroll-snap-type"]')?.scrollLeft }; })()`, returnByValue: true });
  console.log(JSON.stringify(result.result.value, null, 2));
  if (blockChat) {
    if (!String(result.result.value?.src).includes('/diamond.glb/scene.gltf') || !(await send('Runtime.evaluate', { expression: `document.querySelector('[data-panel="1"]')?.textContent?.includes('Showing the loose gemstone preview')`, returnByValue: true })).result.value) throw new Error('Loose-stone fallback failed');
    console.log('loose-stone fallback verified');
  } else {
  const firstTheta = result.result.value?.orbit?.theta;
  await new Promise(resolve => setTimeout(resolve, 3000));
  const second = await send('Runtime.evaluate', { expression: `(() => {const v=document.querySelector('[data-panel="1"] model-viewer'); return {theta:v?.getCameraOrbit?.().theta, orientation:v?.getAttribute('orientation'), visible:v?.modelIsVisible};})()`, returnByValue: true });
  console.log('rotationCheck=' + JSON.stringify({ ...second.result.value, deltaRadians: second.result.value?.theta - firstTheta }));
  const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  const angle = async () => Number((await evaluate(`document.querySelector('[data-panel="1"] model-viewer')?.getAttribute('orientation')`))?.match(/0deg ([\d.]+)deg/)?.[1]);
  const clickAction = async label => evaluate(`(() => {const b=[...document.querySelectorAll('[data-panel="1"] [aria-label="Jewelry viewer actions"] button')].find(x=>x.textContent===${JSON.stringify(label)}); b?.click(); return !!b})()`);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const movingStart = await angle();
  await wait(900);
  const movingEnd = await angle();
  if (!(movingEnd > movingStart)) throw new Error('Jewelry is not visibly rotating');
  await clickAction('Stop');
  await wait(150);
  const stoppedAt = await angle();
  await wait(500);
  if (Math.abs((await angle()) - stoppedAt) > 0.02) throw new Error('Stop did not freeze the jewelry');
  await clickAction('Rotate');
  await wait(900);
  if (!((await angle()) > stoppedAt)) throw new Error('Rotate did not resume the jewelry');
  await evaluate(`document.querySelector('[data-panel="1"] model-viewer')?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
  await wait(100);
  const pausedAt = await angle();
  await wait(500);
  if (Math.abs((await angle()) - pausedAt) > 0.02) throw new Error('Manual orbit did not pause rotation');
  await evaluate(`document.querySelector('[data-panel="1"] model-viewer')?.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))`);
  await wait(2400);
  if (!((await angle()) > pausedAt)) throw new Error('Rotation did not resume after manual orbit');
  await clickAction('Side');
  await wait(150);
  if (!(await evaluate(`document.querySelector('[data-panel="1"] model-viewer')?.getAttribute('camera-orbit')`)).startsWith('90deg')) throw new Error('Side view failed');
  await clickAction('Macro');
  await wait(150);
  if (!(await evaluate(`!!document.querySelector('[data-panel="1"] img[alt="Gemstone macro view"]')`))) throw new Error('Macro view failed');
  await clickAction('Setting');
  await wait(2000);
  if (!(await evaluate(`document.querySelector('[data-panel="1"] model-viewer')?.getAttribute('camera-orbit')`)).startsWith('35deg 35deg')) throw new Error('Setting view failed');
  await clickAction('Reset');
  await wait(150);
  if (!(await evaluate(`document.querySelector('[data-panel="1"] model-viewer')?.getAttribute('camera-orbit')`)).startsWith('35deg 40deg')) throw new Error('Reset view failed');
  if ((await angle()) > 3) throw new Error('Reset did not restore the presentation angle');
  console.log('viewer actions and turntable interaction verified');
  }
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await mkdir(resolve('screenshots'), { recursive: true });
  const screenshotPath = blockChat ? resolve('screenshots/ames-chat-loose-fallback.png') : output;
  await writeFile(screenshotPath, Buffer.from(shot.data, 'base64'));
  console.log(screenshotPath);
} finally {
  ws?.close();
  browser.kill();
}
