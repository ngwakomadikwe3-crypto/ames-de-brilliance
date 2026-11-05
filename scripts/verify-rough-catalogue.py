"""Mobile catalogue UI, mocked public inventory; no real account/data writes."""
import json,os,sys
from pathlib import Path
os.environ['PW_TEST_SCREENSHOT_NO_FONTS_READY']='1'
from playwright.sync_api import sync_playwright
profile=sys.argv[1] if len(sys.argv)>1 else 'android'
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/qa/rough-catalogue';OUT.mkdir(parents=True,exist_ok=True)
base={'origin':'natural','form':'rough','carats':12.5,'measurements':'18 × 12 × 10 mm','treatments':'none-reported','treatmentDetails':'','gradeSummary':'','reportStatus':'not-issued','reportUrl':'','laboratory':'','reportNumber':''}
items=[{**base,'stoneId':s,'ref':'QA-'+str(i),'title':'Rough '+s,'species':s} for i,s in enumerate(['diamond','quartz','tourmaline'])]
items.append({**items[0],'stoneId':'polished','form':'polished','title':'Excluded polished diamond'})
with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if profile=='iphone' else p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
 context=browser.new_context(**p.devices['iPhone 13' if profile=='iphone' else 'Pixel 7'],reduced_motion='reduce')
 context.add_init_script("sessionStorage.setItem('ames_intro_seen','1')")
 context.route('**/api/chats',lambda r:r.fulfill(status=200,content_type='application/json',body='[]'))
 context.route('**/*fontshare.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
 mode=['error']
 def inventory(r):r.fulfill(status=503 if mode[0]=='error' else 200,content_type='application/json',body=json.dumps({'items':items if mode[0]=='stock' else []}))
 context.route('**/api/rough-stones',inventory)
 page=context.new_page();errors=[];developmentDiagnostics=[]
 page.on('pageerror',lambda e:(developmentDiagnostics if '/__nextjs_original-stack-frames' in str(e) else errors).append(str(e)))
 try:
  page.goto('http://127.0.0.1:3020/app?catalogue',wait_until='domcontentloaded',timeout=180000)
  panel=page.locator('[data-catalogue-panel]');panel.get_by_role('heading',name='The Catalogue Room').wait_for(timeout=90000)
  panel.get_by_role('button',name='Try again').wait_for(timeout=30000)
  assert page.get_by_role('button',name='Catalogue',exact=True).get_attribute('aria-current')=='page'
  assert page.get_by_role('button',name='Auction',exact=True).count()==0
  mode[0]='empty';panel.get_by_role('button',name='Try again').click()
  panel.get_by_text('No reviewed rough gemstones are listed yet.',exact=False).wait_for()
  mode[0]='stock';page.reload(wait_until='domcontentloaded')
  panel.locator('[data-catalogue-stone="quartz"]').wait_for(timeout=30000)
  assert panel.locator('[data-catalogue-stone]').count()==3
  assert panel.locator('[data-catalogue-stone="polished"]').count()==0
  panel.get_by_label('Gemstone type').select_option('tourmaline')
  assert panel.locator('[data-catalogue-stone]').count()==1
  panel.get_by_label('Search by name or reference').fill('missing')
  panel.get_by_role('button',name='Clear filters').click()
  assert panel.locator('[data-catalogue-stone]').count()==3
  panel.get_by_label('Search by name or reference').fill('QA-1')
  assert panel.locator('[data-catalogue-stone]').count()==1
  panel.get_by_role('button',name='Copy reference QA-1').click()
  page.wait_for_function("document.querySelector('[data-catalogue-panel]').textContent.includes('Copied reference QA-1.') || document.querySelector('[data-catalogue-panel]').textContent.includes('Copy unavailable. Stone reference: QA-1')")
  panel.get_by_label('Search by name or reference').fill('')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  panel.evaluate('e=>e.scrollTop=0');page.add_style_tag(content='nextjs-portal{display:none}');page.screenshot(path=str(OUT/f'{profile}-fixture.png'))
  assert not errors,errors
  (OUT/f'{profile}.json').write_text(json.dumps({'passed':True,'physicalDevice':False,'inventory':'test fixtures only','checks':['catalogue navigation','outage','retry','empty stock','all rough species','polished excluded','species and text filters','clear filters','copy feedback','no horizontal overflow'],'errors':errors,'developmentDiagnostics':developmentDiagnostics},indent=2))
  print('PASS',profile,flush=True)
 finally:browser.close()
