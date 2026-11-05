"""Live production-browser QA for the hidden AMES gemstone library.
Usage: python3 scripts/test-gemstone-browser.py http://127.0.0.1:3100 /path/to/screenshots
"""
import json
import os
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3100'
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else '/tmp/ames-gemstone-browser')
OUT.mkdir(parents=True, exist_ok=True)
ROOT = Path(__file__).resolve().parents[1]
REGISTRY = json.loads((ROOT / 'src/lib/gemstone-registry.json').read_text())
START = int(os.environ.get('AMES_STONE_OFFSET', '0'))
LIMIT = int(os.environ.get('AMES_STONE_LIMIT', str(len(REGISTRY))))
ACTIVE = REGISTRY[START:START + LIMIT]
if os.environ.get('AMES_STONE_IDS'):
    selected = set(os.environ['AMES_STONE_IDS'].split(','))
    ACTIVE = [stone for stone in REGISTRY if stone['id'] in selected]
CAPTURE = {'stone-ruby', 'stone-emerald', 'stone-tanzanite', 'stone-fancy-color-diamond', 'stone-pearl', 'stone-opal', 'stone-turquoise'}


def main():
    report = {'ready': [], 'failures': [], 'requests': [], 'screenshots': []}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
        # Deterministic quick service outage: selection must still reach real 3D.
        page.route('**/api/chats', lambda route: route.fulfill(status=503, content_type='application/json', body='{"error":"Chat service unavailable for QA"}'))
        page.route('**/api/chats/*', lambda route: route.fulfill(status=503, content_type='application/json', body='{"error":"Chat service unavailable for QA"}'))
        page.add_init_script("""
          sessionStorage.setItem('ames_intro_seen', '1');
          window.__glCreated = 0; window.__glLost = 0; window.__glCanvases = new WeakSet(); window.__glCanvasList = [];
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(type, ...args) {
            const context = original.call(this, type, ...args);
            if (context && String(type).includes('webgl') && !window.__glCanvases.has(this)) {
              window.__glCanvases.add(this); window.__glCreated++; window.__glCanvasList.push(this);
              this.addEventListener('webglcontextlost', () => { window.__glLost++; }, { once: true });
            }
            return context;
          };
        """)
        page.on('pageerror', lambda error: report['failures'].append(f'pageerror: {error}'))
        page.on('response', lambda response: report['requests'].append(response.url) if '.glb' in response.url else None)
        page.goto(BASE + '/app', wait_until='domcontentloaded', timeout=60000)
        page.locator('[data-chat-panel]').wait_for(timeout=30000)
        page.locator('[data-chat-asset-id="dev-test-candidate-ring"]').wait_for(timeout=30000)
        assert not any('.glb' in url for url in report['requests']), 'initial application load must not download a GLB'
        page.locator('[data-load-3d]').click()
        page.locator('[data-ames-engine-host][data-viewer-state="ready"]').wait_for(timeout=45000)
        page.screenshot(path=str(OUT / 'ring-desktop.png'), full_page=True)
        report['screenshots'].append('ring-desktop.png')
        assert page.locator('[data-chat-asset-id="dev-test-candidate-ring"]').get_attribute('data-chat-revision') == 'dev-test-candidate-ring:3'

        for stone in ACTIVE:
            page.get_by_label('Message SAME').fill(f"Show me {stone['name']}")
            page.get_by_label('Message SAME').press('Enter')
            page.locator(f'[data-chat-asset-id="{stone["id"]}"]').wait_for(timeout=15000)
            host = page.locator('[data-ames-engine-host]')
            host.filter(has=page.locator('canvas')).wait_for(timeout=15000)
            page.locator('[data-ames-engine-host][data-viewer-state="ready"]').wait_for(timeout=45000)
            assert host.count() == 1, f"stacked viewers on {stone['id']}"
            assert page.locator('[data-ames-engine-host] canvas').count() == 1, f"stacked canvases on {stone['id']}"
            assert host.locator('img').count() == 0, f"poster remains after 3D ready on {stone['id']}"
            assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), f"horizontal overflow on {stone['id']}"
            report['ready'].append(stone['id'])
            if stone['id'] in CAPTURE:
                name = stone['id'].removeprefix('stone-') + '-desktop.png'
                page.screenshot(path=str(OUT / name), full_page=True)
                report['screenshots'].append(name)
            page.get_by_label('Send message').wait_for(state='visible')
            page.wait_for_function("!document.querySelector('[aria-label=\\\"Send message\\\"]').disabled", timeout=20000)
            print('READY', stone['id'], flush=True)

        # Follow-ups and negation retain the last selection even when private services fail.
        current_stone_id = ACTIVE[-1]['id']
        for query in ['tell me more', 'not ruby']:
            page.get_by_label('Message SAME').fill(query)
            page.get_by_label('Message SAME').press('Enter')
            page.wait_for_timeout(400)
            assert page.locator(f'[data-chat-asset-id="{current_stone_id}"]').count() == 1
            page.wait_for_function("!document.querySelector('[aria-label=\\\"Send message\\\"]').disabled", timeout=20000)

        # Multiple stones and unsupported colours produce local clarification without switching.
        for query, expected in [('compare ruby and sapphire', 'Which would you like to display first'), ('show me a red emerald', 'I don’t have a red Emerald preview')]:
            page.get_by_label('Message SAME').fill(query)
            page.get_by_label('Message SAME').press('Enter')
            page.get_by_text(expected, exact=False).wait_for(timeout=10000)
            assert page.locator(f'[data-chat-asset-id="{current_stone_id}"]').count() == 1

        page.get_by_label('Message SAME').fill('show the ring again')
        page.get_by_label('Message SAME').press('Enter')
        page.locator('[data-chat-asset-id="dev-test-candidate-ring"]').wait_for(timeout=15000)
        assert page.locator('[data-chat-revision="dev-test-candidate-ring:3"]').count() == 1
        page.wait_for_function("!document.querySelector('[aria-label=\\\"Send message\\\"]').disabled", timeout=20000)

        # Mobile framing and the same actual stone selection path.
        page.set_viewport_size({'width': 390, 'height': 844})
        page.locator('[data-load-3d]').click()
        page.locator('[data-ames-engine-host][data-viewer-state="ready"]').wait_for(timeout=45000)
        page.screenshot(path=str(OUT / 'ring-mobile.png'), full_page=True)
        report['screenshots'].append('ring-mobile.png')
        for stone_id in ['stone-ruby', 'stone-pearl', 'stone-turquoise']:
            stone = next(item for item in REGISTRY if item['id'] == stone_id)
            page.get_by_label('Message SAME').fill(f"Show me {stone['name']}")
            page.get_by_label('Message SAME').press('Enter')
            page.locator(f'[data-chat-asset-id="{stone_id}"]').wait_for(timeout=15000)
            page.locator('[data-ames-engine-host][data-viewer-state="ready"]').wait_for(timeout=45000)
            assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
            name = stone_id.removeprefix('stone-') + '-mobile.png'
            page.screenshot(path=str(OUT / name), full_page=True)
            report['screenshots'].append(name)
            page.wait_for_function("!document.querySelector('[aria-label=\\\"Send message\\\"]').disabled", timeout=20000)

        report['webgl'] = page.evaluate('({created: window.__glCreated, lost: window.__glLost, canvases: document.querySelectorAll("canvas").length, details: window.__glCanvasList.map(c => ({connected: c.isConnected, hosted: !!c.closest("[data-ames-engine-host]"), lost: (c.getContext("webgl2") || c.getContext("webgl"))?.isContextLost()}))})')
        print('WEBGL_DIAGNOSTIC', json.dumps(report['webgl']), flush=True)
        assert report['webgl']['created'] - report['webgl']['lost'] <= 1, f"WebGL contexts leaked: {report['webgl']}"
        report['glbRequests'] = len(report['requests'])
        report['uniqueGlbRequests'] = len(set(report['requests']))
        browser.close()
    (OUT / 'browser-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({key: value for key, value in report.items() if key != 'requests'}, indent=2))
    assert len(report['ready']) == len(ACTIVE)
    assert not report['failures']


if __name__ == '__main__':
    main()
