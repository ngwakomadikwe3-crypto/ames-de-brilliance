"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const DIFY_URL = process.env.NEXT_PUBLIC_DIFY_URL || "";

interface StoreStone {
  id: string; ref: string; stone_type: string;
  shape: string; carat: number; color: string; clarity: string;
  cut: string; certification: string; price: number | null;
  photo: string; listing_category: string; status: string;
}

interface VideoItem {
  id: number; video_url: string; caption: string;
  stone_id: string | null; stone_ref: string | null;
  shape: string | null; carat: number | null;
  color: string | null; clarity: string | null;
  certification: string | null; price: number | null;
  stone_status: string | null;
  model_instagram: string | null;
}

const PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#e5e7eb" width="400" height="400"/><text x="200" y="200" font-family="system-ui,sans-serif" font-size="13" fill="#9ca3af" text-anchor="middle">No photo</text></svg>'
);

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */

export default function AppPage() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [activePanel, setActivePanel] = useState(0);
  const [highlightStone, setHighlightStone] = useState<string | null>(null);
  const [chatPrefill, setChatPrefill] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Hero splash fade
  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 1500);
    const hideTimer = setTimeout(() => setShowSplash(false), 2200);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, []);

  // Intersection observer to track which panel is active
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const panels = container.querySelectorAll("[data-panel]");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && e.intersectionRatio > 0.5) {
            setActivePanel(Number(e.target.getAttribute("data-panel")));
          }
        });
      },
      { root: container, threshold: 0.5 }
    );
    panels.forEach((p) => obs.observe(p));
    return () => obs.disconnect();
  }, [showSplash]);

  function scrollToPanel(idx: number) {
    const container = containerRef.current;
    if (!container) return;
    const panel = container.querySelector(`[data-panel="${idx}"]`) as HTMLElement;
    if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Called from Videos panel to jump to Store with item highlighted
  function handleSeePiece(stoneId: string) {
    setHighlightStone(stoneId);
    scrollToPanel(1); // Store is panel 1
    // Clear highlight after animation
    setTimeout(() => setHighlightStone(null), 3000);
  }

  // Called from Videos panel to jump to Chat with item pre-filled
  function handleAskAmes(stoneRef: string, shape: string, carat: number, color: string, clarity: string) {
    const msg = `Tell me about ${stoneRef} — ${shape} ${carat}ct ${color} ${clarity}`;
    setChatPrefill(msg);
    scrollToPanel(0); // Chat is panel 0
  }

  const PANEL_LABELS = ["Chat", "Store", "Videos"];

  return (
    <>
      {/* ── Hero Splash ── */}
      {showSplash && (
        <div
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center transition-opacity duration-700 ease-out"
          style={{ opacity: splashFading ? 0 : 1 }}
        >
          <div className="flex items-center gap-2.5 animate-pulse">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 h-6">
              <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#fff" strokeWidth="1.5" fill="none" />
            </svg>
            <span className="text-white text-[16px] font-bold tracking-tight">AMES — Botswana Diamond GPT</span>
          </div>
        </div>
      )}

      {/* ── Snap Container ── */}
      <div
        ref={containerRef}
        className="h-[100dvh] overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {/* Panel 0: Chat */}
        <section
          data-panel="0"
          className="relative h-[100dvh] snap-start snap-always flex flex-col"
        >
          <ChatPanel prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill("")} />
          {/* Swipe hint */}
          <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center pointer-events-none z-10">
            <span className="text-[10px] text-muted/70 mb-1 tracking-wide">swipe up for the store</span>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-muted/50">
              <path d="M5 13L10 8L15 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </section>

        {/* Panel 1: Store */}
        <section
          data-panel="1"
          className="relative h-[100dvh] snap-start snap-always flex flex-col"
        >
          <StorePanel highlightStone={highlightStone} />
        </section>

        {/* Panel 2: Videos */}
        <section
          data-panel="2"
          className="relative h-[100dvh] snap-start snap-always"
        >
          <VideosPanel onSeePiece={handleSeePiece} onAskAmes={handleAskAmes} />
        </section>
      </div>

      {/* ── Dot Indicator (right edge) ── */}
      <div className="fixed right-3 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2.5">
        {PANEL_LABELS.map((label, i) => (
          <button
            key={i}
            onClick={() => scrollToPanel(i)}
            className={`w-2 h-2 rounded-full transition-all duration-300 cursor-default ${
              activePanel === i
                ? "bg-white scale-125 shadow-lg"
                : "bg-white/30 hover:bg-white/50"
            }`}
            aria-label={label}
            title={label}
          />
        ))}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   PANEL 1 — CHAT (Dify embed)
   ═══════════════════════════════════════════ */

function ChatPanel({ prefill, onPrefillConsumed }: { prefill: string; onPrefillConsumed: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // When prefill changes, try to inject it into the chat input
  useEffect(() => {
    if (!prefill || !iframeRef.current) return;
    // Post message to Dify iframe if it supports it
    try {
      iframeRef.current.contentWindow?.postMessage(
        { type: "prefill", text: prefill },
        "*"
      );
    } catch { /* cross-origin */ }
    onPrefillConsumed();
  }, [prefill, onPrefillConsumed]);

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0">
      {/* Mini brand bar */}
      <div className="shrink-0 px-4 py-2.5 border-b border-border flex items-center gap-2">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" aria-hidden="true">
          <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#000" strokeWidth="1.5" fill="none" />
        </svg>
        <span className="text-[12px] font-bold tracking-tight">AMES — Botswana Diamond GPT</span>
      </div>

      {/* Chat content */}
      <div className="flex-1 min-h-0">
        {DIFY_URL ? (
          <iframe
            ref={iframeRef}
            src={DIFY_URL}
            title="AMES — Botswana Diamond GPT"
            className="w-full h-full border-0"
            allow="microphone"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center h-full p-6 text-center">
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-muted">Chat not configured</p>
              <p className="text-[11px] text-muted">Set NEXT_PUBLIC_DIFY_URL to enable the AI assistant.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PANEL 2 — STORE (scrollable cards)
   ═══════════════════════════════════════════ */

function StorePanel({ highlightStone }: { highlightStone: string | null }) {
  const [stones, setStones] = useState<StoreStone[]>([]);
  const [loading, setLoading] = useState(true);
  const [reserved, setReserved] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchStones = useCallback(async () => {
    try {
      const res = await fetch("/api/stones");
      const all: StoreStone[] = await res.json();
      setStones(all.filter(
        (s) => s.status === "Available" && (s.listing_category === "Polished" || s.listing_category === "Jewelry")
      ));
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStones(); }, [fetchStones]);

  // Scroll to highlighted stone
  useEffect(() => {
    if (!highlightStone || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-stone-id="${highlightStone}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightStone]);

  async function handleReserve(stoneId: string, buyerName: string, buyerWhatsapp: string) {
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stoneId, buyerName, buyerWhatsapp }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Reservation failed");
      }
      setReserved((prev) => ({ ...prev, [stoneId]: true }));
      setStones((prev) => prev.filter((s) => s.id !== stoneId));
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-surface min-h-0">
      {/* Store header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-border bg-white flex items-center gap-2">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" aria-hidden="true">
          <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#000" strokeWidth="1.5" fill="none" />
        </svg>
        <span className="text-[12px] font-bold tracking-tight">Store</span>
        <span className="text-[10px] text-muted ml-auto font-mono">{stones.length} items</span>
      </div>

      {/* Scrollable card list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
        {error && (
          <div className="border border-red-300 bg-red-50 p-3 text-[11px] text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="text-[12px] text-muted text-center py-12">Loading store…</div>
        ) : stones.length === 0 ? (
          <p className="text-[12px] text-muted text-center py-12">No items currently available in store.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {stones.map((stone) => (
              <div key={stone.id} data-stone-id={stone.id}>
                <StoreCard
                  stone={stone}
                  onReserve={(name, wa) => handleReserve(stone.id, name, wa)}
                  reserved={!!reserved[stone.id]}
                  highlighted={highlightStone === stone.id}
                />
              </div>
            ))}
          </div>
        )}

        {/* Bottom spacer so last card isn't hidden behind dots */}
        <div className="h-8" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STORE CARD
   ═══════════════════════════════════════════ */

function StoreCard({ stone, onReserve, reserved, highlighted }: {
  stone: StoreStone;
  onReserve: (name: string, whatsapp: string) => void;
  reserved: boolean;
  highlighted?: boolean;
}) {
  const hasPhoto = stone.photo && stone.photo.length > 10 && !stone.photo.startsWith("data:");
  const photo = hasPhoto ? stone.photo : PLACEHOLDER;
  const isJewelry = stone.listing_category === "Jewelry";
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [wa, setWa] = useState("");

  return (
    <div className={`border bg-white transition-all duration-500 ${highlighted ? "border-black shadow-lg ring-2 ring-black/20" : "border-border"}`}>
      <div className="aspect-square bg-surface overflow-hidden relative">
        <img src={photo} alt={stone.ref} className="w-full h-full object-cover" />
        {isJewelry && (
          <span className="absolute top-2 left-2 bg-black text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5">
            Jewelry
          </span>
        )}
      </div>
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono font-medium">{stone.ref}</span>
          <span className="text-[11px] font-medium">
            {stone.price ? `$${stone.price.toLocaleString()}` : "Price on request"}
          </span>
        </div>
        <div className="text-[11px] text-muted leading-relaxed">
          {isJewelry
            ? <>{stone.shape} · {stone.carat}ct · {stone.color} · {stone.certification}</>
            : <>{stone.shape} · {stone.carat}ct · {stone.color} · {stone.clarity}<br />{stone.cut} · {stone.certification}</>
          }
        </div>
        {reserved ? (
          <div className="bg-surface border border-border p-2.5 mt-2">
            <p className="text-[11px] text-muted leading-relaxed">
              Your reservation has been noted. Our desk will reach out via WhatsApp within one business day with payment details. No payment is collected here.
            </p>
          </div>
        ) : showForm ? (
          <div className="border-t border-border pt-2 mt-2 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-2 py-1.5 border border-border text-[11px]"
            />
            <input
              value={wa}
              onChange={(e) => setWa(e.target.value)}
              placeholder="WhatsApp number (+267…)"
              className="w-full px-2 py-1.5 border border-border text-[11px]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-1.5 border border-border text-[11px] text-muted cursor-default"
              >Cancel</button>
              <button
                onClick={() => onReserve(name, wa)}
                disabled={!name.trim()}
                className="flex-1 py-1.5 bg-black text-white text-[11px] font-medium cursor-default disabled:opacity-40"
              >Confirm</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-2 bg-black text-white text-[11px] font-medium text-center cursor-default mt-1"
          >
            Reserve
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PANEL 3 — VIDEOS (vertical snap-scroll feed)
   ═══════════════════════════════════════════ */

function VideosPanel({ onSeePiece, onAskAmes }: {
  onSeePiece: (stoneId: string) => void;
  onAskAmes: (stoneRef: string, shape: string, carat: number, color: string, clarity: string) => void;
}) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/videos?published=1")
      .then(r => r.ok ? r.json() : [])
      .then(d => setVideos(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Track which video is active via intersection observer
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    const items = feed.querySelectorAll("[data-video]");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && e.intersectionRatio > 0.5) {
            setActiveVideo(Number(e.target.getAttribute("data-video")));
          }
        });
      },
      { root: feed, threshold: 0.5 }
    );
    items.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [videos]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-black text-white/60 text-[12px]">
        Loading videos…
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-black text-white/60 text-[12px] text-center px-6">
        <div>
          <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mx-auto mb-3 opacity-40">
            <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#fff" strokeWidth="1.5" fill="none" />
          </svg>
          <p>No videos published yet.</p>
          <p className="text-[10px] mt-1 opacity-50">Videos added and published from the dashboard will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={feedRef}
      className="h-[100dvh] overflow-y-scroll snap-y snap-mandatory bg-black"
      style={{ scrollSnapType: "y mandatory" }}
    >
      {videos.map((video, idx) => (
        <VideoSlide
          key={video.id}
          video={video}
          index={idx}
          isActive={activeVideo === idx}
          onSeePiece={onSeePiece}
          onAskAmes={onAskAmes}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   VIDEO SLIDE (single full-screen video)
   ═══════════════════════════════════════════ */

function VideoSlide({ video, index, isActive, onSeePiece, onAskAmes }: {
  video: VideoItem;
  index: number;
  isActive: boolean;
  onSeePiece: (stoneId: string) => void;
  onAskAmes: (stoneRef: string, shape: string, carat: number, color: string, clarity: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  // Auto-play/pause based on visibility
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isActive) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
      vid.currentTime = 0;
    }
  }, [isActive]);

  function toggleMute() {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setMuted(vid.muted);
  }

  const stoneInfo = video.stone_id ? {
    ref: video.stone_ref || "",
    shape: video.shape || "",
    carat: video.carat || 0,
    color: video.color || "",
    clarity: video.clarity || "",
    status: video.stone_status || null,
  } : null;

  const isSold = stoneInfo?.status === "Sold";

  return (
    <div
      data-video={index}
      className="h-[100dvh] snap-start snap-always relative bg-black flex items-center justify-center"
    >
      {/* Video */}
      <video
        ref={videoRef}
        src={video.video_url}
        className="absolute inset-0 w-full h-full object-cover"
        loop
        muted={muted}
        playsInline
        preload={isActive ? "auto" : "metadata"}
      />

      {/* Tap to unmute overlay */}
      <button
        onClick={toggleMute}
        className="absolute inset-0 z-10"
        aria-label={muted ? "Tap to unmute" : "Tap to mute"}
      />

      {/* Mute indicator */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={(e) => { e.stopPropagation(); toggleMute(); }}
          className="w-8 h-8 bg-black/50 backdrop-blur-sm flex items-center justify-center rounded-full"
        >
          {muted ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
        </button>
      </div>

      {/* Linked stone price tag — bottom-left, above caption */}
      {stoneInfo && (
        <button
          onClick={(e) => { e.stopPropagation(); onSeePiece(video.stone_id!); }}
          className="absolute bottom-28 left-4 z-20 bg-black/60 backdrop-blur-sm border border-white/20 px-3 py-2 cursor-default text-left"
        >
          {isSold ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-white bg-white/20 px-2 py-0.5">Sold</span>
          ) : (
            <>
              <div className="text-white text-[11px] font-medium">
                {stoneInfo.ref} · {stoneInfo.shape} {stoneInfo.carat}ct {stoneInfo.color}
              </div>
              <div className="text-white text-[13px] font-bold mt-0.5">
                {video.price != null ? `$${video.price.toLocaleString()}` : "Price on request"}
              </div>
            </>
          )}
        </button>
      )}

      {/* Caption — bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <p className="text-white text-[13px] font-medium mb-1">{video.caption}</p>
        {video.model_instagram && (
          <p className="text-white/50 text-[10px] font-mono mb-2">@{video.model_instagram}</p>
        )}

        {/* Linked stone buttons */}
        {stoneInfo && (
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onSeePiece(video.stone_id!); }}
              className="px-3 py-2 bg-white text-black text-[11px] font-medium cursor-default min-h-[36px]"
            >
              See this piece →
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAskAmes(stoneInfo.ref, stoneInfo.shape, stoneInfo.carat, stoneInfo.color, stoneInfo.clarity); }}
              className="px-3 py-2 bg-white/20 backdrop-blur-sm text-white text-[11px] font-medium border border-white/30 cursor-default min-h-[36px]"
            >
              Ask AMES
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
