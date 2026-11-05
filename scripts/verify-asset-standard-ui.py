import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
c=json.loads(Path(sys.argv[1]).read_text());root=Path(c['root']);expect.set_options(timeout=120000)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
    try:
        context=browser.new_context(viewport={'width':820,'height':1180},reduced_motion='reduce')
        context.route('**/*fontshare.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
        page=context.new_page();page.set_default_timeout(120000);errors=[];posts=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:posts.append(r.url) if r.method in ('POST','PUT','PATCH') else None)
        page.goto(c['origin']+'/dashboard/asset-standard',wait_until='domcontentloaded',timeout=180000)
        assert '/login' in page.url
        context.add_cookies([{'name':'adb_session','value':c['cookie'],'url':c['origin']}])
        page.goto(c['origin']+'/dashboard/asset-standard',wait_until='domcontentloaded',timeout=180000)
        expect(page.get_by_text('AMES visual & 3D asset standard',exact=True)).to_be_visible()
        expect(page.locator('[data-asset-standard]')).to_have_attribute('data-workbench-ready','true')
        page.get_by_text('Open brief',exact=True).locator('input').set_input_files(c['brief'])
        expect(page.get_by_role('textbox',name='Asset brief JSON')).to_have_value(__import__('re').compile('Educational diamond'))
        page.get_by_role('button',name='Check brief & model',exact=True).click()
        expect(page.locator('[data-asset-report]').get_by_text('Production inputs required',exact=True)).to_be_visible()
        page.get_by_label('Inspection GLB',exact=True).set_input_files(c['model'])
        expect(page.locator('[data-ames-engine-host]')).to_be_visible()
        page.get_by_role('button',name='Check brief & model',exact=True).click()
        expect(page.locator('[data-asset-report]').get_by_text('technical review required',exact=True)).to_be_visible()
        expect(page.locator('[data-asset-report]').get_by_text('Missing dimensions',exact=True)).to_be_visible()
        page.get_by_role('button',name='View interactive 3D',exact=True).click()
        host=page.locator('[data-ames-engine-host]');expect(host).to_have_attribute('data-viewer-state','ready')
        expect(host).to_have_attribute('data-turntable-enabled','false');expect(host.locator('canvas')).to_have_count(1)
        page.get_by_role('button',name='Slow turntable',exact=True).click()
        expect(host).to_have_attribute('data-turntable-enabled','false')
        page.emulate_media(reduced_motion='no-preference');expect(host).to_have_attribute('data-turntable-enabled','true')
        page.get_by_role('button',name='Slow turntable',exact=True).click()
        page.emulate_media(reduced_motion='reduce');expect(host).to_have_attribute('data-turntable-enabled','false')
        page.get_by_role('button',name='side',exact=True).click();expect(host).to_have_attribute('data-camera-preset','side')
        page.get_by_role('combobox',name='Studio backdrop').select_option('warm-ivory')
        page.locator('[data-ames-engine-host]').screenshot(path=str(root/'tablet-local-3d.png'))
        page.evaluate("document.querySelector('[data-ames-engine-host] canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true}))")
        expect(host).to_have_attribute('data-viewer-state','fallback')
        page.get_by_role('button',name='Retry 3D',exact=True).click();expect(host).to_have_attribute('data-viewer-state','ready');expect(host.locator('canvas')).to_have_count(1)
        page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.get_by_role('button',name='Check brief & model',exact=True).scroll_into_view_if_needed()
        page.screenshot(path=str(root/'mobile-report.png'))
        assert not errors,errors
        assert not posts,posts
        (root/'report.json').write_text(json.dumps({'passed':True,'realWebGL':True,'oneCanvas':True,'localFilesOnly':True,'uploads':posts,'physicalDevices':False,'pageErrors':errors},indent=2))
        print('PASS private workbench, local-only GLB/brief, true 3D ready, camera, context-loss retry, single canvas, responsive report',flush=True)
    except:
        print(json.dumps({'pageErrors':errors,'body':page.locator('body').inner_text()[-5000:]}),flush=True)
        page.screenshot(path=str(root/'failure.png'))
        raise
    finally:browser.close()
