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

/** "49 diamonds", "12 rubies": the bracelet's stones (the AMES tennis bracelet has one diamond a link). */
function stonesLabel(b: { links: number; stones?: number; stone?: string }) {
  const count = b.stones ?? b.links, name = (b.stone ?? 'Diamond').toLowerCase();
  if (!count) return '';
  if (count === 1) return `1 ${name}`;
  return `${count} ${/[^aeiou]y$/.test(name) ? name.slice(0, -1) + 'ies' : /(s|x|z|ch|sh)$/.test(name) ? name + 'es' : name + 's'}`;
}

/** Where a necklace of this length sits (standard jewellery lengths). */
function necklaceLength(mm: number) {
  const cm = mm / 10;
  return cm < 38 ? 'Collar length — sits close at the base of the neck' : cm < 46 ? 'Princess length — rests on the collarbone'
    : cm < 56 ? 'Matinee length — falls to the top of the neckline' : cm < 76 ? 'Opera length — falls to the bust' : 'Rope length';
}

function SelectedViewer({
  src,
  poster,
  alt,
  style,
  cameraPreset, zoom, turntableEnabled, resetToken, paused = false, opticsProfile = "soft-studio", autoLoad = false,
}: ViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const [viewReset, setViewReset] = useState(0);
  const [viewZoom, setViewZoom] = useState(zoom ?? 1);
  useEffect(() => { setViewZoom(zoom ?? 1); }, [zoom, resetToken]);
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
  // A bracelet built link by link reports its size on the canvas; offer to unclasp it and lay it flat.
  const [bracelet, setBracelet] = useState<{ length_mm: number; width_mm: number; links: number; clasp: string; stones?: number; stone?: string; kind?: string; drop_mm?: number } | null>(null);
  const [hint, setHint] = useState(false);
  const [flat, setFlat] = useState(false), [measured, setMeasured] = useState(false);
  // The how-to hint shows for a few seconds once a piece is laid flat, then gets out of the way.
  useEffect(() => { if (!flat || !measured) { setHint(false); return; } setHint(true); const t = setTimeout(() => setHint(false), 4000); return () => clearTimeout(t); }, [flat, measured]);
  useEffect(() => {
    setBracelet(null); setFlat(false); setMeasured(false);
    if (state !== 'ready') return;
    let tries = 0;
    const timer = setInterval(() => {
      const info = host.current?.querySelector('canvas')?.dataset.amesBracelet;
      if (info) { try { setBracelet(JSON.parse(info)); } catch { /* not a bracelet */ } clearInterval(timer); }
      else if (++tries > 20) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [state, src]);
  // A piece that opens (a watch case) says so on the canvas; offer to open it. Tapping the lid also works.
  const [openable, setOpenable] = useState(''), [opened, setOpened] = useState(false);
  useEffect(() => {
    setOpenable(''); setOpened(false);
    if (state !== 'ready') return;
    let tries = 0;
    const timer = setInterval(() => {
      const canvas = host.current?.querySelector('canvas'), label = canvas?.dataset.amesOpenable;
      if (label && canvas) { setOpenable(label); clearInterval(timer); }
      else if (++tries > 20) clearInterval(timer);
    }, 250);
    // Follow taps on the lid too.
    const watch = setInterval(() => { const s = host.current?.querySelector('canvas')?.dataset.amesOpenState; if (s === 'open') setOpened(true); else if (s === 'closed') setOpened(false); }, 300);
    return () => { clearInterval(timer); clearInterval(watch); };
  }, [state, src]);
  const toggleOpen = useCallback(() => {
    const canvas = host.current?.querySelector('canvas'); if (!canvas) return;
    canvas.dispatchEvent(new CustomEvent('ames:open', { detail: { open: !opened } })); setOpened(!opened);
  }, [opened]);
  const toggleClasp = useCallback(() => {
    const canvas = host.current?.querySelector('canvas'); if (!canvas) return;
    const next = !flat; setFlat(next); setMeasured(false);
    canvas.dispatchEvent(new CustomEvent('ames:bracelet', { detail: { flat: next } }));
    if (next) { const check = setInterval(() => { if (canvas.dataset.amesBraceletState === 'flat') { setMeasured(true); clearInterval(check); } }, 100); setTimeout(() => clearInterval(check), 4000); }
  }, [flat]);
  const modelUrl = attempt && !src.startsWith('blob:') ? `${src}${src.includes('?') ? '&' : '?'}ames_retry=${attempt}` : src;
  const showPoster = poster && !posterFailed && state !== 'ready';
  return (
    <div ref={host} className="ames-object-display" data-ames-engine-host data-viewer-state={state} data-model-source={src} data-optics-profile={opticsProfile} data-camera-preset={cameraPreset} data-zoom={zoom} data-turntable-enabled={effectiveTurntable} aria-label={alt ?? 'Jewelry preview'} style={{ position: "relative", width: "100%", height: "100%", overflow: 'hidden', ...style }}>
      {showPoster && <img src={poster} alt={alt ?? "Jewelry preview"} onError={() => setPosterFailed(true)} loading="eager" decoding="async" style={{ position: "absolute", inset: 0, width: '100%', height: "100%", objectFit: 'contain', zIndex: 1, pointerEvents: "none" }} />}
      {(state === 'loading' || state === 'ready') && <ViewerBoundary key={attempt} onFailure={handleFailure}><JewelryViewer
        modelUrl={modelUrl}
        cameraPreset={cameraPreset ?? 'three_quarter'} zoom={viewZoom} turntableEnabled={effectiveTurntable} resetToken={(resetToken ?? 0) + viewReset}
        paused={paused}
        opticsProfile={opticsProfile}
        controlsEnabled
        transparentBackground
        onModelReady={handleReady}
        style={{ width: "100%", height: "100%", borderRadius: 14, overflow: "hidden" }}
      /></ViewerBoundary>}
      {state === 'ready' && <div role="group" aria-label="3D view controls" className="absolute right-3 top-3 z-20 flex gap-2">
        <button type="button" aria-label="Zoom out" disabled={viewZoom <= 0.5} onClick={() => setViewZoom(value => Math.max(0.5, value - 0.25))} className="ames-pill min-h-11 min-w-11 rounded-full px-3 disabled:opacity-40">−</button>
        <button type="button" aria-label="Zoom in" disabled={viewZoom >= 3} onClick={() => setViewZoom(value => Math.min(3, value + 0.25))} className="ames-pill min-h-11 min-w-11 rounded-full px-3 disabled:opacity-40">+</button>
        <button type="button" onClick={() => { setViewZoom(zoom ?? 1); setViewReset(value => value + 1); }} className="ames-pill min-h-11 rounded-full px-3 text-xs">Reset view</button>
      </div>}
      {state === 'ready' && bracelet && <div data-bracelet-measure className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2" style={{ width: 'max-content', maxWidth: 'calc(100% - 24px)' }}>
        {/* Kept to one short line: length and wrist or neck size. The how-to hint shows briefly after unclasping. */}
        {flat && measured && <span role="status" className="rounded-full bg-[#031815]/70 px-3 py-1 text-center text-[11px] text-[#eef5f2] backdrop-blur-md">
          {(bracelet.length_mm / 10).toFixed(1)} cm · {bracelet.kind === 'necklace' ? necklaceLength(bracelet.length_mm) : `fits a wrist up to ${Math.floor(bracelet.length_mm / 10 - 1.5)} cm`}
        </span>}
        {hint && <span className="rounded-full bg-[#031815]/60 px-3 py-1 text-[10px] text-[#b8d0c8] backdrop-blur-md transition-opacity">{bracelet?.kind === 'watch' ? 'Drag the strap down to curl it' : 'Drag a link to fold it'}</span>}
        <button type="button" onClick={toggleClasp} aria-pressed={flat} className="ames-pill min-h-10 whitespace-nowrap rounded-full px-4 text-[11px] backdrop-blur-md">{flat ? 'Close the clasp' : 'Unclasp & measure'}</button>
      </div>}
      {state === 'ready' && openable && !bracelet && <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
        <button type="button" onClick={toggleOpen} aria-pressed={opened} className="ames-pill min-h-10 whitespace-nowrap rounded-full px-4 text-[11px] backdrop-blur-md">{opened ? `Close the ${openable}` : `Open the ${openable}`}</button>
      </div>}
      {state === 'idle' && <button type="button" onClick={load3D} data-load-3d className="ames-pill absolute bottom-4 left-1/2 z-20 min-h-10 -translate-x-1/2 whitespace-nowrap rounded-full px-4 text-[11px] backdrop-blur-md">View interactive 3D</button>}
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
