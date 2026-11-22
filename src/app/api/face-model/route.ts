// Serve the pinned face tracking model from the app's origin (the portrait try-on), as /api/hand-model does.
const modelURL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export async function GET() {
  const result = await fetch(modelURL, { cache: 'force-cache', signal: AbortSignal.timeout(20000) });
  if (!result.ok || !result.body) return new Response(null, { status: 502 });
  return new Response(result.body, { headers: {
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'public, max-age=604800, s-maxage=2592000',
  } });
}
