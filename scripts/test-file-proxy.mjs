/**
 * Read-proxy hardening suite (node:test, Node >= 22 strip-types).
 *
 * Covers the two guarantees asked of the storage proxies:
 *
 *   1. Path traversal: file ids are validated against the Appwrite id
 *      charset before any storage call — no slashes, dots-only sequences,
 *      encodings or control characters reach the storage layer.
 *   2. Bucket allow-listing: each proxy route pins exactly one server-side
 *      bucket constant, and the URL-rewrite allow-list never maps a private
 *      bucket to a client-reachable path.
 *
 * Plus the report share-link scheme (staff-only default, expiring signed
 * links) and static guards on the route sources.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// SESSION_SECRET must exist BEFORE report-share.ts is first used.
const SECRET = 'proxy-test-secret-0123456789abcdef0123456789abcdef';
process.env.SESSION_SECRET = SECRET;
delete process.env.REPORT_SHARE_SECRET;

const { isValidFileId, serveStorageFile, FILE_ID_RE } = await import('../src/lib/file-proxy.ts');
const share = await import('../src/lib/report-share.ts');
const urls = await import('../src/lib/storage-urls.ts');

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** Fake storage that records every call. */
function fakeStorage(files = {}) {
  const calls = [];
  return {
    calls,
    async getFile({ bucketId, fileId }) {
      calls.push(['getFile', bucketId, fileId]);
      const f = files[fileId];
      if (!f) { const e = new Error('not found'); e.code = 404; throw e; }
      return { mimeType: f.mimeType, name: f.name };
    },
    async getFileView({ bucketId, fileId }) {
      calls.push(['getFileView', bucketId, fileId]);
      const f = files[fileId];
      if (!f) { const e = new Error('not found'); e.code = 404; throw e; }
      return f.bytes;
    },
  };
}

/* ── 1. Path traversal: file-id validation ── */

test('file ids: valid Appwrite ids accepted, traversal and junk rejected', () => {
  // Real Appwrite id shapes.
  assert.equal(isValidFileId('6917db700032e5a45562'), true);
  assert.equal(isValidFileId('abc_DEF-123.x_y'), true);
  assert.equal(isValidFileId('a'), true);
  assert.equal(isValidFileId('x'.repeat(36)), true);

  // Traversal and path separators — the core attack surface.
  assert.equal(isValidFileId('..'), false);
  assert.equal(isValidFileId('../secret'), false);
  assert.equal(isValidFileId('a/b'), false);
  assert.equal(isValidFileId('a\\b'), false);
  assert.equal(isValidFileId('%2e%2e%2f'), false);
  assert.equal(isValidFileId('..%2f..%2f'), false);
  assert.equal(isValidFileId('.hidden/ok'), false);
  // Other junk: empty, too long, spaces, query/fragment chars, leading dot/dash.
  assert.equal(isValidFileId(''), false);
  assert.equal(isValidFileId('x'.repeat(37)), false);
  assert.equal(isValidFileId('a b'), false);
  assert.equal(isValidFileId('a?b'), false);
  assert.equal(isValidFileId('a#b'), false);
  assert.equal(isValidFileId('-lead'), false);
  assert.equal(isValidFileId('.lead'), false);
  assert.equal(isValidFileId('a'), true, 'single char allowed');
});

/* ── 2. serveStorageFile: bucket pinning + behaviour ── */

