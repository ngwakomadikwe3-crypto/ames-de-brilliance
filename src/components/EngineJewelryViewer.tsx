"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {useReducedMotion} from '@/lib/use-reduced-motion';
import type { JewelryOpticsProfile, CameraPreset } from "ames-engine";

const JewelryViewer = dynamic(
  () => import("ames-engine").then(module => module.JewelryViewer),
  { ssr: false },
);

class ViewerBoundary extends Component<{ children: ReactNode; onFailure: (error?: Error) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onFailure(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function EngineJewelryViewer(props: ViewerProps) {
  return <SelectedViewer key={props.src} {...props} />;
}

type ViewerProps = {
  cameraPreset?: CameraPreset;
  zoom?: number;
  turntableEnabled?: boolean;
  paused?: boolean;
  opticsProfile?: JewelryOpticsProfile;
  resetToken?: number;
  autoLoad?: boolean;
  src: string;
  poster?: string;
  alt?: string;
  style?: React.CSSProperties;
};

function SelectedViewer({
  src,
  poster,
  alt,
  style,
  cameraPreset, zoom, turntableEnabled, resetToken, paused = false, opticsProfile = "soft-studio", autoLoad = false,
}: ViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const effectiveTurntable = paused || reducedMotion ? false : turntableEnabled;
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'fallback'>(autoLoad ? 'loading' : 'idle');
  const [attempt, setAttempt] = useState(0);
  const [posterFailed, setPosterFailed] = useState(false);
  const [failureReason, setFailureReason] = useState('');
  const handleReady = useCallback(() => setState(current => current === 'loading' ? 'ready' : current), []);
  const handleFailure = useCallback((error?: Error) => { setFailureReason(error?.message.includes('Studio lighting') ? 'Studio lighting could not load.' : 'The 3D model or renderer could not load.'); setState('fallback'); }, []);
  const load3D = useCallback(() => { setFailureReason(''); setPosterFailed(false); setState('loading'); }, []);
  useEffect(() => {
    const element = host.current;
    const lost = (event: Event) => { event.preventDefault(); handleFailure(); };
    const failed = () => handleFailure();
    element?.addEventListener('ames-viewer-error', failed);
    element?.addEventListener('webglcontextlost', lost, true);
    return () => { element?.removeEventListener('ames-viewer-error', failed); element?.removeEventListener('webglcontextlost', lost, true); };
  }, [handleFailure]);
  // R3F Canvas owns renderer disposal; manual context loss can race asset switches.
  useEffect(() => {
    if (state !== 'loading') return;
    const timeout = setTimeout(handleFailure, 60000);
    return () => clearTimeout(timeout);
  }, [state, attempt, handleFailure]);
  const modelUrl = attempt && !src.startsWith('blob:') ? `${src}${src.includes('?') ? '&' : '?'}ames_retry=${attempt}` : src;
  const showPoster = poster && !posterFailed && state !== 'ready';
  return (
    <div ref={host} className="ames-object-display" data-ames-engine-host data-viewer-state={state} data-model-source={src} data-optics-profile={opticsProfile} data-camera-preset={cameraPreset} data-zoom={zoom} data-turntable-enabled={effectiveTurntable} aria-label={alt ?? 'Jewelry preview'} style={{ position: "relative", width: "100%", height: "100%", overflow: 'hidden', ...style }}>
      {showPoster && <img src={poster} alt={alt ?? "Jewelry preview"} onError={() => setPosterFailed(true)} loading="eager" decoding="async" style={{ position: "absolute", inset: 0, width: '100%', height: "100%", objectFit: 'contain', zIndex: 1, pointerEvents: "none" }} />}
      {(state === 'loading' || state === 'ready') && <ViewerBoundary key={attempt} onFailure={handleFailure}><JewelryViewer
        modelUrl={modelUrl}
        cameraPreset={cameraPreset} zoom={zoom} turntableEnabled={effectiveTurntable} resetToken={resetToken}
        paused={paused}
        opticsProfile={opticsProfile}
        controlsEnabled
        transparentBackground
        onModelReady={handleReady}
        style={{ width: "100%", height: "100%", borderRadius: 14, overflow: "hidden" }}
      /></ViewerBoundary>}
      {state === 'idle' && <button type="button" onClick={load3D} data-load-3d className="absolute bottom-4 left-1/2 z-20 min-h-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/25 bg-[#031815]/90 px-4 text-[11px] text-[#eef5f2] shadow-lg backdrop-blur-md">View interactive 3D</button>}
      {state === 'loading' && <span role="status" className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#031815]/90 px-4 py-2 text-[11px] text-[#eef5f2]">Loading interactive 3D…</span>}
      {state === 'fallback' && <div role="status" style={{ position: 'absolute', bottom: 8, left: 8, right: 8, zIndex: 20, color: '#eef5f2', fontSize: 12, textAlign: 'center' }}>
        <span style={{ background: 'rgba(3,24,21,0.92)', padding: '6px 10px', borderRadius: 12 }}>
          {failureReason} {showPoster ? 'Showing the still preview.' : '3D preview unavailable.'}
          <button type="button" data-load-3d onClick={() => { setAttempt(value => value + 1); load3D(); }} style={{ marginLeft: 10, textDecoration: 'underline', cursor: 'pointer' }}>Retry 3D</button>
        </span>
      </div>}
    </div>
  );
}
