# Private jeweller onboarding

Owner dashboard: `/dashboard/jewellers`. Every profile, portfolio image, evidence file and mutation requires the existing signed owner session. There is no public directory or public profile endpoint. Legacy trader records and demonstration suppliers are not imported or treated as verified jewellers.

## AMES onboarding policy

This is an internal review standard, not a claim of legal/regulatory certification:

- Record the representative's legal name, business/trading name, registration number, country, city and business address.
- Collect a valid email and international phone number, a meaningful biography, specialties, and any claimed qualifications.
- Confirm authority to retain the personal evidence and the portfolio rights before uploading documents.
- Retain identity and business-registration evidence plus at least three distinct portfolio images. Claims of qualifications require current supporting evidence.
- Record whether the declared activities require a trade licence. If required, record its number, issuer, expiry and current evidence. Otherwise record the basis reviewed for its non-applicability; the app does not decide local licensing law.
- Submit the complete record, then have staff explicitly check identity, business registration, contact details, portfolio/authorship, qualifications, trading eligibility and authority/rights.
- Record review findings and an expiry within 12 months, never beyond the declared required licence expiry. The UI stops treating an expired record as verified.

Profile edits or evidence uploads/removals return the record to draft and clear the verification checks and expiry. Revision requests and suspensions require a reason. The recent audit trail records the last 50 changes and the owner role; it is not a regulatory-grade immutable audit log or individual staff identity system. Profile verification does not approve jewellery, CAD assets, stock, gemstones or manufacturing quality.

## Storage

Local development defaults to a private folder outside the project and OneDrive: `%LOCALAPPDATA%/AMES/private-jewellers` on Windows. The UI explicitly identifies local storage. `AMES_JEWELLER_ROOT` overrides that local directory for tests. Local records are not automatically transferred to the live database.

On Vercel, storage always uses Appwrite. Elsewhere set `AMES_JEWELLER_STORAGE=appwrite` to use the configured Appwrite credentials. The server provisions `jeweller_profiles` with private collection permissions and a JSON payload attribute, and the shared private file bucket configured by `AMES_JEWELLER_FILES_BUCKET` (default `jewelry-sources`). Browser users never receive Appwrite API keys or anonymous file URLs. If Appwrite is unavailable the API reports an error; it does not silently store production data locally.

Uploads are capped at 4 MB to fit the hosted request limit. Accept only detected JPEG, PNG, WebP and PDF content; portfolio and portrait entries require images. SVG/HTML are rejected. PDFs download as attachments. File downloads verify profile membership and the stored checksum, and responses use private/no-store caching. Files are not virus-scanned or independently authenticated by the app; staff must check the actual evidence and issuing bodies.

Local writes use a per-profile file lock and expected-version check; server requests reject stale versions. Appwrite writes also check expected versions, but are not distributed transactional compare-and-swap. Keep sensitive reviews serialized. File creation and profile metadata are separate storage operations; infrastructure failures can leave private orphan files for administrative cleanup.

## Checks

`npm run test:jewellers` covers draft-only creation, required evidence, distinct portfolio work, qualification/licence expiry, review checks, date bounds, renewal, suspension, edit invalidation, unsafe file content, and audit/version changes.

Local browser/API QA exercises owner sign-in, CRUD, uploads/downloads, review transitions, stale-version rejection, owner-only documents, cross-origin rejection, and desktop/mobile layouts. QA records are explicitly labelled as fixtures and removed afterwards. No real jewellers are fabricated or automatically approved.
