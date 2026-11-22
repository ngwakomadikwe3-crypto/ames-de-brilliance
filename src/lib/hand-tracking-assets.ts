// MediaPipe HandLandmarker runtime and model, fetched once and shared by every camera view.
async function loadTrackingAssets(){
  const model=async()=>{
    let response=await fetch('/hand-tracking/hand-v1.task');
    if(!response.ok || response.headers.get('content-type')?.includes('text/html'))response=await fetch('/api/hand-model');
    if(!response.ok)throw Error('Tracking model unavailable');
    return new Uint8Array(await response.arrayBuffer());
  };
  const [runtime,bytes]=await Promise.all([
    import('@mediapipe/tasks-vision').then(async module=>({HandLandmarker:module.HandLandmarker,files:await module.FilesetResolver.forVisionTasks('/hand-tracking/wasm')})),
    model()
  ]);
  return {...runtime,bytes};
}
let pendingAssets:ReturnType<typeof loadTrackingAssets>|undefined;
export function trackingAssets(){
  return pendingAssets??=(loadTrackingAssets().catch(error=>{pendingAssets=undefined;throw error}));
}


// MediaPipe FaceLandmarker for the portrait try-on: same runtime files, its own pinned model.
async function loadFaceAssets(){
  const model=async()=>{
    let response=await fetch('/hand-tracking/face-v1.task');
    if(!response.ok || response.headers.get('content-type')?.includes('text/html'))response=await fetch('/api/face-model');
    if(!response.ok)throw Error('Face tracking model unavailable');
    return new Uint8Array(await response.arrayBuffer());
  };
  const [runtime,bytes]=await Promise.all([
    import('@mediapipe/tasks-vision').then(async module=>({FaceLandmarker:module.FaceLandmarker,files:await module.FilesetResolver.forVisionTasks('/hand-tracking/wasm')})),
    model()
  ]);
  return {...runtime,bytes};
}
let pendingFace:ReturnType<typeof loadFaceAssets>|undefined;
export function faceTrackingAssets(){
  return pendingFace??=(loadFaceAssets().catch(error=>{pendingFace=undefined;throw error}));
}
