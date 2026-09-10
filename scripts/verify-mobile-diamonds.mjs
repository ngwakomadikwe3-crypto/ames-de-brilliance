import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/ngwak/Documents/Codex/2026-09-07/github-plugin-github-openai-curated-remote/work/ames-engine/node_modules/playwright');
const out = 'outputs/mobile-diamonds';
fs.mkdirSync(out, { recursive: true });
const baseline = execFileSync('git', ['show', 'HEAD:src/three/AMESDiamondMaterial.ts'], { encoding: 'utf8' });
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const html = `<!doctype html><style>body{margin:0;background:#063c3b}#stage{width:360px;height:300px}</style><div id="stage"></div>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/":"/node_modules/three/","react":"/react.js","react/jsx-runtime":"/react.js"}}</script>
<script type="module">
import {mountViewer} from '/node_modules/@ames/engine/ames-engine.js';
import {Vector3} from 'three';
import {createAMESDiamondMaterial} from '/material.js';
</script>`;
// The fixture mounts the shipped viewer, studio, canonical assets and controls.
const fixture = html;
const body = `
import {createAMESStoneStage} from '/stage.js';
const params=new URLSearchParams(location.search);
const viewer=await mountViewer(document.querySelector('#stage'));
await viewer.engine.load('/public/models/canonical/ames_'+params.get('cut')+'_v1.glb');
viewer.resetCamera();
const {camera,target,scene}=viewer.engine;
const distance=camera.position.distanceTo(target);
camera.position.copy(new Vector3(0,1,.22).normalize().multiplyScalar(distance).add(target));camera.lookAt(target);camera.updateMatrixWorld();
scene.background=createAMESStoneStage();
window.samples=[];
viewer.engine.model.asset.scene.traverse(mesh=>{if(!mesh.isMesh)return;mesh.material.dispose();
mesh.material=createAMESDiamondMaterial(mesh,scene.environment,params.get('mobile')==='true');
const before=mesh.onBeforeRender;mesh.onBeforeRender=function(...args){before.apply(this,args);if(window.measure)window.samples.push(performance.now());window.ratio=args[0].getPixelRatio();};});
window.viewer=viewer;window.ready=true;
`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/favicon.ico') {res.writeHead(204);res.end();return;}
    if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html');res.end(fixture.replace("import {createAMESDiamondMaterial} from '/material.js';", `import {createAMESDiamondMaterial} from '/material.js?baseline=${url.searchParams.get('baseline')}';${body}`));return; }
    res.setHeader('Content-Type', 'text/javascript');
    if (url.pathname === '/react.js') {res.end('export const useEffect=()=>{},useRef=()=>{},useState=()=>{},jsx=()=>{};');return;}
    if (url.pathname === '/material.js') {res.end(compile(url.searchParams.get('baseline')==='true'?baseline:fs.readFileSync('src/three/AMESDiamondMaterial.ts','utf8')));return;}
    if (url.pathname === '/stage.js') {res.end(compile(fs.readFileSync('src/three/AMESStoneStage.ts','utf8')));return;}
    const file=path.resolve('.'+decodeURIComponent(url.pathname));
    if (![path.resolve('node_modules'),path.resolve('public/models/canonical')].some(root=>file.startsWith(root+path.sep))) {res.writeHead(403);res.end();return;}
    if(file.endsWith('.glb'))res.setHeader('Content-Type','model/gltf-binary');
    res.end(fs.readFileSync(file));
  } catch(error) {res.writeHead(500);res.end(String(error));}
});
await new Promise(resolve=>server.listen(3108,'127.0.0.1',resolve));
let browser;
const reports=[];
try {
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  for(const cut of ['round_brilliant','oval_brilliant','emerald_cut','pear_brilliant','asscher_cut']) {
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const cdp=await page.context().newCDPSession(page);
    await page.goto(`http://127.0.0.1:3108/?cut=${cut}&mobile=false&baseline=true`);
    await page.waitForFunction(()=>window.ready);await page.waitForTimeout(300);
    await page.locator('canvas').screenshot({path:out+'/'+cut+'-before.png'});
    await page.goto(`http://127.0.0.1:3108/?cut=${cut}&mobile=true`);
    await page.waitForFunction(()=>window.ready);await page.waitForTimeout(2000);
    const canvas=page.locator('canvas');
    await canvas.screenshot({path:out+'/'+cut+'-front.png'});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:150,id:0}]});
    for(let i=1;i<=12;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180+i,y:150+i,id:0}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(500);await canvas.screenshot({path:out+'/'+cut+'-tilt.png'});
    await page.evaluate(()=>{window.samples=[];window.measure=true;});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:150,id:0}]});
    for(let i=0;i<60;i++) {await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180+Math.sin(i/15)*45,y:150+Math.cos(i/15)*25,id:0}]});await page.waitForTimeout(50);}
    const dragging=await page.evaluate(()=>{const gaps=window.samples.slice(1).map((t,i)=>t-window.samples[i]).sort((a,b)=>a-b);return {ratio:window.ratio,fps:(window.samples.length-1)*1000/(window.samples.at(-1)-window.samples[0]),p95FrameMs:gaps[Math.floor(gaps.length*.95)]};});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(500);await canvas.screenshot({path:out+'/'+cut+'-rotate.png'});
    const before=await page.evaluate(()=>window.viewer.engine.camera.position.distanceTo(window.viewer.engine.target));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:155,y:150,id:0},{x:205,y:150,id:1}]});
    for(let i=1;i<=10;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:155-i,y:150,id:0},{x:205+i,y:150,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(700);await canvas.screenshot({path:out+'/'+cut+'-pinch.png'});
    const info=await page.evaluate(()=>{const c=document.querySelector('canvas'),gl=c.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info'),v=window.viewer;return {ratio:window.ratio,canvas:[c.width,c.height],cameraDistance:v.engine.camera.position.distanceTo(v.engine.target),near:v.engine.camera.near,far:v.engine.camera.far,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),antialias:gl.getContextAttributes().antialias};});
    assert.ok(info.cameraDistance<before,'Pinch changes camera distance');assert.equal(errors.length,0,errors.join('\n'));assert.equal(dragging.ratio,1);
    reports.push({cut,conditions:'Desktop Chrome, touch emulation, DPR 3; not physical mobile',dragging,...info,errors});
    await page.close();
    const desktop=await browser.newPage({viewport:{width:1440,height:900}});
    const images=[];
    for(const baseline of [true,false]) {await desktop.goto(`http://127.0.0.1:3108/?cut=${cut}&mobile=false&baseline=${baseline}`);await desktop.waitForFunction(()=>window.ready);await desktop.waitForTimeout(300);images.push(await desktop.locator('canvas').screenshot());}
    reports.at(-1).desktopPixelIdentical=images[0].equals(images[1]);assert.ok(reports.at(-1).desktopPixelIdentical,'Desktop pixels changed');await desktop.close();
    fs.writeFileSync(out+'/report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.at(-1)));
  }
} finally {await browser?.close();server.close();}
