import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(new URL('../../ames-engine-main/package.json', import.meta.url));
const { webkit, devices } = require('playwright');
const output = process.env.AMES_QA_DIR ?? join(tmpdir(), 'ames-chat-controls-qa');
await mkdir(output, { recursive: true });
const browser = await webkit.launch();
try {
  const page = await browser.newPage(devices['iPhone 13']);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/chats', route => route.fulfill({ json: route.request().method() === 'POST' ? {id:'qa-chat'} : [] }));
  await page.route('**/api/chats/qa-chat/messages', async route => route.fulfill({json:{id:String(Date.now()), ...route.request().postDataJSON()}}));
  let sentAssetId;
  await page.route('**/api/ames', route => { sentAssetId=route.request().postDataJSON().assetId; return route.fulfill({json:{answer:'Zoomed.',viewer_action:'zoom'}}) });
  await page.goto((process.env.AMES_APP_URL ?? 'http://127.0.0.1:3000') + '/app');
  await page.waitForSelector('[data-panel="1"] [data-ames-engine-host] canvas', { state: 'attached' });
  await page.waitForFunction(() => !document.querySelector('[data-panel="1"] [data-ames-engine-host] > img'));
  const stage = page.locator('[data-panel="1"]');
  await stage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const action = name => stage.locator('button').filter({ hasText: new RegExp(`^${name}$`) }).evaluate(button => button.click());
  async function snapshot() {
    return page.evaluate(() => {
      const canvas = document.querySelector('[data-panel="1"] canvas');
      let fiber = canvas[Object.keys(canvas).find(key => key.startsWith('__reactFiber'))];
      while (fiber) {
        let hook = fiber.memoizedState;
        while (hook) {
          const store = hook.memoizedState?.current;
          if (store?.gl && typeof store.get === 'function') {
            const state = store.get(), p = state.camera.position;
            state.scene.onAfterRender = (_renderer, _scene, camera) => { window.__renderedCamera = camera.position.toArray() };
            const root = state.scene.getObjectByName('ames-controlled-turntable');
            const bounds = {x:0,y:0};
            root.updateWorldMatrix(true,true);
            const axis=p.clone().set(0,1,0), point=p.clone();
            root.traverse(mesh => {
              if (!mesh.isMesh || !mesh.geometry.attributes.position) return;
              const positions=mesh.geometry.attributes.position;
              for(let i=0;i<positions.count;i++) for(let angle=0;angle<Math.PI*2;angle+=Math.PI/12) {
                point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).applyAxisAngle(axis,angle).project(state.camera);
                bounds.x=Math.max(bounds.x,Math.abs(point.x)); bounds.y=Math.max(bounds.y,Math.abs(point.y));
              }
            });
            return { bounds, renderedCamera: window.__renderedCamera, frame: state.gl.info.render.frame, position: p.toArray(), radius: p.length(), theta: Math.atan2(p.x, p.z), phi: Math.acos(p.y / p.length()), angle: state.scene.getObjectByName('ames-controlled-turntable')?.rotation.y, loop: state.frameloop, tier: document.querySelector('[data-panel="1"] [data-quality-tier]').dataset.qualityTier };
          }
          hook = hook.next;
        }
        fiber = fiber.return;
      }
      throw new Error('Missing Engine state');
    });
  }
  await action('Stop'); await page.waitForTimeout(800);
  const idle = await snapshot(); await page.waitForTimeout(500);
  assert.equal((await snapshot()).frame, idle.frame, 'SAFE idle must not continuously render');
  assert.equal(idle.loop, 'demand'); assert.equal(idle.tier, 'SAFE');
  await page.screenshot({ path: join(output, 'default.png') });
  assert.equal(await stage.locator('[data-chat-revision]').getAttribute('data-chat-revision'), 'dev-test-candidate-ring:2');
  assert.equal(await stage.locator('[data-model-url]').getAttribute('data-model-url'), '/ames-engine/dev-test-candidate-ring/web/jewelry.glb');
  await action('Zoom'); await page.waitForTimeout(250);
  const zoom = await snapshot(); assert.ok(Math.abs(zoom.radius - idle.radius / 1.1) < 0.02);
  await action('Side'); await page.waitForTimeout(250);
  const side = await snapshot(); assert.ok(Math.abs(side.theta - Math.PI / 2) < 0.01); assert.ok(Math.abs(side.phi - 75 * Math.PI / 180) < 0.01);
  await action('Setting'); await page.waitForTimeout(250);
  const setting = await snapshot(); assert.deepEqual(setting.renderedCamera, setting.position, 'Setting camera must be rendered, not just stored'); assert.ok(Math.abs(setting.phi - 35 * Math.PI / 180) < 0.01);
  for(const view of [zoom,side,setting]) assert.ok(view.bounds.x < 0.96 && view.bounds.y < 0.96, 'Full ring/prongs need viewport margin: '+JSON.stringify(view.bounds));
  await page.screenshot({ path: join(output, 'setting-zoom.png') });
  await action('Rotate'); await page.waitForTimeout(1200);
  const rotating = await snapshot(); await page.waitForTimeout(700);
  assert.ok((await snapshot()).angle > rotating.angle, 'Rotate must drive model orientation');
  const canvas = stage.locator('canvas'); await canvas.scrollIntoViewIfNeeded(); const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.waitForTimeout(80); const dragStart = await snapshot();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 10, { steps: 5 });
  await page.waitForTimeout(100); const drag = await snapshot();
  assert.equal(drag.angle, dragStart.angle, 'Drag must pause immediately'); assert.notDeepEqual(drag.position, dragStart.position);
  await page.mouse.up(); await page.waitForTimeout(1000); assert.equal((await snapshot()).angle, drag.angle, 'Resume delay must hold');
  await page.waitForTimeout(1200); assert.ok((await snapshot()).angle > drag.angle, 'Rotation must resume after delay');
  await action('Reset'); await action('Stop'); await page.waitForTimeout(400);
  const reset = await snapshot(); assert.ok(Math.abs(reset.radius - idle.radius) < 0.02); assert.ok(reset.angle < 0.04); assert.ok(Math.abs(reset.theta - 35 * Math.PI / 180) < 0.01);
  await action('Hero'); await stage.locator('img[src$="luxury/editorial-hero.png"]').waitFor(); assert.equal(await stage.locator('canvas').count(), 0);
  await action('Macro'); await stage.locator('img[src$="luxury/gemstone-macro.png"]').waitFor();
  await action('Reset'); await stage.locator('canvas').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-panel="1"] [data-ames-engine-host] > img'));
  await stage.locator('input').fill('Zoom in');
  await stage.locator('input').press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-panel="1"] [data-chat-revision]')?.clientHeight === 180);
  await page.waitForFunction(() => document.querySelector('[data-panel="1"] canvas') && !document.querySelector('[data-panel="1"] [data-ames-engine-host] > img'));
  await action('Stop'); await action('Setting'); await action('Zoom'); await page.waitForTimeout(500);
  const compact = await snapshot();
  assert.ok(compact.bounds.x < 0.96 && compact.bounds.y < 0.96, 'Compact ring/prongs clipped: '+JSON.stringify(compact.bounds));
  assert.equal(sentAssetId, null); // Default Chat resolves the first indexed candidate.
  await page.screenshot({path:join(output,'compact-setting-zoom.png')});
  assert.deepEqual(errors, []);
  const result = { compact, idle, zoom, side, setting, rotating, dragStart, drag, reset, errors };
  await writeFile(join(output, 'results.json'), JSON.stringify(result, null, 2));
  console.log('PASS: six controls, idle demand frames, drag pause/resume, hero/macro, reset; WebKit SAFE. ' + output);
} finally { await browser.close(); }
