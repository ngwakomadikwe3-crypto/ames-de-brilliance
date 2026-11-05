import { mkdir, readFile, writeFile, rename, readdir, open, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

export const formats = ['obj', 'stl', 'glb', 'fbx'];
export const materials = ['preserve', 'unassigned', 'yellow_gold', 'rose_gold', 'white_gold', 'silver', 'platinum', 'diamond', 'ruby', 'sapphire', 'emerald'];
export const requestSchema = z.object({
  sourceFileId: z.string().min(1).max(64),
  units: z.enum(['unknown', 'mm', 'cm', 'm', 'in']),
  baseJobId: z.string().uuid().optional(),
  materialsConfirmed: z.boolean().default(false),
  assignments: z.record(z.string().regex(/^part-\d+$/), z.enum(materials)).refine(value => Object.keys(value).length <= 500, 'Maximum 500 component assignments').default({}),
});
// Runtime-private data lives outside the deployment bundle on the hosted worker.
export const root = () => resolve(/* turbopackIgnore: true */ process.env.AMES_CAD_ROOT || resolve(process.cwd(), '.ames-cad'));
export function jobDir(id) {
  if (!z.string().uuid().safeParse(id).success) throw new Error('Invalid conversion ID');
  return join(root(), 'jobs', id);
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function atomicJson(path, value) {
  const tmp = path + '.' + randomUUID() + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, 2));
  try {
    for (let attempt=0;;attempt++) {
      try { await rename(tmp,path); break; }
      catch(error) {
        if (!['EPERM','EBUSY','EACCES'].includes(error.code) || attempt>=12) throw error;
        await new Promise(resolve => setTimeout(resolve,100*(attempt+1)));
      }
    }
  } finally { await unlink(tmp).catch(()=>{}); }
}
export async function readJob(id) { return JSON.parse(await readFile(join(jobDir(id), 'job.json'), 'utf8')); }
export async function listJobs(productId) {
  const entries = await readdir(join(root(), 'jobs')).catch(() => []);
  const jobs = await Promise.all(entries.map(id => readJob(id).catch(() => null)));
  return jobs.filter(job => job && job.productId === productId).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
export function validateSource(filename, bytes) {
  const ext = filename.toLowerCase().split('.').pop();
  if (!formats.includes(ext)) throw new Error('Automatic preview supports OBJ, STL, GLB and FBX. Export native CAD to one of these formats.');
  if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new Error('Conversion limit is 100 MB per source');
  if (ext === 'glb') {
    if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB file');
    const jsonLength = bytes.readUInt32LE(12);
    if (jsonLength > bytes.length - 20 || bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB JSON');
    const gltf = JSON.parse(bytes.subarray(20,20+jsonLength).toString());
    for (const item of [...(gltf.buffers || []), ...(gltf.images || [])]) {
      if (item.uri && !item.uri.startsWith('data:')) throw new Error('GLB must embed all buffers and textures');
    }
  }
  return ext;
}
export async function queueJob(product, source, bytes, input) {
  const request = requestSchema.parse(input);
  if (!['submitted','processing','revision_requested'].includes(product.workflow_status)) throw new Error('Request a revision before changing a reviewed product');
  if (source.kind !== 'source' || source.fileId !== request.sourceFileId || !product.source_hashes.includes(source.sha256) || sha256(bytes) !== source.sha256) throw new Error('Source identity or checksum mismatch');
  const ext = validateSource(source.filename,bytes);
  if (request.baseJobId) {
    const base = await readJob(request.baseJobId);
    if (base.productId !== product.id || base.sourceSha256 !== source.sha256 || base.status !== 'ready') throw new Error('Material review does not match this source');
    if (Object.keys(request.assignments).length && !request.materialsConfirmed) throw new Error('Confirm material choices before rendering');
    const ids = new Set(base.result.components.map(part => part.id));
    if (Object.keys(request.assignments).some(id => !ids.has(id))) throw new Error('Unknown model component');
  } else if (Object.keys(request.assignments).length) throw new Error('Inspect the model before assigning materials');
  await mkdir(join(root(),'locks'),{recursive:true});
  const lockPath = join(root(),'locks',sha256(Buffer.from(product.id))+'.lock');
  const lock = await open(lockPath,'wx').catch(() => { throw new Error('Another conversion request is being saved. Retry shortly.'); });
  try {
    const previous = await listJobs(product.id);
    if (previous.some(job => ['queued','processing'].includes(job.status))) throw new Error('This product already has a pending conversion');
    const id = randomUUID(), dir = jobDir(id);
    await mkdir(dir,{recursive:true});
    await writeFile(join(dir,'source.'+ext),bytes);
    const job = { id, productId:product.id, assetId:product.asset_id, name:product.name, category:product.category,
      sourceFileId:source.fileId, sourceFilename:source.filename, sourceSha256:source.sha256, extension:ext,
      units:request.units, assignments:request.assignments, materialsConfirmedAt:request.materialsConfirmed?new Date().toISOString():null, status:'queued', createdAt:new Date().toISOString(), result:null, error:null };
    await atomicJson(join(dir,'job.json'),job);
    return job;
  } finally { await lock.close(); await unlink(lockPath); }
}
export async function workerHealth() {
  try { const health = JSON.parse(await readFile(join(root(),'worker.json'),'utf8')); return { online: Date.now()-Date.parse(health.at)<20000 }; }
  catch { return {online:false}; }
}
