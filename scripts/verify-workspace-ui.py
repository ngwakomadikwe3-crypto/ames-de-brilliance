import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
c=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
assert c['origin']=='http://localhost:3012'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
 try:
  context=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  context.add_cookies([{'name':'ames_customer_session','value':'qa-buyer','url':c['origin']}])
  context.route('**/*fontshare.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda e:print('BROWSER',e.text[:1200],flush=True) if e.type=='error' else None)
  page.goto(c['origin']+'/workspace',wait_until='domcontentloaded',timeout=180000)
  page.get_by_text('Your next steps',exact=True).wait_for(timeout=90000)
  page.get_by_role('link',name='Start / continue jeweller setup').wait_for()
  page.locator('[data-enquiry-inbox] nav button').filter(has_text='accepted').first.wait_for(timeout=60000)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(Path(c['output'])/'workspace-mobile.png'),full_page=True)
  context.add_cookies([{'name':'ames_customer_session','value':'qa-new','url':c['origin']}])
  page.goto(c['origin']+'/jeweller/onboarding',wait_until='domcontentloaded',timeout=180000)
  page.get_by_role('link',name='Manage listings and CAD').wait_for(timeout=90000)
  assert page.get_by_label('Business / trading name',exact=True).input_value()=='Isolated maker fixture'
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(Path(c['output'])/'onboarding-mobile.png'),full_page=True)
  page.set_viewport_size({'width':820,'height':1180})
  page.goto(c['origin']+'/makers/'+c['slug'],wait_until='domcontentloaded',timeout=180000)
  page.get_by_role('heading',name='Isolated maker fixture',exact=True).wait_for(timeout=90000)
  assert 'PRIVATE-STREET' not in page.locator('body').inner_text()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(Path(c['output'])/'storefront-tablet.png'),full_page=True)
  assert not errors,errors
  print('PASS customer workspace, merchant onboarding and public storefront browser checks at mobile/tablet sizes',flush=True)
 finally:b.close()
