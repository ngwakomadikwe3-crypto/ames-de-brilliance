"use client";

import { useState, useEffect, useRef, useCallback } from "react";

import HouseWordmark from "./HouseWordmark";

interface VideoIntroProps {
  onDone: () => void;
}

export default function VideoIntro({ onDone }: VideoIntroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showLetters, setShowLetters] = useState(false);
  const [fading, setFading] = useState(false);
  const [fallback, setFallback] = useState(false);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setFading(true);
    setTimeout(onDone, 600);
  }, [onDone]);

  /* Reduced motion: skip straight to app */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDone();
      return;
    }
    /* One per session */
    if (sessionStorage.getItem("ames_intro_seen")) {
      onDone();
    }
  }, [onDone]);

  /* Hard cap: 8 seconds max */
  useEffect(() => {
    const t = setTimeout(() => finish(), 8000);
    return () => clearTimeout(t);
  }, [finish]);

  /* Timeupdate: show letters 1.2s before end */
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration || v.duration === Infinity) return;
    if (v.currentTime >= v.duration - 1.2) {
      setShowLetters(true);
    }
  }, []);

  /* Video ended */
  const handleEnded = useCallback(() => {
    finish();
  }, [finish]);

  /* Video error: fallback mode */
  const handleError = useCallback(() => {
    setFallback(true);
    setShowLetters(true);
    setTimeout(() => finish(), 1000);
  }, [finish]);

  /* Tap to skip */
  const handleSkip = useCallback(() => {
    finish();
  }, [finish]);

  /* Mark seen when overlay starts fading */
  useEffect(() => {
    if (fading) {
      sessionStorage.setItem("ames_intro_seen", "1");
    }
  }, [fading]);

  return (
    <div
      onClick={handleSkip}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.6s ease-in-out",
        cursor: "pointer",
      }}
    >
      {/* Video layer — hidden if fallback */}
      {!fallback && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onError={handleError}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        >
          <source src="/intro/intro.mp4" type="video/mp4" />
        </video>
      )}

      <div style={{
        position: "relative",
        opacity: showLetters ? 1 : 0,
        transition: "opacity 180ms ease",
        fontSize: "clamp(18px, 5vw, 48px)",
        textShadow: "0 2px 12px rgba(0,0,0,.65)",
      }}>
        <HouseWordmark tone="light" className="!text-[1em]" />
      </div>

      {/* Tap hint */}
      {!fading && (
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 11,
            letterSpacing: "0.12em",
            color: "rgba(255,255,255,0.3)",
          }}
        >
          TAP TO SKIP
        </div>
      )}

    </div>
  );
}