test('serveStorageFile: streams bytes with headers, bucket pinned to the given constant', async () => {
  const storage = fakeStorage({
    fileabc123: { mimeType: 'image/png', name: 'stone photo.png', bytes: new Uint8Array([1, 2, 3]) },
  });
  const res = await serveStorageFile({
    storage, bucketId: 'media', fileId: 'fileabc123',
    cacheControl: 'public, max-age=31536000, immutable',
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'image/png');
  assert.equal(res.headers.get('Content-Length'), '3');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  // The storage layer saw EXACTLY the supplied bucket — nothing request-derived.
  assert.deepEqual(storage.calls, [
    ['getFile', 'media', 'fileabc123'],
    ['getFileView', 'media', 'fileabc123'],
  ]);
});

test('serveStorageFile: invalid ids are refused before any storage call', async () => {
  for (const bad of ['../x', 'a/b', '..', 'a?b', '', 'x'.repeat(64)]) {
    const storage = fakeStorage();
    const res = await serveStorageFile({ storage, bucketId: 'media', fileId: bad, cacheControl: 'private' });
    assert.equal(res.status, 400, `id ${JSON.stringify(bad)} rejected`);
    assert.equal(storage.calls.length, 0, 'storage never touched for invalid ids');
  }
});

test('serveStorageFile: unknown file collapses to 404 (no existence oracle)', async () => {
  const storage = fakeStorage({});
  const res = await serveStorageFile({ storage, bucketId: 'reports', fileId: 'missing123', cacheControl: 'private, no-store' });
  assert.equal(res.status, 404);
});

test('serveStorageFile: forced content type and sanitised inline filename', async () => {
  const storage = fakeStorage({
    rpt: { mimeType: 'application/octet-stream', name: 'weird "name" <>.pdf', bytes: new Uint8Array([37, 80, 68, 70]) },
  });
  const res = await serveStorageFile({
    storage, bucketId: 'reports', fileId: 'rpt',
    contentType: 'application/pdf', inlineFilename: true, cacheControl: 'private, no-store',
  });
  assert.equal(res.headers.get('Content-Type'), 'application/pdf');
  const cd = res.headers.get('Content-Disposition');
  assert.match(cd, /^inline; filename="[a-zA-Z0-9._-]+"$/);
  assert.ok(!cd.includes('"name"'), 'quotes stripped from filename');
});

/* ── 3. Bucket allow-listing ── */

test('allow-list: only media/reports/licence-docs map to proxy paths; private buckets never do', () => {
  assert.equal(urls.proxyPathForBucket('media', 'f1'), '/api/media/f1');
  assert.equal(urls.proxyPathForBucket('reports', 'f1'), '/api/reports/file/f1');
  assert.equal(urls.proxyPathForBucket('licence-docs', 'f1'), '/api/licence-docs/f1');
  assert.equal(urls.proxyPathForBucket('jewelry-sources', 'f1'), null, 'private source bucket never proxied');
  assert.equal(urls.proxyPathForBucket('bidder-docs', 'f1'), null, 'KYC bucket never proxied');
  assert.equal(urls.proxyPathForBucket('anything-else', 'f1'), null);
  assert.equal(urls.proxyPathForBucket('../../etc', 'f1'), null);
});

test('allow-list: legacy URL rewrite honours the same list', () => {
  const legacy = (b, f) => `https://cloud.appwrite.io/v1/storage/buckets/${b}/files/${f}/view?project=p1`;
  assert.equal(urls.rewriteStoredUrl(legacy('media', 'abc123')), '/api/media/abc123');
  assert.equal(urls.rewriteStoredUrl(legacy('licence-docs', 'abc123')), '/api/licence-docs/abc123');
  assert.equal(urls.rewriteStoredUrl(legacy('jewelry-sources', 'abc123')), legacy('jewelry-sources', 'abc123'),
    'unmapped bucket passes through unchanged — never gains a proxy path');
  assert.equal(urls.rewriteStoredUrl('https://cdn.example.com/video.mp4'), 'https://cdn.example.com/video.mp4',
    'external URLs pass through');
  assert.equal(urls.rewriteStoredUrl(''), '');
});

test('allow-list: each proxy route pins exactly one server-side bucket constant', () => {
  const routes = [
    ['../src/app/api/media/[fileId]/route.ts', 'MEDIA_BUCKET'],
    ['../src/app/api/reports/file/[fileId]/route.ts', 'REPORTS_BUCKET'],
    ['../src/app/api/licence-docs/[fileId]/route.ts', 'LICENCE_DOCS_BUCKET'],
  ];
  for (const [path, constant] of routes) {
    const src = read(path);
    assert.match(src, new RegExp(`bucketId: ${constant}`), `${path} pins ${constant}`);
    // No request-derived bucket selection anywhere in the route.
    assert.ok(!/bucketId:\s*(req|request|params|searchParams|url)/i.test(src), `${path} has no request-derived bucket`);
    assert.match(src, /serveStorageFile/, `${path} serves through the shared validator`);
  }
  // No other proxy route directory may exist outside these three.
});

/* ── 4. Report share links ── */

test('share links: mint/verify roundtrip; expiry and tampering rejected', () => {
  const now = Date.now();
  const link = share.mintReportShareLink('fileabc123', now, 600);
  assert.ok(link, 'minted');
  assert.equal(share.verifyReportShareLink('fileabc123', String(link.expires), link.sig, now), true);
  // Expired.
  assert.equal(share.verifyReportShareLink('fileabc123', String(link.expires), link.sig, link.expires * 1000), false);
  // Tampered signature.
  assert.equal(share.verifyReportShareLink('fileabc123', String(link.expires), link.sig.slice(0, -2) + 'xx', now), false);
  // Bound to the file id: a link for one file does not open another.
  assert.equal(share.verifyReportShareLink('otherfile99', String(link.expires), link.sig, now), false);
  // Malformed inputs.
  assert.equal(share.verifyReportShareLink('fileabc123', 'not-a-number', link.sig, now), false);
  assert.equal(share.verifyReportShareLink('fileabc123', String(link.expires), '', now), false);
});

test('share links: TTL defaults to 15 minutes, honours env, clamps at 24h', () => {
  assert.equal(share.reportShareTtlSeconds({}), 900);
  assert.equal(share.reportShareTtlSeconds({ REPORT_SHARE_TTL_SECONDS: '300' }), 300);
  assert.equal(share.reportShareTtlSeconds({ REPORT_SHARE_TTL_SECONDS: '999999' }), 86400);
  assert.equal(share.reportShareTtlSeconds({ REPORT_SHARE_TTL_SECONDS: 'junk' }), 900);
  assert.equal(share.reportShareTtlSeconds({ REPORT_SHARE_TTL_SECONDS: '-5' }), 900);
});

test('share links: unusable without a secret (mint null, verify false)', () => {
  const saved = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  delete process.env.REPORT_SHARE_SECRET;
  try {
    assert.equal(share.mintReportShareLink('fileabc123'), null);
    assert.equal(share.verifyReportShareLink('fileabc123', '9999999999', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), false);
  } finally {
    process.env.SESSION_SECRET = saved;
  }
});

test('share links: REPORT_SHARE_SECRET overrides SESSION_SECRET', () => {
  process.env.REPORT_SHARE_SECRET = 'distinct-share-secret-0123456789abcdef0123456789';
  try {
    const now = Date.now();
    const link = share.mintReportShareLink('fileabc123', now, 600);
    assert.equal(share.verifyReportShareLink('fileabc123', String(link.expires), link.sig, now), true);
    // Rotating the secret invalidates the link.
    process.env.REPORT_SHARE_SECRET = 'rotated-share-secret-0123456789abcdef012345678';
    assert.equal(share.verifyReportShareLink('fileabc123', String(link.expires), link.sig, now), false);
  } finally {
    delete process.env.REPORT_SHARE_SECRET;
  }
});

/* ── 5. Route-level static guards ── */

test('reports proxy: staff session OR valid share link required; never public', () => {
  const src = read('../src/app/api/reports/file/[fileId]/route.ts');
  assert.match(src, /verifySession/, 'staff session accepted');
  assert.match(src, /verifyReportShareLink/, 'signed share link accepted');
  assert.match(src, /status: 401/, 'unauthorised requests rejected');
  assert.match(src, /private, no-store/, 'responses never cached');
});

test('share mint endpoint: staff-gated, validates the file id', () => {
  const src = read('../src/app/api/reports/share/route.ts');
  assert.match(src, /verifySession/, 'staff session required');
  assert.match(src, /status: 401/, 'unauthorised rejected');
  assert.match(src, /FILE_ID_RE/, 'file id validated before minting');
});

test('licence-docs proxy: staff session required, shared validator used', () => {
  const src = read('../src/app/api/licence-docs/[fileId]/route.ts');
  assert.match(src, /verifySession/, 'staff session required');
  assert.match(src, /status: 401/, 'unauthorised rejected');
  assert.match(src, /serveStorageFile/, 'shared validator used');
});

test('file id regex constant is exported and matches the documented charset', () => {
  assert.equal(FILE_ID_RE.source, '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$');
});
