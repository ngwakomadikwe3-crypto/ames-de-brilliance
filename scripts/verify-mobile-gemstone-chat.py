"""Production visual flow with mocked chat persistence/answers and real public 3D assets.
No real conversations or customer records are created. Browser profiles, not physical devices.
"""
import json,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'https://houseofames.com'
TARGET=sys.argv[2] if len(sys.argv)>2 else 'tecno-spark'
OUT=Path(__file__).resolve().parents[1]/'.ames-cad/qa-mobile-gemstones';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.webkit.launch(headless=True) if TARGET=='ipad-a16' else p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,args=['--ignore-gpu-blocklist'])
    device=dict(p.devices['iPhone 13' if TARGET=='ipad-a16' else 'Pixel 7'])
    if TARGET=='ipad-a16':device.update(viewport={'width':820,'height':1180},screen={'width':820,'height':1180},device_scale_factor=2,user_agent='Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1')
    else:device.update(viewport={'width':360,'height':800},device_scale_factor=2)
    context=browser.new_context(**device)
    if TARGET=='tecno-spark':context.add_init_script("Object.defineProperty(navigator,'deviceMemory',{get:()=>4});")
    context.add_init_script("sessionStorage.setItem('ames_intro_seen','1')")
    context.route('**/*fontshare.com/**',lambda route:route.fulfill(status=200,content_type='text/css',body=''))
    def chats(route):
        if '/messages' in route.request.url:
            data={'id':f'qa-{time.monotonic_ns()}','role':'user','text':route.request.post_data_json['text'],'created_at':'2026-10-27T00:00:00Z'}
        else:data={'id':'qa-isolated'} if route.request.method=='POST' else []
        route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
    context.route('**/api/chats',chats);context.route('**/api/chats/**',chats)
    context.route('**/api/ames',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'message':{'id':str(time.monotonic_ns()),'role':'assistant','text':'QA visual selection complete.'}})))
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda e:errors.append(e.text) if e.type=='error' and ('Shader' in e.text or 'WebGLProgram' in e.text) else None)
    def say(message):
        field=page.get_by_label('Message SAME');field.fill(message);page.wait_for_timeout(150);field.press('Enter');page.wait_for_timeout(300)
    try:
        page.goto(BASE+'/app?gemstones=mobile4',wait_until='domcontentloaded',timeout=90000)
        page.get_by_label('Message SAME').wait_for(timeout=60000)
        print('CHAT ready',flush=True)
        menu=page.get_by_label('Menu',exact=True)
        for attempt in range(10):
            menu.click();page.wait_for_timeout(500)
            if menu.get_attribute('aria-expanded')=='true':break
        page.get_by_role('button',name='Profile & settings',exact=True).wait_for(timeout=30000)
        page.mouse.click(page.viewport_size['width']-15,200)
        page.wait_for_function("document.querySelector('[aria-label=Menu]').getAttribute('aria-expanded')==='false'")
        page.wait_for_timeout(300)
        print('CHAT hydrated',flush=True)
        say('Show me a ruby')
        stage=page.locator('[data-chat-asset-id="stone-ruby"]');stage.wait_for(timeout=30000)
        stage.locator('[data-viewer-state="ready"]').wait_for(timeout=60000)
        print('RUBY ready',flush=True)
        assert stage.get_attribute('data-chat-revision')=='stone-ruby:4'
        assert page.locator('[data-chat-asset-id]').count()==1
        expected='SAFE' if TARGET=='ipad-a16' else 'LOW'
        assert stage.locator('[data-quality-tier]').get_attribute('data-quality-tier')==expected
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.add_style_tag(content='nextjs-portal{display:none}')
        page.screenshot(path=str(OUT/f'{TARGET}-live-chat-ruby.png'))
        say('Rotate it');page.wait_for_timeout(800)
        assert stage.locator('[data-turntable-enabled="true"]').count()==1
        first=stage.locator('canvas').screenshot();page.wait_for_timeout(600);second=stage.locator('canvas').screenshot();assert first!=second,'Turntable did not draw new frames'
        say('Stop');page.wait_for_timeout(300)
        stage.locator('[data-turntable-enabled="false"]').wait_for(timeout=5000)
        say('Show me an emerald')
        stage=page.locator('[data-chat-asset-id="stone-emerald"]');stage.locator('[data-viewer-state="ready"]').wait_for(timeout=60000)
        assert stage.get_attribute('data-chat-revision')=='stone-emerald:4'
        assert page.locator('[data-chat-asset-id]').count()==1
        if '--presentation' in sys.argv:
            say('Show the ring again')
            ring=page.locator('[data-chat-asset-id="dev-test-candidate-ring"]')
            ring.locator('[data-viewer-state="ready"]').wait_for(timeout=60000)
            ring.locator('canvas[data-studio-environment="photographic"]').wait_for(timeout=30000)
            assert ring.get_attribute('data-chat-revision')=='dev-test-candidate-ring:3'
            page.screenshot(path=str(OUT/f'{TARGET}-studio-ring.png'))
            page.locator('[data-page-tab="0"]').click()
            page.wait_for_function("!document.querySelector('.ames-magazine')?.hasAttribute('data-turning')")
            tile=page.locator('[data-boutique-tile="dev-test-candidate-ring"]')
            tile.wait_for(timeout=30000)
            assert 'presentation-ring-studio.webp' in tile.locator('img').get_attribute('src')
            page.wait_for_function("document.querySelector('[data-boutique-tile=dev-test-candidate-ring] img')?.naturalWidth>0")
            page.screenshot(path=str(OUT/f'{TARGET}-studio-boutique.png'))
            page.locator('[data-page-tab="2"]').click()
            page.wait_for_function("!document.querySelector('.ames-magazine')?.hasAttribute('data-turning')")
            media=page.locator('[data-media-poster]').first
            media.wait_for(timeout=30000)
            assert 'presentation-ring-studio.webp' in media.get_attribute('src')
            page.screenshot(path=str(OUT/f'{TARGET}-studio-media.png'))
            print('PASS shared ring studio in Chat, Boutique and Media',flush=True)
        assert not errors,errors
        (OUT/f'{TARGET}-live-chat-report.json').write_text(json.dumps({'target':TARGET,'physicalDevice':False,'chatServices':'mocked','assets':'real application assets','base':BASE,'passed':['ruby revision 4 ready','target quality tier','one object','overflow','rotation draws frames','stop rotation','emerald revision 4 ready'],'errors':errors},indent=2),encoding='utf-8')
        print(f'PASS live Chat {TARGET}: revision 4 ruby/emerald, target renderer, rotate/stop, one active object',flush=True)
    except Exception:
        page.screenshot(path=str(OUT/f'{TARGET}-live-chat-failed.png'),timeout=5000)
        (OUT/f'{TARGET}-live-chat-failed.txt').write_text(page.locator('body').inner_text()+repr(errors),encoding='utf-8')
        raise
    finally:browser.close()
