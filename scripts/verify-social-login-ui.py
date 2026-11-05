import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
c=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));assert c['origin']=='http://localhost:3012'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
 try:
  context=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  context.add_cookies([{'name':'ames_customer_session','value':'expired-fixture','url':c['origin']}])
  context.route('**/*fontshare.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(c['origin']+'/app/account?oauth=cancelled',wait_until='domcontentloaded',timeout=180000)
  google=page.get_by_role('button',name='Continue with Google',exact=True);google.wait_for(timeout=90000)
  page.get_by_text('Social sign-in was cancelled.',exact=True).wait_for()
  assert not any(x['name']=='ames_customer_session' for x in context.cookies())
  google.click();page.wait_for_url('**/workspace',timeout=90000)
  page.get_by_text('Welcome, Fixture google',exact=True).wait_for(timeout=60000)
  cookies=context.cookies();assert next(x for x in cookies if x['name']=='ames_customer_session')['httpOnly']
  assert not any(x['name']=='ames_social_login' for x in cookies)
  assert 'ames_customer_session' not in page.evaluate('document.cookie')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(Path(c['output'])/'google-workspace-mobile.png'),full_page=True)
  context.clear_cookies();page.goto(c['origin']+'/app/account?oauth=failed',wait_until='domcontentloaded',timeout=90000)
  page.get_by_text('Social sign-in could not be completed. Please try again or use email.',exact=True).wait_for(timeout=60000)
  page.get_by_role('button',name='Continue with TikTok',exact=True).click()
  page.get_by_role('button',name='Save contact email',exact=True).wait_for(timeout=90000)
  page.get_by_label('Contact email',exact=True).fill('tiktok-contact@example.invalid')
  page.get_by_label('Set an AMES password',exact=True).fill('isolated-social-fixture-password')
  page.get_by_role('button',name='Save contact email',exact=True).click()
  page.get_by_text('Contact email saved. Send a verification email below to confirm it.',exact=True).wait_for(timeout=60000)
  page.get_by_role('button',name='Send verification email',exact=True).wait_for()
  page.get_by_text('Email not verified yet',exact=False).wait_for()
  response=page.request.post(c['origin']+'/api/auctioneer/onboarding',headers={'Origin':c['origin']},data={'action':'create','details':{'businessName':'Must not be created'}})
  assert response.status==403
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(Path(c['output'])/'tiktok-contact-mobile.png'),full_page=True)
  assert not errors,errors
  print('PASS Google/TikTok simulated browser redirects, protected cookies and unverified contact completion',flush=True)
 finally:b.close()
