import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('C:/Users/ngwak/Documents/Codex/2026-09-07/github-plugin-github-openai-curated-remote/work/ames-engine/node_modules/playwright');
const out = 'outputs/chat-recovery';
fs.mkdirSync(out, {recursive:true});
const browser = await chromium.launch({headless:true, args:['--use-angle=swiftshader','--disable-gpu-sandbox'], executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const results=process.argv.includes('--desktop') ? JSON.parse(fs.readFileSync(out+'/checks.json','utf8')).filter(r=>r.name==='mobile') : [];
try {
 for (const [name,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1440,height:900}]]) {
  if(process.argv.includes('--desktop') && name==='mobile') continue;
  const page=await browser.newPage({viewport,hasTouch:name==='mobile'});
  page.setDefaultTimeout(90000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  console.log(name,'opening');
  await page.goto('http://127.0.0.1:3092/',{waitUntil:'domcontentloaded'});
  const video=page.locator('.splash-experience video');
  await video.waitFor({timeout:30000});
  await video.evaluate(v=>v.dispatchEvent(new Event('ended')));
  const stage=page.locator('.ames-engine-stone-mount');
  await stage.locator('canvas').waitFor({timeout:60000});
  await page.waitForFunction(()=>document.querySelector('.ames-stone-tray')?.getAttribute('data-loading')==='false').catch(async e=>{console.log('Initial stage:',await stage.innerText(),errors);await page.screenshot({path:out+'/'+name+'-load-failure.png'});throw e;});
  console.log(name,'stone ready');
  await page.waitForTimeout(1500);
  assert.equal(await stage.locator('canvas').count(),1);
  assert.equal(await page.locator('.ames-chat select:visible').count(),0);
  assert.equal(await page.locator('.ames-chat-composer').count(),1);
  await page.screenshot({path:`${out}/${name}-new-conversation.png`});
  await page.screenshot({path:`${out}/${name}-round-brilliant.png`});
  const input=page.getByRole('textbox',{name:'Message AMES'});
  await input.fill('Show me an oval diamond');await input.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.ames-engine-stone-mount')?.getAttribute('data-ames-asset-id')==='stone-002' && document.querySelector('.ames-stone-tray')?.getAttribute('data-loading')==='false');
  await page.waitForTimeout(1200);
  assert.match(await page.locator('.ames-stone-identity').innerText(),/Oval Brilliant.*Diamond/);
  await page.screenshot({path:`${out}/${name}-oval-brilliant.png`});
  await page.screenshot({path:`${out}/${name}-chat.png`});
  await input.fill('Make it sapphire');await input.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.ames-stone-tray [data-gem]')?.textContent?.includes('Sapphire preview')).catch(async e=>{console.log(await page.locator('.ames-chat').innerText(), await page.locator('.ames-stone-tray [data-error]').textContent());await page.screenshot({path:out+'/failure.png'});throw e;});
  assert.equal(await stage.getAttribute('data-ames-asset-id'),'stone-002');
  await page.screenshot({path:`${out}/${name}-sapphire.png`});
  assert.equal(await stage.locator('[data-turntable]').innerText(),'Stop turntable');
  const canvas=stage.locator('canvas');const box=await canvas.boundingBox();
  const before=await canvas.screenshot();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();await page.mouse.move(box.x+box.width/2+55,box.y+box.height/2+20,{steps:12});await page.mouse.up();
  await page.mouse.wheel(0,-120);await page.waitForTimeout(250);
  assert.ok(!before.equals(await canvas.screenshot()),'Stone responds visually');
  assert.ok((await stage.boundingBox()).x>=0,'Rotation stays in Chat');
  if(name==='mobile') {
    const cdp=await page.context().newCDPSession(page);
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:0},{x:x+25,y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-50,y,id:0},{x:x+50,y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.ok((await stage.boundingBox()).x>=0,'Pinch stays in Chat');
  }
  await input.fill('Show me Asscher');await input.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.ames-engine-stone-mount')?.getAttribute('data-ames-asset-id')==='stone-005' && document.querySelector('.ames-stone-tray')?.getAttribute('data-loading')==='false');
  await input.fill('Show me something rare');await input.press('Enter');
  assert.match(await page.getByRole('log').innerText(),/five classic cuts/);
  await page.getByRole('button',{name:'Chat menu',exact:true}).click();
  assert.deepEqual(await page.locator('.ames-chat-menu-popover a').allTextContents(),['Account','Favorites']);
  await page.getByRole('button',{name:'Chat menu',exact:true}).click();
  await page.getByRole('button',{name:'Conversation options'}).click();
  await page.getByRole('button',{name:'New conversation',exact:true}).click();
  assert.equal(await page.getByRole('log').innerText(),'');
  await page.waitForTimeout(1000);
  const bounds=await page.locator('.ames-chat-composer').boundingBox();
  assert.ok(bounds.x>=0 && bounds.x+bounds.width<=viewport.width && bounds.y+bounds.height<=viewport.height);
  assert.equal(await stage.locator('canvas').count(),1);
  if(name==='mobile') {
   await page.setViewportSize({width:320,height:568});await page.waitForTimeout(300);
   const b=await page.locator('.ames-chat-composer').boundingBox();assert.ok(b.x>=0 && b.x+b.width<=320 && b.y+b.height<=568);
   await page.screenshot({path:`${out}/mobile-short.png`});
  }
  assert.deepEqual(errors,[]);
  results.push({name,errors,checks:'one canvas, hidden controls, composer bounds, cut/gem context, menu, reset'});
  await page.close();
 }
} finally {await browser.close();fs.writeFileSync(`${out}/checks.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));

