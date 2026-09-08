import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('C:/Users/ngwak/Documents/Codex/2026-09-07/github-plugin-github-openai-curated-remote/work/ames-engine/node_modules/playwright');
const out = 'outputs/visual-recovery';
fs.mkdirSync(out, { recursive: true });

async function capture(viewport, prefix) {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3091/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.splash-experience');
  await page.screenshot({ path: `${out}/${prefix}-splash.png`, fullPage: true });
  const splashVideo = page.locator('.splash-experience video');
  if (await splashVideo.count()) await splashVideo.evaluate(video => video.dispatchEvent(new Event('ended')));
  await page.locator('.ames-engine-stone-tray select[data-stone]').waitFor({ state: 'attached', timeout: 15000 });
  await page.locator('.ames-engine-stone-mount canvas').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${prefix}-chat-round.png`, fullPage: true });
  const input = page.locator('input[placeholder="Ask SAME anything..."]').first();
  await input.fill('show stone-002');
  await input.press('Enter');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${prefix}-chat-oval.png`, fullPage: true });
  await page.locator('[data-panel="0"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${prefix}-boutique-home.png`, fullPage: true });
  await page.locator('.ames-engine-boutique-mount canvas').waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
  await page.screenshot({ path: `${out}/${prefix}-boutique-product.png`, fullPage: true });
  await page.locator('[data-panel="2"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${prefix}-video.png`, fullPage: true });
  const fps = await page.evaluate(() => new Promise(resolve => { let frames = 0; const start = performance.now(); const tick = (now) => { frames += 1; if (now - start >= 1000) resolve({ fps: frames, frameMs: (now - start) / Math.max(frames, 1) }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
  return { prefix, title: await page.title(), canvasCount: await page.locator('canvas').count(), oldDealer: (await page.locator('body').innerText()).includes('Licensed Diamond Dealer'), fps };
}

const desktop = await capture({ width: 1440, height: 900 }, 'desktop');
const mobile = await capture({ width: 390, height: 844 }, 'mobile');
console.log(JSON.stringify({ desktop, mobile, screenshots: fs.readdirSync(out).sort() }, null, 2));
