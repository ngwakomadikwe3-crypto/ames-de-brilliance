# Customer accounts

`/app/account` and the compatible `/app/settings` route provide customer registration, email/password sign-in, sign-out, verification, password recovery, and profile preferences. The menu links to Profile & settings.

Appwrite Auth manages passwords and sessions. The dedicated `ames_customer_session` cookie is HttpOnly, SameSite=Lax, secure on HTTPS, and expires with its provider session. It has no relationship to the staff `adb_session` cookie and never grants dashboard access. Every account read/update uses a fresh session client; user IDs and roles from profile submissions are ignored. Responses whitelist public profile fields and are private/no-store. Mutation requests require the site's Origin. Login/register requests use distributed, HMAC-keyed email/IP quotas before privileged session creation. Recovery/verification use provider rate limits.

Configuration:
- Existing APPWRITE_ENDPOINT and APPWRITE_PROJECT_ID.
- A current APPWRITE_API_KEY with `sessions.write` for SSR sign-in, plus existing private request-limit collection access. SESSION_SECRET protects quota identifiers.
- Appwrite email/password authentication enabled. Configure houseofames.com and localhost as Web platforms as appropriate. Verification and recovery return exclusively to the originating site's `/app/account` route. Email delivery must be enabled in Appwrite.
- Never expose the API key, passwords or session secrets to client bundles or logs.

Name is the Appwrite account name. Haptics is stored in `prefs.amesHaptics`, preserving unrelated preferences. Signed-in saves are acknowledged only after the provider responds. Local storage is a browser UI cache, not authentication. Guest names/haptics remain device-local and existing legacy settings are read. Explicit sign-out clears the cached account name. Guest conversations and saved media are not migrated or claimed across accounts/devices.

Recovery and verification link secrets are immediately removed from the browser address bar and held only in component memory. The user confirms completion through the form. No test should send email to a real person or leave customer test accounts in production.

Validation: `node --test scripts/test-customer-account.mjs`; TypeScript/build; isolated-browser guest preference checks and mocked account flows. Provider mock tests do not establish live provider configuration. An expired local Appwrite key must be replaced through the service console before local registration/sign-in can work.
