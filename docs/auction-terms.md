# AMES Auction Room — Bidder Terms (PLACEHOLDER)

> **This text is a placeholder.** The owner's lawyer will replace it before
> public bidding opens. The version identifier below is what the platform
> records at acceptance; bump `AUCTION_TERMS_VERSION` in
> `src/lib/bidders/terms.ts` when this document changes, so every bidder has
> to re-accept before their next bid.

**Terms version:** `2026-10-draft-1`

## Outline for the lawyer (sections to draft)

1. **Eligibility** — licensed diamond dealers / individuals under Botswana
   diamond trading law; verification at the house's discretion; the house may
   reject or suspend without obligation to bid access.
2. **Registration and KYC** — accuracy of supplied information; document
   requirements; one account per person/entity.
3. **Bidding rules** — bids are binding; integer minor units; minimum
   increments; anti-snipe extensions; reserve prices (existence may be
   disclosed, amounts never are).
4. **Winning and settlement** — invoice, payment window, collection/shipping,
   default consequences. (Payment mechanics land in Phase 4 — out of scope
   here.)
5. **Fees** — buyer's premium, if any.
6. **Compliance** — Kimberley Process, AML/sanctions screening, the house's
   right to suspend immediately.
7. **Data protection** — reference the privacy notice; see
   docs/DATA_RETENTION.md for the retention schedule.
8. **Liability and disputes** — governing law (Botswana), jurisdiction,
   limitation of liability.
9. **Changes to these terms** — version bumps require re-acceptance before
   further bidding.

## Acceptance record

Acceptance is stored server-side as `(bidder id, terms version, timestamp)`
and written to the audit log (`bidder.terms_accepted`). Bidding requires
acceptance of the **current** version, enforced in the bid route — never only
in the UI.
