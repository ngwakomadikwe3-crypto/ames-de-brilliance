"""Real WebKit/Chromium engine QA with emulated phone viewports; not physical-device certification.
Requires the temporary development /dev/gemstone-review fixture and pip playwright + WebKit.
"""
import json,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.ames-cad/qa-mobile-gemstones';OUT.mkdir(parents=True,exist_ok=True)
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:3010'
ENGINE=sys.argv[2] if len(sys.argv)>2 else 'chromium'
IDS=sys.argv[3].split(',') if len(sys.argv)>3 else ['ruby','emerald','sapphire','diamond','ametrine','opal','pearl','turquoise']
report={'engine':ENGINE,'physicalDevice':False,'stones':[],'errors':[]}
with sync_playwright() as p:
    browser=(p.webkit.launch(headless=True) if ENGINE in ('webkit','ipad-a16') else p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,args=['--ignore-gpu-blocklist']))
    device=dict(p.devices['iPhone 13' if ENGINE in ('webkit','ipad-a16') else 'Pixel 7'])
    if ENGINE=='ipad-a16':device.update(viewport={'width':820,'height':1180},screen={'width':820,'height':1180},device_scale_factor=2,user_agent='Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1')
    if ENGINE=='tecno-spark':device.update(viewport={'width':360,'height':800},screen={'width':360,'height':800},device_scale_factor=2)
    context=browser.new_context(**device)
    if ENGINE=='tecno-spark':context.add_init_script("Object.defineProperty(navigator,'deviceMemory',{get:()=>4});Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});")
    context.route('**/*fontshare.com/**',lambda route:route.fulfill(status=200,content_type='text/css',body=''))
    context.add_init_script("""window.__lost=0;const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args){const result=original.apply(this,args);if(result&&String(args[0]).includes('webgl')&&!this.__watched){this.__watched=true;this.addEventListener('webglcontextlost',()=>{if(this.isConnected)window.__lost++})}return result};""")
    page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda e:report['errors'].append(e.text) if e.type=='error' and ('Shader' in e.text or 'WebGLProgram' in e.text) else None)
    try:
      for sid in IDS:
        if page.is_closed():
          page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
          page.on('console',lambda e:report['errors'].append(e.text) if e.type=='error' and ('Shader' in e.text or 'WebGLProgram' in e.text) else None)
        started=time.monotonic();page.goto(f'{BASE}/dev/gemstone-review?stone={sid}',wait_until='domcontentloaded',timeout=90000)
        page.locator('[data-viewer-state="ready"], [data-viewer-state="fallback"]').wait_for(timeout=60000)
        assert page.locator('[data-viewer-state="ready"]').count()==1, f'{ENGINE}/{sid}: real 3D not ready'
        page.locator('canvas[data-studio-environment=photographic]').wait_for(timeout=30000)
        page.wait_for_timeout(800)
        canvas=page.locator('[data-ames-engine-host] canvas')
        assert canvas.count()==1
        metrics=canvas.evaluate("e=>{const gl=e.getContext('webgl2');const info=gl?.getExtension('WEBGL_debug_renderer_info');return {width:e.width,height:e.height,cssWidth:e.clientWidth,cssHeight:e.clientHeight,renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'unavailable'}}")
        tier=page.locator('[data-quality-tier]').get_attribute('data-quality-tier')
        assert page.evaluate('window.__lost')==0
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        if ENGINE=='tecno-spark' and sid!='ring':assert tier=='LOW'
        if ENGINE=='ipad-a16':assert tier=='SAFE'
        assert metrics['width']>=metrics['cssWidth']*1.45, f'Low rendering resolution: {metrics}'
        page.add_style_tag(content='nextjs-portal{display:none}')
        shot=OUT/f'{ENGINE}-{sid}.png';page.screenshot(path=str(shot))
        before=canvas.screenshot();box=canvas.bounding_box()
        page.mouse.move(box['x']+box['width']*.4,box['y']+box['height']*.5)
        page.mouse.down();page.mouse.move(box['x']+box['width']*.65,box['y']+box['height']*.55,steps=8);page.mouse.up();page.wait_for_timeout(500)
        after=canvas.screenshot();assert before!=after,f'{sid}: orbit did not update real canvas'
        report['stones'].append({'id':sid,'tier':tier,'readySeconds':round(time.monotonic()-started,2),'canvas':metrics,'orbit':True,'screenshot':str(shot)})
        print(f'PASS {ENGINE} {sid} {tier} {metrics["width"]}x{metrics["height"]}',flush=True)
        if ENGINE=='ipad-a16' and sid==IDS[-1]:
          page.set_viewport_size({'width':1180,'height':820});page.wait_for_timeout(500)
          assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
          page.screenshot(path=str(OUT/'ipad-a16-landscape.png'))
        page.close()
      assert not report['errors'],report['errors']
    finally:
      (OUT/f'{ENGINE}-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
      browser.close()
