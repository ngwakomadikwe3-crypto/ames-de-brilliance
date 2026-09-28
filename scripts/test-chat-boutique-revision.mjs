import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { webkit, devices }=createRequire(new URL('../../ames-engine-main/package.json',import.meta.url))('playwright');
const output=process.env.AMES_QA_DIR ?? join(tmpdir(),'ames-chat-revision2-qa');await mkdir(output,{recursive:true});
const browser=await webkit.launch();
try {
 const page=await browser.newPage(devices['iPhone 13']);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/chats',r=>r.fulfill({json:[]}));
 await page.addInitScript(()=>{
   const audit=window.__revisionAudit={saw:{},last:{},transitions:{}};const queued=new WeakSet();
   for(const type of [window.WebGLRenderingContext,window.WebGL2RenderingContext])if(type)for(const name of ['clear','drawElements','drawArrays']){
     const original=type.prototype[name];type.prototype[name]=function(...args){const result=original.apply(this,args);const panel=this.canvas.closest('[data-panel]')?.dataset.panel;
       if(panel!==undefined && this.canvas.closest('[data-ames-engine-host]') && !queued.has(this)){queued.add(this);queueMicrotask(()=>{queued.delete(this);if(this.getParameter(this.FRAMEBUFFER_BINDING))return;const pixels=new Uint8Array(this.drawingBufferWidth*this.drawingBufferHeight*4);this.readPixels(0,0,this.drawingBufferWidth,this.drawingBufferHeight,this.RGBA,this.UNSIGNED_BYTE,pixels);let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)visible++;audit.last[panel]={visible,time:performance.now()}})}return result;
     };
   }
   new MutationObserver(()=>{for(const panel of ['0','1']){const host=document.querySelector(`[data-panel="${panel}"] [data-ames-engine-host]`);if(!host)continue;if(host.querySelector(':scope > img'))audit.saw[panel]=true;else if(audit.saw[panel]&&!audit.transitions[panel])audit.transitions[panel]=audit.last[panel] ?? {visible:0};}}).observe(document,{childList:true,subtree:true});
 });
 const base=process.env.AMES_APP_URL ?? 'http://127.0.0.1:3000';await page.goto(base+'/app');
 const chatContract=await (await page.request.get(base+'/ames-engine/dev-test-candidate-ring/app/chat.json')).json();
 const boutiqueContract=await (await page.request.get(base+'/ames-engine/dev-test-candidate-ring/app/boutique.json')).json();
 assert.equal(chatContract.revisionId,'dev-test-candidate-ring:2');assert.equal(boutiqueContract.revisionId,chatContract.revisionId);assert.equal(chatContract.stageAsset,boutiqueContract.interactiveGlb);assert.equal(boutiqueContract.poster,'web/poster-reference.png');assert.equal(chatContract.poster,'web/poster-chat.png');
 const chat=page.locator('[data-panel="1"]');await chat.scrollIntoViewIfNeeded();
 try { await page.waitForFunction(()=>window.__revisionAudit.transitions['1'],null,{timeout:60000}); } catch(error) { console.log('DIAGNOSTIC',await page.evaluate(()=>({audit:window.__revisionAudit,host:document.querySelector('[data-panel="1"] [data-ames-engine-host]')?.outerHTML})),errors); throw error; }
 await chat.locator('button').filter({hasText:/^Stop$/}).evaluate(b=>b.click());await page.waitForTimeout(400);
 await page.screenshot({path:join(output,'chat-revision2.png')});
 const tile=page.locator('[data-boutique-tile="dev-test-candidate-ring"]');await tile.scrollIntoViewIfNeeded();await tile.click();
 await page.waitForFunction(()=>window.__revisionAudit.transitions['0']);await page.waitForTimeout(400);
 await page.screenshot({path:join(output,'boutique-revision2.png')});
 const loaded=await page.evaluate(()=>[...document.querySelectorAll('[data-model-url]')].map(el=>el.dataset.modelUrl));assert.equal(loaded.length,2);assert.ok(loaded.every(url=>url==='/ames-engine/dev-test-candidate-ring/web/jewelry.glb'));
 const audit=await page.evaluate(()=>window.__revisionAudit);for(const panel of ['0','1'])assert.ok(audit.transitions[panel].visible>100,'Completed model must precede poster removal on panel '+panel);
 assert.deepEqual(errors,[]);await writeFile(join(output,'comparison.json'),JSON.stringify({assetId:chatContract.assetId,revisionId:chatContract.revisionId,poster:chatContract.poster,loaded,audit,errors},null,2));
 console.log('PASS: Chat/Boutique same revision 2 GLB with camera-specific posters; both poster transitions have completed model frames. '+output);
} finally {await browser.close()}
