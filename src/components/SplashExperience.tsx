"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const SPLASH_PRELOADS = <link rel="preload" as="video" href="/intro.mp4" type="video/mp4" />;

interface SplashExperienceProps {
  onComplete?: () => void;
  sessionKey?: string;
  replayPerSession?: boolean;
}

/** Full-screen cinematic gate. The application tree is rendered underneath it by the host. */
export default function SplashExperience({ onComplete, sessionKey = "ames-intro-seen", replayPerSession = false }: SplashExperienceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCompleteRef = useRef(onComplete);
  const phaseRef = useRef<"PLAYING" | "BRIDGING" | "EXITING" | "UNMOUNTED">("PLAYING");
  const callbackRef = useRef(false);
  const readyRef = useRef(false);
  const watchdogRef = useRef<number | null>(null);
  const bridgeRef = useRef<number | null>(null);
  const exitRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [bridging, setBridging] = useState(false);
  const [videoHidden, setVideoHidden] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { performance.mark("ames-splash-start"); }, []);

  const finish = useCallback(() => {
    if (phaseRef.current === "EXITING" || phaseRef.current === "UNMOUNTED") return;
    phaseRef.current = "EXITING";
    if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
    if (bridgeRef.current) window.clearTimeout(bridgeRef.current);
    watchdogRef.current = null;
    bridgeRef.current = null;
    performance.mark("ames-splash-transition-start");
    try { sessionStorage.setItem(sessionKey, "1"); } catch {}
    setVideoHidden(true);
    setExiting(true);
    exitRef.current = window.setTimeout(() => { phaseRef.current = "UNMOUNTED"; performance.mark("ames-splash-transition-end"); performance.measure("ames-splash-transition", "ames-splash-transition-start", "ames-splash-transition-end"); setVisible(false); exitRef.current = null; }, 560);
  }, [sessionKey]);
  const complete = useCallback(() => {
    if (phaseRef.current !== "PLAYING") return;
    phaseRef.current = "BRIDGING";
    setBridging(true);
    if (!callbackRef.current) { callbackRef.current = true; onCompleteRef.current?.(); }
    bridgeRef.current = window.setTimeout(finish, 900);
  }, [finish]);

  useEffect(() => {
    if (replayPerSession) return;
    try {
      if (sessionStorage.getItem(sessionKey) === "1") {
        phaseRef.current = "UNMOUNTED";
        callbackRef.current = true;
        setVisible(false);
        performance.mark("ames-splash-session-skip");
        onCompleteRef.current?.();
      }
    } catch {}
  }, [replayPerSession, sessionKey]);

  useEffect(() => {
    if (phaseRef.current !== "PLAYING") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { complete(); return; }
    watchdogRef.current = window.setTimeout(complete, 12000);
    return () => { if (watchdogRef.current) window.clearTimeout(watchdogRef.current); };
  }, [complete]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || fallback || phaseRef.current !== "PLAYING") return;
    // A failed request can complete before React hydration attaches onError.
    if (video.error) { setFallback(true); if (watchdogRef.current) window.clearTimeout(watchdogRef.current); watchdogRef.current = null; bridgeRef.current = window.setTimeout(complete, 650); return; }
    video.muted = true;
    let cancelled = false;
    const attempt = () => {
      if (cancelled || phaseRef.current !== "PLAYING" || video.readyState < 3) return;
      if (!readyRef.current) { readyRef.current = true; performance.mark("ames-splash-video-ready"); performance.measure("ames-splash-load", "ames-splash-start", "ames-splash-video-ready"); }
      void video.play().catch(() => { if (!cancelled && phaseRef.current === "PLAYING") { setFallback(true); if (watchdogRef.current) window.clearTimeout(watchdogRef.current); watchdogRef.current = null; bridgeRef.current = window.setTimeout(complete, 650); } });
    };
    const bridge = () => {
      if (Number.isFinite(video.duration) && video.duration - video.currentTime <= 0.75) complete();
    };
    video.addEventListener("canplay", attempt, { once: true });
    video.addEventListener("timeupdate", bridge);
    attempt();
    return () => { cancelled = true; video.removeEventListener("canplay", attempt); video.removeEventListener("timeupdate", bridge); };
  }, [complete, fallback]);

  useEffect(() => () => {
    if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
    if (bridgeRef.current) window.clearTimeout(bridgeRef.current);
    if (exitRef.current) window.clearTimeout(exitRef.current);
    watchdogRef.current = null; bridgeRef.current = null; exitRef.current = null;
  }, []);

  if (!visible) return null;
  return <div className={`splash-experience${bridging ? " is-bridging" : ""}${exiting ? " is-exiting" : ""}`} role="presentation" aria-label="AMES opening">
    {SPLASH_PRELOADS}
    {!fallback && !videoHidden && <video ref={videoRef} src="/intro.mp4" autoPlay muted playsInline preload="auto" onEnded={complete} onError={() => { if (phaseRef.current !== "PLAYING") return; setFallback(true); if (watchdogRef.current) window.clearTimeout(watchdogRef.current); watchdogRef.current = null; bridgeRef.current = window.setTimeout(complete, 650); }} disablePictureInPicture aria-hidden="true" />}
    {fallback && <span className="splash-fallback" aria-hidden="true" />}
    <style>{`.splash-experience{position:fixed;inset:0;z-index:9999;overflow:hidden;background:#063c3b url('/ames-silk-bg.webp') center/cover no-repeat;opacity:1;transition:opacity 560ms cubic-bezier(.22,.61,.36,1);contain:paint}.splash-experience.is-bridging{background-position:center;}.splash-experience.is-bridging video{opacity:.35;transform:scale(1.01)}.splash-experience.is-exiting{opacity:0;pointer-events:none}.splash-experience video,.splash-fallback{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#063c3b;transition:opacity 900ms cubic-bezier(.22,.61,.36,1),transform 900ms cubic-bezier(.22,.61,.36,1)}.splash-experience.is-exiting video{opacity:0}.splash-fallback{background:#063c3b url('/ames-silk-bg.webp') center/cover no-repeat}@media(prefers-reduced-motion:reduce){.splash-experience,.splash-experience video{transition:none}}`}</style>
  </div>;
}
