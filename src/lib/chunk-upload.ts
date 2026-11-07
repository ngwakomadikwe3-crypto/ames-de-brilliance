// Browser: upload a file in the server's 3 MB parts (Vercel limits request bodies), after declaring its size and SHA-256.
export async function sha256Hex(blob: Blob) {
  const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
async function call(url: string, init: RequestInit) {
  const response = await fetch(url, init), body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Upload failed'); return body;
}
/** start: declares the file (returns chunkSize); part(i): URL for part i. Returns the last server reply. */
export async function chunkUpload(blob: Blob, name: string, start: (file: { name: string; bytes: number; sha256: string }) => { url: string; method: string; body: object },
  part: (index: number) => string, onProgress?: (percent: number) => void) {
  const file = { name, bytes: blob.size, sha256: await sha256Hex(blob) }, s = start(file);
  const begun = await call(s.url, { method: s.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s.body) });
  const size = Number(begun.chunkSize) || 3 * 1024 * 1024; let last = begun;
  for (let i = 0; i * size < blob.size; i++) {
    last = await call(part(i), { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: blob.slice(i * size, (i + 1) * size) });
    onProgress?.(Math.round(Math.min(1, (i + 1) * size / blob.size) * 100));
  }
  return last;
}
