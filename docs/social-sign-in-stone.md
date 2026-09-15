# AMES social sign-in and stone caption

## Stone presentation

The previous caption followed the full-height canvas host, including its unused lower space. Its final line almost touched the conversation panel. Earlier CSS also reduced the label to small, low-contrast text.

The host now reserves a separate caption row with a 10px top gap and 18px separation before the conversation panel. On ordinary screens the host clips 24-40px of unused lower canvas space, bringing the caption closer to the stone without changing the renderer's stage dimensions, camera, geometry, lighting, or controls. Short screens keep the full existing 24dvh stage and use 8px/12px caption spacing. Both lines remain in document flow, below the visible host and above the conversation/composer.

Primary: **Round Brilliant**, Geist Sans 15px/500, white at .92 opacity. Secondary: **Diamond**, Geist Sans 12px/400, cool white at .66 opacity. Centered, two lines, no hyphen, uppercase transformation, tracking, badge, or glow.

## OAuth architecture

Both providers use the existing Appwrite project and account system:

1. `/login` sends a same-origin POST to `/api/customer/oauth/google` or `/api/customer/oauth/microsoft`.
2. The server calls Appwrite `Account.createOAuth2Token`. It passes its trusted configured success/failure URLs. Only the two supported provider destinations can be returned to the browser.
3. A signed, HttpOnly, SameSite=Lax cookie binds the browser to a random 10-minute attempt. HTTPS uses the `__Host-` prefix and Secure. The callback state nonce must match that cookie.
4. Appwrite handles provider authorization, identities and tokens, then redirects to the AMES callback with a single-use userId/secret pair.
5. AMES consumes the attempt atomically in existing `auth_rate_limits`, exchanges the pair with `Account.createSession`, and checks the resulting Appwrite account and profile state.
6. Shared `finishSession` writes the same existing customer cookie used by email/password, preserves existing profile/preferences/photo, and runs existing guest migration. The response redirects to `/app` with no rendered callback page, no-store and no-referrer headers.
7. Existing session and API guards read the authenticated account. Exact `amesadmin` label grants admin access; exactly one userId-linked VERIFIED application grants jeweller access. OAuth assigns neither role. Existing logout destroys the Appwrite session and clears the customer cookie.

