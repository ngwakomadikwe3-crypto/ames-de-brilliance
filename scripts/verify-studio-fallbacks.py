"""Fault injection against the local preview. Does not modify customer data."""
import json,sys,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
os.environ['PW_TEST_SCREENSHOT_NO_FONTS_READY']='1'
profile=sys.argv[1] if len(sys.argv)>1 else 'android'
OUT=Path(__file__).resolve().parents[1]/'docs/qa/physical-studio';OUT.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if profile=='iphone' else p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
 for failure in (sys.argv[2].split(',') if len(sys.argv)>2 else ['hdr-missing','hdr-corrupt','model-missing','shader']):
  context=browser.new_context(**p.devices['iPhone 13' if profile=='iphone' else 'Pixel 7'])
  context.route('**/*fontshare.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
  if failure.startswith('hdr'):
   context.route('**/jewellery-studio-v3.hdr',lambda r:r.fulfill(status=200 if failure=='hdr-corrupt' else 503,content_type='application/octet-stream',body='not an HDR image'))
  if failure=='model-missing':context.route('**/stone-ruby/web/jewelry.glb',lambda r:r.fulfill(status=404,body='missing model'))
  if failure=='shader':context.add_init_script("""const original=WebGL2RenderingContext.prototype.shaderSource;WebGL2RenderingContext.prototype.shaderSource=function(shader,source){return original.call(this,shader,source.includes('amesTrace')?source+'\\nFORCED_QA_SHADER_FAILURE':source)};""")
  page=context.new_page()
  page.goto('http://127.0.0.1:3020/dev/gemstone-review?stone=ruby',wait_until='domcontentloaded',timeout=180000)
  host=page.locator('[data-ames-engine-host]')
  expect(host).to_have_attribute('data-viewer-state','fallback',timeout=90000)
  expect(host.locator('img')).to_be_visible();expect(host.locator('canvas')).to_have_count(0)
  expect(host.get_by_role('status')).to_contain_text('Showing the still preview.')
  if failure.startswith('hdr'):expect(host.get_by_role('status')).to_contain_text('Studio lighting could not load.')
  if failure=='hdr-missing':
   context.unroute('**/jewellery-studio-v3.hdr');host.get_by_role('button',name='Retry 3D').click()
   expect(host).to_have_attribute('data-viewer-state','ready',timeout=90000)
   expect(host.locator('canvas')).to_have_attribute('data-studio-environment','hdr-pmrem')
  else:
   page.add_style_tag(content='nextjs-portal{display:none}')
   page.screenshot(path=str(OUT/(profile+'-'+failure+'.png')))
  results.append({'failure':failure,'poster':True,'clearError':True,'bareCanvas':False,'retry':failure=='hdr-missing'})
  print('PASS',profile,failure,flush=True);context.close()
 browser.close()
(OUT/(profile+'-fallbacks.json')).write_text(json.dumps(results,indent=2))
