import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROBE_FILE_ID,
  RESOURCE_NOT_FOUND_TYPES,
  buildProbes,
  classifyResponse,
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

const errBody = (type) => JSON.stringify({ message: 'err', code: 404, type, version: '1.8.0' });
const refused = () => ({ status: 401, text: async () => '{"message":"Unauthorized","code":401,"type":"general_unauthorized_scope"}' });
const notFound = (type) => () => ({ status: 404, text: async () => errBody(type) });
const jsonList = (total) => ({ status: 200, text: async () => JSON.stringify({ total, documents: [], rows: [], files: [] }) });

test('classifyResponse: 2xx verdicts depend on total, 401/403 refuse', () => {
  assert.equal(classifyResponse({ status: 200, bodyText: '{"total":3,"documents":[1,2,3]}', passRelevant: true }), 'served');
  assert.equal(classifyResponse({ status: 200, bodyText: '{"total":0,"documents":[]}', passRelevant: true }), 'empty');
  assert.equal(classifyResponse({ status: 200, bodyText: 'not json', passRelevant: true }), 'served');
  assert.equal(classifyResponse({ status: 401, bodyText: '', passRelevant: true }), 'refused');
  assert.equal(classifyResponse({ status: 403, bodyText: '', passRelevant: true }), 'refused');
  assert.equal(classifyResponse({ status: 500, bodyText: '', passRelevant: true }), 'inconclusive');
  assert.equal(classifyResponse({ status: 301, bodyText: '', passRelevant: true }), 'inconclusive');
});

test('classifyResponse: 404 only counts as not-provisioned for recognised types', () => {
  for (const type of ['table_not_found', 'collection_not_found', 'database_not_found', 'storage_bucket_not_found', 'storage_file_not_found']) {
    assert.ok(RESOURCE_NOT_FOUND_TYPES.has(type));
    assert.equal(classifyResponse({ status: 404, bodyText: errBody(type), passRelevant: true }), 'not-provisioned');
  }
  // A mistyped project id must never look like a missing resource.
  assert.equal(classifyResponse({ status: 404, bodyText: errBody('project_not_found'), passRelevant: true }), 'inconclusive');
  assert.equal(classifyResponse({ status: 404, bodyText: errBody('general_route_not_found'), passRelevant: true }), 'inconclusive');
  assert.equal(classifyResponse({ status: 404, bodyText: '<html>nginx 404</html>', passRelevant: true }), 'inconclusive');
  assert.equal(classifyResponse({ status: 404, bodyText: '{}', passRelevant: true }), 'inconclusive');
});

test('classifyResponse: sentinel file-view probe is always informational', () => {
  for (const [status, bodyText] of [[200, 'bytes'], [401, ''], [404, errBody('storage_file_not_found')], [500, '']]) {
    assert.equal(classifyResponse({ status, bodyText, passRelevant: false }), 'informational');
  }
});

test('normalizeEndpoint strips trailing slashes and ensures /v1', () => {
  assert.equal(normalizeEndpoint('https://cloud.appwrite.io/v1'), 'https://cloud.appwrite.io/v1');
  assert.equal(normalizeEndpoint('https://cloud.appwrite.io/v1/'), 'https://cloud.appwrite.io/v1');
  assert.equal(normalizeEndpoint('https://appwrite.example.com'), 'https://appwrite.example.com/v1');
  assert.equal(normalizeEndpoint('https://appwrite.example.com///'), 'https://appwrite.example.com/v1');
  assert.equal(normalizeEndpoint(''), '');
});

test('probe set covers both route families from the app constants', () => {
  const probes = buildProbes({ dbId: DB_ID, collections: COLLECTION_DEFS, buckets: BUCKET_DEFS });

  // 23 collections x 2 route families + 5 buckets files-list + 5 sentinel fetches.
  assert.equal(probes.length, COLLECTION_DEFS.length * 2 + BUCKET_DEFS.length * 2);
  assert.equal(probes.filter((p) => p.passRelevant).length, COLLECTION_DEFS.length * 2 + BUCKET_DEFS.length);

  const dbList = probes.filter((p) => p.family === 'databases' && p.kind === 'collection-list');
  const tblList = probes.filter((p) => p.family === 'tablesdb' && p.kind === 'collection-list');
  assert.deepEqual(dbList.map((p) => p.id).sort(), COLLECTION_DEFS.map((c) => c.id).sort());
  assert.deepEqual(tblList.map((p) => p.id).sort(), COLLECTION_DEFS.map((c) => c.id).sort());
  assert.ok(dbList.every((p) => p.path.startsWith(`/databases/${DB_ID}/collections/`) && p.path.endsWith('/documents')));
  assert.ok(tblList.every((p) => p.path.startsWith(`/tablesdb/${DB_ID}/tables/`) && p.path.endsWith('/rows')));

  for (const bucket of BUCKET_DEFS) {
    const fileList = probes.find((p) => p.kind === 'bucket-files' && p.id === bucket.id);
    const fileView = probes.find((p) => p.kind === 'bucket-file-view' && p.id === bucket.id);
    assert.ok(fileList?.passRelevant, `missing files-list probe for bucket ${bucket.id}`);
    assert.equal(fileView?.passRelevant, false, `sentinel view for ${bucket.id} must be informational`);
    assert.ok(fileView.path.includes(`/files/${PROBE_FILE_ID}/view`));
  }
});

