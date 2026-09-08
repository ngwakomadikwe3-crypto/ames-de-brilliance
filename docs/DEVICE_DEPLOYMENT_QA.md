# Device and deployment QA — 2026-09-08

Verdict: **NOT_READY_FOR_DEPLOYMENT**. The deployment target is Vercel + Appwrite only. No remote infrastructure, credentials, domain or production data was created or changed.

## Evidence and corrections

| Expected | Actual before correction | First broken layer | Correction and retest |
| --- | --- | --- | --- |
| Cursor keys edit Chat text | ArrowLeft navigated to Boutique at 390 and 1280 px | Global keyboard listener | Ignore editable targets/modifiers; real Chrome and WebKit retests pass |
| Orientation retains selected screen | Chat became Boutique at phone size and Video at desktop resize | Scroll position divided by new viewport width | Preserve panel during resize; real Chrome/WebKit pass |
| Fullscreen app has no root scroll | WebKit root `scrollX=4`, Chat left=-4 px, body height 905 px at 844 px viewport | Site header/root document surrounding app | Fullscreen scroll container; hide site header on app; root becomes 390×844 at x=0; WebKit pass |
| Landscape controls remain accessible | Screenshot showed clipped tray/composer | Fixed-height tray CSS won over host responsive rule; Chat overflow hidden | More-specific host stage rule and short-screen vertical scroll; composer reachability tested |
| Native select labels remain readable | WebKit rendered light native fields with inherited light text | Missing native control color scheme | Host `color-scheme:dark`; screenshot confirms readable native select |
| Production auth fails closed | Known fallback secret/codes; no server timestamp validation | Legacy staff session policy | Removed default secret, disabled production fallback codes, timing-safe signature verification, 8-hour expiry, future-time rejection and Secure production cookie; unit and real HTTP tests pass |
| Production reads do not create public-write resources | `ensureReady` provisioned collections/buckets with public writes | Legacy Appwrite bootstrap | Production auto-provisioning disabled; explicit dev opt-in and private defaults. Existing remote resources were not migrated |
| Missing chat backend is a controlled error | Null `listDocuments` exception in Next logs | `/api/chats` database boundary | Redacted 503/no-store; real HTTP test passes |

## Device and flow coverage

No accessible physical Android/iPhone or ADB executable was detected. Chrome tests use desktop hardware with touch/viewport emulation (360, 375, 390, 412, 430 px), plus 1280 px desktop. WebKit 26 was installed locally and tested at 390×844 and 844×390. WebKit on Windows is not iOS Safari; native keyboards, thermal behavior, OS backgrounding and device video decoding remain uncertified.

The unmocked `/app` run uses the actual local Next production endpoints. It verifies one Chat canvas, explicit `show stone-002`, repeated switching across all five cuts, pointer/touch rotation, pinch zoom without app navigation, reset, repeated panel changes, orientation and recovery after offline asset failure. It deliberately reports failures for absent Chat save controls, empty engine Boutique catalog, no published videos and health readiness 503. It does not fabricate authenticated users or claim AI-context/persistence acceptance.

The existing separate Engine fixture suite verifies the earlier generated ring through the Boutique adapter, material selection, favorite/compare callbacks, denied/unavailable access without protected fetch and viewer disposal. These are adapter checks; they do not prove app catalog ingestion, durable favorites, secure delivery or five production jewelry categories.

Video fixture tests use two records pointing to the existing local intro movie, with no live records written. Vertical touch swipe advances one video, horizontal swipe returns to Chat, only the active video plays, and leaving pauses both. Synthetic `visibilitychange` checks pause/resume; no physical OS lifecycle claim. Five cycles retained two paused video elements with approximately 7.1–7.4 MB post-GC JS heap; decoder/GPU memory is unavailable. The existing playback probe measured 48 frames in two seconds with no dropped frames. Failed intro recovered in approximately 1.47 seconds.

