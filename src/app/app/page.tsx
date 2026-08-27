"use client";

import { useState, useEffect, useCallback, useRef } from "react";
/* Native scroll-snap — no framer-motion needed */
/* Sketchfab 3D embeds — PatelDev diamond + Busanello ring */

const DIFY_URL = process.env.NEXT_PUBLIC_DIFY_URL || "";

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */

interface StoreStone {
  id: string; ref: string; stone_type: string;
  shape: string; carat: number; color: string; clarity: string;
  cut: string; certification: string; price: number | null;
  photo: string; listing_category: string; status: string;
  trader_preferred?: boolean;
}

interface VideoItem {
  id: string; video_url: string; caption: string;
  stone_id: string | null; stone_ref: string | null;
  shape: string | null; carat: number | null;
  color: string | null; clarity: string | null;
  certification: string | null; price: number | null;
  stone_status: string | null; model_instagram: string | null;
  likes_count: number;
  house_note: string;
  featured_piece: string | null;
  stone_photo: string | null;
}

interface Comment {
  id: string; video_id: string; author: string; text: string; created_at: string;
}

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */

export default function AppPage() {
  const [activePanel, setActivePanel] = useState(1);
  const [highlightStone, setHighlightStone] = useState<string | null>(null);
  const [chatPrefill, setChatPrefill] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [ringLoaded, setRingLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const obs = new IntersectionObserver(
      (entries) => { entries.forEach((e) => { if (e.isIntersecting && e.intersectionRatio > 0.5) setActivePanel(Number(e.target.getAttribute("data-panel"))); }); },
      { root: c, threshold: 0.5 }
    );
    c.querySelectorAll("[data-panel]").forEach((p) => obs.observe(p));
    return () => obs.disconnect();
  }, []);

  /* ── Native scroll-snap navigation ── */
  const scrollRef = useRef<HTMLDivElement>(null);

  function swipeTo(idx: number) {
    const next = Math.max(0, Math.min(2, idx));
    setActivePanel(next);
    const container = scrollRef.current;
    if (container) {
      container.scrollTo({ left: next * window.innerWidth, behavior: 'smooth' });
    }
  }

  /* Sync panel indicator with scroll position */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    function onScroll() {
      const idx = Math.round(container!.scrollLeft / window.innerWidth);
      if (idx !== activePanel && idx >= 0 && idx <= 2) setActivePanel(idx);
    }
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [activePanel]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") { e.preventDefault(); swipeTo(Math.min(2, activePanel + 1)); }
      if (e.key === "ArrowLeft") { e.preventDefault(); swipeTo(Math.max(0, activePanel - 1)); }
    }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [activePanel]);

  function handleSeePiece(stoneId: string) {
    setHighlightStone(stoneId);
    swipeTo(0);
    setTimeout(() => setHighlightStone(null), 3000);
  }

  function handleAskAmes(ref: string, shape: string, carat: number, color: string, clarity: string) {
    setChatPrefill(`Tell me about ${ref} \u2014 ${shape} ${carat}ct ${color} ${clarity}`);
    swipeTo(1);
  }

  const NAV_ITEMS = [
    { label: "Settings", href: "/app/settings" },
    { label: "Billing", href: "/app/billing" },
  ];

  return (
    <>
      <style>{`
        :root { font-family: var(--font-inter, -apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', Arial, sans-serif); background: #EAE8E4; }
        footer { display: none !important; }
      `}</style>

      {/* Minimal transparent top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-11" style={{ background: 'rgba(234,232,228,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <button onClick={() => setDrawerOpen(!drawerOpen)} className="flex flex-col justify-center items-center w-9 h-9 gap-[5px] shrink-0 z-60" aria-label="Menu">
          <span className="block w-5 h-[1.5px] rounded-full" style={{ background: drawerOpen ? '#171717' : '#6E6C69', transition: 'all 0.3s' }} />
          <span className="block w-4 h-[1.5px] rounded-full" style={{ background: drawerOpen ? '#171717' : '#6E6C69', transition: 'all 0.3s' }} />
          <span className="block w-5 h-[1.5px] rounded-full" style={{ background: drawerOpen ? '#171717' : '#6E6C69', transition: 'all 0.3s' }} />
        </button>
        {/* Platinum glyph */}
        <svg viewBox="0 0 24 24" fill="none" style={{ width: 20, height: 20 }} aria-hidden="true">
          <defs>
            <linearGradient id="app-pg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E8E6E1" />
              <stop offset="50%" stopColor="#C8C6C1" />
              <stop offset="100%" stopColor="#A6A6AB" />
            </linearGradient>
          </defs>
          <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="url(#app-pg)" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
        </svg>
      </div>

      {/* Navigation drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[70]" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div className="absolute top-14 left-4 right-auto w-64 rounded-2xl overflow-hidden" style={{ background: '#FCFCFB', border: '1px solid rgba(23,23,23,0.08)' }} onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(23,23,23,0.08)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', color: '#171717' }}>AMES</div>
            </div>
            <div className="py-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    setDrawerOpen(false);
                    window.location.href = item.href!;
                  }}
                  className="w-full text-left px-5 py-3 text-[13px] transition-colors"
                  style={{ color: '#6E6C69', fontWeight: 400 }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dot indicator — centred under top bar */}
      <div className="fixed top-11 left-0 right-0 z-50 flex justify-center gap-1.5 py-1.5" style={{ pointerEvents: 'none' }}>
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            onClick={() => swipeTo(i)}
            className="rounded-full transition-all duration-200"
            style={{
              pointerEvents: 'auto',
              width: activePanel === i ? 16 : 6,
              height: 6,
              background: activePanel === i ? '#A6A6AB' : '#D9D7D3',
            }}
            aria-label={['Boutique', 'Chat', 'Videos'][i]}
          />
        ))}
      </div>

      <div ref={scrollRef} className="h-[100dvh] w-full overflow-x-auto" style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
        <style>{`.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{scrollbar-width:none}`}</style>
        <div className="flex h-full" style={{ width: '300dvw' }}>
          <section data-panel="0" className="w-[100dvw] h-full flex-shrink-0 flex flex-col" style={{ scrollSnapAlign: 'start' }}>
            <BoutiquePanel highlightStone={highlightStone} />
          </section>
          <section data-panel="1" className="w-[100dvw] h-full flex-shrink-0 flex flex-col" style={{ scrollSnapAlign: 'start' }}>
            <ChatPanel prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill("")} onBrowseBoutique={() => swipeTo(0)} />
          </section>
          <section data-panel="2" className="w-[100dvw] h-full flex-shrink-0" style={{ scrollSnapAlign: 'start' }}>
            <VideosPanel onSeePiece={handleSeePiece} onAskAmes={handleAskAmes} onOpenBoutiqueDetail={(stoneId) => { setHighlightStone(stoneId); swipeTo(0); setTimeout(() => setHighlightStone(null), 3000); }} />
          </section>
        </div>
      </div>

      {/* Desktop edge arrows */}
      {activePanel > 0 && (
        <button onClick={() => swipeTo(activePanel - 1)} className="fixed left-2 top-1/2 -translate-y-1/2 z-40 w-10 h-10 flex items-center justify-center rounded-full bg-[#EAE8E4]/60 backdrop-blur-sm border border-[rgba(23,23,23,0.08)] opacity-40 hover:opacity-70 transition-opacity hidden md:flex" aria-label="Previous panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#171717" strokeWidth="1.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      )}
      {activePanel < 2 && (
        <button onClick={() => swipeTo(activePanel + 1)} className="fixed right-2 top-1/2 -translate-y-1/2 z-40 w-10 h-10 flex items-center justify-center rounded-full bg-[#EAE8E4]/60 backdrop-blur-sm border border-[rgba(23,23,23,0.08)] opacity-40 hover:opacity-70 transition-opacity hidden md:flex" aria-label="Next panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#171717" strokeWidth="1.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   CHAT PANEL
   ═══════════════════════════════════════════ */

interface ChatHistory {
  id: string; title: string; created_at: string; updated_at: string;
}

interface ChatMessage {
  id: string; chat_id: string; role: "user" | "assistant"; text: string; thinking: string; created_at: string;
}

function groupChats(chats: ChatHistory[]): { label: string; items: ChatHistory[] }[] {
  const now = Date.now();
  const day = 86400000;
  const today: ChatHistory[] = [], week: ChatHistory[] = [], older: ChatHistory[] = [];
  for (const c of chats) {
    const t = new Date(c.updated_at).getTime();
    if (now - t < day) today.push(c);
    else if (now - t < 7 * day) week.push(c);
    else older.push(c);
  }
  const groups: { label: string; items: ChatHistory[] }[] = [];
  if (today.length) groups.push({ label: "Today", items: today });
  if (week.length) groups.push({ label: "7 Days", items: week });
  if (older.length) groups.push({ label: "Older", items: older });
  return groups;
}

function ChatPanel({ prefill, onPrefillConsumed, onBrowseBoutique }: { prefill: string; onPrefillConsumed: () => void; onBrowseBoutique: () => void }) {
  const [chats, setChats] = useState<ChatHistory[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [mode, setMode] = useState<"instant" | "expert">("instant");
  const [deepThink, setDeepThink] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [iframeOpacity, setIframeOpacity] = useState(0);
  const [posterOpacity, setPosterOpacity] = useState(1);
  const [diamondPlaying, setDiamondPlaying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chatStarted = messages.length > 0;
  const hasAmesReply = messages.some(m => m.role === "assistant");

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, typing]);

  useEffect(() => {
    fetch("/api/chats").then(r => r.ok ? r.json() : []).then((d: ChatHistory[]) => setChats(d)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!prefill) return;
    handleSend(prefill);
    onPrefillConsumed();
  }, [prefill]);

  async function loadChat(id: string) {
    setActiveChatId(id);
    setChatLoading(true);
    try {
      const res = await fetch(`/api/chats/${id}/messages`);
      if (res.ok) setMessages(await res.json());
    } catch {}
    setChatLoading(false);
  }

  async function ensureChat(): Promise<string> {
    if (activeChatId) return activeChatId;
    const res = await fetch("/api/chats", { method: "POST" });
    const chat: ChatHistory = await res.json();
    setChats(p => [chat, ...p]);
    setActiveChatId(chat.id);
    return chat.id;
  }

  async function handleSend(text?: string) {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput("");
    const chatId = await ensureChat();
    const userRes = await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", text: msg }),
    });
    const userMsg: ChatMessage = await userRes.json();
    setMessages(p => [...p, userMsg]);
    setTyping(true);
    try {
      const history = messages.map(m => ({ role: m.role, text: m.text }));
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history }),
      });
      const chatData = await chatRes.json();
      const replyText = chatData.reply || "That\u2019s a good question \u2014 let me confirm it with the desk so I give you the exact answer. You can also reach a human now on WhatsApp: +267 72 839 152.";
      const thinking = deepThink ? "Let me consider the details of this question carefully..." : "";
      const assistantRes = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", text: replyText, thinking }),
      });
      const assistantMsg: ChatMessage = await assistantRes.json();
      setMessages(p => [...p, assistantMsg]);
    } catch {
      const fallback = "That\u2019s a good question \u2014 let me confirm it with the desk so I give you the exact answer. You can also reach a human now on WhatsApp: +267 72 839 152.";
      const assistantRes = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", text: fallback }),
      });
      const assistantMsg: ChatMessage = await assistantRes.json();
      setMessages(p => [...p, assistantMsg]);
    } finally {
      setTyping(false);
      fetch("/api/chats").then(r => r.ok ? r.json() : []).then((d: ChatHistory[]) => setChats(d)).catch(() => {});
    }
  }

  return (
    <div className="flex flex-col" style={{ height: '100dvh', overflow: 'hidden', background: '#EAE8E4', position: 'relative' }}>

      {chatStarted ? (
        /* === CHAT MODE === */
        <div className="flex-1 flex flex-col min-h-0">
          {/* Mini header */}
          <div className="shrink-0 flex items-center gap-3 px-4 pt-12 pb-3" style={{ borderBottom: '1px solid rgba(23,23,23,0.08)', background: 'rgba(234,232,228,0.9)', backdropFilter: 'blur(12px)' }}>
            <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FCFCFB', border: '1px solid rgba(23,23,23,0.08)' }}>
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }}><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#A6A6AB" strokeWidth="1.5" strokeLinejoin="round" fill="none" /></svg>
            </div>
            <div className="flex rounded-full p-[2px] ml-auto" style={{ background: '#F5F4F2' }}>
              <button onClick={() => setMode("instant")} className="px-3 py-1 rounded-full text-[10px] transition-all" style={{ background: mode === "instant" ? "#FCFCFB" : "transparent", color: mode === "instant" ? "#171717" : "#6E6C69" }}>Instant</button>
              <button onClick={() => setMode("expert")} className="px-3 py-1 rounded-full text-[10px] transition-all" style={{ background: mode === "expert" ? "#FCFCFB" : "transparent", color: mode === "expert" ? "#171717" : "#6E6C69" }}>Expert</button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
              {messages.map((m) => (
                <div key={m.id} className="space-y-2">
                  {m.role === "assistant" && m.thinking && (
                    <div className="ml-2">
                      <details className="group">
                        <summary style={{ fontSize: 11, cursor: 'pointer', userSelect: 'none', color: '#6E6C69' }}>Reasoning</summary>
                        <div style={{ marginTop: 4, padding: '8px 12px', fontSize: 11, lineHeight: 1.5, borderRadius: 12, background: '#F5F4F2', border: '1px solid rgba(23,23,23,0.08)', color: '#6E6C69' }}>{m.thinking}</div>
                      </details>
                    </div>
                  )}
                  <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "assistant" && (
                      <div style={{ width: 24, height: 24, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 2, background: '#F5F4F2', border: '1px solid rgba(23,23,23,0.08)' }}>
                        <svg viewBox="0 0 24 24" fill="none" style={{ width: 12, height: 12 }}><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#A6A6AB" strokeWidth="1.5" fill="none" /></svg>
                      </div>
                    )}
                    <div className="max-w-[85%]" style={{ padding: '10px 14px', fontSize: 14, lineHeight: 1.45, fontWeight: 400, ...(m.role === 'user' ? { background: '#171717', color: '#FCFCFB', borderRadius: '18px 18px 4px 18px' } : { background: '#FCFCFB', border: '1px solid rgba(23,23,23,0.08)', color: '#171717', borderRadius: '18px 18px 18px 4px' }) }}>
                      {m.text}
                    </div>
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div style={{ width: 24, height: 24, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 2, background: '#F5F4F2', border: '1px solid rgba(23,23,23,0.08)' }}>
                    <svg viewBox="0 0 24 24" fill="none" style={{ width: 12, height: 12 }}><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#A6A6AB" strokeWidth="1.5" fill="none" /></svg>
                  </div>
                  <div style={{ background: '#FCFCFB', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', display: 'flex', gap: 4, border: '1px solid rgba(23,23,23,0.08)' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#A6A6AB", animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#A6A6AB", animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#A6A6AB", animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Composer — floating Claude-style card */}
          <div className="shrink-0 px-4 pb-4 pt-2" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <div className="mx-auto" style={{ maxWidth: 680 }}>
              {hasAmesReply && (
                <div className="text-center mb-2">
                  <a href="https://wa.me/26772839152" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#A6A6AB', textDecoration: 'none', fontWeight: 400 }}>Talk to a human on WhatsApp</a>
                </div>
              )}
              <div style={{ background: '#FCFCFB', borderRadius: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.06)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <button style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F4F2', flexShrink: 0, border: 'none', cursor: 'pointer' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6E6C69" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
                </button>
                <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Ask AMES anything..." className="flex-1 bg-transparent outline-none border-none" style={{ fontSize: 15, fontWeight: 400, color: '#171717', lineHeight: 1.4 }} />
                <button onClick={() => handleSend()} disabled={!input.trim()} style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s', border: 'none', cursor: 'pointer', background: input.trim() ? '#171717' : '#D9D7D3' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? '#FCFCFB' : '#FFFFFF'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* === EMPTY STATE — Claude-mobile minimalism === */
        <div className="flex-1 flex flex-col items-center justify-center px-6" style={{ background: '#EAE8E4' }}>

          {/* 3D Diamond — Sketchfab embed, poster-reveal, bare object on pearl */}
          <div style={{ position: 'relative', width: '100%', maxWidth: 220, height: 220, marginBottom: 32, overflow: 'hidden', background: 'transparent' }}>
            {/* Masked + blended iframe wrapper (behind poster) */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'transparent', mixBlendMode: 'multiply', maskImage: 'radial-gradient(closest-side, black 52%, transparent 96%)', WebkitMaskImage: 'radial-gradient(closest-side, black 52%, transparent 96%)' }}>
              <iframe
                title="Diamond"
                src="https://sketchfab.com/models/b508b33eb0844fcc91a4296cc53323c7/embed?autostart=1&autospin=1&ui_theme=light&transparent=1&ui_infos=0&ui_controls=0&ui_hint=0&ui_settings=0&ui_vr=0&ui_fullscreen=0"
                style={{
                  width: '135%', height: '135%',
                  border: 'none',
                  position: 'absolute', top: '-17.5%', left: '-17.5%',
                  opacity: iframeOpacity, transition: 'opacity 0.6s ease-in-out',
                  filter: 'brightness(1.18) contrast(1.12) saturate(1.06)',
                }}
                allow="autoplay; fullscreen"
                loading="eager"
                onLoad={() => { setIframeOpacity(1); setPosterOpacity(0); }}
              />
            </div>
            {/* Poster image — fades out on iframe load */}
            <img
              src="/diamond-poster.jpg"
              alt=""
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'contain', zIndex: 1,
                opacity: posterOpacity, transition: 'opacity 0.6s ease-in-out',
                pointerEvents: 'none',
                background: 'transparent',
                mixBlendMode: 'multiply',
                maskImage: 'radial-gradient(closest-side, black 52%, transparent 96%)',
                WebkitMaskImage: 'radial-gradient(closest-side, black 52%, transparent 96%)',
              }}
            />
            {/* Gesture overlay — captures swipes so they switch panels (removed in play mode) */}
            {!diamondPlaying && <div style={{ position: 'absolute', inset: 0, zIndex: 2 }} />}
            {/* Play / Done chip */}
            <button
              onClick={() => setDiamondPlaying(p => !p)}
              className="flex items-center gap-1"
              style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 3, padding: '4px 10px', borderRadius: 999, background: '#FCFCFB', border: '1px solid rgba(23,23,23,0.08)', fontSize: 11, color: '#6E6C69', cursor: 'pointer', fontWeight: 400 }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" /></svg>
              {diamondPlaying ? 'Done' : 'Play'}
            </button>
          </div>

          {/* Serif time-of-day greeting */}
          <h2 style={{ fontSize: 26, fontWeight: 500, color: '#171717', fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", letterSpacing: '-0.01em', marginBottom: 6, textAlign: 'center' }}>
            {(() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; })()}
          </h2>
          <p style={{ fontSize: 14, fontWeight: 400, color: '#6E6C69', textAlign: 'center' }}>
            How can I help you today?
          </p>
        </div>
      )}

      {/* Floating bottom input card — Claude style */}
      {!chatStarted && (
        <div className="shrink-0 px-4 pb-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))', position: 'relative', zIndex: 1 }}>
          <div className="mx-auto" style={{ maxWidth: 360 }}>
            {/* Controls row: DeepThink + Instant/Expert */}
            <div className="flex items-center gap-2 mb-2.5 px-1">
              <button onClick={() => setDeepThink(p => !p)} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all" style={{ background: deepThink ? '#171717' : '#FCFCFB', color: deepThink ? '#FCFCFB' : '#6E6C69', border: '1px solid rgba(23,23,23,0.08)' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                DeepThink
              </button>
              <div className="flex rounded-full p-[2px]" style={{ background: '#F5F4F2' }}>
                <button onClick={() => setMode("instant")} className="px-3 py-0.5 rounded-full text-[11px] transition-all" style={{ background: mode === "instant" ? "#FCFCFB" : "transparent", color: mode === "instant" ? "#171717" : "#6E6C69" }}>Instant</button>
                <button onClick={() => setMode("expert")} className="px-3 py-0.5 rounded-full text-[11px] transition-all" style={{ background: mode === "expert" ? "#FCFCFB" : "transparent", color: mode === "expert" ? "#171717" : "#6E6C69" }}>Expert</button>
              </div>
            </div>
            {/* Floating card */}
            <div style={{ background: '#FCFCFB', borderRadius: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.06)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F4F2', flexShrink: 0, border: 'none', cursor: 'pointer' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6E6C69" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
              </button>
              <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Ask AMES anything..." className="flex-1 bg-transparent outline-none border-none" style={{ fontSize: 15, fontWeight: 400, color: '#171717', lineHeight: 1.4 }} />
              <button onClick={() => handleSend()} disabled={!input.trim()} style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s', border: 'none', cursor: 'pointer', background: input.trim() ? '#171717' : '#D9D7D3' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? '#FCFCFB' : '#FFFFFF'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   BOUTIQUE PANEL
   ═══════════════════════════════════════════ */

const CATEGORY_MAP: { label: string; key: string }[] = [
  { label: "Rings", key: "Ring" },
  { label: "Necklaces", key: "Necklace" },
  { label: "Earrings", key: "Earring" },
  { label: "Bracelets", key: "Bracelet" },
  { label: "Watches", key: "Watch" },
];

function parsePhotos(photoStr: string | null | undefined): (string | null)[] {
  if (!photoStr) return [null, null, null];
  const parts = photoStr.split("|").map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith("data:"));
  return [parts[0] || null, parts[1] || null, parts[2] || null];
}

const DEMO_STONE: StoreStone & { demo?: boolean } = {
  id: "_demo_aurora",
  ref: "DEMO-001",
  stone_type: "Diamond",
  shape: "Solitaire",
  carat: 1.20,
  color: "D",
  clarity: "VVS1",
  cut: "Platinum",
  certification: "GIA",
  price: 6800,
  photo: "/demo/ring-front.svg|/demo/ring-angle.svg|/demo/ring-worn.svg",
  listing_category: "Jewelry",
  status: "Available",
  trader_preferred: false,
  demo: true,
};

function BoutiquePanel({ highlightStone }: { highlightStone: string | null }) {
  const [stones, setStones] = useState<StoreStone[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("All");
  const [iframeOpacity, setIframeOpacity] = useState(0);
  const [posterOpacity, setPosterOpacity] = useState(1);
  const [ringPlaying, setRingPlaying] = useState(false);
  const [wishlist, setWishlist] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("boutique_wishlist") || "{}"); } catch { return {}; }
    }
    return {};
  });
  const [showReserveId, setShowReserveId] = useState<string | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<(string | null)[]>([null, null, null]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pullDist, setPullDist] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const THRESHOLD = 80;
  const MAX_PULL = 120;

  function openGallery(photos: (string | null)[], index: number) {
    setGalleryPhotos(photos);
    setGalleryIndex(index);
    setGalleryOpen(true);
  }

  const fetchStones = useCallback(async () => {
    try {
      const r = await fetch("/api/stones");
      if (r.ok) {
        const all: StoreStone[] = await r.json();
        const live = all.filter(s => s.status === "Available" && (s.listing_category === "Polished" || s.listing_category === "Jewelry"));
        /* Seed the single demo piece (hidden once real stock exists or owner removed it) */
        const demoRemoved = typeof window !== "undefined" && localStorage.getItem("boutique_demo_removed") === "1";
        const hasDemo = live.some(s => s.id === "_demo_aurora");
        if (!hasDemo && !demoRemoved && live.length === 0) live.unshift(DEMO_STONE);
        setStones(live);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStones(); }, [fetchStones]);

  function handleTouchStart(e: React.TouchEvent) {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 5 || isRefreshing) return;
    pullStartRef.current = e.touches[0].clientY;
    pullingRef.current = true;
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (!pullingRef.current || pullStartRef.current === null || isRefreshing) return;
    const dy = e.touches[0].clientY - pullStartRef.current;
    if (dy <= 0) { setPullDist(0); return; }
    const el = scrollRef.current;
    if (el && el.scrollTop > 0) { pullingRef.current = false; setPullDist(0); return; }
    setPullDist(Math.min(MAX_PULL, dy * 0.55));
  }
  function handleTouchEnd() {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    if (pullDist >= THRESHOLD && !isRefreshing) {
      setIsRefreshing(true); setPullDist(50);
      fetchStones().finally(() => { setIsRefreshing(false); setPullDist(0); });
    } else { setPullDist(0); }
  }

  useEffect(() => {
    if (!highlightStone || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-stone-id="${highlightStone}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightStone]);

  const filtered = filter === "All" ? stones : stones.filter(s => {
    const cat = (s.listing_category || "").toLowerCase();
    const shape = (s.shape || "").toLowerCase();
    const f = filter.toLowerCase();
    return cat.includes(f) || shape.includes(f);
  });

  const categoryImages = CATEGORY_MAP.map(cat => {
    const match = stones.find(s => {
      const shape = (s.shape || "").toLowerCase();
      const category = (s.listing_category || "").toLowerCase();
      return shape.includes(cat.key.toLowerCase()) || category.includes(cat.key.toLowerCase());
    });
    const photos = parsePhotos(match?.photo);
    return { ...cat, photo: photos[0] };
  });

  function toggleWishlist(id: string) {
    setWishlist(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem("boutique_wishlist", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const featured = stones[0];

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "#EAE8E4" }}>

      {/* ═══ SPOTLIGHT HERO ═══ */}
      <div className="shrink-0 relative overflow-hidden" style={{ height: "46vh", minHeight: 300 }}>
        {/* CSS light beam: cone from top center */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 50% 70% at 50% 0%, rgba(255,255,255,0.5) 0%, rgba(23,23,23,0.15) 40%, transparent 70%)",
          pointerEvents: "none",
        }} />
        {/* Soft elliptical pool at base */}
        <div style={{
          position: "absolute", bottom: 0, left: "15%", right: "15%", height: "35%",
          background: "radial-gradient(ellipse at center bottom, rgba(23,23,23,0.04) 0%, transparent 65%)",
          pointerEvents: "none",
        }} />
        {/* Ring — Sketchfab embed, bare object on pearl, no backdrop */}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 24 }}>
          {/* Ring container — 200px tall, 100% wide, scaled down, masked, shadowed */}
          <div style={{ position: 'relative', width: '100%', height: 200, flexShrink: 0, background: 'transparent' }}>
            {/* Soft shadow ellipse beneath */}
            <div style={{ position: 'absolute', bottom: -8, left: '20%', right: '20%', height: 14, background: 'radial-gradient(ellipse at center, rgba(23,23,23,0.18) 0%, transparent 75%)', filter: 'blur(12px)', pointerEvents: 'none', zIndex: 0 }} />
            {/* Masked + blended iframe wrapper (behind poster) */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'transparent', mixBlendMode: 'multiply', maskImage: 'radial-gradient(closest-side, black 52%, transparent 96%)', WebkitMaskImage: 'radial-gradient(closest-side, black 52%, transparent 96%)' }}>
              <iframe
                title="Black Diamond Ring"
                src="https://sketchfab.com/models/5aa8c861617a431395e44a182d6cfa6b/embed?autostart=1&autospin=1&ui_theme=light&transparent=1&ui_infos=0&ui_controls=0&ui_hint=0&ui_settings=0&ui_vr=0&ui_fullscreen=0"
                style={{
                  width: '100%', height: '100%',
                  border: 'none',
                  position: 'absolute', inset: 0,
                  transform: 'scale(0.9)',
                  opacity: iframeOpacity, transition: 'opacity 0.6s ease-in-out',
                  filter: 'brightness(1.18) contrast(1.12) saturate(1.06)',
                }}
                allow="autoplay; fullscreen"
                loading="eager"
                onLoad={() => { setIframeOpacity(1); setPosterOpacity(0); }}
              />
            </div>
            {/* Poster image — fades out on iframe load */}
            <img
              src="/ring-poster.jpg"
              alt=""
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'contain', zIndex: 1,
                opacity: posterOpacity, transition: 'opacity 0.6s ease-in-out',
                pointerEvents: 'none',
                background: 'transparent',
                mixBlendMode: 'multiply',
                maskImage: 'radial-gradient(closest-side, black 52%, transparent 96%)',
                WebkitMaskImage: 'radial-gradient(closest-side, black 52%, transparent 96%)',
              }}
            />
            {/* Gesture overlay — captures swipes so they switch panels (removed in play mode) */}
            {!ringPlaying && <div style={{ position: 'absolute', inset: 0, zIndex: 2 }} />}
            {/* Play / Done chip */}
            <button
              onClick={() => setRingPlaying(p => !p)}
              className="flex items-center gap-1"
              style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 3, padding: '4px 10px', borderRadius: 999, background: '#FCFCFB', border: '1px solid rgba(23,23,23,0.08)', fontSize: 11, color: '#6E6C69', cursor: 'pointer', fontWeight: 400 }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" /></svg>
              {ringPlaying ? 'Done' : 'Play'}
            </button>
          </div>

          {/* ALL text below the stage — never overlapping the stone */}
          <div style={{ textAlign: 'center', padding: '24px 24px 0', zIndex: 2, flexShrink: 0 }}>
            <p style={{ fontSize: 10, letterSpacing: "0.14em", fontWeight: 400, color: "#6E6C69", textTransform: "uppercase", marginBottom: 6 }}>The House Ring</p>
            <h2 style={{ fontSize: 22, fontWeight: 500, color: "#171717", fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", letterSpacing: "0.01em", lineHeight: 1.2, marginBottom: 12 }}>
              Set with intention, worn with meaning.
            </h2>
            <button
              onClick={() => { if (featured) setShowReserveId(featured.id); }}
              style={{ fontSize: 12, color: "#6E6C69", background: "none", border: "none", padding: 0, cursor: "pointer", letterSpacing: "0.05em", fontWeight: 400, textDecoration: "none", borderBottom: "1px solid rgba(110,108,105,0.3)", paddingBottom: 2 }}
            >
              Reserve
            </button>
          </div>
        </div>
      </div>

      {/* ═══ SCROLLABLE CONTENT ═══ */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>

        {/* Pull-to-refresh */}
        <div className="overflow-hidden flex items-center justify-center" style={{ height: pullDist || 0, transition: isRefreshing ? "none" : "height 0.25s ease-out" }}>
          {pullDist > 10 && (
            <div className="flex items-center gap-2" style={{ opacity: Math.min(1, pullDist / THRESHOLD) }}>
              <svg className={isRefreshing ? "animate-spin" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A6A6AB" strokeWidth="2" strokeLinecap="round">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              <span className="text-[10px]" style={{ color: isRefreshing ? "#171717" : "#6E6C69" }}>
                {pullDist >= THRESHOLD ? (isRefreshing ? "Refreshing..." : "Release to refresh") : "Pull to refresh"}
              </span>
            </div>
          )}
        </div>

        {/* ═══ FEATURED CATEGORIES ═══ */}
        <div className="px-5 pt-6 pb-2">
          <h3 style={{ fontSize: 20, fontWeight: 500, color: "#171717", fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", letterSpacing: "0.02em", textAlign: "center", marginBottom: 16 }}>
            Featured Categories
          </h3>
          <div className="flex gap-5 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', paddingLeft: 'max(0px, calc(50% - 200px))', paddingRight: 'max(0px, calc(50% - 200px))' }}>
            {categoryImages.map(cat => {
              const hasImage = cat.photo && cat.photo.length > 10 && !cat.photo.startsWith("data:");
              const isActive = filter === cat.key;
              return (
                <button key={cat.key} onClick={() => setFilter(isActive ? "All" : cat.key)} className="flex flex-col items-center gap-2 shrink-0" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: "50%",
                    background: isActive ? "radial-gradient(circle, rgba(142,142,147,0.10) 0%, #FCFCFB 70%)" : "radial-gradient(circle, rgba(23,23,23,0.02) 0%, #FCFCFB 70%)",
                    border: isActive ? "1.5px solid #8E8E93" : "1px solid rgba(23,23,23,0.08)",
                    overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {hasImage ? (
                      <img src={cat.photo!} alt={cat.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" style={{ width: 24, height: 24 }}>
                        <defs><linearGradient id={`cat-${cat.key}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#E8E6E1" /><stop offset="50%" stopColor="#C8C6C1" /><stop offset="100%" stopColor="#A6A6AB" /></linearGradient></defs>
                        {cat.key === 'Watch' ? (
                          /* Watch glyph: circle face + two lugs */
                          <>
                            <circle cx="12" cy="12" r="7" stroke={`url(#cat-${cat.key})`} strokeWidth="1.5" fill="none" />
                            <line x1="12" y1="5" x2="12" y2="12" stroke={`url(#cat-${cat.key})`} strokeWidth="1.5" strokeLinecap="round" />
                            <line x1="12" y1="12" x2="16" y2="12" stroke={`url(#cat-${cat.key})`} strokeWidth="1.5" strokeLinecap="round" />
                            <rect x="10" y="2" width="4" height="2.5" rx="0.5" stroke={`url(#cat-${cat.key})`} strokeWidth="1" fill="none" />
                            <rect x="10" y="19.5" width="4" height="2.5" rx="0.5" stroke={`url(#cat-${cat.key})`} strokeWidth="1" fill="none" />
                          </>
                        ) : (
                          <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke={`url(#cat-${cat.key})`} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                        )}
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: 10, letterSpacing: "0.1em", color: isActive ? "#171717" : "#6E6C69", textTransform: "uppercase", fontWeight: 400 }}>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══ SECTION TITLE ═══ */}
        <div className="px-5 pt-4 pb-2">
          <h3 style={{ fontSize: 20, fontWeight: 500, color: "#171717", fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", letterSpacing: "0.02em", textAlign: "center", marginBottom: 12 }}>
            {filter === "All" ? "New Arrivals" : `${filter.charAt(0).toUpperCase() + filter.slice(1)} Collection`}
          </h3>
        </div>

        {/* Grid */}
        <div className="px-5 pb-4">
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ background: "#FCFCFB", borderRadius: 14, border: "1px solid rgba(23,23,23,0.08)", overflow: "hidden" }}>
                  <div className="aspect-square relative" style={{ background: "#F5F4F2" }}>
                    <div className="absolute inset-0 shimmer" />
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="h-3 w-16 shimmer rounded" />
                    <div className="h-2.5 w-3/4 shimmer rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[12px] mb-4" style={{ color: "#6E6C69" }}>First pieces arriving soon</p>
              <a href="https://wa.me/26772839152" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#6E6C69", border: "1px solid rgba(23,23,23,0.08)", padding: "6px 16px", borderRadius: 10, textDecoration: "none", display: "inline-block", background: "#FCFCFB" }}>
                WhatsApp the desk to commission
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map(stone => (
                <BoutiqueCard
                  key={stone.id}
                  stone={stone}
                  wishlisted={!!wishlist[stone.id]}
                  onToggleWishlist={() => toggleWishlist(stone.id)}
                  onReserve={() => setShowReserveId(stone.id)}
                  onOpenGallery={(photos, idx) => openGallery(photos, idx)}
                />
              ))}
            </div>
          )}
          <p className="text-center mt-3 pb-2" style={{ fontSize: 10, color: "#6E6C69", fontWeight: 300 }}>{filtered.length} {filtered.length === 1 ? "piece" : "pieces"}</p>
          <div className="h-4" />
        </div>

        {/* ═══ BOTTOM MARQUEE ═══ */}
        <div style={{ borderTop: "1px solid rgba(23,23,23,0.08)", overflow: "hidden", padding: "10px 0" }}>
          <div className="marquee-track">
            {[...Array(4)].map((_, i) => (
              <span key={i} style={{ fontSize: 11, letterSpacing: "0.12em", color: "#A6A6AB", fontWeight: 400, whiteSpace: "nowrap", paddingRight: 32 }}>
                KIMBERLEY PROCESS CERTIFIED &middot; BOTSWANA LICENSED TRADE &middot; EVERY STONE INSURED IN TRANSIT &middot;&nbsp;
              </span>
            ))}
          </div>
        </div>

        {/* Sketchfab licence credit */}
        <div className="text-center pb-4" style={{ fontSize: 9, color: '#9A9A9F', letterSpacing: '0.04em' }}>
          3D: &lsquo;Diamond&rsquo; by PatelDev &middot; &lsquo;Black Diamond Ring&rsquo; by Busanello on Sketchfab
        </div>
      </div>

      {/* Gallery */}
      {galleryOpen && <PhotoGallery photos={galleryPhotos} initialIndex={galleryIndex} onClose={() => setGalleryOpen(false)} />}

      {/* Reserve modal */}
      {showReserveId && (
        <ReserveModal
          stoneId={showReserveId}
          stone={stones.find(s => s.id === showReserveId)}
          onClose={() => setShowReserveId(null)}
          onReserved={() => { setStones(p => p.filter(s => s.id !== showReserveId)); setShowReserveId(null); }}
        />
      )}
    </div>
  );
}

/* ── Reserve Modal ── */
function ReserveModal({ stoneId, stone, onClose, onReserved }: { stoneId: string; stone?: StoreStone; onClose: () => void; onReserved: () => void }) {
  const [name, setName] = useState("");
  const [wa, setWa] = useState("");
  const [sending, setSending] = useState(false);

  async function handleReserve() {
    if (!name.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stoneId, buyerName: name, buyerWhatsapp: wa }),
      });
      if (res.ok) onReserved();
    } catch {}
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full rounded-t-2xl flex flex-col" style={{ background: "#FCFCFB", border: "1px solid rgba(23,23,23,0.08)", borderBottom: "none" }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full" style={{ background: "rgba(23,23,23,0.12)" }} /></div>
        <div className="px-5 pb-4 pt-2">
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#171717", marginBottom: 4 }}>Reserve {stone ? stone.ref : ""}</h3>
          <p style={{ fontSize: 12, color: "#6E6C69", marginBottom: 16 }}>Our desk will send an invoice and payment details via WhatsApp within one business day.</p>
          <div className="space-y-3">
            <div>
              <label style={{ fontSize: 10, letterSpacing: "0.1em", color: "#6E6C69", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Your Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="w-full px-3 py-2.5 text-[13px] rounded-lg outline-none" style={{ border: "1px solid rgba(23,23,23,0.08)", background: "#EAE8E4", color: "#171717" }} />
            </div>
            <div>
              <label style={{ fontSize: 10, letterSpacing: "0.1em", color: "#6E6C69", textTransform: "uppercase", display: "block", marginBottom: 4 }}>WhatsApp Number</label>
              <input value={wa} onChange={e => setWa(e.target.value)} placeholder="+267 ..." className="w-full px-3 py-2.5 text-[13px] rounded-lg outline-none" style={{ border: "1px solid rgba(23,23,23,0.08)", background: "#EAE8E4", color: "#171717" }} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 py-3 text-[13px] font-medium rounded-xl cursor-default" style={{ border: "1px solid rgba(23,23,23,0.08)", color: "#6E6C69" }}>Cancel</button>
              <button onClick={handleReserve} disabled={!name.trim() || sending} className="flex-1 py-3 text-[13px] font-medium rounded-xl cursor-default disabled:opacity-40" style={{ background: "#171717", color: "#FCFCFB" }}>
                {sending ? "Reserving..." : "Confirm Reserve"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Photo Gallery Overlay ── */
function PhotoGallery({ photos, initialIndex, onClose }: { photos: (string | null)[]; initialIndex: number; onClose: () => void }) {
  const [active, setActive] = useState(initialIndex);
  const trackRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const child = track.children[active] as HTMLElement;
    if (child) child.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  function onScroll() {
    const track = trackRef.current;
    if (!track) return;
    const idx = Math.round(track.scrollLeft / track.clientWidth);
    if (idx !== active && idx >= 0 && idx < photos.length) setActive(idx);
  }

  function onDoubleTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 300) onClose();
    lastTapRef.current = now;
  }

  const validCount = photos.filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col" style={{ background: "rgba(0,0,0,0.95)" }} onClick={onClose} data-gallery="true">
      <div className="shrink-0 flex items-center justify-between px-4 pt-4 pb-2" onClick={e => e.stopPropagation()}>
        <span className="text-[11px]" style={{ color: "#A6A6AB" }}>{active + 1} / {validCount || 3}</span>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "rgba(23,23,23,0.15)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div ref={trackRef} onScroll={onScroll} onClick={e => { e.stopPropagation(); onDoubleTap(); }}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory"
        style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        {photos.map((url, idx) => (
          <div key={idx} className="flex-none w-full h-full flex items-center justify-center p-4 snap-center" style={{ scrollSnapAlign: "center" }}>
            {url ? (
              <img src={url} alt={`Shot ${idx + 1}`} className="max-h-full max-w-full object-contain select-none" draggable={false} />
            ) : (
              <div style={{ width: 200, height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="none" style={{ width: 40, height: 40 }}><defs><linearGradient id={`pg-ph-${idx}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#E8E6E1" /><stop offset="100%" stopColor="#A6A6AB" /></linearGradient></defs><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke={`url(#pg-ph-${idx})`} strokeWidth="1.5" strokeLinejoin="round" fill="none" /></svg>
                <p className="text-center mt-3 text-[10px]" style={{ color: "#A6A6AB" }}>Not available</p>
              </div>
            )}
          </div>
        ))}
      </div>
      {photos.length > 1 && (
        <div className="flex justify-center gap-2 py-3" onClick={e => e.stopPropagation()}>
          {photos.map((_, idx) => (
            <button key={idx} onClick={() => setActive(idx)}
              className="rounded-full transition-all"
              style={{ width: idx === active ? 16 : 6, height: 6, background: idx === active ? "#171717" : "rgba(23,23,23,0.15)" }} />
          ))}
        </div>
      )}
      <div className="hidden md:flex justify-center gap-2 pb-4 px-4" onClick={e => e.stopPropagation()}>
        {photos.map((url, idx) => (
          <button key={idx} onClick={() => setActive(idx)}
            className="w-16 h-16 overflow-hidden flex-shrink-0"
            style={{ border: idx === active ? "2px solid #8E8E93" : "1px solid rgba(23,23,23,0.08)", borderRadius: 6, background: "#F5F4F2" }}>
            {url ? (
              <img src={url} alt={`Shot ${idx + 1}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16 }}><defs><linearGradient id={`pg-th-${idx}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#E8E6E1" /><stop offset="100%" stopColor="#A6A6AB" /></linearGradient></defs><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke={`url(#pg-th-${idx})`} strokeWidth="1.5" strokeLinejoin="round" fill="none" /></svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Boutique Card ── */
function BoutiqueCard({ stone, wishlisted, onToggleWishlist, onReserve, onOpenGallery }: {
  stone: StoreStone; wishlisted: boolean;
  onToggleWishlist: () => void; onReserve: () => void;
  onOpenGallery: (photos: (string | null)[], index: number) => void;
}) {
  const photos = parsePhotos(stone.photo);
  const hasPhoto = photos[0] !== null;
  const spec = [stone.cut || stone.shape, stone.carat ? `${stone.carat}ct` : "", stone.color].filter(Boolean).join(" \u00b7 ");

  return (
    <div style={{ background: "#FCFCFB", borderRadius: 14, border: "1px solid rgba(23,23,23,0.08)", overflow: "hidden" }}>
      <div className="aspect-square relative cursor-pointer" style={{ overflow: "hidden" }}
        onClick={() => onOpenGallery(photos, 0)}>
        {hasPhoto ? (
          <>
            <img src={photos[0]!} alt={stone.ref} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {photos.some(Boolean) && (
              <span className="absolute bottom-2 right-2 text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.85)", color: "#6E6C69" }}>
                1/{photos.filter(Boolean).length || 3}
              </span>
            )}
          </>
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F4F2" }}>
            <svg viewBox="0 0 24 24" fill="none" style={{ width: 40, height: 40 }}><defs><linearGradient id="card-fb" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#E8E6E1" /><stop offset="50%" stopColor="#C8C6C1" /><stop offset="100%" stopColor="#A6A6AB" /></linearGradient></defs><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="url(#card-fb)" strokeWidth="1.5" strokeLinejoin="round" fill="none" /></svg>
          </div>
        )}
        {(stone as any).trader_preferred && (
          <span className="absolute top-2 left-2 flex items-center gap-1 text-[8px] font-medium uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full" style={{ color: "#8E8E93", background: "rgba(252,252,251,0.9)", border: "1px solid rgba(23,23,23,0.08)" }}>
            <svg viewBox="0 0 24 24" fill="none" style={{ width: 8, height: 8 }}><defs><linearGradient id="pref-g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#E8E6E1" /><stop offset="100%" stopColor="#A6A6AB" /></linearGradient></defs><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="url(#pref-g)" strokeWidth="1.5" fill="none" /></svg>
            Preferred
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-[13px] font-light truncate" style={{ color: "#171717", marginBottom: 2 }}>{stone.shape} {stone.carat}ct {stone.color}</p>
        {spec && <p className="text-[11px] truncate" style={{ color: "#6E6C69", marginBottom: 8 }}>{spec}</p>}
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium tabular-nums" style={{ color: stone.price ? "#171717" : "#6E6C69" }}>
            {stone.price ? `$${stone.price.toLocaleString()}` : "Price on request"}
          </span>
          <div className="flex items-center gap-1.5">
            <button onClick={(e) => { e.stopPropagation(); onToggleWishlist(); }} style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={wishlisted ? "#A6A6AB" : "none"} stroke={wishlisted ? "#A6A6AB" : "#6E6C69"} strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); onReserve(); }} className="text-[12px] font-medium" style={{ background: "#171717", color: "#FCFCFB", padding: "6px 14px", borderRadius: 10, border: "none", cursor: "pointer", lineHeight: 1 }}>
              Reserve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   VIDEOS PANEL
   ═══════════════════════════════════════════ */

function VideosPanel({ onSeePiece, onAskAmes, onOpenBoutiqueDetail }: {
  onSeePiece: (id: string) => void;
  onAskAmes: (ref: string, shape: string, carat: number, color: string, clarity: string) => void;
  onOpenBoutiqueDetail: (stoneId: string) => void;
}) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(0);
  const [drawerVideoId, setDrawerVideoId] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/videos?published=1").then(r => r.ok ? r.json() : []).then(d => setVideos(d)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const f = feedRef.current;
    if (!f) return;
    const obs = new IntersectionObserver(
      (entries) => { entries.forEach(e => { if (e.isIntersecting && e.intersectionRatio > 0.5) setActiveVideo(Number(e.target.getAttribute("data-video"))); }); },
      { root: f, threshold: 0.5 }
    );
    f.querySelectorAll("[data-video]").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [videos]);

  if (loading) return <div className="h-full flex items-center justify-center" style={{ background: '#EAE8E4', color: '#6E6C69', fontSize: 12 }}>Loading videos...</div>;
  if (!videos.length) return (
    <div className="h-full flex items-center justify-center" style={{ background: '#EAE8E4', fontSize: 12, textAlign: 'center', padding: 24 }}>
      <div>
        <svg viewBox="0 0 24 24" fill="none" style={{ width: 32, height: 32, margin: '0 auto 12px' }}><defs><linearGradient id="vid-fb" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#E8E6E1" /><stop offset="50%" stopColor="#C8C6C1" /><stop offset="100%" stopColor="#A6A6AB" /></linearGradient></defs><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="url(#vid-fb)" strokeWidth="1.5" strokeLinejoin="round" fill="none" /></svg>
        <p style={{ color: "#6E6C69" }}>No videos published yet.</p>
      </div>
    </div>
  );

  return (
    <>
      <div ref={feedRef} className="h-[100dvh] overflow-y-scroll snap-y snap-mandatory relative" style={{ scrollSnapType: "y mandatory", background: "#1A1A1A" }}>
        {videos.map((v, i) => (
          <VideoSlide key={v.id} video={v} index={i} isActive={activeVideo === i}
            onSeePiece={onSeePiece} onAskAmes={onAskAmes}
            onComments={() => setDrawerVideoId(v.id)}
            onOpenBoutiqueDetail={onOpenBoutiqueDetail}
            totalVideos={videos.length} activeIndex={activeVideo} />
        ))}
      </div>
      {drawerVideoId && <CommentDrawer videoId={drawerVideoId} onClose={() => setDrawerVideoId(null)} />}
    </>
  );
}

function VideoSlide({ video, index, isActive, onSeePiece, onAskAmes, onComments, onOpenBoutiqueDetail, totalVideos, activeIndex }: {
  video: VideoItem; index: number; isActive: boolean;
  onSeePiece: (id: string) => void; onAskAmes: (ref: string, shape: string, carat: number, color: string, clarity: string) => void;
  onComments: () => void; onOpenBoutiqueDetail: (stoneId: string) => void;
  totalVideos: number; activeIndex: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(() => typeof window !== "undefined" && !!localStorage.getItem(`liked_${video.id}`));
  const [likes, setLikes] = useState(video.likes_count || 0);
  const [commentCount, setCommentCount] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/videos/${video.id}/comments`).then(r => r.ok ? r.json() : []).then((c: Comment[]) => setCommentCount(c.length)).catch(() => {});
  }, [video.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive) { v.play().catch(() => {}); } else { v.pause(); v.currentTime = 0; }
  }, [isActive]);

  function toggleMute() { const v = videoRef.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } }

  async function toggleLike() {
    const delta = liked ? -1 : 1;
    setLiked(!liked);
    setLikes(l => Math.max(0, l + delta));
    if (!liked) localStorage.setItem(`liked_${video.id}`, "1"); else localStorage.removeItem(`liked_${video.id}`);
    try { await fetch(`/api/videos/${video.id}/like`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delta }) }); } catch {}
  }

  function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `${video.caption} \u2014 AMES`;
    if (navigator.share) {
      navigator.share({ title: "AMES", text, url }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + url)}`, "_blank");
    }
  }

  const stoneInfo = video.stone_id ? { ref: video.stone_ref || "", shape: video.shape || "", carat: video.carat || 0, color: video.color || "", clarity: video.clarity || "", status: video.stone_status || null, photo: video.stone_photo || null, price: video.price } : null;

  return (
    <div data-video={index} className="h-[100dvh] snap-start snap-always relative flex items-center justify-center" style={{ background: "#1A1A1A" }}>
      <video ref={videoRef} src={video.video_url} className="absolute inset-0 w-full h-full object-cover" loop muted={muted} playsInline preload={isActive ? "auto" : "metadata"} />
      <button onClick={toggleMute} className="absolute inset-0 z-10" aria-label={muted ? "Tap to unmute" : "Tap to mute"} />

      {/* Progress dots */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1.5">
        {Array.from({ length: totalVideos }, (_, i) => (
          <div key={i} className="rounded-full transition-all" style={{ width: i === activeIndex ? 4 : 3, height: i === activeIndex ? 12 : 3, background: i === activeIndex ? "#A6A6AB" : "rgba(255,255,255,0.25)" }} />
        ))}
      </div>

      {/* Right rail */}
      <div className="absolute right-3 bottom-36 z-20 flex flex-col items-center gap-6">
        <button onClick={(e) => { e.stopPropagation(); toggleLike(); }} className="flex flex-col items-center gap-1">
          <svg width="22" height="22" viewBox="0 0 24 24" fill={liked ? "#A6A6AB" : "none"} stroke={liked ? "#A6A6AB" : "rgba(255,255,255,0.85)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span style={{ fontSize: 10, color: liked ? "#A6A6AB" : "rgba(255,255,255,0.85)" }}>{likes}</span>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onComments(); }} className="flex flex-col items-center gap-1">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.85)" }}>{commentCount ?? "-"}</span>
        </button>
        <button onClick={(e) => { e.stopPropagation(); handleShare(); }} className="flex flex-col items-center gap-1">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
          </svg>
        </button>
      </div>

      {/* Bottom overlay */}
      <div className="absolute bottom-0 left-0 right-12 z-20 p-4 pb-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
        {video.model_instagram && (
          <p style={{ fontSize: 11, letterSpacing: "0.12em", color: "#A6A6AB", fontWeight: 400, textTransform: "uppercase", marginBottom: 6 }}>
            {video.model_instagram}
          </p>
        )}
        {(video.house_note || video.caption) && (
          <p style={{ fontSize: 15, fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", fontStyle: "italic", color: "#FCFCFB", marginBottom: 10, lineHeight: 1.4 }}>
            <span style={{ fontWeight: 500, fontStyle: "normal" }}>AMES</span> &mdash; {video.house_note || video.caption}
          </p>
        )}
        {stoneInfo && (
          <button onClick={(e) => { e.stopPropagation(); onOpenBoutiqueDetail(video.stone_id!); }}
            className="flex items-center gap-3 p-2 rounded-xl"
            style={{ background: "rgba(23,23,23,0.08)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", maxWidth: 280 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "#EAE8E4", border: "1px solid rgba(255,255,255,0.1)" }}>
              {stoneInfo.photo ? (
                <img src={stoneInfo.photo} alt={stoneInfo.ref} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }}><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#A6A6AB" strokeWidth="1.5" strokeLinejoin="round" fill="none" /></svg>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="truncate" style={{ fontSize: 12, color: "#FCFCFB", fontWeight: 500, marginBottom: 1 }}>
                {stoneInfo.ref} &middot; {stoneInfo.shape} {stoneInfo.carat}ct
              </p>
              <span style={{ fontSize: 12, color: "#A6A6AB", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {stoneInfo.price != null ? `$${stoneInfo.price.toLocaleString()}` : "Price on request"}
              </span>
            </div>
            <span style={{ fontSize: 9, color: "#A6A6AB", letterSpacing: "0.06em", flexShrink: 0, textTransform: "uppercase" }}>View piece</span>
          </button>
        )}
      </div>
    </div>
  );
}

function CommentDrawer({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/videos/${videoId}/comments`).then(r => r.ok ? r.json() : []).then((c: Comment[]) => setComments(c)).catch(() => {}).finally(() => setLoading(false));
  }, [videoId]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [comments]);

  async function handleSubmit() {
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ author: author || "Anonymous", text: text.trim() }) });
      if (res.ok) { const c = await res.json(); setComments(p => [...p, c]); setText(""); }
    } catch {}
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-h-[70dvh] rounded-t-2xl flex flex-col" style={{ background: "#FCFCFB" }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center py-2"><div className="w-10 h-1 rounded-full" style={{ background: "rgba(23,23,23,0.12)" }} /></div>
        <div className="px-4 pb-2 flex items-center justify-between">
          <span className="text-[13px] font-light" style={{ color: "#171717" }}>Comments</span>
          <button onClick={onClose} className="text-[11px] cursor-default" style={{ color: "#6E6C69" }}>Close</button>
        </div>
        <div style={{ borderTop: "1px solid rgba(23,23,23,0.08)" }} />
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[100px] max-h-[45dvh]">
          {loading ? (
            <div className="text-[11px] text-center py-4" style={{ color: "#6E6C69" }}>Loading...</div>
          ) : comments.length === 0 ? (
            <div className="text-[11px] text-center py-4" style={{ color: "#6E6C69" }}>No comments yet. Be the first.</div>
          ) : comments.map(c => (
            <div key={c.id} className="space-y-0.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-medium" style={{ color: "#171717" }}>{c.author}</span>
                <span className="text-[9px]" style={{ color: "#A6A6AB" }}>{timeAgo(c.created_at)}</span>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "#171717" }}>{c.text}</p>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 space-y-2" style={{ borderTop: "1px solid rgba(23,23,23,0.08)" }}>
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Name (optional)" className="w-full px-3 py-1.5 text-[11px] font-light rounded-lg" style={{ border: "1px solid rgba(23,23,23,0.08)", background: "#EAE8E4", color: "#171717" }} />
          <div className="flex gap-2">
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }} placeholder="Add a comment..." className="flex-1 px-3 py-1.5 text-[11px] font-light rounded-lg outline-none" style={{ border: "1px solid rgba(23,23,23,0.08)", background: "#EAE8E4", color: "#171717" }} />
            <button onClick={handleSubmit} disabled={!text.trim() || sending} className="px-4 py-1.5 text-[11px] font-medium rounded-lg cursor-default disabled:opacity-40" style={{ background: "#171717", color: "#FCFCFB" }}>
              {sending ? "..." : "Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
