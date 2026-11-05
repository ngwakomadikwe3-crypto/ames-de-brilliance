"""Real WebGL mobile profiles; isolated review route, no account or AI writes."""
import base64
import os
os.environ['PW_TEST_SCREENSHOT_NO_FONTS_READY']='1'
import json
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:3023'
PROFILE=sys.argv[2] if len(sys.argv)>2 else 'android'
PHASE=sys.argv[3] if len(sys.argv)>3 else 'after'
ids=sys.argv[4].split(',') if len(sys.argv)>4 else ['amethyst','tanzanite','moonstone']
if ids==['all']:
    ids=[s['id'].removeprefix('stone-') for s in json.loads((ROOT/'src/lib/gemstone-registry.json').read_text())]
OUT=ROOT/'docs/qa/gem-refresh-2026-11-04'/PHASE/PROFILE
OUT.mkdir(parents=True,exist_ok=True)
report={'profile':PROFILE,'phase':PHASE,'physicalDevice':False,'stones':[],'errors':[]}
with sync_playwright() as p:
    browser=p.webkit.launch(headless=True) if PROFILE=='iphone' else p.chromium.launch(
        executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,
        args=['--ignore-gpu-blocklist'])
    device=dict(p.devices['iPhone 13' if PROFILE=='iphone' else 'Pixel 7'])
    if PROFILE!='iphone':
        device.update(viewport={'width':393,'height':851},device_scale_factor=2)
    context=browser.new_context(**device)
    if '--posters' in sys.argv:
        context.add_init_script("const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,o){return old.call(this,t,t==='webgl2'||t==='webgl'?{...o,preserveDrawingBuffer:true}:o)}")
    context.route('**/*fontshare.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
    if PROFILE!='iphone':
        context.add_init_script("Object.defineProperty(navigator,'deviceMemory',{get:()=>4});")
    try:
        for sid in ids:
            page=context.new_page()
            page.on('pageerror',lambda e:report['errors'].append(str(e)))
            page.on('console',lambda e:report['errors'].append(e.text) if e.type=='error' and ('Shader' in e.text or 'WebGLProgram' in e.text) else None)
            started=time.monotonic()
            try:
                page.goto(BASE+'/dev/gemstone-review?stone='+sid,wait_until='domcontentloaded',timeout=180000)
                host=page.locator('[data-ames-engine-host]')
                page.locator('[data-viewer-state="ready"],[data-viewer-state="fallback"]').wait_for(timeout=90000)
                assert host.get_attribute('data-viewer-state')=='ready',sid+' 3D failed'
                canvas=host.locator('canvas')
                canvas.wait_for(timeout=15000)
                if PHASE=='after':
                    page.locator('canvas[data-studio-environment=softbox-v2]').wait_for(timeout=30000)
                page.wait_for_timeout(1200)
                assert canvas.count()==1
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                metrics=canvas.evaluate("e=>({width:e.width,height:e.height,cssWidth:e.clientWidth,cssHeight:e.clientHeight,environment:e.dataset.studioEnvironment,preserveDrawingBuffer:e.getContext('webgl2').getContextAttributes().preserveDrawingBuffer})")
                probe=canvas.evaluate("e=>{const g=e.getContext('webgl2');const a=new Uint8Array(e.width*e.height*4);const old=g.getParameter(g.FRAMEBUFFER_BINDING);g.bindFramebuffer(g.FRAMEBUFFER,null);g.readPixels(0,0,e.width,e.height,g.RGBA,g.UNSIGNED_BYTE,a);g.bindFramebuffer(g.FRAMEBUFFER,old);let count=0,max=0;for(let i=3;i<a.length;i+=4){if(a[i])count++;max=Math.max(max,a[i])}return {lost:g.isContextLost(),error:g.getError(),alphaPixels:count,maximumAlpha:max,attributes:g.getContextAttributes()}}")
                print('GPU',PROFILE,sid,probe,flush=True)
                tier=host.locator('[data-quality-tier]').get_attribute('data-quality-tier')
                assert tier==('SAFE' if PROFILE=='iphone' else 'LOW'),tier
                assert metrics['width']>=metrics['cssWidth']*(1.9 if PHASE=='after' else 1.45),metrics
                page.add_style_tag(content='nextjs-portal{display:none}')
                page.screenshot(path=str(OUT/f'{sid}.png'))
                if '--posters' in sys.argv:
                    raw=canvas.evaluate("e=>e.toDataURL('image/png').split(',')[1]")
                    (OUT/f'{sid}-transparent.png').write_bytes(base64.b64decode(raw))
                first=canvas.screenshot()
                (OUT/f'{sid}-canvas.png').write_bytes(first)
                pixels=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/analyze-gem-capture.mjs'),str(OUT/f'{sid}-canvas.png')],text=True))
                box=canvas.bounding_box()
                page.mouse.move(box['x']+box['width']*.35,box['y']+box['height']*.52)
                page.mouse.down()
                page.mouse.move(box['x']+box['width']*.65,box['y']+box['height']*.56,steps=12)
                page.mouse.up()
                page.wait_for_timeout(800)
                second=canvas.screenshot()
                (OUT/f'{sid}-orbit.png').write_bytes(second)
                assert first!=second,sid+' orbit did not draw a new image'
                subprocess.check_output(['node',str(ROOT/'scripts/analyze-gem-capture.mjs'),str(OUT/f'{sid}-orbit.png')],text=True)
                report['stones'].append({'id':sid,'ready':True,'tier':tier,'canvas':metrics,'gpu':probe,'pixels':pixels,'orbit':True,'seconds':round(time.monotonic()-started,2)})
                print('PASS',PROFILE,PHASE,sid,metrics,flush=True)
            except Exception as e:
                report['stones'].append({'id':sid,'ready':False,'error':str(e)})
                page.screenshot(path=str(OUT/f'{sid}-failed.png'),timeout=10000)
                raise
            finally:
                page.close()
        assert not report['errors'],report['errors']
    finally:
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        browser.close()
