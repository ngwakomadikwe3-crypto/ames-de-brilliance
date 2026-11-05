"""Loopback-only browser QA for the isolated listing integration harness."""
import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
config=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
assert config['origin']=='http://localhost:3012'
out=Path(config['output'])
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,args=['--ignore-gpu-blocklist'])
 try:
  context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,reduced_motion='reduce')
  context.add_cookies([{'name':'ames_customer_session','value':'qa-a','url':config['origin']}])
  context.route('**/*fontshare.com/**',lambda route:route.fulfill(status=200,content_type='text/css',body=''))
  page=context.new_page();errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE ERROR',str(e),flush=True)))
  page.on('console',lambda e:print('BROWSER ERROR',e.text[:1800],flush=True) if e.type=='error' else None)
  page.on('requestfailed',lambda r:print('REQUEST FAILED',r.url,r.failure,flush=True))
  page.goto(config['origin']+'/jeweller',wait_until='domcontentloaded',timeout=120000)
  page.get_by_role('button',name='New listing',exact=True).wait_for(timeout=60000)
  page.get_by_label('Piece name',exact=True).fill('Browser-created private fixture')
  page.get_by_label('Category',exact=True).select_option('accessory')
  page.get_by_role('button',name='Create private draft',exact=True).click()
  page.get_by_text('Draft saved privately.',exact=True).wait_for(timeout=30000)
  assert page.locator('input[type=file]').count()==1
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(out/'mobile-studio.png'))
  page.goto(config['origin']+'/jewellery/'+config['id'],wait_until='domcontentloaded',timeout=90000)
  page.locator('[data-viewer-state="ready"],[data-viewer-state="fallback"]').wait_for(timeout=120000)
  if page.locator('[data-viewer-state="fallback"]').count():
   print('Retrying real viewer after cold chunk compilation',flush=True)
   page.get_by_role('button',name='Retry 3D',exact=True).click()
  page.locator('[data-viewer-state="ready"]').wait_for(timeout=90000)
  page.get_by_text('BWP',exact=False).wait_for(timeout=10000)
  assert '2,450' in page.locator('body').inner_text()
  assert 'South Africa' in page.locator('body').inner_text()
  assert 'Mozambique' in page.locator('body').inner_text()
  assert 'PRIVATE-NOTE-NOT-PUBLIC' not in page.locator('body').inner_text()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(out/'mobile-public-listing.png'))
  page.set_viewport_size({'width':820,'height':1180});page.screenshot(path=str(out/'tablet-public-listing.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.goto(config['origin']+'/app',wait_until='domcontentloaded',timeout=90000)
  # Wait for the real page navigation to hydrate before selecting Boutique.
  menu=page.get_by_label('Menu',exact=True)
  for attempt in range(10):
   menu.click();page.wait_for_timeout(300)
   if menu.get_attribute('aria-expanded')=='true':break
  page.mouse.click(805,200);page.wait_for_timeout(300)
  page.locator('[data-page-tab="0"]').click()
  tile=page.locator('[data-boutique-tile="listing-'+config['id']+'"]')
  tile.wait_for(timeout=30000)
  assert '2,450' in tile.inner_text()
  tile.click()
  page.locator('[data-boutique-detail="listing-'+config['id']+'"]').wait_for(timeout=10000)
  assert 'Mozambique' in page.locator('body').inner_text()
  assert not errors,errors
  print('PASS responsive jeweller studio, real public 3D price/origin and Boutique listing integration',flush=True)
 finally:browser.close()
