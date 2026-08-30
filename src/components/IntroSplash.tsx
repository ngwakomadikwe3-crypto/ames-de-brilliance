"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SESSION_KEY = "ames-intro-seen";
const MAX_DURATION = 8000;
const FALLBACK_DURATION = 1000;

export default function IntroSplash() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(true);
  const [showLetters, setShowLetters] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);
  const skipRef = useRef(false);
  const finish = useCallback((skipped = false) => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    skipRef.current = skipped;
    setExiting(true);
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
    window.setTimeout(() => setVisible(false), 400);
  }, []);

  const handleError = useCallback(() => {
    setFallback(true);
    setShowLetters(true);
    window.setTimeout(finish, FALLBACK_DURATION);
  }, [finish]);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(SESSION_KEY) === "1"; } catch {}
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen || reduced) {
      setVisible(false);
      return;
    }

    const timeout = window.setTimeout(finish, MAX_DURATION);
    return () => window.clearTimeout(timeout);
  }, [finish]);

  const resumeVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || fallback || exitingRef.current) return;
    void video.play().catch(() => {});
  }, [fallback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || fallback) return;
    const onTimeUpdate = () => {
      if (Number.isFinite(video.duration) && video.currentTime >= Math.max(0, video.duration - 1.2)) {
        setShowLetters(true);
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [fallback]);

  if (!visible) return null;

  return (
    <div
      role="presentation"
      onClick={() => finish(true)}
      className={`fixed inset-0 z-[200] overflow-hidden bg-black transition-opacity duration-500 ${exiting ? "opacity-0" : "opacity-100"}`}
    >
      {!fallback && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          preload="auto"
          src="/intro/intro.mp4"
          onLoadedData={resumeVideo}
          onCanPlay={resumeVideo}
          onPause={() => { if (!skipRef.current && !exitingRef.current) resumeVideo(); }}
          onEnded={() => finish(false)}
          onError={handleError}
          disablePictureInPicture
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          aria-hidden="true"
        />
      )}
      <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${showLetters ? "opacity-100" : "opacity-0"}`}>
        <div className="flex items-center gap-3 text-white sm:gap-5" aria-label="AMES">
          {["A", "M", "E", "S"].map((letter, index) => (
            <span
              key={letter}
              className="intro-letter text-3xl font-light tracking-[0.38em] sm:text-5xl"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              {letter}
            </span>
          ))}
        </div>
      </div>
      <style>{`
        .intro-letter { animation: intro-letter-in 420ms cubic-bezier(.2,.8,.2,1) both; position: relative; }
        .intro-letter::after { content: ""; position: absolute; inset: -10% -35%; background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.95) 50%, transparent 65%); transform: translateX(-140%); animation: intro-shine 520ms ease-out 300ms both; pointer-events: none; }
        @keyframes intro-letter-in { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes intro-shine { to { transform: translateX(140%); } }
        @media (prefers-reduced-motion: reduce) { .intro-letter, .intro-letter::after { animation: none; } }
      `}</style>
    </div>
  );
}

