import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const { webkit, devices } = createRequire(new URL('../../ames-engine-main/package.json', import.meta.url))('playwright');
const output = process.env.AMES_QA_DIR ?? '../ames-engine-main/outputs/chat-poster-revision2';
await mkdir(output, { recursive: true });
const browser = await webkit.launch();
const results = [];
try {
 for (const height of [220, 180]) {
  const page = await browser.newPage(devices['iPhone 13']);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/chats', r => r.fulfill({json:r.request().method()==='POST'?{id:'qa-chat'}:[]}));
  await page.route('**/api/chats/qa-chat/messages', r => r.fulfill({json:{id:String(Date.now()),...r.request().postDataJSON()}}));
  await page.route('**/api/ames', r => r.fulfill({json:{answer:'Here is the selected ring.',viewer_action:null}}));
  let release; const held = new Promise(resolve => { release = resolve; });
  await page.route('**/dev-test-candidate-ring/web/jewelry.glb', async r => { await held; await r.continue(); });
  await page.addInitScript(() => {
   sessionStorage.setItem('ames_intro_seen','1');
   window.__posterAudit = {last:null,transition:null,saw:false,blankAfterReveal:0};
   const queued = new WeakSet();
   for (const type of [window.WebGLRenderingContext,window.WebGL2RenderingContext]) if(type) for(const name of ['clear','drawArrays','drawElements']) {
    const original=type.prototype[name]; type.prototype[name]=function(...args) {
     const result=original.apply(this,args);
     if(this.canvas.closest('[data-panel="1"] [data-ames-engine-host]')&&!queued.has(this)) {
      queued.add(this); queueMicrotask(()=>{
       queued.delete(this); if(this.getParameter(this.FRAMEBUFFER_BINDING))return;
       const w=this.drawingBufferWidth,h=this.drawingBufferHeight,p=new Uint8Array(w*h*4);
       this.readPixels(0,0,w,h,this.RGBA,this.UNSIGNED_BYTE,p);
       let left=w,right=0,top=h,bottom=0,count=0;
       for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(p[(y*w+x)*4+3]>32){count++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,h-1-y);bottom=Math.max(bottom,h-1-y);}
       window.__posterAudit.last={w,h,bounds:[left,top,right,bottom],count,png:this.canvas.toDataURL()};
       if(window.__posterAudit.transition&&count===0)window.__posterAudit.blankAfterReveal++;
      });
     }return result;
    };
   }
   new MutationObserver(()=>{const host=document.querySelector('[data-panel="1"] [data-ames-engine-host]');if(!host)return;
    if(host.querySelector(':scope > img'))window.__posterAudit.saw=true;
    else if(window.__posterAudit.saw&&!window.__posterAudit.transition)window.__posterAudit.transition=window.__posterAudit.last;
   }).observe(document,{subtree:true,childList:true});
  });
  await page.goto((process.env.AMES_APP_URL??'http://127.0.0.1:3000')+'/app');
  const panel=page.locator('[data-panel="1"]'); await panel.scrollIntoViewIfNeeded();
  if(height===180){await panel.locator('input').fill('Tell me about it');await panel.locator('input').press('Enter');}
  await page.waitForFunction(h=>document.querySelector('[data-panel="1"] [data-chat-revision]')?.clientHeight===h,height);
  const poster=panel.locator('[data-ames-engine-host] > img'); await poster.waitFor();
  assert.ok((await poster.getAttribute('src')).endsWith('/web/poster-chat.png'));
  await poster.evaluate(img=>img.decode());
  await panel.screenshot({path:join(output,`poster-${height}.png`)});
  release();
  await page.waitForFunction(()=>window.__posterAudit.transition?.count>100,null,{timeout:60000});
  const audit=await page.evaluate(()=>window.__posterAudit.transition);
  await writeFile(join(output,`first-canvas-${height}.png`),Buffer.from(audit.png.split(',')[1],'base64'));
  const expected=await page.evaluate(async({w,h})=>{
   const img=new Image();img.src='/ames-engine/dev-test-candidate-ring/web/poster-chat.png';await img.decode();
   const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(img,(w-h)/2,0,h,h);
   const p=ctx.getImageData(0,0,w,h).data;let left=w,right=0,top=h,bottom=0;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(p[(y*w+x)*4+3]>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
   return [left,top,right,bottom];
  },audit);
  const difference=audit.bounds.map((value,i)=>Math.abs(value-expected[i]));
  assert.ok(difference.every(d=>d<=3),'Poster/canvas framing changed: '+JSON.stringify({expected,actual:audit.bounds,difference}));
  assert.equal(await panel.locator('[data-quality-tier]').getAttribute('data-quality-tier'),'SAFE');
  await panel.locator('button').filter({hasText:/^Stop$/}).evaluate(b=>b.click());
  await panel.screenshot({path:join(output,`canvas-${height}.png`)});
  assert.equal(await page.evaluate(()=>window.__posterAudit.blankAfterReveal),0,'No blank frame after poster removal');
  assert.deepEqual(errors,[]);
  const {png,...frame}=audit;results.push({height,frame,expected,difference,errors});await page.close();
 }
 await writeFile(join(output,'transitions.json'),JSON.stringify(results,null,2));
 console.log('PASS: WebKit SAFE 180px/220px: selected Chat poster, complete canvas before reveal, framing within 3px. '+JSON.stringify(results));
} finally {await browser.close();}
