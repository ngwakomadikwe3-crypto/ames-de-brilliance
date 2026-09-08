import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {startFixture} from '../tests/appwrite-fixture.mjs';
const engine=process.env.AMES_ENGINE_WORKSPACE;if(!engine)throw new Error('Engine workspace required');
const {chromium}=await import(pathToFileURL(join(engine,'node_modules/playwright/index.mjs')).href);
const f=await startFixture({glb:await readFile('public/models/canonical/ames_round_brilliant_v1.glb'),ring:await readFile(join(engine,'public/models/generated/ames_ring_oval_hidden_halo_v1.glb'))}),origin='http://127.0.0.1:3084';
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3084','-H','127.0.0.1'],{windowsHide:true,stdio:'ignore',env:{...process.env,APPWRITE_ENDPOINT:f.endpoint,APPWRITE_PROJECT_ID:f.project,APPWRITE_API_KEY:f.key,AMES_APP_ORIGIN:origin,ASSET_DELIVERY_SECRET:randomBytes(48).toString('hex'),SESSION_SECRET:randomBytes(48).toString('hex')}});
const report={fixtureOnly:true,productionBuild:true,browser:'Chrome SwiftShader, 390px viewport; not a physical-device measurement',runs:[]};let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(let run=0;run<2;run++){
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-shader-disk-cache']});const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.addInitScript(()=>{
   window.startupQA={longTasks:[],glCalls:[],contexts:[]};
   new PerformanceObserver(l=>window.startupQA.longTasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
   const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args){const start=performance.now(),value=original.apply(this,args);if(String(args[0]).includes('webgl'))window.startupQA.contexts.push({start,duration:performance.now()-start,panel:this.closest('[data-panel]')?.getAttribute('data-panel')});return value;};
   for(const proto of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype])for(const name of ['getShaderParameter','getProgramParameter','compileShader','linkProgram','drawArrays','drawElements','texImage2D','readPixels']){const fn=proto[name];if(!fn)continue;proto[name]=function(...args){const start=performance.now(),result=fn.apply(this,args),duration=performance.now()-start;if(duration>10)window.startupQA.glCalls.push({name,start,duration,panel:this.canvas.closest('[data-panel]')?.getAttribute('data-panel'),stack:new Error().stack?.split('\n').slice(1,7)});return result;};}
  });
  await page.goto(origin+'/app');await page.locator('[data-stone]').waitFor({timeout:60000});await page.waitForTimeout(2000);
  const opening=await page.evaluate(()=>({...window.startupQA,measures:performance.getEntriesByType('measure').filter(e=>e.name.startsWith('ames-')).map(e=>({name:e.name,start:e.startTime,duration:e.duration})),paints:performance.getEntriesByType('paint').map(e=>({name:e.name,start:e.startTime})),boutiqueCanvasCount:document.querySelectorAll('[data-panel="0"] canvas').length}));
  await page.getByRole('button',{name:'Boutique',exact:true}).click();await page.locator('[data-title]').waitFor({timeout:60000});await page.waitForTimeout(1000);
  const afterVisit=await page.evaluate(()=>({boutiqueCanvasCount:document.querySelectorAll('[data-panel="0"] canvas').length,error:document.querySelector('[data-error]')?.textContent||'',measures:performance.getEntriesByType('measure').filter(e=>e.name.startsWith('ames-')).map(e=>({name:e.name,start:e.startTime,duration:e.duration}))}));
  report.runs.push({run,opening,afterVisit});await browser.close();browser=null;
 }
}finally{await browser?.close();app.kill();await f.close();}
const name=process.argv.includes('--after')?'after':'before';await writeFile(`outputs/startup-${name}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({phase:name,runs:report.runs.map(r=>({maxLongTask:Math.max(0,...r.opening.longTasks.map(t=>t.duration)),glCalls:r.opening.glCalls.map(({stack,...v})=>v),boutiqueCanvasesAtOpen:r.opening.boutiqueCanvasCount,afterVisit:r.afterVisit}))}));
