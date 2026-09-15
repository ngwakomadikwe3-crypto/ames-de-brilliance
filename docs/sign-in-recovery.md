# AMES sign-in recovery and password visibility

## Confirmed root cause

The login/register handler called `identity(req)` before checking new credentials. If the browser retained an expired, revoked or invalid Appwrite session cookie, identity threw HTTP 401 "Session expired". The handler stopped before `gateway.login(email, password)`, leaving the user unable to recover by signing in again.

Evidence collected before the fix:

- Local reproduction with valid fixture credentials and an expired cookie: HTTP 401, "Session expired", credentialValidationReached=false.
- Configured deployed origin https://ames-de-brilliance.vercel.app, anonymous diagnostic using a random nonexistent account: HTTP 401, "Invalid credentials".
- Same deployed endpoint with a deliberately stale session cookie: HTTP 401, "Session expired".
- Direct Appwrite check with the configured local server key and a random nonexistent account: HTTP 401 / user_invalid_credentials, not a missing-permission error.

These checks confirm a deployed stale-cookie failure. They do not establish whether the owner's particular password is correct or whether the owner also has another issue on a different hostname. No owner password/session was accessed, and no real account was created for diagnostics.

## Complete flow and fix

1. `/login` contains both Sign in and Create account modes; there is no separate active registration page or confirm-password field.
2. The form sends email/password JSON using customerRequest to `/api/customer/login` or `/api/customer/register`, with same-origin credentials.
3. The API catch-all builds the existing Appwrite gateway. Proxy policy delegates customer routes to this handler.
4. The service validates the exact configured Origin, input and persistent rate limits. It reads only the independently signed guest cookie for guest-data migration; a previous account session is not required for a fresh credential exchange.
5. Registration still calls Appwrite Account.create. Both modes still create an Appwrite email/password session through the existing server helper.
6. The new session secret and expiry are validated. The service resolves the new account, enforces enabled account/profile status and initializes the existing profile if needed. A failure in that validation revokes the newly created session where possible and returns no auth cookie.
7. Success sets the fresh HttpOnly, SameSite=Lax cookie with Path=/, capped expiry and Secure on HTTPS, and clears the guest cookie. The browser redirects to `/app`; customer session state resolves the account and existing roles.
8. Logout still deletes the current Appwrite session and clears the account/guest cookies. Expired-session logout remains recoverable.

Email whitespace/case is normalized before sending to Appwrite. Password characters are never trimmed or transformed. Wrong password and nonexistent account return the same clear message: "Email or password is incorrect. Check your details and try again." This avoids exposing which emails are registered. Recognized Appwrite scope/project configuration errors remain service errors rather than misleading password errors.

Exact amesadmin label and separately linked VERIFIED jeweller requirements are unchanged. No authentication provider, database or role model change.

## Password toggle

The shared form defaults to a password input. A visible Show password / Hide password button uses type=button, aria-controls, aria-pressed and keyboard focus styling. Fixed reserved width prevents input/layout movement. Switching modes clears the password and resets visibility to hidden. Existing autocomplete semantics remain current-password/new-password. No password is logged or persisted in browser storage. Validation screenshots show masked inputs only.

## Configuration

No Appwrite or Vercel configuration change was identified as necessary for this reproduced bug. The local required configuration validates, the configured deployment accepts its configured Origin, and the local Appwrite server key reaches credential validation.

Keep APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID, ASSET_DELIVERY_SECRET and AMES_APP_ORIGIN server-only and consistent with the target environment. Existing sessions require the Appwrite server key's session creation permission; profile/rate-limit storage permissions remain necessary. AMES_APP_ORIGIN must be the exact site origin, without a path or trailing slash. Local HTTP uses ames_customer; HTTPS uses __Host-ames_customer with Secure. Do not broaden allowed origins to work around a mismatched hostname; use the correct configured environment/origin.

The fix is committed locally only. No push or deployment was performed, so the existing live deployment still needs a separately authorized rollout. A new private browser window avoids the old cookie as a temporary workaround; it does not bypass credentials or roles.

## Validation

- Production build passed.
- Full tests: 95/95 passed.
- Production browser + isolated Appwrite SDK fixture passed: stale-cookie recovery, wrong password, nonexistent account, fresh admin session, verified jeweller login, registration, /app redirect, logout revocation, both toggles, no toggle layout shift and mobile layout. No browser errors.
- Mobile Sign in and Create account screenshots visually reviewed.
- git diff --check passed.
- No live registration, owner credentials, role changes or deployment.

## Exact files

- src/app/login/page.tsx
- src/app/globals.css
- src/lib/customer/service.mjs
- tests/appwrite-fixture.mjs
- tests/sign-in-recovery.test.mjs
- scripts/verify-sign-in.mjs
- docs/sign-in-recovery.md
