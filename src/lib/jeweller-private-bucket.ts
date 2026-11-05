import { getStorage } from './appwrite';
// One private bucket for verification documents and UUID-named listing parts.
// Routes decide which files may be downloaded; no client receives bucket access.
export const jewellerPrivateBucket = process.env.AMES_JEWELLER_FILES_BUCKET || 'jewelry-sources';
export async function ensureJewellerPrivateBucket() {
  const storage = getStorage(), bucketId = jewellerPrivateBucket;
  const extensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'bin'];
  let bucket;
  try { bucket = await storage.getBucket({ bucketId }); }
  catch (e) {
    if ((e as { code?: number }).code !== 404) throw e;
    try { bucket = await storage.createBucket({ bucketId, name: 'Private jeweller files', permissions: [], fileSecurity: false, maximumFileSize: 4194304, allowedFileExtensions: extensions }); }
    catch (conflict) {
      if ((conflict as { code?: number }).code !== 409) {
        if ((conflict as { code?: number }).code === 403) {
          const available = await storage.listBuckets().catch(() => null);
          console.error('Private jeweller bucket unavailable', { requested: bucketId, existing: available?.buckets.map(b => ({ id: b.$id, permissions: b.$permissions })) });
        }
        throw conflict;
      }
      bucket = await storage.getBucket({ bucketId });
    }
  }
  if (bucket.$permissions.length) throw new Error('Jeweller files require a private storage bucket');
  const current = bucket.allowedFileExtensions || [];
  if (current.length && extensions.some(e => !current.includes(e)) || bucket.maximumFileSize > 0 && bucket.maximumFileSize < 4194304) {
    await storage.updateBucket({ bucketId, name: bucket.name,
      allowedFileExtensions: current.length ? [...new Set([...current, ...extensions])] : [],
      maximumFileSize: bucket.maximumFileSize === 0 ? 0 : Math.max(bucket.maximumFileSize, 4194304) });
  }
}
