import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
c=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));assert c['origin']=='http://localhost:3012'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
 try:
  context=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  context.add_cookies([{'name':'ames_customer_session','value':'qa-a','url':c['origin']}])
  context.route('**/*fontshare.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(c['origin']+'/auctioneer',wait_until='domcontentloaded',timeout=180000)
  page.get_by_role('button',name='Edit business details (renewed review required)',exact=True).wait_for(timeout=90000)
  assert page.get_by_label('Business / trading name',exact=True).input_value()=='Auctioneer fixture studio'
  assert page.get_by_label('Seller authority and consignment policy',exact=True).input_value()
  assert page.get_by_text('verified',exact=False).count()>0
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(Path(c['output'])/'auctioneer-mobile.png'),full_page=True)
  name,value=c['owner'].split('=',1);context.add_cookies([{'name':name,'value':value,'url':c['origin']}])
  page.set_viewport_size({'width':820,'height':1180})
  page.goto(c['origin']+'/dashboard/auctioneers',wait_until='domcontentloaded',timeout=180000)
  page.get_by_role('button',name='Auctioneer fixture studio',exact=False).wait_for(timeout=90000)
  page.get_by_role('button',name='Auctioneer fixture studio',exact=False).click()
  page.get_by_role('heading',name='Onboarding review',exact=True).wait_for()
  assert page.get_by_label('Buyer fees, payment and delivery terms',exact=True).input_value()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(Path(c['output'])/'auctioneer-staff-tablet.png'),full_page=True)
  assert not errors,errors
  print('PASS real mobile applicant and tablet staff profile screens; no browser errors or overflow',flush=True)
 finally:b.close()