This follows [Appwrite's SSR OAuth flow](https://appwrite.io/docs/products/auth/server-side-rendering). Provider secrets and Appwrite keys stay server-side. Callback secrets are exchanged only on the server, never put into localStorage, sessionStorage, UI, or application logs. If configuring external request logging, redact callback query parameters rather than logging their token contents. Client-supplied return URLs, roles, labels and userId linkage are not accepted.

No new collection, column, index, bucket or dependency is required. Existing `auth_rate_limits` stores attempt consumption as `kind: oauth` with payload `expiresAt`, using its existing shared schema. Existing rate limiting also covers OAuth initiation. The jeweller collections still need the separately documented live setup if not yet provisioned.

## Account linking: do not merge by email in AMES

Appwrite identities belong to one stable account. An authenticated OAuth flow can attach another provider to that account. AMES passes the existing Appwrite session for this flow and binds the callback to that user ID. It rejects a different returned user ID. To connect an existing password account, sign in with email/password, return to `/login`, and select a provider; the page explains that it will connect to the signed-in account. See [Appwrite identities](https://appwrite.io/docs/products/auth/identities).

For signed-out users, Appwrite resolves existing provider identities and same-email accounts. The current upstream implementation permits same-email linking only when the provider email is verified; conflicts fail instead of authorizing an AMES email-based merge. Google's verified email can satisfy this. Microsoft's current adapter treats the Graph email as unverified and uses userPrincipalName, which can differ from a user's usual email. Consequently, an existing password account may need the authenticated linking flow first. See [Appwrite's account controller](https://github.com/appwrite/appwrite/blob/main/app/controllers/api/account.php) and [Microsoft adapter](https://github.com/appwrite/appwrite/blob/main/src/Appwrite/Auth/OAuth2/Microsoft.php).

These upstream findings are not a claim that the live Cloud deployment version has been independently verified. Complete the live identity-linking checks below. AMES does not copy favorites or privileges between separate authenticated user IDs, change application ownership, or resolve conflicting identities by email. If the provider is already attached elsewhere, keep the existing account and resolve the identity conflict through an authorized support process.

## Exact origin and callback configuration

Retain project `6a8d93140026683be1e3`, endpoint `https://fra.cloud.appwrite.io/v1`, database `ames`. Keep `APPWRITE_API_KEY` and `ASSET_DELIVERY_SECRET` server-only. Existing SSR key needs `sessions.write` alongside the existing application read/write permissions; do not add broad admin access to client credentials.

Set the existing variable separately per environment:

| Environment | `AMES_APP_ORIGIN` |
| --- | --- |
| Local development | `http://localhost:3000` |
| Production | `https://houseofames.com` |

No trailing slash or path. Use the configured host consistently: localhost and 127.0.0.1 are different origins. No simultaneous permissive Origin allowlist was added. The prior local configuration targeted the Vercel deployment hostname; update the appropriate environment before using the requested domain. No environment file or Vercel setting was changed by this work.

In Appwrite project Platforms, register Web hostnames `localhost` and `houseofames.com`. Appwrite requires allowed platform hostnames for the application's success/failure redirects. The AMES server derives them only from `AMES_APP_ORIGIN`, never Host, forwarded-host, or caller-supplied redirects. See [Appwrite OAuth configuration](https://appwrite.io/docs/products/auth/oauth2).

| Purpose | Local | Production |
| --- | --- | --- |
| Success endpoint | `http://localhost:3000/api/customer/oauth/callback` | `https://houseofames.com/api/customer/oauth/callback` |
| Failure endpoint | `http://localhost:3000/api/customer/oauth/failure` | `https://houseofames.com/api/customer/oauth/failure` |
| Successful landing | `http://localhost:3000/app` | `https://houseofames.com/app` |
| Failure landing | `/login?oauth=failed` or `/login?oauth=expired` on the configured origin | Same |

Success and failure URLs receive an application-generated `?state=<random-attempt-nonce>` at runtime. Do not enter a fixed nonce in a console. Appwrite subsequently appends userId/secret to the success URL. Failure details are discarded in favor of a safe, actionable message.

### Google

1. In Google Cloud / Google Auth Platform, configure the AMES consent screen, support contact, audience and actual website/privacy details. Add test users while the app is in testing; complete Google's applicable publishing requirements before general availability.
2. Create an OAuth client of type **Web application**. Its authorized redirect URI is the Appwrite callback, not the AMES success endpoint:

   `https://fra.cloud.appwrite.io/v1/account/sessions/oauth2/callback/google/6a8d93140026683be1e3`

3. In Appwrite Auth > Settings > OAuth2 providers > **Google** (`google`), enable it and enter the Google Client ID and Client Secret. Copy the callback displayed by Appwrite and verify it matches the URI above; the console-generated URI is authoritative if the project endpoint changes.
4. No Google client secret belongs in Vercel client variables or the repository. No Google browser SDK is used; JavaScript origins are not needed for this server redirect flow. Appwrite supplies its normal profile/email scopes; AMES requests no extra scopes.

Reference: [Google web-server OAuth credentials](https://developers.google.com/identity/protocols/oauth2/web-server).

### Microsoft

1. In Microsoft Entra > App registrations, register AMES. For general customer sign-in select **Accounts in any organizational directory and personal Microsoft accounts**. Add a **Web** platform, not SPA/implicit flow.
2. Set the redirect URI to:

   `https://fra.cloud.appwrite.io/v1/account/sessions/oauth2/callback/microsoft/6a8d93140026683be1e3`

3. Record Application (client) ID. Create a client secret and use its **Value**, not its secret ID. Track its expiry in your operational process.
4. In Appwrite's **Microsoft** (`microsoft`) provider settings, enable it, enter client ID, secret value and tenant setting. For the broad account audience above use tenant `common`. If the console exposes a combined secret field, the current adapter expects the JSON shape `{"clientSecret":"<SECRET_VALUE>","tenantID":"common"}`; otherwise use its separate fields. Copy/compare Appwrite's displayed callback URL.
5. Allow the normal delegated Microsoft Graph `User.Read` sign-in/profile access. Appwrite's adapter requests `user.read` and `offline_access`; AMES adds no mail, files or other scopes. Tenant consent policies may require administrator consent.

References: [Microsoft registration and Web platform setup](https://learn.microsoft.com/en-us/graph/auth-register-app-v2), [Appwrite Microsoft settings implementation](https://github.com/appwrite/appwrite/blob/main/src/Appwrite/Auth/OAuth2/Microsoft.php).

## Validation and rollout boundary

Automated checks use the real node-appwrite SDK against a local HTTP fixture. Google/Microsoft consent redirects are substituted in the browser test. They do not authenticate real provider users or change live Appwrite resources.

- Full suite: 103 tests passed, including both provider token exchanges, data preservation, exact admin role, VERIFIED-only jeweller access, ordinary-user denial, authenticated identity linking, disabled-profile rejection, CSRF, expired/tampered/missing state, replay, failures and OAuth logout.
- Production build passed.
- Browser verification passed at 390x844, 1440x1000, 844x390 and 320x568. Both fixture provider flows, email/password, password visibility, logout, centered Geist caption and non-overlapping host/caption/conversation/composer bounds passed with no browser errors. Screenshots were inspected; measurements are in `outputs/social-stone/checks.json`.
- `git diff --check` passed.

Live checks still required after the operator configures providers and later authorizes deployment: sign in with a Google customer and Microsoft customer; link each to an existing password account; confirm stable Appwrite userId, favorites/profile/preferences and role links; verify existing admin and verified jeweller accounts independently; test provider cancellation and logout on localhost and houseofames.com. No live provider success is claimed without those checks.

## Files in this change

- `src/app/globals.css`: caption layout and restrained social sign-in styles.
- `src/app/login/page.tsx`: Google/Microsoft buttons, current-session linking explanation and safe failure messages.
- `src/lib/customer/appwrite.mjs`: OAuth token initiation and session exchange through the existing SDK.
- `src/lib/customer/oauth.mjs`: origin-bound OAuth attempt/callback handling.
- `src/lib/customer/service.mjs`: shared sign-in finalization and OAuth dispatch/rate limiting.
- `tests/appwrite-fixture.mjs`: test-only OAuth protocol support.
- `tests/oauth.test.mjs`: OAuth integration/security coverage.
- `scripts/verify-social-stone.mjs`: local browser flow/layout verification.
- `scripts/verify-dashboard-access-stone.mjs`: updated caption-size expectation.
- `docs/social-sign-in-stone.md`: this setup and implementation report.

The pre-existing `docs/appwrite-jeweller-live-setup.md` and generated `next-env.d.ts` working changes are outside this commit. No renderer, role guard, admin/jeweller business workflow, public Boutique/Video, or account/favorites logic was changed. No push or deployment was performed.
