import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('C:/Users/ngwak/Documents/Codex/2026-09-07/github-plugin-github-openai-curated-remote/work/ames-engine/node_modules/playwright');
const out='outputs/boutique-final';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--disable-gpu-sandbox'],executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const results=[];
try{for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce',hasTouch:name==='mobile'});
 page.setDefaultTimeout(60000);
 await page.goto('http://127.0.0.1:3094/',{waitUntil:'domcontentloaded'});
 await page.locator('.ames-product-shell.is-ready').waitFor({state:'attached'});
 await page.getByRole('button',{name:'Boutique',exact:true}).click();
 const panel=page.locator('.ames-boutique-panel[data-active="true"]');await panel.waitFor();
 const canvas=panel.locator('canvas').first();await canvas.waitFor({state:'visible'});await page.waitForTimeout(2500);
 await page.screenshot({path:`${out}/${name}-boutique.png`});
 const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.55);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.65,{steps:20});await page.mouse.up();await page.mouse.wheel(0,-80);await page.waitForTimeout(700);
 assert.equal(await panel.getAttribute('data-active'),'true');
 await panel.locator('.ames-boutique-hero').screenshot({path:`${out}/${name}-hero.png`});
 for(const [key,selector] of [['editorial','.ames-boutique-editorial'],['new-arrivals','.ames-boutique-arrivals'],['categories','.ames-boutique-categories-bottom']])await panel.locator(selector).screenshot({path:`${out}/${name}-${key}.png`});
 const metrics=await panel.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,contentHeight:el.querySelector('.ames-boutique-scroll').scrollHeight,visibleControls:[...el.querySelectorAll('select')].filter(n=>n.getClientRects().length).length}));assert.equal(metrics.width,metrics.scrollWidth);assert.equal(metrics.visibleControls,0);
 await page.setViewportSize({width,height:metrics.contentHeight});await panel.locator('.ames-boutique-scroll').evaluate(el=>el.scrollTop=0);await page.waitForTimeout(700);await page.screenshot({path:`${out}/${name}-full.png`});
 await panel.getByRole('button',{name:'Watches',exact:true}).click();await page.waitForTimeout(400);assert.equal(await panel.locator('.ames-boutique-section-heading h2').innerText(),'Watches');
 results.push({name,...metrics,rotationZoom:true,categoryFilter:true});await page.close();
}}finally{await browser.close();fs.writeFileSync(`${out}/checks.json`,JSON.stringify(results,null,2));}
console.log(results);


