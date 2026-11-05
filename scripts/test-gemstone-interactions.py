"""Mocked-service interaction, fallback, and stale-response QA for AMES Chat."""
import json
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3100'
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else '/tmp/ames-gemstone-interactions')
OUT.mkdir(parents=True, exist_ok=True)


def main():
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        page.add_init_script("sessionStorage.setItem('ames_intro_seen','1')")
        page.on('pageerror', lambda error: errors.append(str(error)))

        def chats(route):
            if route.request.method == 'GET':
                return route.fulfill(json=[])
            return route.fulfill(json={'id': 'test-chat', 'title': 'Private preview', 'created_at': '2026-01-01T00:00:00Z', 'updated_at': '2026-01-01T00:00:00Z'})

        def message(route):
            if route.request.method == 'GET':
                return route.fulfill(json=[])
            body = route.request.post_data_json
            return route.fulfill(json={'id': 'user-' + str(time.time_ns()), 'chat_id': 'test-chat', 'role': 'user', 'text': body['text'], 'thinking': '', 'created_at': '2026-01-01T00:00:00Z'})

        def ames(route):
            body = route.request.post_data_json
            query = body['query']
            if 'emerald' in query:
                time.sleep(1.5)
            action = next((value for phrase, value in [('zoom in', 'zoom'), ('rotate it', 'rotate'), ('show the side', 'side_view'), ('reset', 'reset')] if phrase in query), None)
            answer = 'Representative educational preview; no stock, price, carat, or certification is claimed.'
            payload = {'answer': answer, 'message': {'id': 'assistant-' + str(time.time_ns()), 'chat_id': 'test-chat', 'role': 'assistant', 'text': answer, 'thinking': '', 'created_at': '2026-01-01T00:00:00Z'}}
            if action:
                payload['viewer_action'] = action
            if query.lower().startswith('show me'):
                payload['asset_selection'] = {'assetId': body['assetId']}
            route.fulfill(json=payload)

        page.route('**/api/chats', chats)
        page.route('**/api/chats/**', message)
        page.route('**/api/ames', ames)
        page.goto(BASE + '/app', wait_until='domcontentloaded')
        page.locator('[data-chat-asset-id="dev-test-candidate-ring"]').wait_for(timeout=30000)

        def send(query, ready_id=None):
            before = page.locator('[data-chat-message="assistant"]').count()
            page.get_by_label('Message SAME').fill(query)
            page.get_by_label('Message SAME').press('Enter')
            if ready_id:
                page.locator(f'[data-chat-asset-id="{ready_id}"]').wait_for(timeout=15000)
                page.locator('[data-panel="1"] [data-ames-engine-host][data-viewer-state="ready"]').wait_for(timeout=45000)
            page.wait_for_function("count => document.querySelectorAll('[data-chat-message=\\\"assistant\\\"]').length > count", arg=before, timeout=20000)

        send('Show me a ruby', 'stone-ruby')
        send('tell me more')
        assert page.locator('[data-chat-asset-id="stone-ruby"]').count() == 1
        base_zoom = float(page.locator('[data-panel="1"] [data-ames-engine-host]').get_attribute('data-zoom'))
        send('zoom in')
        page.wait_for_function("expected => Math.abs(Number(document.querySelector('[data-panel=\"1\"] [data-ames-engine-host]')?.dataset.zoom) - expected) < 0.0001", arg=base_zoom * 1.1)
        assert page.locator('[data-chat-asset-id="stone-ruby"]').count() == 1
        send('show the side')
        page.wait_for_function("document.querySelector('[data-panel=\"1\"] [data-ames-engine-host]')?.dataset.cameraPreset === 'side'")
        send('rotate it')
        page.wait_for_function("document.querySelector('[data-panel=\"1\"] [data-ames-engine-host]')?.dataset.turntableEnabled === 'true'")
        send('reset')
        page.wait_for_function("document.querySelector('[data-panel=\"1\"] [data-ames-engine-host]')?.dataset.cameraPreset === 'three_quarter'")
        page.wait_for_function("expected => Math.abs(Number(document.querySelector('[data-panel=\"1\"] [data-ames-engine-host]')?.dataset.zoom) - expected) < 0.0001", arg=base_zoom)
        page.wait_for_function("document.querySelector('[data-panel=\"1\"] [data-ames-engine-host]')?.dataset.turntableEnabled === 'false'")

        # An older delayed selection and camera action must not override a newer Boutique choice.
        page.get_by_label('Message SAME').fill('Show me emerald')
        page.get_by_label('Message SAME').press('Enter')
        page.locator('[data-chat-asset-id="stone-emerald"]').wait_for(timeout=15000)
        page.locator('[data-page-tab="0"]').click()
        page.locator('[data-boutique-tile="dev-test-candidate-ring"]').click()
        page.locator('[data-boutique-detail]').get_by_text('Ask SAME', exact=True).click()
        page.locator('[data-chat-asset-id="dev-test-candidate-ring"]').wait_for(timeout=15000)
        page.wait_for_timeout(2200)
        assert page.locator('[data-chat-asset-id="dev-test-candidate-ring"]').count() == 1
        assert page.locator('[data-chat-revision="dev-test-candidate-ring:3"]').count() == 1
        assert page.locator('[data-panel="1"] [data-ames-engine-host]').get_attribute('data-camera-preset') != 'side'

        assert not errors, errors
        # A failed GLB uses the transparent poster only as a labelled error fallback; retry restores real 3D.
        page.route('**/stone-ruby/web/jewelry.glb*', lambda route: route.abort())
        page.get_by_label('Message SAME').fill('Show me a ruby')
        page.get_by_label('Message SAME').press('Enter')
        page.locator('[data-chat-asset-id="stone-ruby"]').wait_for(timeout=15000)
        page.locator('[data-panel="1"] [data-ames-engine-host][data-viewer-state="fallback"]').wait_for(timeout=45000)
        page.get_by_text('Still preview · 3D unavailable', exact=False).wait_for()
        assert page.locator('[data-panel="1"] [data-ames-engine-host] img[src$="poster.webp"]').count() == 1
        page.unroute('**/stone-ruby/web/jewelry.glb*')
        page.get_by_text('Retry 3D', exact=True).click()
        page.locator('[data-panel="1"] [data-ames-engine-host][data-viewer-state="ready"]').wait_for(timeout=45000)
        assert page.locator('[data-panel="1"] [data-ames-engine-host] img').count() == 0
        assert all('Failed to fetch' in error for error in errors), errors
        print('PASS: follow-up persistence, zoom, side, rotate, reset, stale-response guard, labelled failure poster, and retry.')
        browser.close()


if __name__ == '__main__':
    main()