test('probes are GET-only and send no API key or session', async () => {
  const calls = [];
  await runProbes({ endpoint: ENDPOINT, projectId: PROJECT_ID, fetchImpl: fakeFetch(refused, calls) });
  for (const { url, init } of calls) {
    assert.equal(init.method ?? 'GET', 'GET');
    assert.equal(init.body, undefined);
    assert.equal(init.headers['X-Appwrite-Project'], PROJECT_ID);
    assert.equal(init.headers['X-Appwrite-Key'], undefined);
    assert.equal(init.headers['Cookie'], undefined);
    assert.ok(url.startsWith(`${ENDPOINT}/`));
  }
});

test('all refused -> PASS, exit 0', async () => {
  const results = await runProbes({ endpoint: ENDPOINT, projectId: PROJECT_ID, fetchImpl: fakeFetch(refused, []) });
  const summary = summarize(results);
  assert.equal(summary.pass, true);
  assert.equal(summary.exitCode, 0);
  assert.equal(summary.refused.length, COLLECTION_DEFS.length * 2 + BUCKET_DEFS.length);
  assert.equal(summary.informational.length, BUCKET_DEFS.length);
});

test('project_not_found -> INCONCLUSIVE exit 2, never a PASS', async () => {
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: 'mistyped-project',
    fetchImpl: fakeFetch(notFound('project_not_found'), []),
  });
  const summary = summarize(results);
  assert.equal(summary.pass, false);
  assert.equal(summary.exitCode, 2);
  assert.equal(summary.served.length, 0);
  // Only the informational sentinel probes escape the inconclusive count.
  assert.equal(summary.inconclusive.length, COLLECTION_DEFS.length * 2 + BUCKET_DEFS.length);
});

test('not-provisioned (404 table_not_found) passes and is reported separately', async () => {
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch((url) =>
      url.includes('/tablesdb/') ? notFound('table_not_found')() : refused(),
    [],),
  });
  const summary = summarize(results);
  assert.equal(summary.pass, true);
  assert.equal(summary.exitCode, 0);
  assert.equal(summary.notProvisioned.length, COLLECTION_DEFS.length);
  assert.ok(summary.notProvisioned.every((r) => r.family === 'tablesdb'));
  assert.equal(summary.refused.length, COLLECTION_DEFS.length + BUCKET_DEFS.length);
});

test('--expect-provisioned turns not-provisioned into FAIL exit 1', async () => {
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch((url) =>
      url.includes('/tablesdb/') ? notFound('table_not_found')() : refused(),
    [],),
  });
  const summary = summarize(results, { expectProvisioned: true });
  assert.equal(summary.pass, false);
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.provisionFailures.length, COLLECTION_DEFS.length);
});

test('populated 200 on one collection -> FAIL exit 1 naming it (both families probed)', async () => {
  const openId = COLLECTION_DEFS[0].id;
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch(
      (url) => (url.includes(`/collections/${openId}/documents`) ? jsonList(3) : refused()),
      [],
    ),
  });
  const summary = summarize(results);
  assert.equal(summary.pass, false);
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.served.length, 1);
  assert.equal(summary.served[0].id, openId);
  assert.equal(summary.served[0].family, 'databases');
  assert.ok(summary.served[0].detail.includes('"total":3'));
});

test('empty 200 -> UNPROVEN exit 2, named in output lists', async () => {
  const openBucket = BUCKET_DEFS[0].id;
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch(
      (url) => (url.includes(`/buckets/${openBucket}/files`) && !url.includes(PROBE_FILE_ID) ? jsonList(0) : refused()),
      [],
    ),
  });
  const summary = summarize(results);
  assert.equal(summary.pass, false);
  assert.equal(summary.exitCode, 2);
  assert.equal(summary.served.length, 0);
  assert.equal(summary.empty.length, 1);
  assert.equal(summary.empty[0].id, openBucket);
});

test('populated 200 on bucket files list -> FAIL exit 1', async () => {
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch(
      (url) => (url.includes('/storage/buckets/') && !url.includes(PROBE_FILE_ID) ? jsonList(2) : refused()),
      [],
    ),
  });
  const summary = summarize(results);
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.served.length, BUCKET_DEFS.length);
});

test('sentinel fetch 200 is informational and does not affect pass criteria', async () => {
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch(
      (url) => (url.includes(PROBE_FILE_ID) ? { status: 200, text: async () => 'bytes' } : refused()),
      [],
    ),
  });
  const summary = summarize(results);
  assert.equal(summary.pass, true);
  assert.equal(summary.exitCode, 0);
  assert.equal(summary.informational.length, BUCKET_DEFS.length);
  assert.equal(summary.served.length, 0);
});

test('network errors are inconclusive -> exit 2', async () => {
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch(() => {
      throw new Error('ECONNREFUSED');
    }, []),
  });
  const summary = summarize(results);
  assert.equal(summary.exitCode, 2);
  assert.equal(summary.inconclusive.length, COLLECTION_DEFS.length * 2 + BUCKET_DEFS.length);
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
  assert.equal(summary.inconclusive.length, COLLECTION_DEFS.length);
});

test('failures take precedence over unproven (exit 1, not 2)', async () => {
  const openId = COLLECTION_DEFS[0].id;
  const results = await runProbes({
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    fetchImpl: fakeFetch((url) => {
      if (url.includes(`/collections/${openId}/documents`)) return jsonList(1);
      if (url.includes('/tablesdb/')) return { status: 500, text: async () => '' };
      return refused();
    }, []),
  });
  const summary = summarize(results);
  assert.equal(summary.exitCode, 1);
});
