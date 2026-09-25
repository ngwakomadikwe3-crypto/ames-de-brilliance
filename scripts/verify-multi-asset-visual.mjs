import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const width = 390;
const height = 844;
const port = 9251;
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=' + resolve('.chrome-multi-asset-qa'), `--window-size=${width},${height}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
let nextId = 1;
const pending = new Map();
const exceptions = [];

try {
  let target;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'); if (target) break; } catch {}
    await pause(250);
  }
  assert.ok(target, 'Chrome target is unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails.exception?.description?.slice(0, 300) || data.params.exceptionDetails.text);
    if (data.id && pending.has(data.id)) {
      const call = pending.get(data.id); pending.delete(data.id);
      if (data.error) call.reject(new Error(data.error.message));
      else call.resolve(data.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  };
  const waitFor = async (expression, label, attempts = 40) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const value = await evaluate(expression);
      if (value) return value;
      await pause(250);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const shot = async name => {
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const path = resolve('screenshots', name);
    await mkdir(resolve('screenshots'), { recursive: true });
    await writeFile(path, Buffer.from(result.data, 'base64'));
    console.log(`screenshot=${path}`);
  };
  const panel = async index => {
    await evaluate(`document.querySelector('[data-panel="0"]').parentElement.parentElement.scrollTo({left:${index}*innerWidth,behavior:'instant'})`);
    await pause(500);
  };
  const search = async value => {
    await evaluate(`(() => {const input=document.querySelector('#ames-media-search');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await pause(300);
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: 'http://localhost:3010/app' });
  await waitFor(`document.querySelectorAll('[data-boutique-tile]').length === 2`, 'two ring tiles');
  await panel(0);
  await waitFor(`[...document.querySelectorAll('[data-boutique-tile] img')].every(image=>image.naturalWidth>0)`, 'ring posters');
  const rings = await evaluate(`[...document.querySelectorAll('[data-boutique-tile]')].map(tile=>({id:tile.dataset.boutiqueTile,img:tile.querySelector('img')?.src,loaded:tile.querySelector('img')?.naturalWidth>0,review:tile.textContent.includes('approval pending')}))`);
  assert.deepEqual(rings.map(item => item.id), ['dev-test-candidate-ring', 'dev-test-solitaire-mount']);
  assert.ok(rings.every(item => item.img.includes(`/ames-engine/${item.id}/`) && item.loaded && item.review));
  assert.equal(await evaluate(`document.querySelectorAll('[data-boutique-group]').length`), 1);
  await waitFor(`document.querySelector('[data-panel="1"] model-viewer')?.src?.includes('/dev-test-candidate-ring/web/jewelry.glb')`, 'default candidate Chat stage');
  await shot('ames-multi-boutique-rings.png');

  await evaluate(`([...document.querySelectorAll('[aria-label="Boutique categories"] button')].find(button=>button.textContent==='Earrings'))?.click()`);
  await waitFor(`document.querySelector('[data-boutique-tile="dev-test-earring-001"]') !== null`, 'earring tile');
  await waitFor(`document.querySelector('[data-boutique-tile="dev-test-earring-001"] img')?.naturalWidth>0`, 'earring poster');
  const earrings = await evaluate(`[...document.querySelectorAll('[data-boutique-tile]')].map(tile=>({id:tile.dataset.boutiqueTile,img:tile.querySelector('img')?.src,loaded:tile.querySelector('img')?.naturalWidth>0,text:tile.textContent}))`);
  assert.equal(earrings.length, 1);
  assert.equal(earrings[0].id, 'dev-test-earring-001');
  assert.ok(earrings[0].img.includes('/dev-test-earring-001/web/poster.png') && earrings[0].loaded && !earrings[0].text.includes('Price'));
  await shot('ames-multi-boutique-earrings.png');
  await evaluate(`document.querySelector('[data-boutique-tile="dev-test-earring-001"]').click()`);
  await waitFor(`document.querySelector('[data-boutique-detail="dev-test-earring-001"] model-viewer')?.loaded === true`, 'earring detail GLB', 60);
  const detail = await evaluate(`(() => {const d=document.querySelector('[data-boutique-detail]'),v=d?.querySelector('model-viewer');return {id:d?.dataset.boutiqueDetail,src:v?.src,poster:v?.poster,review:d?.textContent.includes('approval pending'),name:d?.textContent.includes('Chandelier earring mount'),price:d?.textContent.includes('Price on request')}})()`);
  assert.equal(detail.id, 'dev-test-earring-001');
  assert.ok(detail.src.includes('/dev-test-earring-001/web/jewelry.glb') && detail.poster.includes('/dev-test-earring-001/web/poster.png') && detail.review && detail.name && !detail.price);
  await shot('ames-multi-earring-detail.png');
  await evaluate(`([...document.querySelectorAll('[data-boutique-detail] button')].find(button=>button.textContent==='Ask SAME'))?.click()`);
  await waitFor(`document.querySelector('[data-panel="1"] model-viewer')?.src?.includes('/dev-test-earring-001/web/jewelry.glb')`, 'earring Chat stage');
  const chatEarring = await evaluate(`(() => {const p=document.querySelector('[data-panel="1"]'),v=p.querySelector('model-viewer'),i=[...p.querySelectorAll('input')].find(input=>input.value.includes('dev-test-earring-001'));return {src:v?.src,loaded:v?.loaded,orbit:v?.getAttribute('camera-orbit'),draft:i?.value,review:p.textContent.includes('Not approved for publication')}})()`);
  assert.ok(chatEarring.draft?.includes('Chandelier earring mount') && chatEarring.review && chatEarring.orbit === '35deg 75deg auto');
  await waitFor(`document.querySelector('[data-panel="1"] model-viewer')?.loaded === true`, 'earring Chat GLB', 60);
  const orientation = () => evaluate(`document.querySelector('[data-panel="1"] model-viewer')?.getAttribute('orientation')`);
  const beforeRotation = await orientation();
  await pause(600);
  assert.notEqual(await orientation(), beforeRotation, 'engine-enabled Chat turntable should rotate the earring');
  await evaluate(`([...document.querySelectorAll('[data-panel="1"] [aria-label="Jewelry viewer actions"] button')].find(button=>button.textContent==='Stop'))?.click()`);
  await pause(100);
  const stopped = await orientation();
  await pause(500);
  assert.equal(await orientation(), stopped, 'Stop must freeze the earring turntable');
  await evaluate(`([...document.querySelectorAll('[data-panel="1"] [aria-label="Jewelry viewer actions"] button')].find(button=>button.textContent==='Rotate'))?.click()`);
  await pause(600);
  assert.notEqual(await orientation(), stopped, 'Rotate must resume the earring turntable');
  await shot('ames-multi-chat-earring.png');

  await panel(2);
  await waitFor(`document.querySelectorAll('[data-media-item]').length === 21`, 'combined media feed');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-media-feed]')).scrollSnapType`), 'y mandatory');
  await search('ring');
  assert.equal(await evaluate(`document.querySelectorAll('[data-media-item]').length`), 10);
  await search('solitaire');
  assert.equal(await evaluate(`document.querySelectorAll('[data-media-item]').length`), 10);
  await search('earrings');
  const mediaEarring = await evaluate(`[...document.querySelectorAll('[data-media-item]')].map(item=>item.dataset.mediaItem)`);
  assert.equal(mediaEarring.length, 6);
  assert.ok(mediaEarring.every(key => key.startsWith('dev-test-earring-001:')));
  await shot('ames-multi-media-earring.png');
  await waitFor(`document.querySelector('[data-media-item] video')?.paused === false`, 'active earring video');
  await evaluate(`document.querySelector('[data-media-feed]').scrollTo({top:innerHeight,behavior:'instant'})`);
  await waitFor(`(() => {const videos=[...document.querySelectorAll('[data-media-item] video')];return videos[0]?.paused && videos[1]?.paused===false})()`, 'inactive video pause and next video autoplay');
  await evaluate(`document.querySelector('[data-media-feed]').scrollTo({top:0,behavior:'instant'})`);
  await waitFor(`document.querySelector('[data-media-item] video')?.paused === false`, 'first video resumes');
  const likeBefore = await evaluate(`document.querySelector('[data-media-item] [aria-label="Like"]').getAttribute('aria-pressed')`);
  const saveBefore = await evaluate(`document.querySelector('[data-media-item] [aria-label="Save"]').getAttribute('aria-pressed')`);
  await evaluate(`document.querySelector('[data-media-item] [aria-label="Like"]').click();document.querySelector('[data-media-item] [aria-label="Save"]').click()`);
  assert.notEqual(await evaluate(`document.querySelector('[data-media-item] [aria-label="Like"]').getAttribute('aria-pressed')`), likeBefore);
  assert.notEqual(await evaluate(`document.querySelector('[data-media-item] [aria-label="Save"]').getAttribute('aria-pressed')`), saveBefore);
  await evaluate(`document.querySelector('[data-media-item] [aria-label="Comment"]').click()`);
  await waitFor(`document.querySelector('[data-media-comments]') !== null`, 'comment sheet');
  await evaluate(`document.querySelector('[aria-label="Close comments"]').click()`);
  await evaluate(`document.querySelector('[data-media-item] [aria-label^="Buy "]').click()`);
  await waitFor(`document.querySelector('[data-boutique-detail="dev-test-earring-001"]') !== null`, 'Media Buy exact earring');
  const buy = await evaluate(`document.querySelector('[data-boutique-detail="dev-test-earring-001"] model-viewer')?.src`);
  assert.ok(buy.includes('/dev-test-earring-001/web/jewelry.glb'));
  await panel(2);
  await evaluate(`document.querySelector('[data-media-item] button:not([aria-label])')?.click()`);
  await waitFor(`document.querySelector('[data-panel="1"] model-viewer')?.src?.includes('/dev-test-earring-001/web/jewelry.glb')`, 'Media Ask SAME earring');
  assert.ok((await evaluate(`[...document.querySelectorAll('[data-panel="1"] input')].map(input=>input.value).find(value=>value.includes('dev-test-earring-001'))`))?.includes('Chandelier earring mount'));

  await panel(0);
  await evaluate(`document.querySelector('[data-boutique-detail] button')?.click()`);
  await evaluate(`([...document.querySelectorAll('[aria-label="Boutique categories"] button')].find(button=>button.textContent==='Rings'))?.click()`);
  await waitFor(`document.querySelector('[data-boutique-tile="dev-test-solitaire-mount"]') !== null`, 'mount ring tile');
  await evaluate(`document.querySelector('[data-boutique-tile="dev-test-solitaire-mount"]').click()`);
  await evaluate(`([...document.querySelectorAll('[data-boutique-detail] button')].find(button=>button.textContent==='Ask SAME'))?.click()`);
  await waitFor(`document.querySelector('[data-panel="1"] model-viewer')?.src?.includes('/dev-test-solitaire-mount/web/jewelry.glb')`, 'mount Chat stage');
  const mountDraft = await evaluate(`[...document.querySelectorAll('[data-panel="1"] input')].map(input=>input.value).find(value=>value.includes('dev-test-solitaire-mount'))`);
  assert.ok(mountDraft?.includes('Solitaire ring mount'));

  await panel(0);
  await evaluate(`document.querySelector('[data-boutique-detail] button')?.click()`);
  await evaluate(`(() => {const button=[...document.querySelectorAll('[aria-label="Boutique categories"] button')].find(item=>item.textContent==='Pendant');button?.click();button?.scrollIntoView({block:'nearest',inline:'center'});})()`);
  await waitFor(`document.querySelector('[data-boutique-tile="dev-test-pendant-001"]') !== null`, 'contract-derived pendant category');
  await waitFor(`document.querySelector('[data-boutique-tile="dev-test-pendant-001"] img')?.naturalWidth>0`, 'pendant poster');
  const pendantTile = await evaluate(`(() => {const tile=document.querySelector('[data-boutique-tile="dev-test-pendant-001"]');return {id:tile?.dataset.boutiqueTile,poster:tile?.querySelector('img')?.src,name:tile?.textContent.includes('Pendant mount'),preview:tile?.textContent.includes('approval pending'),category:document.querySelector('[aria-label="Boutique categories"] [aria-current="page"]')?.textContent}})()`);
  assert.equal(pendantTile.id, 'dev-test-pendant-001');
  assert.ok(pendantTile.poster.includes('/dev-test-pendant-001/web/poster.png') && pendantTile.name && pendantTile.preview && pendantTile.category === 'Pendant');
  assert.equal(await evaluate(`document.querySelectorAll('[data-boutique-tile]').length`), 1);
  await shot('ames-fourth-boutique-pendant.png');

  await evaluate(`document.querySelector('[data-boutique-tile="dev-test-pendant-001"]').click()`);
  await waitFor(`document.querySelector('[data-boutique-detail="dev-test-pendant-001"] model-viewer')?.loaded === true`, 'pendant detail GLB', 60);
  const pendantDetail = await evaluate(`(() => {const detail=document.querySelector('[data-boutique-detail="dev-test-pendant-001"]'),viewer=detail?.querySelector('model-viewer');return {src:viewer?.src,poster:viewer?.poster,name:detail?.textContent.includes('Pendant mount'),preview:detail?.textContent.includes('approval pending'),scale:detail?.textContent.includes('Physical scale unverified'),inventedPrice:detail?.textContent.includes('Price on request')}})()`);
  assert.ok(pendantDetail.src.includes('/dev-test-pendant-001/web/jewelry.glb') && pendantDetail.poster.includes('/dev-test-pendant-001/web/poster.png'));
  assert.ok(pendantDetail.name && pendantDetail.preview && pendantDetail.scale && !pendantDetail.inventedPrice);
  await shot('ames-fourth-pendant-detail.png');

  await evaluate(`([...document.querySelectorAll('[data-boutique-detail] button')].find(button=>button.textContent==='Ask SAME'))?.click()`);
  await waitFor(`document.querySelector('[data-panel="1"] model-viewer')?.src?.includes('/dev-test-pendant-001/web/jewelry.glb')`, 'Boutique Ask SAME pendant');
  await waitFor(`document.querySelector('[data-panel="1"] model-viewer')?.loaded === true`, 'Chat pendant GLB', 60);
  const pendantChat = await evaluate(`(() => {const panel=document.querySelector('[data-panel="1"]'),viewer=panel?.querySelector('model-viewer'),draft=[...panel.querySelectorAll('input')].find(input=>input.value.includes('dev-test-pendant-001'));return {src:viewer?.src,poster:viewer?.poster,orbit:viewer?.getAttribute('camera-orbit'),draft:draft?.value,preview:panel?.textContent.includes('Not approved for publication')}})()`);
  assert.ok(pendantChat.src.includes('/dev-test-pendant-001/web/jewelry.glb') && pendantChat.poster.includes('/dev-test-pendant-001/web/poster.png'));
  assert.ok(pendantChat.draft?.includes('Pendant mount') && pendantChat.preview && pendantChat.orbit === '0deg 75deg auto');
  await shot('ames-fourth-chat-pendant.png');

  await panel(2);
  await search('pendant');
  await waitFor(`document.querySelectorAll('[data-media-item]').length === 5`, 'five supplied pendant media records');
  const pendantMedia = await evaluate(`[...document.querySelectorAll('[data-media-item]')].map(item=>({key:item.dataset.mediaItem,preview:item.textContent.includes('approval pending'),buy:item.querySelector('[aria-label^="Buy "]')?.getAttribute('aria-label')}))`);
  assert.deepEqual(pendantMedia.map(item => item.key), ['luxury_product_video','turntable_360','hero','gemstone_macro','setting_detail_macro'].map(id => `dev-test-pendant-001:${id}`));
  assert.ok(pendantMedia.every(item => item.preview && item.buy === 'Buy Pendant mount'));
  await waitFor(`document.querySelector('[data-media-item] video')?.paused === false`, 'active pendant video');
  await shot('ames-fourth-media-pendant.png');
  await evaluate(`document.querySelector('[data-media-item] [aria-label^="Buy "]').click()`);
  await waitFor(`document.querySelector('[data-boutique-detail="dev-test-pendant-001"] model-viewer')?.src?.includes('/dev-test-pendant-001/web/jewelry.glb')`, 'Media Buy exact pendant');
  await panel(2);
  await evaluate(`document.querySelector('[data-media-item] button:not([aria-label])')?.click()`);
  await waitFor(`document.querySelector('[data-panel="1"] model-viewer')?.src?.includes('/dev-test-pendant-001/web/jewelry.glb')`, 'Media Ask SAME exact pendant');
  const mediaDraft = await evaluate(`[...document.querySelectorAll('[data-panel="1"] input')].map(input=>input.value).find(value=>value.includes('dev-test-pendant-001'))`);
  assert.ok(mediaDraft?.includes('Pendant mount'));

  assert.equal(exceptions.length, 0, `Browser exceptions: ${exceptions.join(' | ')}`);
  console.log(JSON.stringify({ rings, earrings, detail, chatEarring, mediaEarringCount: mediaEarring.length,
    pendantTile, pendantDetail, pendantChat, pendantMediaCount: pendantMedia.length,
    buyExactAsset: true, mediaAskExactAsset: true, boutiqueAskExactAsset: true, exceptions }, null, 2));
} finally {
  ws?.close();
  browser.kill();
}
