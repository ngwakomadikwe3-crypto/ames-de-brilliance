#!/usr/bin/env node
/**
 * Permission reconciliation for the AMES Appwrite project
 * (owner instruction 2026-11-01).
 *
 * Strips legacy client permissions from EVERY collection in the database and
 * EVERY bucket in the project, enforcing the server-only lockdown
 * (permissions: []). ensureReady() only runs this when
 * APPWRITE_RECONCILE_PERMISSIONS=1; this script is the deliberate, auditable
 * way to do it by hand.
 *
 * Usage:
 *   node scripts/reconcile-permissions.mjs                 # DRY-RUN (default):
 *                                                          # prints planned
 *                                                          # changes, touches
 *                                                          # nothing
 *   node scripts/reconcile-permissions.mjs --apply         # captures ALL
 *                                                          # pre-change
 *                                                          # permissions into
 *                                                          # a rollback JSON
 *                                                          # FIRST, then
 *                                                          # applies, logging
 *                                                          # each change
 *   node scripts/reconcile-permissions.mjs --apply \
 *        --rollback-out path/to/rollback.json              # custom snapshot path
 *   node scripts/reconcile-permissions.mjs --restore <rollback.json>
 *                                                          # re-applies the
 *                                                          # captured
 *                                                          # permissions
 *
 * Required env: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY
 * Optional env: APPWRITE_DATABASE_ID (default "ames")
 *
 * Failure behaviour: --apply works one resource at a time and STOPS on the
 * first error, reporting exactly which resources were already reconciled and
 * which were not. Resources updated before the failure stay locked down;
 * re-running is safe (idempotent). The rollback snapshot is written BEFORE
 * the first change, so the pre-change state is always recoverable.
 *
 * Concurrent runs: every run writes the SAME target state (permissions: []),
 * so two overlapping runs cannot produce divergent outcomes; the worst case
 * is a duplicated no-op update and a second rollback snapshot file.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as sdk from 'node-appwrite';

const { Client, Databases, Storage } = sdk;

const DEFAULT_DATABASE_ID = 'ames';

/** Current permission array of a collection, normalised across API shapes. */
export function collectionPermissions(collection) {
  const perms = collection?.$permissions ?? collection?.permissions;
  return Array.isArray(perms) ? perms : [];
}

/** Current permission array of a bucket, normalised across API shapes. */
export function bucketPermissions(bucket) {
  const perms = bucket?.$permissions ?? bucket?.permissions;
  return Array.isArray(perms) ? perms : [];
}

/**
 * Planned changes: one entry per resource whose permissions are not already
 * the server-only lockdown. Pure function (unit-tested without a server).
 */
export function planChanges(collections, buckets) {
  const plan = [];
  for (const col of collections ?? []) {
    const before = collectionPermissions(col);
    if (before.length > 0) {
      plan.push({ kind: 'collection', id: col.$id, name: col.name, before, after: [] });
    }
  }
  for (const bucket of buckets ?? []) {
    const before = bucketPermissions(bucket);
    if (before.length > 0) {
      plan.push({ kind: 'bucket', id: bucket.$id, name: bucket.name, before, after: [] });
    }
  }
  return plan;
}

/**
 * Rollback snapshot: every collection/bucket with its FULL pre-change
 * permission set plus the options needed to restore it. Written to disk
 * before --apply touches anything.
 */
export function snapshotForRollback(collections, buckets, databaseId = DEFAULT_DATABASE_ID) {
  return {
    tool: 'reconcile-permissions',
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    databaseId,
    collections: (collections ?? []).map((c) => ({
      id: c.$id,
      name: c.name,
      permissions: collectionPermissions(c),
      enabled: c.enabled !== false,
      documentSecurity: Boolean(c.documentSecurity),
    })),
    buckets: (buckets ?? []).map((b) => ({
      id: b.$id,
      name: b.name,
      permissions: bucketPermissions(b),
      enabled: b.enabled !== false,
      maximumFileSize: b.maximumFileSize,
      allowedFileExtensions: Array.isArray(b.allowedFileExtensions) ? b.allowedFileExtensions : [],
    })),
  };
}

function printPlan(plan, collections, buckets) {
  const colCount = (collections ?? []).length;
  const bucketCount = (buckets ?? []).length;
  console.log(`Scanned ${colCount} collection(s) and ${bucketCount} bucket(s).`);
  if (plan.length === 0) {
    console.log('No changes needed: every resource is already server-only (permissions: []).');
    return;
  }
  console.log(`Planned changes (${plan.length}):`);
  for (const change of plan) {
    console.log(`  ${change.kind} ${change.id} (${change.name})`);
    console.log(`    before: ${JSON.stringify(change.before)}`);
    console.log(`    after:  []`);
  }
}

