#!/usr/bin/env node
/**
 * Lockdown verification (owner instruction 2026-11-02).
 *
 * Proves that every collection and bucket the app provisions REFUSES
 * unauthenticated access. Given ONLY APPWRITE_ENDPOINT and
 * APPWRITE_PROJECT_ID — no API key, no session cookie — it attempts to:
 *
 *   1. list documents in every collection (COLLECTION_DEFS),
 *   2. list files in every bucket (BUCKET_DEFS), and
 *   3. fetch a file directly from every bucket,
 *
 * then reports PASS only if EVERY call is refused (401/403) or misses
 * (404 — database/collection/bucket not provisioned, or the probe file
 * does not exist). Any 2xx means data was served to an anonymous caller:
 * FAIL with the details. Collection/bucket names come from the same
 * constants in src/lib/appwrite.ts the app provisions with, so the probe
 * set can never drift from the schema.
 *
 * Read-only: it issues GET requests only — it never writes, never deletes,
 * and never sends an API key.
 *
 * Usage:
 *   APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1 \
 *   APPWRITE_PROJECT_ID=<project id> \
 *   node --experimental-strip-types scripts/verify-lockdown.mjs
 *
 * Exit codes: 0 = PASS (all calls refused), 1 = FAIL (at least one call
 * returned data), 2 = inconclusive (network error / unexpected status —
 * the lockdown is not proven).
 *
 * Run it BEFORE scripts/reconcile-permissions.mjs --apply to see the
 * exposed surface of a legacy project, and AFTER to prove the lockdown
 * (see docs/STATUS.md).
 */

import { pathToFileURL } from 'node:url';
import { DB_ID, COLLECTION_DEFS, BUCKET_DEFS } from '../src/lib/appwrite.ts';

/** Deliberately nonexistent id for the direct file-fetch probe. */
export const PROBE_FILE_ID = 'verify-lockdown-probe';

/** Map an HTTP status to a verdict. 2xx = data served = FAIL. */
export function classifyStatus(status) {
  if (status >= 200 && status < 300) return 'served';
  if (status === 401 || status === 403) return 'refused';
  if (status === 404) return 'not-found';
  return 'error';
}

/** Normalise the endpoint to its /v1 API root (trailing slashes stripped). */
export function normalizeEndpoint(endpoint) {
  let trimmed = String(endpoint ?? '').trim();
  while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
  if (!trimmed) return '';
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

/**
 * The full probe set: one documents-list per collection, one files-list
 * and one direct file fetch per bucket.
 */
export function buildProbes({ dbId, collections, buckets }) {
  const probes = [];
  for (const col of collections) {
    probes.push({
      kind: 'collection-documents',
      id: col.id,
      path: `/databases/${dbId}/collections/${col.id}/documents`,
    });
  }
  for (const bucket of buckets) {
    probes.push({
      kind: 'bucket-files',
      id: bucket.id,
      path: `/storage/buckets/${bucket.id}/files`,
    });
    probes.push({
      kind: 'bucket-file-view',
      id: bucket.id,
      // A locked bucket answers 401/403; an open bucket answers 404 for
      // this nonexistent id (its files-list probe above is what exposes
      // it). Only a 2xx here is a FAIL.
      path: `/storage/buckets/${bucket.id}/files/${PROBE_FILE_ID}/view`,
    });
  }
  return probes;
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
    try {
      const res = await fetchImpl(url, {
        headers: { 'X-Appwrite-Project': projectId },
      });
      const verdict = classifyStatus(res.status);
      let detail = `HTTP ${res.status}`;
      if (verdict === 'served') {
        const body = await res.text().catch(() => '');
        detail += ` — body (first 200 chars): ${body.slice(0, 200)}`;
      }
      results.push({ ...probe, url, status: res.status, verdict, detail });
    } catch (error) {
      results.push({
        ...probe,
        url,
        status: null,
        verdict: 'error',
        detail: String(error instanceof Error ? error.message : error),
      });
    }
  }
  return results;
}

/** Aggregate verdicts into the final pass/fail and exit code. */
export function summarize(results) {
  const served = results.filter((r) => r.verdict === 'served');
  const errors = results.filter((r) => r.verdict === 'error');
  const refused = results.filter((r) => r.verdict === 'refused');
  const notFound = results.filter((r) => r.verdict === 'not-found');
  return {
    pass: served.length === 0 && errors.length === 0,
    exitCode: served.length > 0 ? 1 : errors.length > 0 ? 2 : 0,
    served,
    errors,
    refused,
    notFound,
    total: results.length,
  };
}

export async function main(argv, env = process.env) {
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
  const summary = summarize(results);

  for (const r of results) {
    console.log(`[${r.kind}] ${r.id} -> ${r.detail}`);
  }
  console.log(
    `verify-lockdown: ${summary.pass ? 'PASS' : summary.served.length > 0 ? 'FAIL' : 'INCONCLUSIVE'} — ` +
      `${summary.total} probes (${COLLECTION_DEFS.length} collections, ${BUCKET_DEFS.length} buckets x2): ` +
      `${summary.served.length} served, ${summary.refused.length} refused (401/403), ` +
      `${summary.notFound.length} not-found (404), ${summary.errors.length} errors.`,
  );
  for (const r of summary.served) {
    console.error(`EXPOSED: [${r.kind}] ${r.id} -> ${r.detail}`);
  }
  for (const r of summary.errors) {
    console.error(`INCONCLUSIVE: [${r.kind}] ${r.id} -> ${r.detail}`);
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
