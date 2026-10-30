# Runbook: purge `data/ames.db*` from git history

**Who:** Ngwako executes this. **When:** before or alongside the Phase 1 PR merge.
**Why:** `data/ames.db`, `data/ames.db-shm` and `data/ames.db-wal` were committed on
2026-08-23 and live in the history of a public repository. They contain trader PII
(names, WhatsApp numbers, licence strings) and two trader portal access codes.
Deleting the files in a commit (done in Phase 1) does **not** remove them from
history.

## 0. Non-negotiable, independent of this purge

**Reissue both trader portal codes.** Assume they are compromised. Purging history
does not undo clones or forks that already exist. Also confirm with Same whether
the trader/buyer records are seed data; if any record is real, treat this as a data
exposure incident and handle notification obligations accordingly.

## 1. Prerequisites

```bash
pip install git-filter-repo   # or: brew install git-filter-repo
```

Warn collaborators: every clone of this repository becomes invalid after the purge.

## 2. Fresh mirror clone

```bash
git clone --mirror https://github.com/ngwakomadikwe3-crypto/ames-de-brilliance.git adb-mirror.git
cd adb-mirror.git
```

## 3. Purge the files from ALL branches (main and recovery/ames-visual)

```bash
git filter-repo --path data/ames.db --path data/ames.db-shm --path data/ames.db-wal --invert-paths
```

Verify before pushing:

```bash
git log --all --oneline -- data/ames.db        # must print nothing
git rev-list --objects --all | grep ames.db    # must print nothing
```

## 4. Force-push every branch and tag

```bash
git remote set-url origin https://github.com/ngwakomadikwe3-crypto/ames-de-brilliance.git
git push --force --all origin
git push --force --tags origin
```

## 5. Collaborators re-clone (no exceptions)

```bash
cd .. && rm -rf ames-de-brilliance
git clone https://github.com/ngwakomadikwe3-crypto/ames-de-brilliance.git
```

Anyone with an old clone must not push from it — that would resurrect the files.
Open PRs must be rebased onto the rewritten `main`.

## 6. After the purge

- Reissue trader portal codes (see step 0) and confirm the old codes reject.
- Consider whether the repository should be private; that is an owner decision.
- On GitHub, ask support to drop cached views/forks if the exposure is confirmed real:
  https://support.github.com/contact (remove sensitive data request).
