"""Real production Chat visuals; mock only persistence/assistant, never customer writes."""
import base64,json,os,sys,time,subprocess
from pathlib import Path
os.environ['PW_TEST_SCREENSHOT_NO_FONTS_READY']='1'
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
BASE=sys.argv[1]
PROFILE=sys.argv[2]
OUT=ROOT/'docs/qa/gem-refresh-2026-11-04/production-chat'/PROFILE
OUT.mkdir(parents=True,exist_ok=True)
report={'profile':PROFILE,'physicalDevice':False,'services':'mocked','assets':'real','stones':[],'errors':[]}
with sync_playwright() as p:
    browser=p.webkit.launch(headless=True) if PROFILE=='iphone' else p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,args=['--ignore-gpu-blocklist'])
    device=dict(p.devices['iPhone 13' if PROFILE=='iphone' else 'Pixel 7'])
    if PROFILE=='android':device.update(viewport={'width':393,'height':851},device_scale_factor=2)
    context=browser.new_context(**device)
    context.add_init_script("sessionStorage.setItem('ames_intro_seen','1');const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,o){return old.call(this,t,t==='webgl2'||t==='webgl'?{...o,preserveDrawingBuffer:true}:o)}")
    if PROFILE=='android':context.add_init_script("Object.defineProperty(navigator,'deviceMemory',{get:()=>4});")
    context.route('**/*fontshare.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
    def chats(route):
        if '/messages' in route.request.url:
            data={'id':str(time.monotonic_ns()),'role':'user','text':route.request.post_data_json['text'],'created_at':'2026-11-04T00:00:00Z'}
        else:data={'id':'qa-gem-refresh'} if route.request.method=='POST' else []
        route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
    context.route('**/api/chats',chats)
    context.route('**/api/chats/**',chats)
    context.route('**/api/ames',lambda r:r.fulfill(status=200,content_type='application/json',body=json.dumps({'message':{'id':str(time.monotonic_ns()),'role':'assistant','text':'QA visual selection complete.'}})))
    page=context.new_page()
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda e:report['errors'].append(e.text) if e.type=='error' and ('Shader' in e.text or 'WebGLProgram' in e.text) else None)
    def say(text):
        field=page.get_by_label('Message SAME');field.fill(text);field.press('Enter');page.wait_for_timeout(500)
    try:
        page.goto(BASE+'/app',wait_until='domcontentloaded',timeout=180000)
        page.get_by_label('Message SAME').wait_for(timeout=90000)
        menu=page.get_by_label('Menu',exact=True)
        menu.click()
        page.get_by_role('button',name='Profile & settings',exact=True).wait_for(timeout=30000)
        page.mouse.click(page.viewport_size['width']-15,200)
        page.wait_for_function("document.querySelector('[aria-label=Menu]').getAttribute('aria-expanded')==='false'")
        assert page.locator('[data-chat-asset-id="demo-reference-ring"] [data-reference-ring]').count()==1
        for sid in ['amethyst','tanzanite','moonstone']:
            say('Show me '+sid)
            stage=page.locator('[data-chat-asset-id="stone-'+sid+'"]')
            stage.locator('[data-viewer-state="ready"]').wait_for(timeout=90000)
            canvas=stage.locator('canvas[data-studio-environment="softbox-v2"]')
            canvas.wait_for(timeout=30000);page.wait_for_timeout(1200)
            assert page.locator('[data-chat-asset-id]').count()==1
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            metrics=canvas.evaluate('e=>({width:e.width,height:e.height,cssWidth:e.clientWidth,cssHeight:e.clientHeight})')
            assert metrics['width']>=metrics['cssWidth']*1.9,metrics
            raw=canvas.evaluate("e=>e.toDataURL('image/png').split(',')[1]")
            (OUT/f'{sid}-transparent.png').write_bytes(base64.b64decode(raw))
            first=canvas.screenshot();(OUT/f'{sid}-canvas.png').write_bytes(first)
            subprocess.check_output(['node',str(ROOT/'scripts/analyze-gem-capture.mjs'),str(OUT/f'{sid}-canvas.png')],text=True)
            page.screenshot(path=str(OUT/f'{sid}.png'))
            say('Rotate it');stage.locator('[data-turntable-enabled="true"]').wait_for(timeout=10000)
            page.wait_for_timeout(700);rotated=canvas.screenshot();assert rotated!=first
            (OUT/f'{sid}-rotated.png').write_bytes(rotated)
            subprocess.check_output(['node',str(ROOT/'scripts/analyze-gem-capture.mjs'),str(OUT/f'{sid}-rotated.png')],text=True)
            say('Stop');stage.locator('[data-turntable-enabled="false"]').wait_for(timeout=10000)
            report['stones'].append({'id':sid,'ready':True,'rotation':True,'stop':True,'canvas':metrics})
            print('PASS production Chat',PROFILE,sid,metrics,flush=True)
        say('Show the ring again')
        page.locator('[data-chat-asset-id="demo-reference-ring"] [data-reference-ring]').wait_for(timeout=10000)
        assert not report['errors'],report['errors']
    except Exception as e:
        report['failure']=str(e)
        page.screenshot(path=str(OUT/'failed.png'),timeout=10000)
        raise
    finally:
        (OUT/'report.json').write_text(json.dumps(report,indent=2))
        browser.close()
