# Private visitor Chat

Guest conversations are bound to a signed, HttpOnly, SameSite=Strict cookie (Secure on HTTPS), expiring after 30 days. Clearing it loses access to that guest history; cross-device account recovery is not implemented. Staff authentication stays separate.

Every chat/message route checks the session and owner. Cross-origin writes are rejected, JSON bodies are capped at 16 KiB, and clients may write only user messages. SAME receives a server-chosen visitor identifier and a conversation identifier stored on the owned chat. Its cleaned answer is stored by the server.

The additive migration makes `chats`, `chat_messages`, and `request_limits` private at collection level with document permissions disabled. It adds owner/provider fields and indexes. Existing unowned conversations remain stored but are not shown to visitors. Do not guess owners or restore their previous public permissions.

Limits per minute: 10 conversations, 20 user messages, 20 SAME requests, 20 title changes and 120 reads per visitor. Session issuance is limited to 30 per platform address; unknown/local addresses share a bucket. Current jewelry uploads and conversion requests are limited to 10 and 5 per staff session. Counters use Appwrite atomic increments and fail closed if storage is unavailable. Expired counters are removed in bounded batches during chat-list reads. Platform WAF limits are still needed against broad distributed abuse and cookie rotation.

Tests cover cookie integrity, expiry, cross-visitor denial, cross-origin denial, forged assistant messages, body limits, and concurrent quota use. HTTP verification creates one isolated test chat; its ID is recorded in ignored `.ames-cad/qa/chat-privacy-fixture.json`. No real conversation is deleted or reassigned.
