"use client";

import { useRef, useState, useEffect } from "react";
import {useReducedMotion} from '@/lib/use-reduced-motion';
import { createTurntable, turntableEnabled, turntablePointerDown, turntablePointerUp, turntableReady, turntableReset, turntableTick } from '../lib/chat-turntable';

const guardedArRenderers = new WeakSet<object>();

interface ModelViewerProps {
  src: string;
  poster?: string;
  alt?: string;
  style?: React.CSSProperties;
  autoRotate?: boolean;
  cameraControls?: boolean;
  ar?: boolean;
  shadowIntensity?: string;
  cameraOrbit?: string;
  fieldOfView?: string;
  jewelryPresentation?: boolean;
  /** Explicit material study for an untextured mount; never changes source files. */
  metalPreview?: 'yellow-gold';
  controlledTurntable?: boolean;
  turntableEnabled?: boolean;
  turntableResetToken?: number;
  /** Fallback title shown when model fails to load */
  fallbackTitle?: string;
  /** Fallback subtitle */
  fallbackSubtitle?: string;
}

export default function ModelViewer({
  src,
  poster,
  alt = "3D model",
  style,
  autoRotate = true,
  cameraControls = true,
  ar = true,
  shadowIntensity = "1",
  cameraOrbit,
  fieldOfView,
  jewelryPresentation = false,
  metalPreview,
  controlledTurntable = false,
  turntableEnabled: turntableEnabledProp = false,
  turntableResetToken = 0,
  fallbackTitle,
  fallbackSubtitle = "Photography coming soon",
}: ModelViewerProps) {
  const reducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const turntableState = useRef(createTurntable(turntableEnabledProp));

  useEffect(() => {
    if (controlledTurntable) turntableState.current = turntableEnabled(turntableState.current, turntableEnabledProp && !reducedMotion, performance.now());
  }, [controlledTurntable, turntableEnabledProp, reducedMotion]);
  useEffect(() => { if(reducedMotion)(viewerRef.current as (HTMLElement & {pause?:()=>void}) | null)?.pause?.(); }, [reducedMotion, loaded]);

  useEffect(() => {
    if (controlledTurntable && turntableResetToken > 0) turntableState.current = turntableReset(turntableState.current, performance.now());
  }, [controlledTurntable, turntableResetToken]);

  useEffect(() => {
    const el = containerRef.current?.querySelector("model-viewer");
    if (!el) return;

    const onLoad = () => {
      if (metalPreview === 'yellow-gold') {
        type PreviewMaterial = { pbrMetallicRoughness: { setBaseColorFactor: (rgba: number[]) => void; setMetallicFactor: (value: number) => void; setRoughnessFactor: (value: number) => void } };
        const model = (el as HTMLElement & { model?: { materials: PreviewMaterial[] } }).model;
        model?.materials.forEach(({ pbrMetallicRoughness: material }) => {
          material.setBaseColorFactor([1, 0.766, 0.336, 1]);
          material.setMetallicFactor(1);
          material.setRoughnessFactor(0.24);
        });
      }
      setLoaded(true);
      if (controlledTurntable) turntableState.current = turntableReady(turntableState.current, performance.now());
    };
    const onError = () => {
      setError(true);
      turntableState.current = { ...turntableState.current, ready: false };
    };
    const onPointerDown = () => { turntableState.current = turntablePointerDown(turntableState.current, performance.now()); };
    const onPointerUp = () => { turntableState.current = turntablePointerUp(turntableState.current, performance.now()); };
    let frame = 0;
    const animate = (now: number) => {
      if (controlledTurntable) {
        const bounds = el.getBoundingClientRect();
        const onScreen = bounds.right > 0 && bounds.left < window.innerWidth && bounds.bottom > 0 && bounds.top < window.innerHeight;
        if (onScreen) {
          const previous = turntableState.current.angleDeg;
          const next = turntableTick(turntableState.current, now);
          turntableState.current = next;
          if (next.ready && next.angleDeg !== previous && (el as HTMLElement & { modelIsVisible?: boolean }).modelIsVisible) el.setAttribute('orientation', `0deg ${next.angleDeg.toFixed(3)}deg 0deg`);
        } else turntableState.current = { ...turntableState.current, lastFrameMs: now };
      }
      frame = requestAnimationFrame(animate);
    };

    el.addEventListener("load", onLoad);
    el.addEventListener("error", onError);
    if (controlledTurntable) {
      el.addEventListener('pointerdown', onPointerDown);
      el.addEventListener('pointerup', onPointerUp);
      el.addEventListener('pointercancel', onPointerUp);
      frame = requestAnimationFrame(animate);
    }
    Promise.all([import('@google/model-viewer'), import('@google/model-viewer/lib/model-viewer-base.js')])
      .then(([, { $renderer }]) => {
        if (!controlledTurntable) return;
        type ArRenderer = { presentedScene: unknown; onUpdateScene: () => void };
        const renderer = (el as unknown as Record<symbol, { arRenderer: ArRenderer }> )[$renderer];
        const arRenderer = renderer?.arRenderer;
        if (!arRenderer || guardedArRenderers.has(arRenderer)) return;
        // model-viewer 4.3.1 calls this AR update for orientation changes even outside AR.
        // The non-AR turntable must skip it while no AR scene is presented.
        const update = arRenderer.onUpdateScene;
        arRenderer.onUpdateScene = () => { if (arRenderer.presentedScene) update(); };
        guardedArRenderers.add(arRenderer);
      }).catch(onError);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("load", onLoad);
      el.removeEventListener("error", onError);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, [src, controlledTurntable, metalPreview]);

  if (error) {
    return (
      <div
        className={jewelryPresentation ? "ames-object-display" : undefined}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#F5F4F2",
          borderRadius: 14,
          border: "1px solid rgba(23,23,23,0.08)",
          padding: 24,
          color: "#6E6C69",
          textAlign: "center",
          position: 'relative',
          overflow: 'hidden',
          ...style,
        }}
      >
        {poster && <img src={poster} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', inset: 0 }} />}
        {/* Platinum diamond glyph fallback */}
        {!poster && <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ marginBottom: 12, opacity: 0.5 }}>
          <path d="M20 4 L28 16 L20 36 L12 16 Z" stroke="#A6A6AB" strokeWidth="1.5" fill="none" />
          <path d="M12 16 L28 16" stroke="#A6A6AB" strokeWidth="1" />
          <path d="M15 16 L20 4 L25 16" stroke="#A6A6AB" strokeWidth="1" />
          <path d="M15 16 L20 36 L25 16" stroke="#A6A6AB" strokeWidth="1" />
        </svg>}
        {fallbackTitle && !poster && (
          <p style={{ fontSize: 13, fontWeight: 500, color: "#171717", marginBottom: 4 }}>{fallbackTitle}</p>
        )}
        {!poster && <p style={{ fontSize: 11, color: "#A6A6AB" }}>{fallbackSubtitle}</p>}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={jewelryPresentation ? "ames-object-display" : undefined} style={{ position: "relative", width: "100%", ...style }}>
      {poster && !loaded && <img src={poster} alt={alt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />}
      {/* @ts-expect-error — model-viewer is a custom element */}
      <model-viewer
        ref={viewerRef}
        src={src}
        alt={alt}
        poster={poster || ""}
        camera-orbit={cameraOrbit}
        field-of-view={fieldOfView}
        auto-rotate={controlledTurntable || reducedMotion ? false : autoRotate}
        camera-controls={cameraControls}
        shadow-intensity={jewelryPresentation ? '0.55' : shadowIntensity}
        shadow-softness={jewelryPresentation ? '1' : '0.5'}
        exposure={jewelryPresentation ? '1' : '1.2'}
        min-camera-orbit={jewelryPresentation ? 'auto auto 45%' : undefined}
        max-camera-orbit={jewelryPresentation ? 'auto auto 160%' : undefined}
        environment-image={jewelryPresentation ? "/ames-engine/environments/studio-small-09-v1/studio.hdr" : "neutral"}
        interaction-prompt="none"
        touch-action="pan-y"
        autoplay={!reducedMotion}
        {...(ar ? { ar: true, "ar-modes": "webxr scene-viewer quick-look" } : {})}
        style={{
          width: "100%",
          height: "100%",
          background: "transparent",
          display: "block",
          opacity: loaded ? 1 : 0,
        }}
      />
      {/* Loading shimmer — shown while model loads */}
      {!loaded && !error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "2px solid #D9D7D3",
              borderTopColor: "#A6A6AB",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
