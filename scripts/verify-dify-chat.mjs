import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('C:/Users/ngwak/Documents/Codex/2026-09-07/github-plugin-github-openai-curated-remote/work/ames-engine/node_modules/playwright');
const base = 'http://127.0.0.1:3100';
const browser = await chromium.launch({ headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', args:['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport:{width:390,height:844}, reducedMotion:'reduce' });
page.setDefaultTimeout(90000);
const checks=[];
try {
  const missing = await page.request.post(base+'/api/chat', {headers:{Origin:base},data:{message:'Hello'}});
  assert.equal(missing.status(),503);assert.match((await missing.json()).error,/not configured/);checks.push('real production route: missing credentials returns 503');
  const denied = await page.request.post(base+'/api/chat',{headers:{Origin:'https://untrusted.example'},data:{message:'Hello'}});
  assert.equal(denied.status(),403);checks.push('real production route: cross-origin denied');
  const requests=[];
  await page.route('**/api/chat', async route => {
    const body=route.request().postDataJSON();requests.push(body);
    if(body.message==='error')return route.fulfill({status:502,json:{error:'AMES chat is temporarily unavailable. Please try again.'}});
    const reply=body.message==='Recommend a cut'?'Here is Oval Brilliant.':'A fixture response.';
    return route.fulfill({json:{reply,conversationToken:'fixture-token-'+requests.length}});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Chat',exact:true}).click();
  await page.waitForTimeout(3000);
  const send=async text=>{await page.getByRole('textbox',{name:'Message AMES'}).fill(text);await page.getByRole('button',{name:'Send message',exact:true}).click();await page.locator('.ames-chat-wait').waitFor({state:'hidden'});};
  await send('Hello');assert.equal(requests[0].conversationToken,null);
  await send('Recommend a cut');assert.equal(requests[1].conversationToken,'fixture-token-1');
  await page.getByText('Oval Brilliant', {exact:false}).last().waitFor();
  assert.match(await page.locator('.ames-engine-stone-tray').innerText(),/Oval/);checks.push('normal response, multi-turn token, assistant-driven Oval selection');
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Chat',exact:true}).click();await page.getByText('Here is Oval Brilliant.',{exact:true}).waitFor();
  await send('Continue');assert.equal(requests[2].conversationToken,'fixture-token-2');checks.push('tab reload preserves conversation token and transcript');
  await send('Show me Asscher');assert.match(await page.locator('.ames-engine-stone-tray').innerText(),/Asscher/);checks.push('stone command still reaches chat route');
  await send('error');await page.getByText('AMES chat is temporarily unavailable. Please try again.',{exact:true}).waitFor();checks.push('explicit error displayed');
  await page.getByRole('button',{name:'Conversation options',exact:true}).click();await page.getByRole('button',{name:'New conversation',exact:true}).click();
  await send('New');assert.equal(requests.at(-1).conversationToken,null);checks.push('new conversation clears continuity');
  fs.mkdirSync('outputs/dify-audit',{recursive:true});fs.writeFileSync('outputs/dify-audit/browser.json',JSON.stringify({liveDify:false,checks},null,2));console.log(checks);
} finally {await browser.close();}
