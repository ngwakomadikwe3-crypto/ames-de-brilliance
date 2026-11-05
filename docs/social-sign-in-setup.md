# Google and TikTok sign-in setup

The application integration is prepared. Neither provider is enabled by default.
No developer apps or provider credentials have been created for you. Keep email
sign-in available while configuring and testing social sign-in.

Both providers sign in through the existing Appwrite project. They establish the
same `ames_customer_session` HttpOnly cookie used by customer workspaces, jeweller
setup and auctioneer setup. Social login never grants staff access or business
verification. This implementation does not request publishing, messaging or other
social-account management permissions.

## 1. Appwrite and site settings

In the existing Appwrite project, add a Web platform for `houseofames.com` if it
is not already present. Use the canonical domain for sign-in; do not register
temporary Vercel previews as production redirect destinations.

Verify the website's existing `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID` and
server-only `APPWRITE_API_KEY`. SSR session creation needs `sessions.write`.
Never put that key or provider client secrets into `NEXT_PUBLIC_*` variables,
source files, screenshots or chat messages. The local `.env.local` key was found
expired in previous checks; renew it before testing locally. Production has its
own managed credentials.

The application callback is:

`https://houseofames.com/api/customer/oauth/callback`

The integration appends a browser-bound, random `ames_state` to this URL. Appwrite adds
its one-use `userId` and `secret` token. The server validates state, creates the
session and immediately redirects to a clean account/workspace URL. The callback
sets no-referrer/no-store headers. It never sends session secrets to client code.

## 2. Google (including Gmail and Google Workspace)

1. Open [Google Cloud Console](https://console.cloud.google.com/), select or
   create the AMES project, and configure Google Auth Platform branding,
   audience and consent. Supply the site's real support/contact details and
   existing privacy/terms URLs. Complete any Google verification required for
   the intended audience.
2. Create an OAuth client for a Web application. Use only basic identity scopes
   needed for sign-in (openid/email/profile), not Gmail inbox access.
3. In Appwrite **Auth → Settings → Google**, enter the Google client ID and
   client secret privately. Copy the redirect URI displayed by Appwrite into
   Google's authorised redirect URIs. This is Appwrite's callback URI, not the
   AMES callback above. Copy the exact value instead of guessing its region/path.
4. Enable the Google provider in Appwrite. If the Google app is still in testing,
   add authorised testers; ordinary visitors cannot be assumed to have access.

## 3. TikTok

1. Register the AMES website app in [TikTok for Developers](https://developers.tiktok.com/).
   Add Login Kit for Web and the site, privacy policy and terms URLs. Follow the
   provider's business/app review requirements before offering it to all users.
2. In Appwrite **Auth → Settings → TikTok**, enter the app's client key and secret
   privately. Copy Appwrite's exact redirect URI into TikTok Login Kit settings.
   If TikTok is missing from the provider list, the Appwrite server needs a
   release supporting it; do not substitute another provider ID.
3. Request only the minimal identity permissions Appwrite's TikTok provider needs.
   Enable it after the redirect and permitted audience are configured.

Do not assume TikTok supplies an email. An account without an email is directed
to the AMES account screen. It can add a contact email and an AMES password, then
verify that email before enquiries or professional onboarding. An existing email
on an AMES account cannot be overwritten by this completion form.

## 4. Enable the prepared controls

After configuring a provider, set these server environment variables on Vercel:

```
AMES_AUTH_ORIGIN=https://houseofames.com
AMES_SOCIAL_PROVIDERS=google
```

Use `google,tiktok` after both are configured. Leave `AMES_SOCIAL_PROVIDERS` empty
to keep both disabled. Redeploy after environment changes. Provider secrets belong
in Appwrite, not these flags. The account screen shows unavailable providers as
disabled and retains working email sign-in.

For local tests, use `AMES_AUTH_ORIGIN=http://localhost:3010`, configure localhost
as a separate Appwrite Web platform and keep production provider settings intact.
Only loopback HTTP is accepted during development; production requires HTTPS.

## 5. Verify before public release

Test Google and TikTok with approved test accounts through `/app/account`:
start, consent, cancellation, successful callback, reload, sign-out and a second
sign-in. Confirm that existing profiles remain bound to the same Appwrite account
ID, and that professional verification is still required. For TikTok, test the
missing-email completion and email verification steps as well.

Existing email users should use their matching Google identity where Appwrite
supports its native identity association. The app does not merge accounts by
display name, username or a guessed email. TikTok may create a separate identity
without an email. Do not move saved data or business ownership between accounts
without checking ownership. Linking additional social identities to a currently
signed-in account is not part of this release; users must sign out before starting
a different social sign-in.

Run `scripts/test-customer-social.mjs` and `scripts/test-customer-account.mjs`
for the callback, origin, cookie, account and contact-completion checks. Live
provider consent/approval cannot be certified until the developer apps exist.

## Instagram

Instagram's current professional-account APIs are not a general personal-account
login provider. The retired Basic Display API must not be used to simulate a
working login. This release therefore does not show a functional Instagram login
button. Professional Instagram connections would need a separate Meta app,
supported account types, permissions and review; they are not implemented here.

## Official references

- [Appwrite OAuth2 configuration](https://appwrite.io/docs/products/auth/oauth2)
- [Appwrite server-side OAuth2 login](https://appwrite.io/docs/products/auth/server-side-rendering)
- [Appwrite TikTok provider announcement](https://appwrite.io/changelog/entry/2026-10-19-1)
- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [TikTok Login Kit for Web](https://developers.tiktok.com/doc/login-kit-web/)
- [Meta Instagram platform](https://developers.facebook.com/docs/instagram-platform/)
