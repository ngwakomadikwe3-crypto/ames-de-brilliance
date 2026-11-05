"""Mobile UI with isolated feed/account fixtures; never posts to real accounts."""
import json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
os.environ['PW_TEST_SCREENSHOT_NO_FONTS_READY']='1'
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/qa/community-fyp';OUT.mkdir(parents=True,exist_ok=True)
profile=sys.argv[1] if len(sys.argv)>1 else 'android'
records=[]
for i,tag in enumerate(['hiphop','luxury','women','genz','men']):
 records.append(dict(key='qa:'+tag,id=tag,assetId='demo-pave-solitaire',name=tag.title()+' jewellery',category='ring',mediaUrl='/ames-engine/dev-test-earring-001/motion/turntable-360.mp4',poster='',mediaType='video',searchTerms=[tag.title()+' jewellery','#'+tag],aspectRatio=1,publicationStatus='published',visualApproval='approved',approvalState='approved',product={'assetId':'demo-pave-solitaire','name':'Solitaire','category':'ring'},buyable=False))
records.append({**records[0],'key':'qa:image','mediaType':'image'})
with sync_playwright() as p:
 browser=p.webkit.launch(headless=True) if profile=='iphone' else p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
 context=browser.new_context(**p.devices['iPhone 13' if profile=='iphone' else 'Pixel 7'],reduced_motion='reduce')
 context.add_init_script("sessionStorage.setItem('ames_intro_seen','1')")
 context.route('**/api/chats',lambda r:r.fulfill(status=200,content_type='application/json',body='[]'))
 context.route('**/*fontshare.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
 context.route('**/api/media/feed',lambda r:r.fulfill(status=200,content_type='application/json',body=json.dumps({'records':records})))
 mode=['error'];comments={};posted=[]
 def community(r):
  from urllib.parse import urlparse,parse_qs
  if mode[0]=='error':
   r.fulfill(status=502,content_type='text/html',body='<!DOCTYPE html><html>Proxy unavailable</html>');return
  if r.request.method=='POST':
   body=r.request.post_data_json;key=body['key'];posted.append(body)
   assert mode[0]=='account'
   if body['action']=='comment':comments.setdefault(key,[]).append({'id':'qa-comment','author':'QA customer','text':body['text'],'createdAt':'2026-11-04T10:00:00Z','own':True})
   if body['action']=='delete':comments[key]=[]
   r.fulfill(status=200,content_type='application/json',body='{"ok":true}');return
  key=parse_qs(urlparse(r.request.url).query)['key'][0];rows=comments.get(key,[])
  r.fulfill(status=200,content_type='application/json',body=json.dumps({'authenticated':mode[0]=='account','liked':False,'saved':False,'likes':0,'commentCount':len(rows),'comments':rows,'next':None}))
 context.route('**/api/media/community*',community)
 page=context.new_page();errors=[];development=[]
 page.on('pageerror',lambda e:(development if '/__nextjs_original-stack-frames' in str(e) else errors).append(str(e)))
 try:
  page.goto('http://127.0.0.1:3020/app?media',wait_until='domcontentloaded',timeout=180000)
  panel=page.locator('[data-media-panel]');group=panel.get_by_role('group',name='Video interests')
  group.wait_for(timeout=90000);expect(panel.locator('[data-media-item]')).to_have_count(5)
  tab=page.locator('[data-page-tab="2"]').bounding_box();buttons=group.bounding_box()
  assert buttons['y']>=tab['y']+tab['height']+8,'Interest buttons must clear navigation'
  for label,tag in [('Hip Hop','hiphop'),('Luxury','luxury'),('Women','women'),('Gen Z','genz'),('Men','men')]:
   group.get_by_role('button',name=label,exact=True).click()
   expect(panel.locator('[data-media-item]')).to_have_count(1)
   expect(panel.locator('[data-media-item]')).to_have_attribute('data-media-item','qa:'+tag)
  panel.get_by_label('Search videos').fill('missing');expect(panel.locator('[data-media-item]')).to_have_count(0)
  panel.get_by_label('Search videos').fill('');group.get_by_role('button',name='For You',exact=True).click()
  expect(panel.locator('[data-media-item]')).to_have_count(5)
  panel.locator('[data-media-item]').first.get_by_role('button',name='Comment',exact=True).click()
  dialog=page.get_by_role('dialog');expect(dialog.get_by_role('alert')).to_contain_text('temporarily unavailable')
  assert 'DOCTYPE' not in dialog.inner_text() and 'Unexpected token' not in dialog.inner_text()
  mode[0]='guest';dialog.get_by_role('button',name='Try again').click();expect(dialog.get_by_role('link',name='Sign in to comment')).to_be_visible()
  expect(dialog.get_by_label('Add a comment')).to_have_count(0)
  dialog.get_by_role('button',name='Close comments').click();mode[0]='account'
  panel.locator('[data-media-item]').first.get_by_role('button',name='Comment',exact=True).click()
  dialog.get_by_label('Add a comment').fill('I love this piece');dialog.get_by_role('button',name='Post',exact=True).click()
  expect(dialog.get_by_text('I love this piece',exact=True)).to_be_visible()
  assert panel.locator('video').evaluate_all('(vs)=>vs.every(v=>v.paused)')
  page.add_style_tag(content='nextjs-portal{display:none}')
  page.screenshot(path=str(OUT/f'{profile}-comments.png'))
  dialog.get_by_role('button',name='Delete comment').click();expect(dialog.get_by_text('No comments yet.')).to_be_visible()
  dialog.get_by_role('button',name='Close comments').click()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(OUT/f'{profile}-fyp.png'))
  page.locator('[data-page-tab="0"]').click()
  page.locator('[data-boutique-tile="demo-pave-solitaire"]').click()
  detail=page.locator('[data-boutique-detail="demo-pave-solitaire"]')
  detail.get_by_role('button',name='Comments on',exact=False).click()
  dialog.get_by_label('Add a comment').fill('My preferred ring');dialog.get_by_role('button',name='Post',exact=True).click()
  expect(dialog.get_by_text('My preferred ring',exact=True)).to_be_visible()
  assert posted[-1]['key']=='piece:demo-pave-solitaire'
  assert not comments.get('qa:hiphop')
  assert not errors,errors
  (OUT/f'{profile}.json').write_text(json.dumps({'passed':True,'physicalDevice':False,'data':'isolated feed and account fixtures; no real writes','checks':['videos only','all six interest buttons','search and category intersection','HTML error recovery','guest sign-in','post and delete','video pauses for comments','piece-specific discussion','no horizontal overflow'],'errors':errors,'developmentDiagnostics':development},indent=2))
  print('PASS',profile,flush=True)
 finally:browser.close()
