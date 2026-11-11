import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client, Storage } from 'node-appwrite';
import { listStudioJobs, queueStudioUpload, getStudioJob, readStudioArtifact, buildStudioPack, rerenderStudioJob } from './studio.mjs';
import { formats } from './store.mjs';
import { listJobs, readJob, jobDir, queueJob, workerHealth, sha256 } from './store.mjs';

const secret = process.env.AMES_CAD_SERVICE_TOKEN;
if (!secret || secret.length < 48) throw new Error('Set a CAD service token of at least 48 characters');

const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }); res.end(JSON.stringify(body)); };
const server = createServer(async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '') || '';
  const supplied = Buffer.from(token), expected = Buffer.from(secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(res, 401, { error: 'Unauthorized' });
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') return send(res, 200, await workerHealth());
    if (req.method === 'GET' && path === '/studio/jobs') return send(res, 200, { jobs: await listStudioJobs(), worker: await workerHealth(), formats, maxBytes: 4 * 1024 * 1024 });
    if (req.method === 'POST' && path === '/studio/jobs') {
      if (!(await workerHealth()).online) return send(res, 503, { error: 'Worker offline' });
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 4 * 1024 * 1024) return send(res, 413, { error: 'Hosted uploads are limited to 4 MB' }); chunks.push(chunk); }
      const metadata = JSON.parse(Buffer.from(String(req.headers['x-ames-metadata'] || ''), 'base64').toString('utf8'));
      return send(res, 202, await queueStudioUpload(metadata, metadata.filename, Buffer.concat(chunks)));
    }
    const studioRoute = /^\/studio\/jobs\/([a-f0-9-]{36})(?:\/(preview.glb|poster.png|result.json|asset-pack.zip))?$/.exec(path);
    if (studioRoute) {
      const [, id, file] = studioRoute;
      if (req.method === 'POST' && !file) {
        if (!(await workerHealth()).online) return send(res, 503, { error: 'Worker offline' });
        return send(res, 202, await rerenderStudioJob(id));
      }
      if (req.method === 'GET' && file) {
        const job = await getStudioJob(id);
        const bytes = file === 'asset-pack.zip' ? buildStudioPack(job, await readStudioArtifact(job, 'preview.glb'), await readStudioArtifact(job, 'poster.png')) : await readStudioArtifact(job, file);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store' }); return res.end(bytes);
      }
      return send(res, 405, { error: 'Method not allowed' });
    }
    const route = /^\/products\/([a-zA-Z0-9._-]{1,36})\/jobs(?:\/([a-f0-9-]{36})(?:\/(preview.glb|poster.png|result.json))?)?$/.exec(path);
    if (!route) return send(res, 404, { error: 'Not found' });
    const [, productId, jobId, file] = route;
    if (req.method === 'GET' && !jobId) return send(res, 200, { jobs: await listJobs(productId), worker: await workerHealth() });
    if (req.method === 'GET' && jobId) {
      const job = await readJob(jobId);
      if (job.productId !== productId) return send(res, 404, { error: 'Not found' });
      if (!file) return send(res, 200, job);
      if (job.status !== 'ready') return send(res, 404, { error: 'Preview not ready' });
      const bytes = await readFile(join(jobDir(jobId), file));
      const expected = file === 'preview.glb' ? job.result.previewSha256 : file === 'poster.png' ? job.result.posterSha256 : null;
      if (expected && sha256(bytes) !== expected) throw new Error('Artifact checksum mismatch');
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store' }); return res.end(bytes);
    }
    if (req.method === 'POST' && !jobId) {
      if (!(await workerHealth()).online) return send(res, 503, { error: 'Worker offline' });
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 65536) return send(res, 413, { error: 'Metadata too large' }); chunks.push(chunk); }
      const { product, source, input } = JSON.parse(Buffer.concat(chunks).toString());
      if (product?.id !== productId || !source?.fileId || source.bytes > 100 * 1024 * 1024) return send(res, 400, { error: 'Invalid product source' });
      const storage = new Storage(new Client().setEndpoint(process.env.APPWRITE_ENDPOINT).setProject(process.env.APPWRITE_PROJECT_ID).setKey(process.env.APPWRITE_API_KEY));
      const bytes = Buffer.from(await storage.getFileDownload({ bucketId: 'jewelry-sources', fileId: source.fileId }));
      return send(res, 202, await queueJob(product, source, bytes, input));
    }
    return send(res, 405, { error: 'Method not allowed' });
  } catch { return send(res, 400, { error: 'CAD request could not be processed' }); }
});
server.requestTimeout = 60000; server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 3020), '127.0.0.1', () => console.log(`Private CAD broker listening on loopback:${server.address().port}`));
