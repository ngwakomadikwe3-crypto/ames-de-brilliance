import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROBE_FILE_ID,
  buildProbes,
  classifyStatus,
  normalizeEndpoint,
  runProbes,
  summarize,
} from './verify-lockdown.mjs';
import { BUCKET_DEFS, COLLECTION_DEFS, DB_ID } from '../src/lib/appwrite.ts';

const ENDPOINT = 'https://cloud.appwrite.io/v1';
const PROJECT_ID = 'test-project';

/** Fake fetch: handler(url, init) decides the canned response per URL. */
const fakeFetch = (handler, calls) => async (url, init) => {
  calls.push({ url, init });
  return handler(url, init);
};

const refused = () => ({ status: 401, text: async () => '{"message":"Unauthorized"}' });

test('classifyStatus maps statuses to verdicts', () => {
  assert.equal(classifyStatus(200), 'served');
  assert.equal(classifyStatus(206), 'served');
  assert.equal(classifyStatus(401), 'refused');
  assert.equal(classifyStatus(403), 'refused');
  assert.equal(classifyStatus(404), 'not-found');
  assert.equal(classifyStatus(500), 'error');
  assert.equal(classifyStatus(301), 'error');
});

test('normalizeEndpoint strips trailing slashes and ensures /v1', () => {
  assert.equal(normalizeEndpoint('https://cloud.appwrite.io/v1'), 'https://cloud.appwrite.io/v1');
  assert.equal(normalizeEndpoint('https://cloud.appwrite.io/v1/'), 'https://cloud.appwrite.io/v1');
  assert.equal(normalizeEndpoint('https://appwrite.example.com'), 'https://appwrite.example.com/v1');
  assert.equal(normalizeEndpoint('https://appwrite.example.com///'), 'https://appwrite.example.com/v1');
  assert.equal(normalizeEndpoint(''), '');
});

test('probe set is built from the app constants, one entry per resource', () => {
  const probes = buildProbes({ dbId: DB_ID, collections: COLLECTION_DEFS, buckets: BUCKET_DEFS });

  // 23 collections + 5 buckets x (files list + direct fetch).
  assert.equal(probes.length, COLLECTION_DEFS.length + BUCKET_DEFS.length * 2);

  // Every provisioned collection id is probed exactly once.
  const docProbes = probes.filter((p) => p.kind === 'collection-documents');
  assert.deepEqual(
    docProbes.map((p) => p.id).sort(),
    COLLECTION_DEFS.map((c) => c.id).sort(),
  );
  assert.ok(docProbes.every((p) => p.path.startsWith(`/databases/${DB_ID}/collections/`)));

  // Every provisioned bucket id gets a files list AND a direct fetch.
  for (const bucket of BUCKET_DEFS) {
    const fileList = probes.find((p) => p.kind === 'bucket-files' && p.id === bucket.id);
    const fileView = probes.find((p) => p.kind === 'bucket-file-view' && p.id === bucket.id);
    assert.ok(fileList, `missing files-list probe for bucket ${bucket.id}`);
    assert.ok(fileView, `missing file-view probe for bucket ${bucket.id}`);
    assert.ok(fileView.path.includes(`/files/${PROBE_FILE_ID}/view`));
  }
});

test('probes are GET-only and send no API key or session', async () => {
  const calls = [];
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch(refused, calls),
  });

  assert.equal(calls.length, results.length);
  for (const { url, init } of calls) {
    assert.equal(init.method ?? 'GET', 'GET');
    assert.equal(init.body, undefined);
    assert.equal(init.headers['X-Appwrite-Project'], PROJECT_ID);
    assert.equal(init.headers['X-Appwrite-Key'], undefined);
    assert.equal(init.headers['Cookie'], undefined);
    assert.ok(url.startsWith(`${ENDPOINT}/`));
  }
});

test('all calls refused -> PASS with exit code 0', async () => {
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch(refused, []),
  });
  const summary = summarize(results);
  assert.equal(summary.pass, true);
  assert.equal(summary.exitCode, 0);
  assert.equal(summary.refused.length, results.length);
});

test('404 everywhere (unprovisioned project) still passes', async () => {
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch(() => ({ status: 404, text: async () => '' }), []),
  });
  const summary = summarize(results);
  assert.equal(summary.pass, true);
  assert.equal(summary.exitCode, 0);
  assert.equal(summary.notFound.length, results.length);
});

test('one open collection -> FAIL with exit code 1 naming the collection', async () => {
  const openId = COLLECTION_DEFS[0].id;
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch(
      (url) =>
        url.includes(`/collections/${openId}/documents`)
          ? { status: 200, text: async () => '{"total":3,"documents":[]}' }
          : refused(),
      [],
    ),
  });
  const summary = summarize(results);
  assert.equal(summary.pass, false);
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.served.length, 1);
  assert.equal(summary.served[0].id, openId);
  assert.ok(summary.served[0].detail.includes('{"total":3'));
});

test('one open bucket file view -> FAIL naming the bucket', async () => {
  const openBucket = BUCKET_DEFS[0].id;
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch(
      (url) =>
        url.includes(`/buckets/${openBucket}/files/${PROBE_FILE_ID}/view`)
          ? { status: 200, text: async () => 'binary-data' }
          : refused(),
      [],
    ),
  });
  const summary = summarize(results);
  assert.equal(summary.pass, false);
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.served[0].id, openBucket);
  assert.equal(summary.served[0].kind, 'bucket-file-view');
});

test('network errors are inconclusive -> exit code 2', async () => {
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch(() => {
      throw new Error('ECONNREFUSED');
    }, []),
  });
  const summary = summarize(results);
  assert.equal(summary.pass, false);
  assert.equal(summary.exitCode, 2);
  assert.equal(summary.errors.length, results.length);
  assert.equal(summary.served.length, 0);
});

test('unexpected 5xx is inconclusive even when nothing was served', async () => {
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch(
      (url) => (url.includes('/databases/') ? { status: 500, text: async () => '' } : refused()),
      [],
    ),
  });
  const summary = summarize(results);
  assert.equal(summary.exitCode, 2);
  assert.equal(summary.errors.length, COLLECTION_DEFS.length);
});
