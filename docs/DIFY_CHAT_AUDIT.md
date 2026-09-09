# Dify connectivity audit

## Before
- DIFY_CLIENT: none. `/api/chat` called DeepSeek using DEEPSEEK_API_KEY.
- DIFY_ENDPOINT: none used. NEXT_PUBLIC_DIFY_URL was an unused declaration.
- DIFY_ENV: DIFY_API_URL, DIFY_API_KEY and DIFY_SESSION_SECRET are absent locally (values never printed).
- CHAT_ROUTE: composer -> /api/chat -> DeepSeek /chat/completions.
- STREAMING: no; complete JSON only.
- CONVERSATION_ID: absent; client supplied history instead.
- USER_ID: no provider identity binding in /api/chat.
- STONE_COMMAND_BRIDGE: local stoneRequest consumed matching messages before API dispatch.
- FALLBACK: canned replies returned as successful answers on missing key/provider failure.

## Implemented
One server-side Dify Chatflow path: POST /api/chat -> configured base URL + /chat-messages with blocking response mode. Dify credentials and all authorization stay in the server module. No alternative model/provider fallback. Complete responses preserve the approved UI without adding streaming components.

Uses the existing authenticated customerIdentity verification without changing Appwrite code or schema. Guests receive a signed HttpOnly, SameSite=Lax cookie (Secure with HTTPS). Provider user identifiers are keyed hashes, not browser-supplied IDs, emails or session credentials. Conversation IDs are returned inside a signed, expiring token bound to that identity; a different account/session, tampering or expiry cannot resume it. Origin checks reject cross-site POSTs. Provider redirects are refused, requests time out after 90 seconds, upstream bodies/secrets are never logged or returned.

The active token and transcript survive reload within the same tab via sessionStorage, keyed by account/guest; New conversation clears them. Identity changes discard in-flight responses. Existing account transcript storage remains best effort and independent of Dify response availability; no Appwrite modifications. Cross-device/history-list Dify resumption is not implemented. Tokens expire after 24 hours and explicitly require a new conversation.

Both direct user requests and Dify answers use the existing stoneRequest contract. No geometry, renderer, selection UI, layout, navigation or protected surface changes. This is keyword-based interpretation, not a structured agent tool schema; ambiguous prose can select a mentioned supported cut. Dify never grants entitlements or supplies asset URLs.

## Configuration required (server-only)
- DIFY_API_URL: actual Chatflow Service API base including /v1, e.g. https://api.dify.ai/v1 for Dify Cloud.
- DIFY_API_KEY: API key for the published Chatflow app.
- DIFY_SESSION_SECRET: independent random signing secret of at least 32 characters.

Use a Chatflow that accepts the normal query with no required custom inputs (`inputs: {}`). A standalone Workflow /workflows/run application is not interchangeable with conversational Chatflow; Agent Assistant streaming-only mode is not supported by this complete-response path. No credentials were invented or populated.

API contract: https://github.com/langgenius/dify/blob/main/web/app/components/develop/template/template_advanced_chat.en.mdx

## Validation
38 tests pass, including seven Dify fixture tests: normal request/answer, multi-turn ID continuity and reset, identity isolation/tampering/expiry, guest continuity, canonical stone bridge, missing credentials, invalid inputs, provider errors, malformed answers and network errors. Fixtures do not prove live Dify connectivity.

Browser verification: scripts/verify-dify-chat.mjs; output outputs/dify-audit/browser.json. Real production route checks missing credentials and denied Origin; successful browser replies are explicitly intercepted fixtures. Production build PASS. All seven browser checks PASS on http://127.0.0.1:3100 with a process-only AMES_APP_ORIGIN loopback override. No saved environment was changed.

Live connectivity is BLOCKED until the owner supplies the three environment values and a published compatible Chatflow. No deploy or main merge.
