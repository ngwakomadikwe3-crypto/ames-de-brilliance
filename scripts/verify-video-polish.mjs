import {createRequire} from 'node:module';import fs from 'node:fs';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('C:/Users/ngwak/Documents/Codex/2026-09-07/github-plugin-github-openai-curated-remote/work/ames-engine/node_modules/playwright');
const out='outputs/video-polish';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const results=[];
try{for(const [name,width,height] of [['mobile',390,844],['desktop',1440,900]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});page.setDefaultTimeout(45000);
 // Read-only local media fixture: no catalog or backend changes.
 await page.route('**/api/videos?published=1',r=>r.fulfill({json:[{id:'visual-fixture-1',video_url:'/intro.mp4',caption:'A study in light.',house_note:'A study in light.',stone_id:null},{id:'visual-fixture-2',video_url:'/intro.mp4',caption:'Form in motion.',house_note:'Form in motion.',stone_id:null}]}));
 await page.goto('http://127.0.0.1:3095/',{waitUntil:'domcontentloaded'});
 await page.locator('.ames-product-shell.is-ready').waitFor({state:'attached'});await page.getByRole('button',{name:'Video',exact:true}).click();
 const panel=page.locator('.ames-video-panel[data-active="true"]');await panel.waitFor();const first=page.locator('.ames-video-panel video').nth(0),second=page.locator('.ames-video-panel video').nth(1);
 await page.waitForFunction(()=>{const v=document.querySelector('.ames-video-panel video');return v&&!v.paused&&v.currentTime>.3&&v.readyState>=2});
 const t=await first.evaluate(v=>v.currentTime);await page.waitForTimeout(450);assert.ok(await first.evaluate(v=>v.currentTime)>t);
 await page.screenshot({path:`${out}/${name}-video.png`});await panel.locator('.ames-video-frame').first().screenshot({path:`${out}/${name}-active-playback.png`});
 await panel.getByRole('button',{name:'Video menu',exact:true}).click();assert.deepEqual(await panel.locator('.ames-video-menu a').allTextContents(),['Account','Favorites']);await page.screenshot({path:`${out}/${name}-menu.png`});await panel.getByRole('button',{name:'Video menu',exact:true}).click();
 await page.getByRole('button',{name:'Chat',exact:true}).click();await page.waitForTimeout(450);assert.equal(await first.evaluate(v=>v.paused),true);
 await page.getByRole('button',{name:'Video',exact:true}).click();await page.waitForTimeout(450);assert.equal(await first.evaluate(v=>v.paused),false);
 await panel.locator('.ames-video-feed').evaluate(el=>el.scrollTo({top:el.clientHeight,behavior:'instant'}));await page.waitForTimeout(700);assert.equal(await first.evaluate(v=>v.paused),true);assert.equal(await second.evaluate(v=>v.paused),false);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await second.evaluate(v=>v.paused),true);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(300);assert.equal(await second.evaluate(v=>v.paused),false);
 const metrics=await panel.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));assert.equal(metrics.width,metrics.scrollWidth);
 results.push({name,...metrics,playbackAdvances:true,panelPauseResume:true,feedPauseResume:true,visibilityPauseResume:true,menu:['Account','Favorites'],fixture:'Existing local intro.mp4, intercepted feed only'});await page.close();
}}finally{await browser.close();fs.writeFileSync(`${out}/checks.json`,JSON.stringify(results,null,2));}console.log(results);
