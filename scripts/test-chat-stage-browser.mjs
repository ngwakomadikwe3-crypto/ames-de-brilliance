import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// Reuse the canonical Engine's installed browser test runtime; no download/install.
const require = createRequire(new URL('../../ames-engine-main/package.json', import.meta.url));
const { webkit, devices } = require('playwright');
const browser = await webkit.launch();
try {
  const page = await browser.newPage(devices['iPhone 13']);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/chats', route => route.fulfill({ json: [] }));
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/dev-test-earring-001/app/chat.json', async route => { await held; await route.continue(); });
  await page.route('**/dev-test-pendant-001/app/chat.json', route => route.fulfill({ status: 503, body: 'Test unavailable' }));
  await page.goto((process.env.AMES_APP_URL ?? 'http://127.0.0.1:3000') + '/app');
  await page.waitForSelector('[data-panel="1"] [data-model-url="/ames-engine/dev-test-candidate-ring/web/jewelry.glb"]', { state: 'attached' });
  async function select(category, id) {
    await page.locator('[aria-label="Boutique categories"] button').filter({ hasText: category }).evaluate(button => button.click());
    await page.locator(`[data-boutique-tile="${id}"]`).evaluate(button => button.click());
    await page.locator('[data-boutique-detail] button').filter({ hasText: 'Ask SAME' }).evaluate(button => button.click());
  }
  await select('Earrings', 'dev-test-earring-001');
  const stage = page.locator('[data-panel="1"]');
  await stage.locator('[data-chat-stage-placeholder]').waitFor();
  assert.equal(await stage.locator('[data-ames-engine-host]').count(), 0);
  assert.equal(await stage.locator('model-viewer').count(), 0, 'Old ring must unmount during new metadata load');
  assert.equal(await stage.locator('img[src*="dev-test-candidate-ring"]').count(), 0);
  await page.evaluate(() => {
    window.__oldAssetFrames = [];
    window.__watchChat = true;
    const sample = () => {
      const stage = document.querySelector('[data-panel="1"]');
      if (stage?.querySelector('model-viewer[src*="mounted-reference"],[data-model-url*="dev-test-candidate-ring"],img[src*="dev-test-candidate-ring"]')) window.__oldAssetFrames.push(performance.now());
      if (window.__watchChat) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.route('**/dev-test-earring-001/web/jewelry.glb', route => route.abort());
  release();
  await stage.locator('img[src="/ames-engine/dev-test-earring-001/web/poster.png"]').first().waitFor();
  console.log('Selected earring poster visible during GLB failure');
  // Return to categories using the existing detail-back control.
  await page.locator('[data-boutique-detail] button').first().evaluate(button => button.click());
  await select('Pendant', 'dev-test-pendant-001');
  await page.waitForFunction(() => document.querySelector('[data-panel="1"] [data-chat-stage-placeholder]')?.textContent.includes('Preview unavailable'));
  assert.equal(await stage.locator('model-viewer').count(), 0, 'Failed selection must not restore previous viewer');
  assert.equal(await stage.locator('img[src*="dev-test-earring-001"],img[src*="dev-test-candidate-ring"]').count(), 0);
  assert.deepEqual(await page.evaluate(() => { window.__watchChat = false; return window.__oldAssetFrames; }), []);
  assert.deepEqual(errors, []);
  console.log('PASS: WebKit selected-asset poster; delayed switch removes old ring; failed switch stays neutral; no stale ring frames or page errors.');
} finally { await browser.close(); }
