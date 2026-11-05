# Stone verification and auction catalogue gate

Owner dashboard: Stone verification. Select an existing inventory stone; no new inventory identity is created. Complete classification, measured weight/dimensions, treatment disclosure, report verification or explicitly recorded absence, physical matching, seller authority, sourcing and applicable licence checks. Evidence references remain private. A reviewer name is a staff declaration under the existing owner session, not a separately authenticated staff identity.

Save creates an immutable draft. Approve and publish requires explicit confirmation and creates an immutable receipt tied to that draft and a hash of the current stone and seller records. New drafts, withdrawals, inventory edits, seller changes, inactive consigned sellers and non-Available inventory invalidate public eligibility. Drafts are ordered by Appwrite $sequence; simultaneous saves cannot reuse old approval. The read path checks the gate every time and returns no private evidence. The public catalogue is not cached. Errors fail closed, never falling back to old Boutique content.

New private Appwrite collections: stone_reviews and stone_publications, with stoneId and payload attributes. Schema creation occurs only during owner review writes; initial attribute provisioning may require a retry. No existing data is migrated or auto-approved. Publication is a catalogue approval, not an auction schedule, bid acceptance, payment system, laboratory certificate or legal clearance. No-report stones are explicitly labelled; a future business policy can require reports for specified lots. Cross-border natural rough-diamond evidence is a conditional operational check, not an automatic KP certificate validation.

Legacy stone availability and trader/model routes remain. Their existing public inventory surfaces do not become verified merely because this auction gate exists. Existing inventory approval wording is clarified. The next phase should review those surfaces and per-staff identity/security separately. The gate cannot recall a page or screenshot already downloaded; transaction-time eligibility must be enforced again when bidding is implemented.

Tests: node --experimental-strip-types --test scripts/test-stone-verification.mjs. Tests cover unknowns, missing evidence, disclosure, KP applicability, stale approvals, withdrawal and privacy projection. Live Appwrite operations need valid configured credentials. Nothing is deployed by these changes.

## Inventory access and storage hardening

Inventory creation now requires an owner session. Inventory status changes and inventory approval/rejection require an owner or cousin session, preserving existing staff responsibilities. These write handlers reject cross-origin browser requests before reading uploads or accessing storage. Auction publication remains owner-only. The legacy inventory GET remains available because the model portal consumes it; it is not the verified auction catalogue.

Review collections must have no client permissions and document security disabled. Existing collections with unsafe permissions are rejected rather than silently reconfigured. This check applies to draft reads, catalogue publication reads and review writes. Deleted inventory is omitted from the catalogue; infrastructure/authentication failures still fail closed. No source records are deleted by these checks.

Run the access and storage tests with `node --experimental-strip-types --test scripts/test-stone-access.mjs scripts/test-stone-review-store.mjs scripts/test-stone-verification.mjs`.

## Remaining launch gates

Launch jurisdiction: **Botswana**, confirmed by the user on 24 October 2026. This identifies the initial operating market; it does not establish whether buyers or shipments will be domestic only. Do not assume South African licensing or tax rules apply.

### Botswana launch requirements to resolve

Implemented catalogue policy: separate private `botswanaLicensing.operator` and `botswanaLicensing.seller` assessments now store requirement status, entity, transaction role, authority/legal basis, licence number, activities/stone scope, validity dates, verification date, evidence and an explicit scope confirmation. Both must be reviewed, including own-stock sales. `not-required` needs a documented basis; it is a staff determination, not a legal conclusion made by the app. No licence numbers are exposed in catalogue responses.

Required licences must be current on every catalogue read and publication attempt. Expiry is inclusive through the recorded Botswana civil date (UTC+02:00). A record expires from the catalogue on the next read after that date; already downloaded pages are not recalled. This is an AMES review policy, not a representation that every licence has this legal expiry interpretation. Revocations still need staff action; there is no authority-system integration.

Historical drafts without the new fields stay readable with unknown assessments and cannot remain eligible for publication. Staff must save a new reviewed draft and approve it again. No real inventory or Appwrite records are migrated automatically.

- Confirm AMES's legal role (platform, auctioneer, dealer, custodian or exporter), licensed premises and applicable Precious Stones Dealer's Licence scope with the Botswana Department of Mines. Record licence holder, permitted activities, stone scope, validity and verification evidence; a trader's generic Active status is not licence verification.
- For rough-diamond exports, the Botswana Trade Portal lists incorporation documents, a Diamond Cutting and/or Precious Stones Dealer's Licence, BURS trader identification, a commercial invoice and a certified packing list, plus Diamond Office inspection and Kimberley Process certification. Build shipment approval separately from catalogue approval. An evidence reference in the current review form is not an issued export certificate.
- Confirm AML/customer-due-diligence applicability, beneficial ownership checks, reporting, record retention, auction permissions, privacy, consumer terms and tax treatment with the relevant Botswana authorities/advisers before encoding thresholds or deadlines. These details have not yet been verified for AMES's business model.
- Keep domestic trading, rough-diamond exports, polished stones and jewelry workflows distinct. Do not apply a semi-precious-stone licence or a KP certificate as blanket permission for every category.
- International buyer access and export destinations remain unconfirmed; assess destination requirements before enabling cross-border checkout or shipments.

Official source checked 24 October 2026: [Botswana Trade Portal: Kimberley Process certificate application](https://www.botswanatradeportal.org.bw/index.php?id=18&r=searchProcedure%2Fview1). The procedure lists rough-diamond export documents and inspection; it is not a complete legal assessment of an online auction business. [Government semi-precious-stone licensing service](https://www.gov.bw/mining/semi-precious-stone-dealers-licence-application) describes a separate category and must not be treated as the diamond-dealing licence.

### Technical and operational gates

- Verify schema provisioning, save, approval, withdrawal and private permissions against working Appwrite credentials.
- Replace declared reviewer names with individual authenticated staff identities and define access/revocation policy. Existing owner/cousin sessions remain in use.
- Audit remaining legacy APIs and public projections, including seller/model access, media uploads and inventory fields. This change protects the inventory mutation routes only.
- Establish the business's accepted laboratories, report exceptions, physical custody and inspection process. Report lookup is not physical authentication; see https://www.gia.edu/terms.
- Confirm operating jurisdictions and applicable licensing, seller/buyer checks, sourcing, shipment and consumer terms with the responsible specialists.
- Implement and verify server-authoritative auction timing, bids, reserves, settlement, cancellation, dispute handling and transaction-time stone eligibility before enabling bidding or payments.
- Complete CAD material/geometry review and desktop/mobile visual acceptance using real jeweller files. Preserve AMES colours, silk ambience, SAFE mode and the separation of jewelry retail from loose-stone auctions.

These are remaining readiness gates, not a claim that AMES is certified or fully compliant.
