import json,sys,os,time
from pathlib import Path
from playwright.sync_api import sync_playwright
os.environ['PW_TEST_SCREENSHOT_NO_FONTS_READY']='1'
profile=sys.argv[1] if len(sys.argv)>1 else 'android'
ids=sys.argv[2].split(',') if len(sys.argv)>2 else ['diamond','ruby','morganite']
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'docs/qa/physical-studio';out.mkdir(parents=True,exist_ok=True)
version=json.loads((ROOT/'node_modules/ames-engine/package.json').read_text())['version']
report={'passed':False,'engineVersion':version,'results':[],'errors':[]}
reportPath=out/(profile+'-results.json');reportPath.write_text(json.dumps(report,indent=2))
with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if profile=='iphone' else p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
 context=browser.new_context(**p.devices['iPhone 13' if profile=='iphone' else 'Pixel 7'])
 context.add_init_script("sessionStorage.setItem('ames_intro_seen','1')")
 context.route('**/*fontshare.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
 context.route('**/api/chats',lambda r:r.fulfill(status=200,content_type='application/json',body='[]'))
 errors=[];results=[]
 for sid in ids:
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)+' '+str(e.stack)))
  page.on('console',lambda e:errors.append(e.text) if e.type=='error' and any(t in e.text for t in ['shader','Shader','WebGLProgram']) else None)
  path='/app' if sid=='solitaire' else '/dev/gemstone-review?stone='+sid
  page.goto('http://127.0.0.1:3020'+path,wait_until='domcontentloaded',timeout=180000)
  host=page.locator('[data-ames-engine-host]').first
  page.locator('[data-viewer-state="ready"],[data-viewer-state="fallback"]').first.wait_for(timeout=90000)
  print('RENDER',sid,host.inner_text(),errors,flush=True)
  page.wait_for_timeout(2500);page.add_style_tag(content='nextjs-portal{display:none}')
  page.screenshot(path=str(out/(profile+'-'+sid+'.png')))
  print('STATE',sid,host.get_attribute('data-viewer-state'),errors,flush=True)
  assert host.get_attribute('data-viewer-state')=='ready'
  canvas=host.locator('canvas');diagnostics=json.loads(canvas.get_attribute('data-gem-materials'))
  for gem in diagnostics:
   assert gem['type']=='MeshPhysicalMaterial' and gem['color']=='ffffff' and gem['roughness']==0 and gem['transmission']==1 and gem['dispersion']>0
  before=canvas.screenshot();box=canvas.bounding_box()
  page.mouse.move(box['x']+box['width']*.35,box['y']+box['height']*.5);page.mouse.down();page.mouse.move(box['x']+box['width']*.62,box['y']+box['height']*.54,steps=12);page.mouse.up();page.wait_for_timeout(700)
  after=canvas.screenshot();(out/(profile+'-'+sid+'-rotated.png')).write_bytes(after)
  assert before!=after
  results.append({'stone':sid,'physicalDevice':False,'materials':diagnostics,'orbit':True})
  report.update(results=results,errors=errors);reportPath.write_text(json.dumps(report,indent=2))
  print('PASS',profile,sid,flush=True);page.close()
 report.update(passed=not errors,results=results,errors=errors);reportPath.write_text(json.dumps(report,indent=2))
 browser.close()
 assert not errors,errors
