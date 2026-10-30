# Data Retention — Bidder Accounts (DRAFT for owner + lawyer)

Phase 3a introduces real bidder personal data. This document records the
**proposed defaults** so the owner and her lawyer can confirm or adjust them.
Nothing here is legal advice; the marked decisions belong to the owner.

## What we hold and where

| Data | Where | Why | Proposed retention |
|---|---|---|---|
| Registration (name, email, phone, country, entity type, licence no.) | Appwrite `bidders` table | Identity, verification, contact | Life of account + **24 months** after closure/anonymisation request |
| Login codes | `bidder_otps` table (HMAC hash only, never the code) | Sign-in | Expire after **10 minutes**; rows overwritten on re-request |
| KYC documents | Private `bidder-docs` bucket + `bidder_documents` metadata | Licence verification | Until decision + **24 months**, or erased immediately on an approved erasure request |
| Bids | `bids` table (bidder **row id only**, no PII) | Auction integrity, disputes | **7 years** (financial-record keeping) |
| Audit log | `audit_log` table (actors are role labels / row ids) | Security, compliance, dispute evidence | **7 years**, append-only |
| Staff document views | `audit_log` (`bidder.document_viewed`) | Access accountability | With the audit log, 7 years |

## How erasure works (implemented)

`anonymiseBidder` erases all PII columns in place, replaces the email with
`deleted+<rowid>@invalid`, deletes the bidder's document files from the
private bucket and their metadata rows, and stamps `anonymised_at`.

**Why the row id survives:** bids and audit entries reference only the
pseudonymous row id — never a name or email. Deleting the row would break the
immutability of the bid history (a sold lot must always show its winning bid)
and of the audit trail. After anonymisation the id can no longer be tied to a
person, which satisfies erasure without falsifying history.

## Access and export

- Bidder self-serve: `GET /api/bidders/me` returns the caller's own profile.
- Staff export: `GET /api/staff/bidders/{id}/export` (owner/staff roles only,
  audited as `bidder.data_exported`).
- Staff erasure: `POST /api/staff/bidders/{id}/anonymise` (owner/staff only,
  audited as `bidder.anonymised`).

## Questions for the owner and her lawyer

1. **Retention periods** — are 24 months (account data/KYC) and 7 years
   (bids/audit) right for Botswana's record-keeping and the house's contracts?
2. **Lawful basis + privacy notice** — the registration form needs the final
   privacy wording; the auction terms placeholder (docs/auction-terms.md)
   references it.
3. **Rejected applications** — erase KYC documents immediately on rejection,
   or keep them for the appeal window? (Default implemented: kept until an
   erasure request or the retention deadline.)
4. **Cross-border transfer** — Appwrite region and any sub-processors should
   be listed in the privacy notice.
5. **Under-age / sanctioned-party screening** — does the lawyer want an
   explicit declaration checkbox at registration?
