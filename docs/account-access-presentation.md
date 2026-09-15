# Account access and profile presentation

## Focused presentation changes

Favorites now uses a centered status panel with "Loading your collection..." and "Bringing your saved pieces together." The title is clamp(1.4rem, 2.2vw, 1.8rem). The final heading is "Your collection", in title case with Geist Sans, weight 500 and tight tracking. Scoped Account/Favorites rules override the old low-weight heading styling and remove the spaced kicker treatment. Other app surfaces and login styling retain their existing rules.

Account has a direct Account title, profile name, private photo controls and access-qualified dashboard links. Focus indicators, status announcements and responsive controls are included. Story Engine remains unbuilt; see story-engine-principles.md.

## Access findings

- Server session identity already re-fetches Appwrite Account and requires the exact amesadmin label. No admin email allowlist exists.
- The client previously awaited session and catalog in one Promise.all before retaining identity. A catalog failure could therefore hide valid dashboard links. Session and catalog now load independently, and session/access refresh when the window regains focus.
- Admin SSR collapsed missing-session errors into generic service-unavailable output. Admin denial now distinguishes sign-in required from a signed-in account lacking access.
- Jeweller verification previously returned one generic denial. One shared access resolver now distinguishes missing login, absent application, APPLIED, UNDER_REVIEW, REJECTED, SUSPENDED and not verified. It still requires exactly one linked VERIFIED application, with no admin bypass.
- Existing Chat/Video dashboard links still use server-derived account identity and the same jeweller verification helper. Account now also exposes dashboard links only from authenticated access results.
- A read-only request to the configured live origin https://ames-de-brilliance.vercel.app returned "Admin service unavailable" at /admin and the older "Jeweller portal" sign-in screen. Those responses differ from the local dashboard implementation. No live session was connected to the available browser tool, and the owner's sign-in email was not supplied during implementation. The owner's actual account labels/linkage remain unconfirmed; no role changes were made.
- Local commits do not change the live site. This task explicitly prohibits push/deployment, so live rollout remains separate.

## Manual Appwrite checks

1. Use the exact AMES sign-in account in the existing Appwrite project. Confirm the user is enabled and the associated user_profiles accountState is not disabled.
2. For admin, add/check the exact case-sensitive label amesadmin in Appwrite Auth > Users > the account > Labels. No email substitution, wildcard or differently cased label grants access. Sign out and sign back in on the same AMES origin to refresh the browser session/navigation; labels are also rechecked server-side.
3. For jeweller access, find the existing JEWELLER_APPLICATION row in jeweller_sources. Its userId, if present, must equal the authenticated Appwrite user ID. An existing incorrect userId takes precedence over matching email and must be corrected only after ownership verification. Older rows without userId use the original application email case-insensitively. Exactly one application must match.
4. verificationStatus must be VERIFIED through the existing admin review workflow. Admin status alone is insufficient. Do not create duplicate applications or mark an unreviewed application verified to bypass review.
5. Confirm AMES_APP_ORIGIN matches the actual site origin. HTTPS uses the HttpOnly Secure __Host-ames_customer cookie; local HTTP uses ames_customer. Cookies and sessions do not transfer between production/preview/local hostnames. No cookie or session secret should be copied into client code.

## Profile photo architecture

Uses existing user_profiles JSON payload and private media Storage. No new collection, index, environment variable or attribute. POST/GET/DELETE /api/customer/profile-photo derive the profile solely from the authenticated session. Guests are denied. Write origin checks remain active.

POST accepts one JPG/JPEG, PNG or WebP image up to 2 MiB. Extension, declared MIME and detected file signature must agree. The server generates an ownership-marked private filename and stores only reference/metadata in profile.photo (fileId, bucketId, filename/type/size, uploader/date).

GET streams only the authenticated user's referenced photo, with private no-store and nosniff. There is no public photo URL or endpoint accepting another user's ID. Replacing uploads first, saves the new reference, then deletes the previous owned image when safe. A failed profile save leaves the previous reference intact and attempts cleanup of the new upload. Deleting removes the reference first, restores initials and deletes the old owned file. Cleanup rechecks the current reference, uploader, private file permissions and server-generated ownership filename. Unsafe/failed cleanup leaves a private orphan and returns cleanupPending; it does not delete unverified files. Existing preferences/guest-merge writes preserve the photo field.

Keep media enabled with file security, empty public bucket/file permissions, JPEG/PNG/WebP extensions allowed and a size cap at least 2 MiB. The existing server key needs its existing file read/write permissions for upload and deletion. No live Appwrite settings were modified.

## Validation

The full test suite includes profile upload/replacement/deletion, stale/new-file cleanup, cross-user denial, invalid files/size, preserved preferences, exact admin labels and each portal denial state. The production browser fixture checks visible loading size/title case, every denial screen, fresh admin login, qualified links even when catalog fails, SDK-backed photo lifecycle/old-file deletion and mobile layout. All fixture data is local and isolated, not live inventory/accounts.

Production build passed. Full tests: 90/90 passed. The production SDK/browser fixture passed all checks with no browser errors; loading and photo screenshots were visually reviewed. git diff --check passed. Nothing pushed or deployed.

## Files

- src/app/account/page.tsx
- src/app/favorites/page.tsx
- src/app/globals.css
- src/app/admin/page.tsx
- src/app/jewellers/portal/page.tsx
- src/components/CustomerState.tsx
- src/components/ProfilePhoto.tsx
- src/lib/customer/appwrite.mjs
- src/lib/customer/jeweller-service.mjs
- src/lib/customer/service.mjs
- src/lib/customer/profile-photo.mjs
- tests/account-presentation.test.mjs
- tests/appwrite-fixture.mjs
- scripts/verify-account-presentation.mjs
- docs/account-access-presentation.md
- docs/story-engine-principles.md
