import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/ngwak/Documents/Codex/2026-09-07/github-plugin-github-openai-curated-remote/work/ames-engine/node_modules/playwright');
const out='outputs/stone-rendering';fs.mkdirSync(out,{recursive:true});
const cut=process.argv[2]||'round';
const hardware=process.argv.includes('--hardware');
const browser=await chromium.launch({headless:true,args:hardware?[]:['--use-angle=swiftshader','--enable-webgl-draft-extensions'],executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
page.setDefaultTimeout(60000);
const errors=[];const shaderErrors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error' && /shader|WebGL|GL_INVALID/.test(m.text()))shaderErrors.push(m.text());});
await page.addInitScript(()=>{
 const samples={draws:[],cpu:[],gpu:[],timer:false,renderer:null,antialias:null};
 window.__stoneSamples=samples;window.__stoneMeasure=false;
 const original=WebGL2RenderingContext.prototype.drawElements;
 const state=new WeakMap();
 WebGL2RenderingContext.prototype.drawElements=function(...args){
  if(!window.__stoneMeasure || !this.canvas.closest('.ames-engine-stone-mount'))return original.apply(this,args);
  let data=state.get(this);
  if(!data){const ext=this.getExtension('EXT_disjoint_timer_query_webgl2');data={ext,pending:[]};state.set(this,data);samples.timer=!!ext;
    const debug=this.getExtension('WEBGL_debug_renderer_info');samples.renderer=debug?this.getParameter(debug.UNMASKED_RENDERER_WEBGL):this.getParameter(this.RENDERER);samples.antialias=this.getContextAttributes().antialias;}
  const {ext,pending}=data;
  if(ext){while(pending.length && this.getQueryParameter(pending[0],this.QUERY_RESULT_AVAILABLE)){
    const q=pending.shift();if(!this.getParameter(ext.GPU_DISJOINT_EXT))samples.gpu.push(this.getQueryParameter(q,this.QUERY_RESULT)/1e6);this.deleteQuery(q);}}
  const query=ext&&pending.length<8?this.createQuery():null;
  if(query)this.beginQuery(ext.TIME_ELAPSED_EXT,query);
  const start=performance.now();samples.draws.push(start);
  const result=original.apply(this,args);samples.cpu.push(performance.now()-start);
  if(query){this.endQuery(ext.TIME_ELAPSED_EXT);pending.push(query);}return result;
 };
});
try{
 await page.goto('http://127.0.0.1:3093/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Chat',exact:true}).click();
 if(cut!=='round'){const input=page.getByRole('textbox',{name:'Message AMES'});await input.fill('Show me '+cut+' diamond');await input.press('Enter');}
 const canvas=page.locator('.ames-engine-stone-mount canvas');await canvas.waitFor();
 await page.waitForFunction(()=>document.querySelector('.ames-stone-tray')?.getAttribute('data-loading')==='false');
 await page.waitForTimeout(1800);
 assert.equal(await page.locator('.ames-chat select:visible').count(),0);
 await page.screenshot({path:`${out}/${cut}-front.png`});
 await canvas.screenshot({path:`${out}/${cut}-front-stone.png`});
 if(cut==='round')await page.screenshot({path:`${out}/mobile-chat.png`});
 const box=await canvas.boundingBox();const x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y+40,{steps:20});await page.mouse.up();
 await page.waitForTimeout(300);
 await page.screenshot({path:`${out}/${cut}-rotated.png`});
 await canvas.screenshot({path:`${out}/${cut}-rotated-stone.png`});
 await page.evaluate(()=>{window.__stoneMeasure=true;});
 await page.mouse.move(x,y);await page.mouse.down();
 for(let i=0;i<16;i++){await page.mouse.move(x+Math.sin(i/3)*18,y+Math.cos(i/3)*12,{steps:2});await page.waitForTimeout(250);}
 await page.mouse.up();
 const collectPerformance=()=>page.evaluate(()=>{window.__stoneMeasure=false;const s=window.__stoneSamples;const gaps=s.draws.slice(1).map((t,i)=>t-s.draws[i]);const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;const p95=a=>a.length?[...a].sort((a,b)=>a-b)[Math.floor(a.length*.95)]:null;return {renderer:s.renderer,antialias:s.antialias,samples:gaps.length,fps:1000/avg(gaps),frameMs:avg(gaps),p95FrameMs:p95(gaps),gpuMs:avg(s.gpu),gpuP95Ms:p95(s.gpu),gpuSamples:s.gpu.length,cpuSubmitMs:avg(s.cpu),timerAvailable:s.timer};});
 const perf=await collectPerformance();
 let desktopPerf=null;
 if(cut==='round'){
  await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(1000);await page.screenshot({path:`${out}/desktop-chat.png`});
  await page.evaluate(()=>{const s=window.__stoneSamples;s.draws=[];s.cpu=[];s.gpu=[];window.__stoneMeasure=true;});
  const desktopBox=await canvas.boundingBox();const dx=desktopBox.x+desktopBox.width/2,dy=desktopBox.y+desktopBox.height/2;
  await page.mouse.move(dx,dy);await page.mouse.down();
  for(let i=0;i<16;i++){await page.mouse.move(dx+Math.sin(i/3)*18,dy+Math.cos(i/3)*12,{steps:2});await page.waitForTimeout(250);}
  await page.mouse.up();desktopPerf=await collectPerformance();
 }

 const hashes=JSON.parse(fs.readFileSync('public/models/canonical/integrity.json')).map(a=>({path:a.path,unchanged:createHash('sha256').update(fs.readFileSync('public'+a.path)).digest('hex')===a.sha256}));assert.ok(hashes.every(a=>a.unchanged));
 const report={cut,hardwareRequested:hardware,errors,shaderErrors,perf,desktopPerf,hashes,stage:await page.locator('.ames-engine-stone-tray').innerText()};
 fs.writeFileSync(`${out}/${cut}${hardware?'-hardware':''}-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 assert.equal(shaderErrors.length,0);assert.equal(errors.length,0);
 if(hardware){assert.ok(perf.fps>=45, 'Mobile-width interactive FPS below 45');if(desktopPerf)assert.ok(desktopPerf.fps>=45,'Desktop interactive FPS below 45');}
}finally{await browser.close();}
