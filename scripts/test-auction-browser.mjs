import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium, webkit, devices } = createRequire(new URL('../../ames-engine-main/package.json', import.meta.url))('playwright');
const base = process.env.AMES_APP_URL ?? 'http://127.0.0.1:3000';
const output = process.env.AMES_QA_DIR ?? join(tmpdir(), 'ames-auction-qa');
await mkdir(output, { recursive: true });
const results = [];
for (const mobile of [false, true]) {
  const browser = await (mobile ? webkit.launch() : chromium.launch({ channel: 'chrome' }));
  try {
    const page = await browser.newPage(mobile ? devices['iPhone 13'] : { viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => sessionStorage.setItem('ames_intro_seen', '1'));
    await page.route('**/api/chats', route => route.fulfill({ json: [] }));
    await page.goto(base + '/app');
    assert.equal(await page.locator('[data-panel]').count(), 4);
    const nav = label => page.getByRole('button', { name: label, exact: true });
    const settled = index => page.waitForFunction(i => {
      const panel = document.querySelector(`[data-panel="${i}"]`);
      return panel && Math.abs(panel.getBoundingClientRect().x) < 2;
    }, index);
    await nav('Auction').click(); await settled(3);
    const auction = page.locator('[data-auction-panel]');
    await auction.getByRole('heading', { name: 'The Auction Room', exact: true }).waitFor();
    assert.equal(await auction.locator('[data-auction-status]').innerText(), 'No auction scheduled');
    const index = await (await page.request.get(base + '/ames-engine/boutique/index.json')).json();
    const pieces = await Promise.all(index.contracts.map(async path => (await page.request.get(base + '/ames-engine/' + path)).json()));
    await page.waitForFunction(count => document.querySelectorAll('[data-auction-asset]').length === count, pieces.length);
    assert.equal(await auction.getByRole('button', { name: /bid|pay|buy/i }).count(), 0);
    await auction.locator('img').first().evaluate(img => img.decode());
    await page.screenshot({ path: join(output, `auction-${mobile ? 'mobile' : 'desktop'}.png`) });
    const handoffs = [];
    for (const piece of pieces) {
      await nav('Auction').click(); await settled(3);
      const card = auction.locator(`[data-auction-asset="${piece.assetId}"]`);
      assert.equal(await card.getAttribute('data-auction-revision'), piece.revisionId);
      assert.equal(await card.locator('img').getAttribute('src'), `/ames-engine/${piece.assetId}/${piece.poster}`);
      await card.getByRole('button', { name: 'View piece', exact: true }).click(); await settled(0);
      const detail = page.locator(`[data-boutique-detail="${piece.assetId}"]`); await detail.waitFor();
      if (piece.assetId === 'dev-test-candidate-ring') {
        await page.waitForFunction(() => document.querySelector('[data-panel="0"] canvas') && !document.querySelector('[data-panel="0"] [data-ames-engine-host] > img'), null, { timeout: 60000 });
        assert.equal(await detail.locator('[data-model-url]').getAttribute('data-model-url'), `/ames-engine/${piece.assetId}/${piece.interactiveGlb}`);
        if (mobile) assert.equal(await detail.locator('[data-quality-tier]').getAttribute('data-quality-tier'), 'SAFE');
        await page.screenshot({ path: join(output, `auction-boutique-${mobile ? 'mobile-safe' : 'desktop'}.png`) });
      } else {
        await detail.locator('model-viewer').waitFor();
        await page.waitForFunction(() => document.querySelector('[data-panel="0"] model-viewer')?.src);
        assert.equal(await detail.locator('model-viewer').evaluate(el => el.src), `/ames-engine/${piece.assetId}/${piece.interactiveGlb}`);
      }
      await nav('Auction').click(); await settled(3);
      await card.getByRole('button', { name: 'Ask SAME', exact: true }).click(); await settled(1);
      const chat = page.locator('[data-panel="1"]');
      await page.waitForFunction(id => document.querySelector('[data-panel="1"] [data-chat-asset-id]')?.dataset.chatAssetId === id, piece.assetId);
      assert.ok((await chat.locator('input').inputValue()).includes(piece.assetId));
      assert.equal(await chat.locator('[data-chat-revision]').getAttribute('data-chat-revision'), piece.revisionId);
      if (piece.assetId === 'dev-test-candidate-ring') {
        await page.waitForFunction(() => document.querySelector('[data-panel="1"] canvas') && !document.querySelector('[data-panel="1"] [data-ames-engine-host] > img'), null, { timeout: 60000 });
        assert.equal(await chat.locator('[data-model-url]').getAttribute('data-model-url'), `/ames-engine/${piece.assetId}/web/jewelry.glb`);
        if (mobile) assert.equal(await chat.locator('[data-quality-tier]').getAttribute('data-quality-tier'), 'SAFE');
      } else {
        await chat.locator('model-viewer').waitFor();
        await page.waitForFunction(() => document.querySelector('[data-panel="1"] model-viewer')?.src);
        assert.equal(await chat.locator('model-viewer').evaluate(el => el.src), `/ames-engine/${piece.assetId}/web/jewelry.glb`);
      }
      handoffs.push({ assetId: piece.assetId, revisionId: piece.revisionId });
    }
    await nav('Videos').click(); await settled(2);
    assert.ok(await page.locator('[data-media-item]').count() > 0);
    if (!mobile) { await nav('Next panel').click(); await settled(3); await nav('Previous panel').click(); await settled(2); }
    // Exercise the same native scroll container used by swiping, separately from buttons.
    await page.locator('[data-panel="2"]').evaluate(panel => panel.parentElement.parentElement.scrollTo({ left: innerWidth * 3, behavior: 'instant' }));
    await settled(3); await page.waitForFunction(() => document.querySelector('button[aria-label="Auction"]')?.getAttribute('aria-current') === 'page');
    await page.locator('[data-panel="1"] input').evaluate(input => input.blur());
    await page.keyboard.press('ArrowLeft'); await settled(2);
    await page.keyboard.press('ArrowRight'); await settled(3);
    assert.deepEqual(errors, []);
    results.push({ browser: mobile ? 'WebKit iPhone SAFE' : 'Chrome desktop', handoffs, errors });
    console.log('PASS: Auction navigation and all four asset handoffs: ' + results.at(-1).browser);
  } finally { await browser.close(); }
}
await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(output);
