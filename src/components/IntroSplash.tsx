"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_DURATION = 8000;
const FALLBACK_DURATION = 1200;
const EMBLEM_DURATION = 3600;
const SEEN_KEY = "ames-intro-seen";

export default function IntroSplash() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(true);
  const [phase, setPhase] = useState<"video" | "emblem">("video");
  const [fallback, setFallback] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);
  const finishTimer = useRef<number | null>(null);

  const markSeen = useCallback(() => {
    try { sessionStorage.setItem(SEEN_KEY, "1"); } catch {}
  }, []);

  const finish = useCallback((skipped = false) => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    markSeen();
    setExiting(true);
    if (finishTimer.current) window.clearTimeout(finishTimer.current);
    finishTimer.current = window.setTimeout(() => setVisible(false), skipped ? 0 : 400);
  }, [markSeen]);

  const showEmblem = useCallback(() => {
    if (exitingRef.current) return;
    setPhase("emblem");
    if (finishTimer.current) window.clearTimeout(finishTimer.current);
    finishTimer.current = window.setTimeout(() => finish(false), EMBLEM_DURATION);
  }, [finish]);

  const handleError = useCallback(() => {
    setFallback(true);
    showEmblem();
    window.setTimeout(() => finish(false), FALLBACK_DURATION);
  }, [finish, showEmblem]);

  useEffect(() => {
    const timeout = window.setTimeout(() => showEmblem(), MAX_DURATION);
    return () => { window.clearTimeout(timeout); if (finishTimer.current) window.clearTimeout(finishTimer.current); };
  }, [showEmblem]);

  const resumeVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || fallback || exitingRef.current) return;
    video.muted = true;
    void video.play().catch(() => {});
  }, [fallback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || fallback) return;
    video.muted = true;
    resumeVideo();
    const onTimeUpdate = () => {
      if (Number.isFinite(video.duration) && video.currentTime >= Math.max(0, video.duration - 1.2)) showEmblem();
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [fallback, resumeVideo, showEmblem]);

  if (!visible) return null;

  return (
    <div role="presentation" onClick={() => finish(true)} className={`intro-splash fixed inset-0 z-[9999] overflow-hidden bg-black transition-opacity duration-400 ${exiting ? "opacity-0" : "opacity-100"}`}>
      {!fallback && phase === "video" && <video ref={videoRef} autoPlay muted playsInline preload="auto" src="/intro.mp4" onLoadedData={(e) => { e.currentTarget.muted = true; resumeVideo(); }} onCanPlay={(e) => { e.currentTarget.muted = true; resumeVideo(); }} onPause={() => resumeVideo()} onEnded={showEmblem} onError={handleError} disablePictureInPicture className="pointer-events-none absolute inset-0 h-full w-full object-cover" aria-hidden="true" />}
      {phase === "emblem" && <div className="emblem-phase absolute inset-0 flex items-center justify-center overflow-hidden" aria-label="AMES emblem">
        <img src="/splash-bg.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" onError={(event) => { event.currentTarget.style.display = "none"; }} />
        <div className="emblem-glow" />
        <div className="emblem-particles" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ left: `${8 + ((i * 37) % 84)}%`, top: `${12 + ((i * 53) % 72)}%`, animationDelay: `${i * 90}ms` }} />)}</div>
        <svg className="ames-emblem" viewBox="0 0 720 420" role="img" aria-label="AMES" xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="chrome" x1="0" x2="1"><stop stopColor="#6c756f" /><stop offset=".35" stopColor="#f4fff9" /><stop offset=".55" stopColor="#86948d" /><stop offset="1" stopColor="#d9e9e0" /></linearGradient><linearGradient id="emerald" x1="0" y1="1" x2="1"><stop stopColor="#063c2d" /><stop offset=".5" stopColor="#8bffcf" /><stop offset="1" stopColor="#0b6d50" /></linearGradient></defs>
          <path className="emblem-rule" d="M115 92H605M115 328H605" /><path className="emblem-sweep" d="M142 112C205 55 280 52 346 84M378 84C452 52 520 59 578 112" /><path className="emblem-sweep" d="M142 308C205 365 280 368 346 336M378 336C452 368 520 361 578 308" />
          <path fill="url(#chrome)" d="M360 45 430 125 397 212 360 370 323 212 290 125Z" /><path fill="url(#emerald)" d="M360 78 401 132 381 205 360 287 339 205 319 132Z" /><path fill="none" stroke="#eafff5" strokeWidth="3" d="m360 78 41 54-20 73-21 82-21-82-20-73Z" /><text x="360" y="306" textAnchor="middle" fill="#f2fff8" fontFamily="Georgia, serif" fontSize="58" letterSpacing="20">AMES</text><path className="emblem-star" d="m360 22 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" />
        </svg>
      </div>}
      <style>{`.intro-splash{cursor:pointer}.emblem-phase{background:#020805}.emblem-glow{position:absolute;width:42vmin;height:42vmin;border-radius:50%;background:radial-gradient(circle,rgba(85,255,188,.24),transparent 68%);filter:blur(8px);animation:emblem-bloom 1.6s ease-out both}.ames-emblem{position:relative;width:min(88vw,620px);height:auto;animation:emblem-reveal 1.4s cubic-bezier(.2,.8,.2,1) both}.emblem-rule,.emblem-sweep{fill:none;stroke:url(#chrome);stroke-width:2;opacity:.8}.emblem-sweep{stroke-dasharray:500;stroke-dashoffset:500;animation:emblem-draw 1.2s .25s ease-out forwards}.emblem-star{fill:#dffff0;animation:emblem-star 1.4s .6s ease-out both}.emblem-particles i{position:absolute;width:2px;height:2px;border-radius:50%;background:#b8ffe1;box-shadow:0 0 8px #72ffc2;animation:emblem-particle 2.5s ease-out both}.emblem-phase:after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(224,255,242,.35) 50%,transparent 65%);transform:translateX(-140%);animation:emblem-shine 1.1s 1.15s ease-out both}@keyframes emblem-reveal{from{opacity:0;transform:scale(.82);filter:blur(5px)}to{opacity:1;transform:scale(1);filter:blur(0)}}@keyframes emblem-bloom{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}@keyframes emblem-draw{to{stroke-dashoffset:0}}@keyframes emblem-shine{to{transform:translateX(140%)}}@keyframes emblem-star{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:scale(1)}}@keyframes emblem-particle{0%{opacity:0;transform:translateY(18px)}35%{opacity:1}100%{opacity:0;transform:translateY(-30px)}}@media(prefers-reduced-motion:reduce){.ames-emblem,.emblem-glow,.emblem-sweep,.emblem-star,.emblem-particles i,.emblem-phase:after{animation:none}.ames-emblem,.emblem-glow{opacity:1;transform:none}}`}</style>
    </div>
  );
}