async function applyPlan({ databases, storage, databaseId, plan, rollbackPath, rollback }) {
  // Capture the pre-change state BEFORE touching anything.
  await writeFile(rollbackPath, JSON.stringify(rollback, null, 2) + '\n');
  console.log(`Rollback snapshot written: ${rollbackPath}`);
  console.log(`Applying ${plan.length} change(s)...`);
  const done = [];
  for (const change of plan) {
    try {
      if (change.kind === 'collection') {
        await databases.updateCollection({
          databaseId,
          collectionId: change.id,
          name: change.name,
          permissions: [],
        });
      } else {
        const bucket = rollback.buckets.find((b) => b.id === change.id) ?? {};
        await storage.updateBucket({
          bucketId: change.id,
          name: change.name,
          permissions: [],
          enabled: bucket.enabled ?? true,
          maximumFileSize: bucket.maximumFileSize,
          allowedFileExtensions: bucket.allowedFileExtensions ?? [],
        });
      }
      done.push(change);
      console.log(`  applied ${change.kind} ${change.id}: ${JSON.stringify(change.before)} -> []`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAILED on ${change.kind} ${change.id}: ${message}`);
      console.error(`Reconciled before the failure: ${done.length ? done.map((d) => `${changeKindId(d)}`).join(', ') : '(none)'}`);
      console.error(`Not yet reconciled: ${plan.slice(done.length + 1).map(changeKindId).join(', ') || '(none)'}`);
      console.error(`Re-running this script is safe (idempotent). Restore pre-change state with:`);
      console.error(`  node scripts/reconcile-permissions.mjs --restore ${rollbackPath}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`Done. ${done.length} resource(s) reconciled to permissions: [].`);
}

function changeKindId(change) {
  return `${change.kind} ${change.id}`;
}

async function restoreFromSnapshot({ databases, storage, databaseId, rollback }) {
  console.log(`Restoring permissions captured at ${rollback.capturedAt} ...`);
  for (const col of rollback.collections ?? []) {
    await databases.updateCollection({
      databaseId: rollback.databaseId ?? databaseId,
      collectionId: col.id,
      name: col.name,
      permissions: col.permissions,
      documentSecurity: col.documentSecurity ?? false,
      enabled: col.enabled ?? true,
    });
    console.log(`  restored collection ${col.id} -> ${JSON.stringify(col.permissions)}`);
  }
  for (const bucket of rollback.buckets ?? []) {
    await storage.updateBucket({
      bucketId: bucket.id,
      name: bucket.name,
      permissions: bucket.permissions,
      enabled: bucket.enabled ?? true,
      maximumFileSize: bucket.maximumFileSize,
      allowedFileExtensions: bucket.allowedFileExtensions ?? [],
    });
    console.log(`  restored bucket ${bucket.id} -> ${JSON.stringify(bucket.permissions)}`);
  }
  console.log('Restore complete.');
}

async function main(argv) {
  const args = new Set(argv.slice(2));
  const apply = args.has('--apply');
  const restoreIdx = argv.indexOf('--restore');
  const rollbackOutIdx = argv.indexOf('--rollback-out');
  if (args.has('--help') || args.has('-h')) {
    console.log('Usage: node scripts/reconcile-permissions.mjs [--apply] [--rollback-out <file>] [--restore <file>]');
    return;
  }

  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  const databaseId = process.env.APPWRITE_DATABASE_ID || DEFAULT_DATABASE_ID;
  if (!endpoint || !projectId || !apiKey) {
    console.error('Missing env: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and APPWRITE_API_KEY are required.');
    process.exitCode = 1;
    return;
  }

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const databases = new Databases(client);
  const storage = new Storage(client);

  if (restoreIdx !== -1) {
    const file = argv[restoreIdx + 1];
    if (!file) {
      console.error('--restore requires a rollback JSON path.');
      process.exitCode = 1;
      return;
    }
    const rollback = JSON.parse(await readFile(file, 'utf8'));
    await restoreFromSnapshot({ databases, storage, databaseId, rollback });
    return;
  }

  // Read the CURRENT state of every collection and bucket.
  const collections = [];
  let offset = 0;
  for (;;) {
    const page = await databases.listCollections({ databaseId, queries: [sdk.Query.limit(100), sdk.Query.offset(offset)] });
    collections.push(...page.collections);
    if (page.collections.length < 100) break;
    offset += 100;
  }
  const buckets = [];
  offset = 0;
  for (;;) {
    const page = await storage.listBuckets({ queries: [sdk.Query.limit(100), sdk.Query.offset(offset)] });
    buckets.push(...page.buckets);
    if (page.buckets.length < 100) break;
    offset += 100;
  }

  const plan = planChanges(collections, buckets);

  if (!apply) {
    console.log('DRY-RUN (default — pass --apply to make changes).');
    printPlan(plan, collections, buckets);
    return;
  }

  const rollbackPath =
    rollbackOutIdx !== -1 && argv[rollbackOutIdx + 1]
      ? argv[rollbackOutIdx + 1]
      : `scripts/reconcile-rollback-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const rollback = snapshotForRollback(collections, buckets, databaseId);
  await applyPlan({ databases, storage, databaseId, plan, rollbackPath, rollback });
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  main(process.argv).catch((error) => {
    console.error('reconcile-permissions failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
