#!/usr/bin/env node
/**
 * Lockdown verification (owner instruction 2026-11-02, amended 2026-11-03
 * per Ngwako's PR #33 review).
 *
 * Proves that every collection and bucket the app provisions REFUSES
 * unauthenticated access. Given ONLY APPWRITE_ENDPOINT and
 * APPWRITE_PROJECT_ID — no API key, no session cookie — it attempts to:
 *
 *   1. list documents/rows in every collection (COLLECTION_DEFS) via BOTH
 *      the legacy Databases route and the TablesDB route,
 *   2. list files in every bucket (BUCKET_DEFS), and
 *   3. fetch a file directly from every bucket using a sentinel id
 *      (INFORMATIONAL ONLY — see NOTES),
 *
 * Collection/bucket names come from the same constants in
 * src/lib/appwrite.ts the app provisions with, so the probe set can never
 * drift from the schema. Read-only: GET requests only, keyless by design.
 *
 * Usage:
 *   APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1 \
 *   APPWRITE_PROJECT_ID=<project id> \
 *   node --experimental-strip-types scripts/verify-lockdown.mjs [--expect-provisioned]
 *
 * Verdicts (list probes):
 *   served          2xx WITH rows/files (or an unparseable 2xx body) —
 *                   FAIL: anonymous callers get data.
 *   empty           2xx with total = 0 — UNPROVEN: an empty list cannot
 *                   distinguish protection from an empty resource. Seed one
 *                   row per collection and one file per bucket first.
 *   refused         401/403 — PASS contribution.
 *   not-provisioned 404 whose Appwrite error `type` is a recognised
 *                   resource-not-found (table/collection/database/bucket/
 *                   row/document/file) — PASS contribution, reported
 *                   separately. --expect-provisioned turns each into FAIL.
 *   inconclusive    project_not_found, general_route_not_found, any
 *                   unrecognised or unparseable 404 body, any other status,
 *                   or a network error — the lockdown is NOT proven.
 *
 * Exit codes: 0 = PASS, 1 = FAIL, 2 = UNPROVEN/INCONCLUSIVE.
 *
 * NOTES
 * - The sentinel file-fetch probe proves NOTHING on its own: 404
 *   file_not_found is ambiguous (a locked bucket and an open bucket both
 *   answer 404 for a nonexistent id), and a 401/403 duplicates what the
 *   files-list probe already establishes. It is kept as an informational
 *   signal and is excluded from the pass criteria.
 * - Run it BEFORE scripts/reconcile-permissions.mjs --apply to see the
 *   exposed surface of a legacy project, and AFTER to prove the lockdown.
 *   Positive control and seeding procedure: see docs/STATUS.md.
 */

import { pathToFileURL } from 'node:url';
import { DB_ID, COLLECTION_DEFS, BUCKET_DEFS } from '../src/lib/appwrite.ts';

/** Deliberately nonexistent id for the informational file-fetch probe. */
export const PROBE_FILE_ID = 'verify-lockdown-probe';

/**
 * 404 error `type` values that mean "this resource does not exist"
 * (Appwrite response-codes docs; both current TablesDB and legacy
 * Databases spellings are accepted because the deployed server's version
 * is unknown to a keyless caller). project_not_found is deliberately NOT
 * here: a mistyped project id must never produce a PASS.
 */
export const RESOURCE_NOT_FOUND_TYPES = new Set([
  'database_not_found',
  'table_not_found',
  'collection_not_found',
  'row_not_found',
  'document_not_found',
  'storage_bucket_not_found',
  'bucket_not_found',
  'storage_file_not_found',
  'file_not_found',
]);

