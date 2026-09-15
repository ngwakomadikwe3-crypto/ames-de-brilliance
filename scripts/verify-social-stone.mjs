// Local HTTP fixture + browser checks. No live OAuth accounts or Appwrite writes.
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {startFixture} from '../tests/appwrite-fixture.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.AMES_PLAYWRIGHT_PATH||'C:/Users/ngwak/Documents/Codex/2026-09-07/github-plugin-github-openai-curated-remote/work/ames-engine/node_modules/playwright');
const f=await startFixture({glb:await readFile('public/models/canonical/ames_round_brilliant_v1.glb')}),origin='http://127.0.0.1:3121';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3121','-H','127.0.0.1'],{env:{...process.env,APPWRITE_ENDPOINT:f.endpoint,APPWRITE_PROJECT_ID:f.project,APPWRITE_API_KEY:f.key,APPWRITE_DATABASE_ID:'ames',AMES_APP_ORIGIN:origin,ASSET_DELIVERY_SECRET:'fixture-only-'.repeat(8)},windowsHide:true,stdio:'ignore'});
let browser,page;const checks=[];
try{
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/login')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 await mkdir('outputs/social-stone',{recursive:true});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.addInitScript(()=>sessionStorage.setItem('ames-intro-seen','1'));
 page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [label,provider] of [['Google','google'],['Microsoft','microsoft']]){
  await context.clearCookies();await page.goto(origin+'/login');
  const host=provider==='google'?'accounts.google.com':'login.microsoftonline.com';
  await page.route('https://'+host+'/**',async route=>{
   const attempt=f.oauthStarts.at(-1);assert.equal(attempt.provider,provider);
   const token='browser-'+provider;f.oauthTokens.set(token,'alice');const callback=new URL(attempt.success);callback.searchParams.set('userId','alice');callback.searchParams.set('secret',token);
   await route.fulfill({status:302,headers:{location:callback.href},body:''});
  });
  await page.getByRole('button',{name:'Continue with '+label,exact:true}).click();await page.waitForURL(origin+'/app');
  const state=await page.evaluate(async()=>await(await fetch('/api/customer/session')).json());assert.equal(state.user.id,'alice');assert.equal(state.access.admin,false);assert.equal(state.access.jeweller,false);
  assert.equal(await page.evaluate(async()=>(await fetch('/api/customer/logout',{method:'POST'})).status),200);
  checks.push({provider,fixtureSignIn:true,rolesUnchanged:true,logout:true});
 }
 await context.clearCookies();await page.goto(origin+'/login');
 await page.getByLabel('Email',{exact:true}).fill('alice@example.test');await page.getByLabel('Password',{exact:true}).fill(f.password);
 await page.getByRole('button',{name:'Show password',exact:true}).click();assert.equal(await page.getByLabel('Password',{exact:true}).getAttribute('type'),'text');await page.getByRole('button',{name:'Hide password',exact:true}).click();
 await page.screenshot({path:'outputs/social-stone/login-mobile.png'});
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(origin+'/app');
 for(const [name,width,height] of [['mobile',390,844],['desktop',1440,1000],['short',844,390],['compact',320,568]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/app');
  await page.locator('.ames-engine-stone-tray.is-ready').waitFor();
  await page.locator('.ames-screen-scroller').evaluate(el=>el.scrollTo({left:innerWidth,behavior:'instant'}));
  await page.waitForFunction(()=>Math.abs(document.querySelector('.ames-chat-stage').getBoundingClientRect().x+document.querySelector('.ames-chat-stage').getBoundingClientRect().width/2-innerWidth/2)<2);
  const layout=await page.evaluate(()=>{
   const bounds=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
   const style=getComputedStyle(document.querySelector('.ames-stone-identity strong'));
   return {mount:bounds('.ames-engine-stone-mount'),caption:bounds('.ames-stone-identity'),primary:bounds('.ames-stone-identity strong'),secondary:bounds('.ames-stone-identity span'),conversation:bounds('.ames-chat-conversation-panel'),composer:bounds('.ames-chat-composer'),font:style.fontFamily,size:style.fontSize,weight:style.fontWeight};
  });
  assert.equal(await page.locator('.ames-stone-identity strong').innerText(),'Round Brilliant');assert.equal(await page.locator('.ames-stone-identity span').innerText(),'Diamond');
  assert.match(layout.font,/Geist/i);assert.equal(layout.size,'15px');assert.equal(layout.weight,'500');
  assert.ok(Math.abs(layout.primary.x+layout.primary.width/2-width/2)<1);assert.ok(Math.abs(layout.secondary.x+layout.secondary.width/2-width/2)<1);
  assert.ok(layout.caption.y>=layout.mount.bottom+7);assert.ok(layout.conversation.y>=layout.caption.bottom+11);assert.ok(layout.composer.y>=layout.conversation.bottom);assert.ok(layout.composer.bottom<=height);
  await page.screenshot({path:`outputs/social-stone/${name}.png`});checks.push({name,...layout});
 }
 assert.deepEqual(errors,[]);await writeFile('outputs/social-stone/checks.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:true,providers:'fixture only',viewports:4,emailPassword:true,errors}));
}catch(e){if(page)await page.screenshot({path:'outputs/social-stone/failure.png'});throw e;}finally{await browser?.close();child.kill();await f.close();}
