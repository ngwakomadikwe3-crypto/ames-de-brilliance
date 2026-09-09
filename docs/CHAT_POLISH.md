# Center Chat polish

Scope: Chat presentation, canonical selection validation and Chat renderer mounting. Approved Boutique, Video, splash, root routing and navigation behavior are unchanged.

- Preserve one canonical gemstone, existing optical shader and asset geometry. Keep the stage height steady during conversation and responsive on short screens.
- Offer the five cuts inside the existing plus menu, alongside New conversation. Keep Account/Favorites in the hamburger. Refine composer focus treatment.
- Validate restored/requested stone IDs. Gem changes preserve the cut. Invalid explicit IDs cannot enter the renderer even when paired with a valid gem name.
- Give each renderer mount its own DOM host, preventing late cleanup from removing a newer canvas during rapid switches.
- Reveal the canvas only after setup; show quiet preparation and actionable retry states. A mount without an actual model is not considered ready.

Validation: production build; 31 tests including invalid selection and gem/cut independence. Browser checks cover all five cuts, rapid conversation switching, drag/zoom, menu, mobile/desktop and short viewport, original splash, navigation, and simulated failed-asset retry. Screenshots/checks: outputs/chat-polish. Local review: http://127.0.0.1:3098/.

Optical realism remains bounded by the existing real-time renderer; this change prioritizes stability and clean presentation. No new stone geometry, optical approximation, backend behavior or asset substitution.
