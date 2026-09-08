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
  const completionRef = useRef(false);
  const readyRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { performance.mark("ames-splash-start"); }, []);

  const complete = useCallback(() => {
    if (completionRef.current) return;
    completionRef.current = true;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    performance.mark("ames-splash-transition-start");
    try { sessionStorage.setItem(sessionKey, "1"); } catch {}
    onCompleteRef.current?.();
    setExiting(true);
    timeoutRef.current = window.setTimeout(() => { performance.mark("ames-splash-transition-end"); performance.measure("ames-splash-transition", "ames-splash-transition-start", "ames-splash-transition-end"); setVisible(false); }, 560);
  }, [sessionKey]);

  useEffect(() => {
    if (replayPerSession) return;
    try {
      if (sessionStorage.getItem(sessionKey) === "1") {
        completionRef.current = true;
        setVisible(false);
        performance.mark("ames-splash-session-skip");
        onCompleteRef.current?.();
      }
    } catch {}
  }, [replayPerSession, sessionKey]);

  useEffect(() => {
    if (completionRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { complete(); return; }
    timeoutRef.current = window.setTimeout(complete, 12000);
    return () => { if (timeoutRef.current) window.clearTimeout(timeoutRef.current); };
  }, [complete]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || fallback || completionRef.current) return;
    // A failed request can complete before React hydration attaches onError.
    if (video.error) { setFallback(true); if (timeoutRef.current) window.clearTimeout(timeoutRef.current); timeoutRef.current = window.setTimeout(complete, 650); return; }
    video.muted = true;
    let cancelled = false;
    const attempt = () => {
      if (cancelled || completionRef.current || video.readyState < 3) return;
      if (!readyRef.current) { readyRef.current = true; performance.mark("ames-splash-video-ready"); performance.measure("ames-splash-load", "ames-splash-start", "ames-splash-video-ready"); }
      void video.play().catch(() => { if (!cancelled && !completionRef.current) { setFallback(true); if (timeoutRef.current) window.clearTimeout(timeoutRef.current); timeoutRef.current = window.setTimeout(complete, 650); } });
    };
    video.addEventListener("canplay", attempt, { once: true });
    attempt();
    return () => { cancelled = true; video.removeEventListener("canplay", attempt); };
  }, [complete, fallback]);

  if (!visible) return null;
  return <div className={`splash-experience${exiting ? " is-exiting" : ""}`} role="presentation" aria-label="AMES opening">
    {SPLASH_PRELOADS}
    {!fallback && <video ref={videoRef} src="/intro.mp4" autoPlay muted playsInline preload="auto" poster="/splash-bg.jpg" onEnded={complete} onError={() => { setFallback(true); if (timeoutRef.current) window.clearTimeout(timeoutRef.current); timeoutRef.current = window.setTimeout(complete, 650); }} disablePictureInPicture aria-hidden="true" />}
    {fallback && <span className="splash-fallback" aria-hidden="true" />}
    <style>{`.splash-experience{position:fixed;inset:0;z-index:9999;overflow:hidden;background:#050607;opacity:1;transition:opacity 560ms cubic-bezier(.22,.61,.36,1);contain:paint}.splash-experience.is-exiting{opacity:0;pointer-events:none}.splash-experience video,.splash-fallback{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#050607}.splash-fallback{background:radial-gradient(ellipse at center,#171a1e 0%,#050607 68%)}@media(prefers-reduced-motion:reduce){.splash-experience{transition:none}}`}</style>
  </div>;
}
