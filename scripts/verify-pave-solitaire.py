"""Exercise the actual local Chat/Boutique model without customer writes."""
import json,os,sys
from pathlib import Path
os.environ['PW_TEST_SCREENSHOT_NO_FONTS_READY']='1'
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/qa/pave-solitaire';OUT.mkdir(parents=True,exist_ok=True)
profile=sys.argv[1] if len(sys.argv)>1 else 'android'
with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if profile=='iphone' else p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
 context=browser.new_context(**p.devices['iPhone 13' if profile=='iphone' else 'Pixel 7'])
 context.add_init_script("sessionStorage.setItem('ames_intro_seen','1');Object.defineProperty(navigator,'deviceMemory',{get:()=>4});")
 context.route('**/api/chats',lambda r:r.fulfill(status=200,content_type='application/json',body='[]'))
 context.route('**/*fontshare.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
 page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 try:
  page.goto('http://127.0.0.1:3020/app',wait_until='domcontentloaded',timeout=180000)
  stage=page.locator('[data-chat-asset-id="demo-pave-solitaire"]')
  stage.locator('[data-viewer-state="ready"]').wait_for(timeout=90000)
  canvas=stage.locator('canvas[data-metal-environment=photographic][data-studio-environment=softbox-v2]');canvas.wait_for(timeout=30000);page.wait_for_timeout(1500)
  assert page.locator('[data-chat-asset-id]').count()==1
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  first=canvas.screenshot();(OUT/f'{profile}-chat.png').write_bytes(first)
  box=canvas.bounding_box();page.mouse.move(box['x']+box['width']*.3,box['y']+box['height']*.5);page.mouse.down();page.mouse.move(box['x']+box['width']*.7,box['y']+box['height']*.55,steps=15);page.mouse.up();page.wait_for_timeout(800)
  after=canvas.screenshot();assert first!=after,'Orbit must redraw';(OUT/f'{profile}-orbit.png').write_bytes(after)
  page.locator('[data-page-tab="0"]').click();page.wait_for_timeout(900)
  assert page.locator('[data-boutique-tile="dev-test-candidate-ring"]').count()==0
  page.locator('[data-boutique-tile="demo-pave-solitaire"]').click()
  detail=page.locator('[data-boutique-detail="demo-pave-solitaire"]')
  detail.locator('[data-viewer-state="ready"]').wait_for(timeout=90000)
  page.wait_for_timeout(1000);page.add_style_tag(content='nextjs-portal{display:none}')
  page.screenshot(path=str(OUT/f'{profile}-boutique.png'))
  assert not errors,errors
  (OUT/f'{profile}.json').write_text(json.dumps({'passed':True,'physicalDevice':False,'chat3D':True,'manualOrbit':True,'boutique3D':True,'oldDefaultRemoved':True,'errors':errors},indent=2))
  print('PASS',profile,flush=True)
 finally:browser.close()
