# Customer workspace and jeweller storefront

The customer workspace is `/workspace`. Customers register and sign in at
`/app/account`, verify their email, save published pieces and follow private
enquiries. Selecting “Jeweller” is a navigation preference and grants no access
or verification privileges.

Jewellers create their private, account-bound business profile at
`/jeweller/onboarding`. The checklist explains the required business details,
identity/business evidence, portfolio, consent and any applicable licences.
Staff review these at `/dashboard/jewellers`. Only staff can verify a business;
verification expires and changes to evidence or business details require review.

After verification, the jeweller can enable their storefront at `/makers/<slug>`.
The address is reserved to that business. Publication requires explicit rights
confirmation. Public information is limited to business name, an approved image
category, public introduction, specialties and optional business city/country.
Identity documents, registration documents, street address, account identity and
internal review findings are never included in the public storefront response.

The jeweller manages pieces and CAD at `/jeweller`. Each private draft has a price
or “price on request”, manufacturing country and separate gemstone origins.
Declared origin remains labelled as declared until staff review supporting
evidence. Staff review and publish pieces at `/dashboard/listings`; business
verification alone does not publish a product. Withdrawal or expired/suspended
verification removes public access to the piece and its display files.

Published piece pages offer saving and private enquiries. The customer explicitly
consents to sharing their account name and verified email with that jeweller.
Jewellers answer and quote at `/jeweller/enquiries`; customers reply and request
purchase from `/workspace`. Staff can support enquiries at `/dashboard/enquiries`.
Accepting a quote records a purchase request. It does not collect payment, reserve
stock or confirm fulfilment. Existing payment integration is not simulated.

## Local CAD conversion

Upload GLB, OBJ, STL or FBX as a private source. Native `.3dm` requires a companion
mesh export; STEP conversion is not supported. An already exported, self-contained
GLB plus JPG/PNG/WebP product image can be attached without running a conversion.

The website records conversion requests. This workstation runs the isolated
Blender worker with `npm run cad:worker`. Its queue is outside OneDrive at the
private `AMES_CAD_ROOT` location. For a cloud listing, staff explicitly run
`npm run cad:listing -- --listing <listing-uuid>` while the worker is running.
This operator makes outbound requests; no public tunnel or inbound computer port
is required. It can return conversion artifacts but cannot approve or publish.
An always-on cloud conversion worker is not provisioned by this change.

Local credentials are in the ignored `.env.cad-worker.local`; the matching
`AMES_LISTING_WORKER_TOKEN` is a sensitive Production environment variable.
Never copy it into browser configuration or source control. Blender receives only
OS and rendering settings, not website/service credentials. Original queue files
remain preserved after the move to the shorter private queue path.

Cloud profiles, documents, listing files and enquiries use private Appwrite
collections and one shared private file bucket (`AMES_JEWELLER_FILES_BUCKET`;
`jewelry-sources` by default). Production reuses the existing private `media`
bucket, with empty bucket permissions and empty permissions on each new file.
Existing media file permissions and visibility are preserved. Set
`AMES_JEWELLER_FILES_BUCKET` only when an existing private bucket is deliberately
selected; all instances must use the same bucket. Publicly permitted buckets are
rejected. Sharing this private bucket avoids adding a bucket on limited plans. Downloads go through server-side ownership checks. Public
downloads expose only published display artifacts, never CAD originals or evidence.
Customer workspace preferences use that customer's Appwrite account preferences.

## Verification

`test-workspaces-storefronts.mjs` checks input/authority/publication rules.
`verify-workspace-flow.mjs` runs real application routes with isolated private
storage and loopback identity fixtures, including onboarding, storefront privacy,
saved pieces, private quotations and stale-version rejection. Its browser check
covers mobile/tablet layouts. Listing-flow tests separately cover resumable
uploads, corrupt file rejection, native Blender and publication controls.
No verification fixture represents a real verified merchant or product.
