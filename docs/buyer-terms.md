# AMES DE BRILLANTE — Buyer Terms (PLACEHOLDER)

> **This text is a placeholder.** The owner's lawyer will replace it before
> the catalogue opens to buyers. The version identifier below is what the
> platform records at acceptance; bump `BUYER_TERMS_VERSION` in
> `src/lib/buyers/terms.ts` when this document changes, so every buyer has
> to re-accept before their next offer.

**Terms version:** `2026-10-draft-1`

## Outline for the lawyer (sections to draft)

1. **Eligibility** — licensed diamond dealers / individuals under Botswana
   diamond trading law; a valid, current diamond trading licence is required;
   verification at the house's discretion; the house may reject or suspend
   without obligation to catalogue access.
2. **Registration and KYC** — accuracy of supplied information; licence
   number, type and expiry are required and staff-verified; document
   requirements; one account per person/entity.
3. **Offers** — offers are expressions of intent on catalogue lots; amounts
   are integer minor units with a per-lot currency; an expired buyer licence
   blocks new offers until renewed and re-verified.
4. **Acceptance and settlement** — offer acceptance is at the house's sole
   discretion; invoice, payment confirmation, and shipment are recorded
   manually by staff; a lot cannot ship before payment is recorded.
5. **Fees** — buyer's premium or service fees, if any.
6. **Compliance** — Kimberley Process, AML/sanctions screening, the house's
   right to suspend immediately.
7. **Data protection** — reference the privacy notice; see
   docs/DATA_RETENTION.md for the retention schedule.
8. **Liability and disputes** — governing law (Botswana), jurisdiction,
   limitation of liability.
9. **Changes to these terms** — version bumps require re-acceptance before
   further offers.

## Acceptance record

Acceptance is stored server-side as `(buyer id, terms version, timestamp)`
and written to the audit log (`buyer.terms_accepted`). Making offers requires
acceptance of the **current** version, enforced server-side — never only
in the UI.