Splash screenshots show the actual movie filling the viewport. The transition measurement is approximately 0.56 seconds. Sampled screenshots do not establish frame-by-frame absence of flashes on physical devices. Recorded cumulative layout shift is nonzero (approximately 0.03–0.05 across the scripted run), so zero layout shift is not certified.

## Performance and limits

Reports retain cold and warm observations. Final isolated real-app RAF throughput was about 60 FPS / 16.67 ms in both viewport runs. First paint was 1.324 s at 390 px and 0.456 s at 1280 px; intro readiness 2.390 s and 0.378 s; initial Stone Tray mount 2.468 s and 0.407 s. JS heap was 13.4–14.4 MB, cumulative resource encoded-body sizes about 3.40 MB, and the throttled stone switch 305–326 ms (250 ms injected latency). These are local-host measurements, not network/device service levels. This is browser frame cadence, not GPU time. Earlier concurrent cold-host runs recorded 53 FPS and a 2.8–3.0 second main-thread task during initial viewer mount; the final cold long task was 2.295 s. No speculative renderer change was made. Startup responsiveness needs isolated physical-device profiling.

Engine adapter metrics measured 1 draw / 590 triangles for the round stone and 31 draws / 14,526 triangles for the existing generated ring. Most settled samples were 58–60 FPS; the first cold phone sample was 39.7 FPS. This does not certify photorealism or a universal minimum FPS. Network/resource timing, JS heap, long tasks, paints, intro readiness, GLB load and slow-network timing are retained in the JSON reports; GPU and decoder memory are not available.

## Reproduce and interpret

App checkout: `C:/Users/ngwak/ames-de-brilliance`. Engine checkout: `C:/Users/ngwak/Documents/Codex/2026-09-07/github-plugin-github-openai-curated-remote/work/ames-engine`.

Run the app production server at 127.0.0.1:3080 and the engine QA host at 127.0.0.1:4180. Use an isolated local/staging environment with no production credentials. Engine scripts: `validate-device-readiness.mjs`, `validate-webkit-readiness.mjs`, `validate-video-device.mjs`, `validate-app-launch.mjs`, `validate-launch.mjs`, `validate-launch-resilience.mjs`. The real readiness script intentionally exits nonzero for missing product gates; do not suppress that exit for promotion.

Reports: engine-relative `../../outputs/device-readiness/` (`real-app-before.json`, `real-app-report.json`, `webkit-report.json`, `video-device-report.json`, screenshots) and `../../outputs/launch-readiness/` (five-width smoke, adapter performance and resilience). Test fixtures are explicitly labeled separately from unmocked runs.

App checks: `npm test`, `npm run validate:session`, `npm run validate:deployment`, `npm run build`. Full engine suite: `node node_modules/vitest/vitest.mjs run --pool=threads --maxWorkers=2` — 132 tests/32 files pass. Three additional session-policy tests and real local HTTP security checks pass. Engine app/standalone/package smoke build passes; Next production build passes with the existing middleware deprecation warning. All 87 protected file hashes remain unchanged. Client artifact scan finds no server-secret identifiers in 24 JS chunks; this is not a full security certification. Six public GLB files consist of five canonical stones plus the pre-existing Chat diamond, not protected jewelry.

## Remaining launch gates

Appwrite customer auth/accounts, ownership checks across administrative SDK routes, favorites/saved assets/design persistence, entitlement/subscription state and file-token delivery remain unwired. No Appwrite credentials or live connectivity were supplied/tested. There is no approved engine jewelry catalog or published Video content in this local backend. Canonical renderer photorealism and physical-device acceptance remain open. Follow [APPWRITE_MVP_DEPLOYMENT.md](./APPWRITE_MVP_DEPLOYMENT.md); configuration documents do not resolve these implementation gaps.

The intervening backend, multi-category generator and renderer-acceptance requests were superseded before completion. The generator has unfinished local spec/script edits but no new exported assets; it has not been repackaged into the app. No renderer verdict or category-general generator claim is inferred from this device milestone. Stop here; do not deploy this release as a secure MVP.
