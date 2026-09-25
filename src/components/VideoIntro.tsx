"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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

      {/* AMES letters — snap in one by one with shine sweep */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          gap: 18,
          opacity: showLetters ? 1 : 0,
          transition: "opacity 0.1s",
        }}
      >
        {["A", "M", "E", "S"].map((letter, i) => (
          <span
            key={letter}
            style={{
              fontSize: 48,
              fontWeight: 600,
              letterSpacing: "0.18em",
              color: "#F5F5F2",
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
              opacity: showLetters ? 1 : 0,
              transform: showLetters ? "translateY(0)" : "translateY(8px)",
              transition: `opacity 0.15s ${i * 0.06}s, transform 0.15s ${i * 0.06}s`,
              position: "relative",
              display: "inline-block",
            }}
          >
            {letter}
            {/* Shine sweep */}
            {showLetters && (
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)",
                  backgroundSize: "200% 100%",
                  animation: `shineSweep 0.6s ${i * 0.06}s ease-out forwards`,
                  pointerEvents: "none",
                }}
              />
            )}
          </span>
        ))}
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

      <style>{`
        @keyframes shineSweep {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