/** Normalise the endpoint to its /v1 API root (trailing slashes stripped). */
export function normalizeEndpoint(endpoint) {
  let trimmed = String(endpoint ?? '').trim();
  while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
  if (!trimmed) return '';
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

/**
 * The full probe set. List probes are pass-relevant; the sentinel file
 * fetch is informational only. Route families:
 *   databases — legacy /v1/databases/{db}/collections/{id}/documents
 *   tablesdb  — /v1/tablesdb/{db}/tables/{id}/rows (the other surface of
 *               the same data; both exist in node-appwrite@28)
 *   storage   — /v1/storage/buckets/{id}/files (+ sentinel view)
 */
export function buildProbes({ dbId, collections, buckets }) {
  const probes = [];
  for (const col of collections) {
    probes.push({
      family: 'databases',
      kind: 'collection-list',
      id: col.id,
      passRelevant: true,
      path: `/databases/${dbId}/collections/${col.id}/documents`,
    });
    probes.push({
      family: 'tablesdb',
      kind: 'collection-list',
      id: col.id,
      passRelevant: true,
      path: `/tablesdb/${dbId}/tables/${col.id}/rows`,
    });
  }
  for (const bucket of buckets) {
    probes.push({
      family: 'storage',
      kind: 'bucket-files',
      id: bucket.id,
      passRelevant: true,
      path: `/storage/buckets/${bucket.id}/files`,
    });
    probes.push({
      family: 'storage',
      kind: 'bucket-file-view',
      id: bucket.id,
      passRelevant: false, // informational: proves nothing on its own
      path: `/storage/buckets/${bucket.id}/files/${PROBE_FILE_ID}/view`,
    });
  }
  return probes;
}

/**
 * Classify one response. `bodyText` is the raw body ('' when unreadable).
 * The sentinel view probe is always informational, whatever it returns.
 */
export function classifyResponse({ status, bodyText, passRelevant }) {
  if (!passRelevant) return 'informational';
  if (status >= 200 && status < 300) {
    let parsed = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch { /* unparseable */ }
    if (parsed && typeof parsed.total === 'number') {
      return parsed.total > 0 ? 'served' : 'empty';
    }
    // A 2xx to an anonymous caller is exposure even when the body shape is
    // unexpected — treat as served (FAIL), flagged in the detail.
    return 'served';
  }
  if (status === 401 || status === 403) return 'refused';
  if (status === 404) {
    let type = null;
    try {
      type = JSON.parse(bodyText)?.type ?? null;
    } catch { /* unparseable */ }
    if (type && RESOURCE_NOT_FOUND_TYPES.has(type)) return 'not-provisioned';
    // project_not_found, general_route_not_found, unrecognised or
    // unparseable 404 bodies: we cannot tell what we actually reached.
    return 'inconclusive';
  }
  return 'inconclusive';
}

/**
 * Run every probe with GET requests carrying only the X-Appwrite-Project
 * header (anonymous, keyless by design). fetchImpl is injectable so the
 * pass/fail logic can be unit-tested against a fake HTTP layer.
 */
export async function runProbes({ endpoint, projectId, fetchImpl = fetch }) {
  const base = normalizeEndpoint(endpoint);
  const probes = buildProbes({ dbId: DB_ID, collections: COLLECTION_DEFS, buckets: BUCKET_DEFS });
  const results = [];
  for (const probe of probes) {
    const url = `${base}${probe.path}`;
    let status = null;
    let bodyText = '';
    try {
      const res = await fetchImpl(url, {
        headers: { 'X-Appwrite-Project': projectId },
      });
      status = res.status;
      bodyText = await res.text().catch(() => '');
    } catch (error) {
      results.push({
        ...probe,
        url,
        status: null,
        verdict: 'inconclusive',
        detail: `network error: ${String(error instanceof Error ? error.message : error)}`,
      });
      continue;
    }
    const verdict = classifyResponse({ status, bodyText, passRelevant: probe.passRelevant });
    let detail = `HTTP ${status}`;
    if (verdict === 'served') {
      detail += ` — body (first 200 chars): ${bodyText.slice(0, 200)}`;
    } else if (verdict === 'empty') {
      detail += ' — 2xx with total=0 (cannot distinguish protection from an empty resource)';
    } else if (verdict === 'not-provisioned') {
      detail += ` — resource not provisioned (${safeType(bodyText)})`;
    } else if (verdict === 'inconclusive') {
      detail += ` — body (first 200 chars): ${bodyText.slice(0, 200)}`;
    } else if (verdict === 'informational') {
      detail += ` — informational only (sentinel fetch; not part of pass criteria): ${bodyText.slice(0, 120)}`;
    }
    results.push({ ...probe, url, status, verdict, detail });
  }
  return results;
}

function safeType(bodyText) {
  try {
    return JSON.parse(bodyText)?.type ?? 'unparseable';
  } catch {
    return 'unparseable';
  }
}

/**
 * Aggregate verdicts into the final outcome.
 *   FAIL (1): any list probe served data, or --expect-provisioned and any
 *             resource is not provisioned.
 *   UNPROVEN/INCONCLUSIVE (2): no failures, but any empty 2xx or
 *             inconclusive response (incl. project_not_found — a mistyped
 *             project id can never PASS).
 *   PASS (0): every pass-relevant probe refused or not-provisioned.
 */
export function summarize(results, { expectProvisioned = false } = {}) {
  const relevant = results.filter((r) => r.passRelevant);
  const by = (v) => relevant.filter((r) => r.verdict === v);
  const served = by('served');
  const empty = by('empty');
  const refused = by('refused');
  const notProvisioned = by('not-provisioned');
  const inconclusive = by('inconclusive');
  const informational = results.filter((r) => r.verdict === 'informational');
  const provisionFailures = expectProvisioned ? notProvisioned : [];
  const failed = served.length > 0 || provisionFailures.length > 0;
  const unproven = !failed && (empty.length > 0 || inconclusive.length > 0);
  return {
    pass: !failed && !unproven,
    exitCode: failed ? 1 : unproven ? 2 : 0,
    served,
    empty,
    refused,
    notProvisioned,
    inconclusive,
    informational,
    provisionFailures,
    total: results.length,
    totalRelevant: relevant.length,
  };
}

function familyCounts(summary) {
  const families = ['databases', 'tablesdb', 'storage'];
  return families
    .map((f) => {
      const all = [
        ...summary.served,
        ...summary.empty,
        ...summary.refused,
        ...summary.notProvisioned,
        ...summary.inconclusive,
      ].filter((r) => r.family === f);
      if (all.length === 0) return null;
      const n = (list) => list.filter((r) => r.family === f).length;
      return (
        `${f}: ${n(summary.served)} served, ${n(summary.empty)} empty-unproven, ` +
        `${n(summary.refused)} refused, ${n(summary.notProvisioned)} not-provisioned, ` +
        `${n(summary.inconclusive)} inconclusive`
      );
    })
    .filter(Boolean)
    .join(' | ');
}

export async function main(argv = process.argv, env = process.env) {
  const expectProvisioned = argv.includes('--expect-provisioned');
  const endpoint = env.APPWRITE_ENDPOINT;
  const projectId = env.APPWRITE_PROJECT_ID;
  if (!endpoint || !projectId) {
    console.error(
      'Missing env: APPWRITE_ENDPOINT and APPWRITE_PROJECT_ID are required ' +
        '(no API key and no session — keyless is the point of this check).',
    );
    process.exitCode = 2;
    return;
  }

  const results = await runProbes({ endpoint, projectId });
  const summary = summarize(results, { expectProvisioned });

  for (const r of results) {
    console.log(`[${r.family}:${r.kind}] ${r.id} -> ${r.verdict} (${r.detail})`);
  }
  const outcome = summary.pass ? 'PASS' : summary.exitCode === 1 ? 'FAIL' : 'UNPROVEN/INCONCLUSIVE';
  console.log(
    `verify-lockdown: ${outcome} — ${summary.total} probes ` +
      `(${COLLECTION_DEFS.length} collections x2 route families, ${BUCKET_DEFS.length} buckets files-list, ` +
      `${BUCKET_DEFS.length} informational sentinel fetches): ${familyCounts(summary)}.`,
  );
  for (const r of summary.served) {
    console.error(`EXPOSED: [${r.family}:${r.kind}] ${r.id} -> ${r.detail}`);
  }
  for (const r of summary.provisionFailures) {
    console.error(`NOT PROVISIONED (--expect-provisioned): [${r.family}:${r.kind}] ${r.id} -> ${r.detail}`);
  }
  for (const r of summary.empty) {
    console.error(`UNPROVEN (empty 2xx): [${r.family}:${r.kind}] ${r.id} -> ${r.detail}`);
  }
  for (const r of summary.inconclusive) {
    console.error(`INCONCLUSIVE: [${r.family}:${r.kind}] ${r.id} -> ${r.detail}`);
  }
  process.exitCode = summary.exitCode;
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  main().catch((error) => {
    console.error('verify-lockdown failed:', error instanceof Error ? error.message : error);
    process.exitCode = 2;
  });
}
