// Serve the face segmentation model from the app's origin (the face scan's outline fit), as /api/face-model does.
const modelURL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';

export async function GET() {
  const result = await fetch(modelURL, { cache: 'force-cache', signal: AbortSignal.timeout(20000) });
  if (!result.ok || !result.body) return new Response(null, { status: 502 });
  return new Response(result.body, { headers: {
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'public, max-age=604800, s-maxage=2592000',
  } });
}
