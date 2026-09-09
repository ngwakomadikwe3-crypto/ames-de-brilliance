# Video screen polish

Video-only change on recovery/ames-visual. No deployment. Earlier uncommitted Boutique work remains separate and is excluded from the Video commit.

The screen uses a near-black surround, centered vertical film on desktop, edge-to-edge mobile presentation, AMES header, Account/Favorites menu, sound control, concise caption, and optional View piece action. Social counters, comments and share rail are removed from the visible interface. No renderer, backend, splash, Chat or Boutique implementation was changed during this task.

The existing IntersectionObserver feed selection and visibilitychange/isActive play/pause effect are preserved. Horizontal navigation uses the unchanged three-screen shell.

Validation: production build passes; 28 existing tests pass. scripts/verify-video-polish.mjs exercises active playback, menu, horizontal panel exit/return, vertical feed selection and document visibility pause/resume at mobile and desktop widths. Visibility is simulated by the browser test; physical-device background behavior remains outside this local check.

Screenshots in outputs/video-polish use a browser-intercepted two-item feed pointing to existing /intro.mp4. This is explicitly test media, not a claim of published inventory; no media asset or backend data was changed. The default local screen may show the empty published-feed state. Local review: http://127.0.0.1:3095/ then select Video.
