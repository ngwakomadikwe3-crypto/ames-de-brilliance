"""Check the transparent reference image in the real app; no customer records written."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT=Path(__file__).resolve().parents[1]/'docs/qa/reference-ring-2026-11-04'
OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
    try:
        for name,width,height in [('desktop',1440,1000),('phone',390,844)]:
            context=browser.new_context(viewport={'width':width,'height':height},reduced_motion='reduce')
            context.add_init_script("sessionStorage.setItem('ames_intro_seen','1')")
            context.route('**/api/chats',lambda r:r.fulfill(status=200,content_type='application/json',body='[]'))
            context.route('**/*fontshare.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
            page=context.new_page()
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto('http://127.0.0.1:3021/app',wait_until='domcontentloaded',timeout=180000)
            image=page.locator('[data-chat-asset-id="demo-reference-ring"] [data-reference-ring]')
            image.wait_for(timeout=120000)
            page.wait_for_function("document.querySelector('[data-reference-ring]')?.naturalWidth>0")
            appearance=image.evaluate("e=>{const s=getComputedStyle(e);return {background:s.backgroundColor,border:s.borderTopWidth,radius:s.borderRadius,shadow:s.boxShadow}}")
            assert appearance=={'background':'rgba(0, 0, 0, 0)','border':'0px','radius':'0px','shadow':'none'},appearance
            assert page.locator('[data-chat-asset-id] canvas').count()==0
            assert page.locator('[data-chat-asset-id]').count()==1
            assert page.get_by_text('Reference ring · Image preview · Not for sale',exact=True).is_visible()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.add_style_tag(content='nextjs-portal{display:none}')
            page.screenshot(path=str(OUT/f'{name}.png'))
            assert not errors,errors
            (OUT/f'{name}.json').write_text(json.dumps({'passed':True,'appearance':appearance,'imageReferenceNot3D':True,'overflow':False,'errors':errors},indent=2))
            print('PASS',name,appearance,flush=True)
            context.close()
    finally:
        browser.close()
