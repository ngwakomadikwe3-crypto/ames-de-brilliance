"""Real application/3D assets with isolated mocked conversations; no customer writes."""
import json
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:3020'
PROFILE = sys.argv[2] if len(sys.argv)>2 else 'desktop'
OUT = Path(__file__).resolve().parents[1] / 'docs/qa/chat-diamond-2026-11-04'
OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser = p.webkit.launch(headless=True) if PROFILE=='webkit-tablet' else p.chromium.launch(
        executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,
        args=['--ignore-gpu-blocklist'])
    options = dict(viewport={'width':1440,'height':1000},device_scale_factor=1)
    if PROFILE=='phone':
        options.update(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    if PROFILE=='webkit-tablet':
        options.update(viewport={'width':820,'height':1180},device_scale_factor=2,has_touch=True,
            user_agent='Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1')
    context = browser.new_context(**options)
    context.add_init_script("sessionStorage.setItem('ames_intro_seen','1');Object.defineProperty(navigator,'deviceMemory',{get:()=>4});")
    context.route('**/*fontshare.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
    outage = False
    requests, errors, contexts = [], [], []
    def chats(route):
        request=route.request
        if request.method=='GET': data=[]
        elif request.url.endswith('/api/chats'): data={'id':'isolated-concept-chat','title':'Isolated QA'}
        else: data={'id':str(time.monotonic_ns()),'role':'user','text':request.post_data_json.get('text','')}
        route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
    def same(route):
        contexts.append(route.request.post_data_json)
        route.fulfill(status=503 if outage else 200,content_type='application/json',
            body=json.dumps({'error':'Isolated SAME outage'} if outage else {'message':{'id':str(time.monotonic_ns()),'role':'assistant','text':'Isolated visual check.'}}))
    context.route('**/api/chats',chats)
    context.route('**/api/chats/**',chats)
    context.route('**/api/ames',same)
    page=context.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda e:errors.append(e.text) if e.type=='error' and ('Shader' in e.text or 'WebGLProgram' in e.text) else None)
    page.on('request',lambda r:requests.append(r.url) if '.glb' in r.url else None)
    def selected(asset):
        print('WAIT',asset,flush=True)
        stage=page.locator(f'[data-chat-asset-id="{asset}"]')
        stage.locator('[data-viewer-state="ready"]').wait_for(timeout=120000)
        assert page.locator('[data-chat-asset-id]').count()==1
        assert stage.locator('canvas').count()==1
        return stage
    def say(text):
        print('SAY',text,flush=True)
        field=page.get_by_label('Message SAME')
        field.fill(text)
        field.press('Enter')
        page.wait_for_timeout(600)
    try:
        page.goto(BASE+'/app',wait_until='domcontentloaded',timeout=180000)
        page.get_by_label('Message SAME').wait_for(timeout=120000)
        stage=selected('demo-modern-diamond')
        assert stage.get_attribute('data-chat-revision')=='demo-modern-diamond:1'
        assert page.locator('[data-demonstration-label]').is_visible()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not any('/stone-' in url for url in requests),'Hidden stone library was eagerly fetched'
        page.add_style_tag(content='nextjs-portal{display:none}')
        page.screenshot(path=str(OUT/f'{PROFILE}-default.png'))
        print('CHECK reduced motion',flush=True)
        page.emulate_media(reduced_motion='reduce')
        stage.locator('[data-turntable-enabled="false"]').wait_for(timeout=10000)
        page.emulate_media(reduced_motion='no-preference')
        say('Stop')
        stage.locator('[data-turntable-enabled="false"]').wait_for(timeout=10000)
        assert contexts[-1]['assetId']=='demo-modern-diamond'
        say('Show me the side')
        stage.locator('[data-camera-preset="side"]').wait_for(timeout=10000)
        say('Zoom in')
        zoom=stage.locator('[data-ames-engine-host]').get_attribute('data-zoom')
        assert float(zoom)>1.12
        say('Reset')
        stage.locator('[data-camera-preset="gemstone"]').wait_for(timeout=10000)
        say('Rotate it')
        stage.locator('[data-turntable-enabled="true"]').wait_for(timeout=10000)
        page.bring_to_front()
        page.wait_for_timeout(2000)  # Controlled turntable resumes after touch interaction.
        first=stage.locator('canvas').screenshot()
        (OUT/f'{PROFILE}-rotation-before.png').write_bytes(first)
        page.wait_for_timeout(600)
        second=stage.locator('canvas').screenshot()
        (OUT/f'{PROFILE}-rotation-after.png').write_bytes(second)
        assert first!=second,'Rotation did not draw new frames'
        say('Show me a ruby')
        selected('stone-ruby')
        say('Show the ring again')
        selected('dev-test-candidate-ring')
        outage=True
        say('Show the default diamond')
        stage=selected('demo-modern-diamond')
        page.get_by_text('Isolated SAME outage',exact=True).wait_for(timeout=10000)
        say('Stop')
        stage.locator('[data-turntable-enabled="false"]').wait_for(timeout=10000)
        page.screenshot(path=str(OUT/f'{PROFILE}-service-outage.png'))
        # Use the real context-loss extension, with the same event path as a GPU reset.
        stage.locator('canvas').evaluate("c=>{const g=c.getContext('webgl2')||c.getContext('webgl');g.getExtension('WEBGL_lose_context').loseContext();}")
        stage.locator('[data-viewer-state="fallback"]').wait_for(timeout=10000)
        page.screenshot(path=str(OUT/f'{PROFILE}-fallback.png'))
        page.get_by_role('button',name='Retry 3D',exact=True).click()
        selected('demo-modern-diamond')
        assert not errors,errors
        report={'profile':PROFILE,'physicalDevice':False,'passed':True,'services':'isolated mocks, including outage','assets':'real application GLBs and viewer',
            'checks':['default real 3D ready','one Chat object/canvas','hidden library lazy','concept disclosure','no overflow','reduced motion','stop/side/zoom/reset','rotation draws frames','ruby selection','ring restoration','concept restoration during outage','context-loss fallback/retry'],
            'requestedModels':requests,'errors':errors}
        (OUT/f'{PROFILE}-browser.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print('PASS',PROFILE,json.dumps(report['checks']),flush=True)
    except Exception:
        page.screenshot(path=str(OUT/f'{PROFILE}-failed.png'))
        (OUT/f'{PROFILE}-failed.txt').write_text(page.locator('body').inner_text()+repr(errors),encoding='utf-8')
        raise
    finally:
        browser.close()
