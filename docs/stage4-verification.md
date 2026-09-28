# Stage 4 verification — 2026-09-28

Engine/Chat checkpoint: `1a4d6e7` (`Checkpoint verified Engine revision 2 and Chat controls, contracts, and posters`). This includes the vendored Engine, candidate revision 2, asset-aware Chat contracts/API, six Engine controls, SAFE readiness, and the Chat-specific poster. Stage 4 changes were excluded from that commit.

## Stage 4 diff

| File | Result |
| --- | --- |
| `src/app/page.tsx` | Replaces the obsolete auction/demo page with the Next.js server redirect to `/app` (HTTP 307). |
| `src/components/header.tsx` | Replaces obsolete root anchors with App/Dashboard navigation; logo links to `/app`; registration wording becomes Sign in. |
| `src/app/api/traders/route.ts` | Awaits `getAllTraders()` before serializing the response; POST preserved. |
| `src/lib/db.ts` | Removes automatic seeding on import; retains an explicitly invoked `seedDemoIfEmpty()` utility. |
| `src/app/api/stones/photo/[filename]/route.ts` | Removes the unused handler that always returned 404. Actual Appwrite photo URLs and `/api/stones/photos` upload remain intact. |
| `public/demo/ring-front.svg`, `ring-angle.svg`, `ring-worn.svg` | Removed after a repository-wide reference search returned no matches. |
| `scripts/test-stage4-preservation.mjs` | Tests import safety and deferred/empty trader results. |
| `scripts/test-stage4-browser.mjs` | Tests root navigation, Boutique, Media playback/actions/Chat handoff, header links, and the retired endpoint on Chrome desktop and WebKit mobile. |

The eight production files above total 11 insertions and 1,089 deletions. Most Stage 4 source changes were already present in the incoming working tree and were verified rather than rewritten. The SVG deletion and browser verification script complete that work. Stage 4 remains uncommitted for review.

## Results

- 27 tests pass: 3 Stage 4, 9 Chat, 4 Boutique, 4 Media, and 7 jewelry onboarding/pack checks.
- Production `npm run build` passes, including TypeScript and generation of 60 static pages. Existing middleware/proxy deprecation and test module-type warnings remain.
- Chrome desktop and Playwright WebKit iPhone 13 emulation: `/` returns 307 to `/app`; direct `/app` loads; Boutique opens the canonical ring; mobile selects SAFE; Media loads 21 records, plays video, saves a local like/comment, and hands the selected asset to Chat. Updated header destinations resolve. No page errors on the completed run.
- WebKit SAFE: all six Chat commands, idle demand rendering, orbit/drag pause and resume, zoom, reset, Hero/Macro, and compact framing pass.
- WebKit SAFE poster transitions pass at 180px and 220px: completed canvas before poster removal, no blank rendered frame, exact silhouette bounds.
- WebKit selected-asset switching passes: delayed metadata removes the old ring, GLB failure shows the selected earring poster, and failed metadata stays neutral. A concurrent run lost its browser process; the isolated rerun passed with no stale frames or page errors.
- A source comparison against the checkpoint confirms 79 protected route/viewer files are unchanged, including the trader, human-model, stone, order, report, and app routes, and both viewers.
- `git diff --check` passes.

The initial navigation test left pages while GLBs were still loading and observed canceled-load errors. Waiting for readiness at the Media-to-Chat handoff and direct `/app` navigation resolved the harness failures without runtime changes.

Browser evidence: `C:/Users/ngwak/AppData/Local/Temp/ames-stage4-qa/` (JSON and desktop/mobile screenshots). SAFE command evidence: `C:/Users/ngwak/AppData/Local/Temp/ames-chat-controls-qa/`. Poster evidence: `C:/Users/ngwak/OneDrive/Desktop/ames-engine-main/outputs/chat-poster-revision2/`.

Chat persistence/AI calls are mocked in browser tests; these checks do not submit live commercial records or verify the external AI service. Mobile checks use desktop WebKit emulation, not physical iPhone hardware.

Unrelated pre-existing dependency changes, staged legacy asset deletions, and untracked reference/instruction files remain outside the checkpoint and Stage 4 diff. No deployment occurred.
