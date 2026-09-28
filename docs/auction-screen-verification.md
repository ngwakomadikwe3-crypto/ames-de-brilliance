# Auction fourth screen

The app previously contained three screens. Auction is appended as panel 3; panel labels, native scroll range, dot controls, keyboard navigation, desktop edge arrows, and strip width now support four screens.

The new screen uses AMES's existing emerald silk, Geist font variable, cool-white text, and translucent catalogue cards. The Botswana Auction Room screenshot could not be located; the user did not know its path. The layout follows the supplied editorial/catalogue description, without claiming an exact screenshot match.

## Content and identity

The catalogue reuses the validated Boutique index and contracts. It displays the actual pack poster and preserves each asset/revision through Boutique and SAME handoffs:

| Asset | Revision | Display name |
| --- | --- | --- |
| dev-test-candidate-ring | 2 | Solitaire ring |
| dev-test-solitaire-mount | 1 | Solitaire ring mount |
| dev-test-earring-001 | 1 | Chandelier earring mount |
| dev-test-pendant-001 | 1 | Pendant mount |

No auction schedule is supplied by the current data, so the screen explicitly says **No auction scheduled** and identifies these as catalogue previews, not scheduled lots. No bids, bidder counts, dates, prices, provenance, partnerships, payment controls, or transactional endpoints were added. Review status comes from the existing contracts.

## Changed files

- `src/app/app/page.tsx`: fourth-panel wiring and navigation bounds; existing panel implementations unchanged.
- `src/components/EngineAuctionPanel.tsx`: new read-only catalogue, loading/error/empty states, and asset handoff buttons.
- `scripts/test-auction-browser.mjs`: desktop Chrome and WebKit iPhone navigation, real catalogue identity, poster, Boutique and Chat URL/revision checks, and candidate SAFE readiness.
- `docs/auction-screen-verification.md`: this report.

## Verification

- 17 existing unit tests pass: Chat 9, Boutique 4, Media 4.
- Production build passes, including TypeScript. Existing middleware/proxy deprecation warning remains.
- Auction browser checks pass on Chrome desktop (1440 x 1000) and WebKit iPhone 13 emulation: all four assets hand off to the correct Boutique item and Chat identity/revision/GLB. Candidate SAFE canvas becomes ready without interaction. Existing other assets retain ModelViewer.
- Fourth-dot, desktop edge-arrow, keyboard, and native horizontal scroll navigation pass; Media still renders its catalogue. Native scroll is tested programmatically; physical-device touch gestures were not tested.
- No page errors in the completed Auction browser runs.
- Existing WebKit SAFE command regression passes: all six commands, idle demand rendering, orbit/drag pause and resume, zoom, reset, Hero/Macro, and compact viewport framing.
- New component lint: zero errors; one `no-img-element` optimization advisory for the existing pack poster images.
- React review: stable asset keys, guarded asynchronous state updates after unmount, accessible button names/headings, no new viewer instances or transaction state.
- Original Boutique, ChatVisualStage, Media, both viewer components, global design CSS, and inline Chat implementation match HEAD. The only change within the existing app page is navigation/wiring.
- `git diff --check` passes. Pre-existing dependency changes, staged asset deletions, and unrelated untracked files remain untouched.

The initial browser assertions used HTML attributes for ModelViewer's source. React assigns its custom-element `src` property after registration, so the test was corrected to inspect that property; no viewer changes were needed.

## Screenshots and evidence

Saved under `C:/Users/ngwak/AppData/Local/Temp/ames-auction-qa/`:

- `auction-desktop.png`
- `auction-mobile.png`
- `auction-boutique-desktop.png`
- `auction-boutique-mobile-safe.png`
- `results.json`

Browser Chat history is mocked to avoid persistence writes. No bids/payments, commit, or deployment occurred.
