// The face's own outline in each scan photo, for System 1's outline fit (face-outline.ts): MediaPipe's selfie
// multiclass segmenter (Apache-2.0) labels every pixel background / hair / body skin / face skin / clothes / other.
// Model: public/hand-tracking/segment-v1.tflite, fetched at build like the hand and face models (MediaPipe "latest" float32,
// sha256 c6748b12…e0e0 when this was written), or /api/segment-model.
export const SEG = { background: 0, hair: 1, body: 2, face: 3, clothes: 4, other: 5 } as const;
export type Segmentation = { width: number; height: number; labels: Uint8Array };

let pending: Promise<{ segment: (img: ImageData) => Segmentation }> | undefined;
async function load() {
  const [{ ImageSegmenter, FilesetResolver }, bytes] = await Promise.all([
    import('@mediapipe/tasks-vision'),
    (async () => { let r = await fetch('/hand-tracking/segment-v1.tflite');
      if (!r.ok || r.headers.get('content-type')?.includes('text/html')) r = await fetch('/api/segment-model');
      if (!r.ok) throw Error('Segmentation model unavailable'); return new Uint8Array(await r.arrayBuffer()); })(),
  ]);
  const files = await FilesetResolver.forVisionTasks('/hand-tracking/wasm');
  const seg = await ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetBuffer: bytes }, runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: false });
  return {
    segment(img: ImageData): Segmentation {
      let out: Segmentation | undefined;
      seg.segment(img, r => { const m = r.categoryMask!; out = { width: m.width, height: m.height, labels: m.getAsUint8Array().slice() }; m.close(); });
      if (!out) throw Error('Segmentation failed');
      return out;
    },
  };
}
export function faceSegmenter() { return pending ??= load().catch(e => { pending = undefined; throw e; }); }
