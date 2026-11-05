# Auctioneer profiles

Applicants use `/auctioneer` (also `/auctioneer/onboarding`) with their existing
AMES account. Email verification is required before creating or changing a
profile. Auctioneer setup is linked from the main menu, Auction section and the
Auctioneer option in `/workspace`.

The private profile covers business identity, representative and contact details,
specialties, professional biography, auction experience, seller authority and
consignment policy, and buyer fees/payment/delivery terms. Identity, business
registration and separate professional reference evidence are required before
submission. Claimed qualifications and required licences need supporting
evidence. A licence marked not applicable requires a recorded basis for review.
Documents accept PDF, JPG, PNG or WebP up to 4 MB; portraits must be images.

Staff owners review at `/dashboard/auctioneers`. Verification requires a completed
submission, all evidence checks, written findings and an expiry within 12 months,
bounded by any required licence expiry. Staff can request revisions or suspend
verification. Editing details or evidence clears verification and records an audit
entry. Applicants see requirements, status, expiry and revision feedback; internal
checks and audit findings remain with staff.

The account preference “Auctioneer” grants no staff privileges. Applicants can
access only the profile and files bound to their authenticated account. The
auctioneer collection and deterministic account IDs are separate from jewellers.
No applicant data or evidence is published in the public auction catalogue.

Cloud storage uses private `auctioneer_profiles` records and the existing private
file bucket configured by `AMES_JEWELLER_FILES_BUCKET`. New files have empty
permissions and are served only through authorised routes. Local records use
`AMES_AUCTIONEER_ROOT`, defaulting outside the project to
`%LOCALAPPDATA%/AMES/private-auctioneers`; they are separate from production.

Verification records AMES onboarding checks. It is not an auctioneering licence,
permission to sell a particular consignment, approval of a lot, or payment setup.
This change creates profiles and review, not auction scheduling or live bidding.

`test-auctioneer-profiles.mjs` tests requirements and lifecycle rules.
`verify-auctioneer-flow.mjs` exercises real routes, private file upload/download,
staff approval, ownership, CSRF, version conflicts and renewed review with
loopback identity fixtures. `verify-auctioneer-ui.py` checks applicant and staff
screens at mobile and tablet sizes. Fixtures are not real auctioneers.
