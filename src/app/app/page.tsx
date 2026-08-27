"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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

const PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#f3f4f6" width="400" height="400"/><text x="200" y="200" font-family="system-ui,sans-serif" font-size="13" fill="#9ca3af" text-anchor="middle">No photo</text></svg>'
);

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */

export default function AppPage() {
  const [activePanel, setActivePanel] = useState(1);
  const [highlightStone, setHighlightStone] = useState<string | null>(null);
  const [chatPrefill, setChatPrefill] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  // Scroll to Chat (middle) on initial load
  useEffect(() => {
    setTimeout(() => scrollToPanel(1), 100);
  }, []);

  function scrollToPanel(idx: number) {
    const c = containerRef.current;
    if (!c) return;
    const p = c.querySelector(`[data-panel="${idx}"]`) as HTMLElement;
    if (p) p.scrollIntoView({ behavior: "smooth", inline: "start" });
  }

  function handleSeePiece(stoneId: string) {
    setHighlightStone(stoneId);
    scrollToPanel(0); // Boutique
    setTimeout(() => setHighlightStone(null), 3000);
  }

  function handleAskAmes(ref: string, shape: string, carat: number, color: string, clarity: string) {
    setChatPrefill(`Tell me about ${ref} \u2014 ${shape} ${carat}ct ${color} ${clarity}`);
    scrollToPanel(1); // Chat
  }

  // Keyboard + wheel navigation (desktop)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); scrollToPanel(Math.min(2, activePanel + 1)); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); scrollToPanel(Math.max(0, activePanel - 1)); }
    }
    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Already horizontal scroll — let browser handle
      } else if (Math.abs(e.deltaY) > 30) {
        e.preventDefault();
        if (e.deltaY > 0) scrollToPanel(Math.min(2, activePanel + 1));
        else scrollToPanel(Math.max(0, activePanel - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("wheel", onWheel); };
  }, [activePanel]);

  const NAV_ITEMS = [
    { label: "Boutique", panel: 0 },
    { label: "Chat", panel: 1 },
    { label: "Videos", panel: 2 },
    { label: "Trader Portal", href: "/trader" },
    { label: "Model Portal", href: "/model" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Intelligence", href: "/intelligence" },
  ];

  return (
    <>
      {/* App shell font + animations */}
      <style>{`
        :root { font-family: var(--font-inter, -apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', Arial, sans-serif); }
        @keyframes shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .shimmer {
          background: linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.04) 50%, transparent 75%);
          background-size: 400px 100%;
          animation: shimmer 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .shimmer { animation: none !important; }
        }
      `}</style>

      {/* Minimal transparent top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-11" style={{ background: 'transparent' }}>
        {/* Hamburger menu */}
        <button onClick={() => setDrawerOpen(!drawerOpen)} className="flex flex-col justify-center items-center w-9 h-9 gap-[5px] shrink-0 z-60" aria-label="Menu">
          <span className="block w-5 h-[1.5px] rounded-full" style={{ background: drawerOpen ? '#FFFFFF' : '#98989E', transition: 'all 0.3s' }} />
          <span className="block w-4 h-[1.5px] rounded-full" style={{ background: drawerOpen ? '#FFFFFF' : '#98989E', transition: 'all 0.3s' }} />
          <span className="block w-5 h-[1.5px] rounded-full" style={{ background: drawerOpen ? '#FFFFFF' : '#98989E', transition: 'all 0.3s' }} />
        </button>
        {/* Gold glyph */}
        <svg viewBox="0 0 24 24" fill="none" style={{ width: 24, height: 24 }} aria-hidden="true">
          <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
        </svg>
      </div>

      {/* Navigation drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[70]" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div className="absolute top-14 left-4 right-auto w-64 rounded-2xl overflow-hidden" style={{ background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.08)' }} onClick={e => e.stopPropagation()}>
            {/* Drawer header */}
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" fill="none" style={{ width: 20, height: 20 }} aria-hidden="true">
                  <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                </svg>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', color: '#FAF8F4' }}>AMES</div>
                  <div style={{ fontSize: 8, letterSpacing: '0.3em', color: '#C9A227' }}>DE BRILLIANTE</div>
                </div>
              </div>
            </div>
            {/* Nav links */}
            <div className="py-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    setDrawerOpen(false);
                    if ('panel' in item && item.panel !== undefined) scrollToPanel(item.panel);
                    else window.location.href = item.href;
                  }}
                  className="w-full text-left px-5 py-3 text-[13px] transition-colors"
                  style={{
                    color: 'panel' in item && activePanel === item.panel ? '#FFFFFF' : '#98989E',
                    background: 'panel' in item && activePanel === item.panel ? 'rgba(255,255,255,0.05)' : 'transparent',
                    fontWeight: 'panel' in item && activePanel === item.panel ? 500 : 400,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div ref={containerRef} className="h-[100dvh] w-[100dvw] overflow-x-scroll snap-x snap-mandatory flex" style={{ scrollSnapType: "x mandatory" }}>
        <section data-panel="0" className="relative w-[100dvw] h-full snap-start snap-always flex-shrink-0 flex flex-col">
          <BoutiquePanel highlightStone={highlightStone} />
        </section>

        <section data-panel="1" className="relative w-[100dvw] h-full snap-start snap-always flex-shrink-0 flex flex-col">
          <ChatPanel prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill("")} onBrowseBoutique={() => scrollToPanel(0)} />
        </section>

        <section data-panel="2" className="relative w-[100dvw] h-full snap-start snap-always flex-shrink-0">
          <VideosPanel onSeePiece={handleSeePiece} onAskAmes={handleAskAmes} onOpenBoutiqueDetail={(stoneId) => { setHighlightStone(stoneId); scrollToPanel(0); setTimeout(() => setHighlightStone(null), 3000); }} />
        </section>
      </div>

      {/* Desktop edge arrows — 40% opacity */}
      {activePanel > 0 && (
        <button onClick={() => scrollToPanel(activePanel - 1)} className="fixed left-2 top-1/2 -translate-y-1/2 z-40 w-10 h-10 flex items-center justify-center rounded-full bg-white/5 backdrop-blur-sm border border-white/10 opacity-40 hover:opacity-70 transition-opacity hidden md:flex" aria-label="Previous panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FAF8F4" strokeWidth="1.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      )}
      {activePanel < 2 && (
        <button onClick={() => scrollToPanel(activePanel + 1)} className="fixed right-2 top-1/2 -translate-y-1/2 z-40 w-10 h-10 flex items-center justify-center rounded-full bg-white/5 backdrop-blur-sm border border-white/10 opacity-40 hover:opacity-70 transition-opacity hidden md:flex" aria-label="Next panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FAF8F4" strokeWidth="1.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   CHAT PANEL — ChatGPT-style front desk
   ═══════════════════════════════════════════ */

interface ChatHistory {
  id: string; title: string; created_at: string; updated_at: string;
}

interface ChatMessage {
  id: string; chat_id: string; role: "user" | "assistant"; text: string; thinking: string; created_at: string;
}

const NO_AI_NOTICE = "The AMES desk is being configured. Talk to a human now:";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chatStarted = messages.length > 0;
  const hasAmesReply = messages.some(m => m.role === "assistant");

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, typing]);

  // Load chat list
  useEffect(() => {
    fetch("/api/chats").then(r => r.ok ? r.json() : []).then((d: ChatHistory[]) => setChats(d)).catch(() => {});
  }, []);

  // Prefill handling
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
    <div className="flex-1 flex flex-col min-h-0" style={{ background: '#000000', position: 'relative' }}>

      {chatStarted ? (
        /* === CHAT MODE === */
        <div className="flex-1 flex flex-col min-h-0">
          {/* Mini diamond header */}
          <div className="shrink-0 flex items-center gap-3 px-4 pt-12 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1C1C1E' }}>
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 28, height: 28 }}>
                <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            {/* Tiny segmented control */}
            <div className="flex rounded-full p-[2px] ml-auto" style={{ background: '#2C2C2E' }}>
              <button onClick={() => setMode("instant")} className="px-3 py-1 rounded-full text-[10px] transition-all" style={{ background: mode === "instant" ? "#3A3A3C" : "transparent", color: mode === "instant" ? "#FFFFFF" : "#98989E" }}>Instant</button>
              <button onClick={() => setMode("expert")} className="px-3 py-1 rounded-full text-[10px] transition-all" style={{ background: mode === "expert" ? "#3A3A3C" : "transparent", color: mode === "expert" ? "#FFFFFF" : "#98989E" }}>Expert</button>
            </div>
          </div>

          {/* Messages scroll area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
              {messages.map((m) => (
                <div key={m.id} className="space-y-2">
                  {m.role === "assistant" && m.thinking && (
                    <div className="ml-2">
                      <details className="group">
                        <summary style={{ fontSize: 11, cursor: 'pointer', userSelect: 'none', color: '#98989E' }}>Reasoning</summary>
                        <div style={{ marginTop: 4, padding: '8px 12px', fontSize: 11, lineHeight: 1.5, borderRadius: 12, background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.08)', color: '#98989E' }}>{m.thinking}</div>
                      </details>
                    </div>
                  )}
                  <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "assistant" && (
                      <div style={{ width: 24, height: 24, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 2, background: '#C9A227' }}>
                        <svg viewBox="0 0 24 24" fill="none" style={{ width: 12, height: 12 }}><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="white" strokeWidth="1.5" fill="none" /></svg>
                      </div>
                    )}
                    <div className="max-w-[85%]" style={{ padding: '10px 14px', fontSize: 14, lineHeight: 1.45, fontWeight: 400, ...(m.role === 'user' ? { background: 'rgba(201,162,39,0.12)', color: '#FFFFFF', borderRadius: '18px 18px 4px 18px', border: '1px solid rgba(201,162,39,0.15)' } : { background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF', borderRadius: '18px 18px 18px 4px' }) }}>
                      {m.text}
                    </div>
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div style={{ width: 24, height: 24, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 2, background: '#C9A227' }}>
                    <svg viewBox="0 0 24 24" fill="none" style={{ width: 12, height: 12 }}><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="white" strokeWidth="1.5" fill="none" /></svg>
                  </div>
                  <div style={{ background: '#1C1C1E', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', display: 'flex', gap: 4, border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#C9A227", animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#C9A227", animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#C9A227", animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Composer — chat mode */}
          <div className="shrink-0 px-4 pb-4 pt-2" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-2 rounded-full px-4 py-2" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', minHeight: 48 }}>
                <button onClick={() => setDeepThink(p => !p)} className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all" style={{ background: deepThink ? '#C9A227' : '#3A3A3C', color: deepThink ? '#000000' : '#98989E' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  DeepThink
                </button>
                <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Message AMES" className="flex-1 bg-transparent outline-none" style={{ fontSize: 14, fontWeight: 400, color: '#FFFFFF' }} />
                <button onClick={() => handleSend()} disabled={!input.trim()} className="waveform-icon" style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#C9A227', flexShrink: 0, opacity: input.trim() ? 1 : 0.3, transition: 'opacity 0.15s' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" /></svg>
                </button>
              </div>
              {/* WhatsApp link — visible after first AMES reply */}
              {hasAmesReply && (
                <div className="text-center mt-2">
                  <a href="https://wa.me/26772839152" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#C9A227', textDecoration: 'none', fontWeight: 400 }}>Talk to a human on WhatsApp</a>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* === EMPTY STATE - assistant home === */
        <div className="flex-1 flex flex-col items-center justify-center px-6 relative" style={{ background: '#000000' }}>
          {/* Quartz glow: radial white behind diamond */}
          <div className="quartz-glow" style={{
            position: 'absolute',
            width: 320, height: 320,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 40%, transparent 70%)',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -65%)',
            pointerEvents: 'none',
          }} />
          {/* Silver-white gradient rising from bottom */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
            background: 'linear-gradient(to top, rgba(255,255,255,0.10), transparent)',
            pointerEvents: 'none',
          }} />

          {/* Sketchfab embed — "A Diamond" by 3Dee */}
          <div style={{ width: '100%', maxWidth: 360, height: 220, marginBottom: 32, position: 'relative', zIndex: 1 }}>
            {/* Fallback glyph — visible while iframe loads or on error */}
            <iframe
              src="https://sketchfab.com/models/1cfafbdf8bfd4c8ca3ed9621789cdf01/embed?autostart=1&autospin=1&ui_theme=dark&transparent=1&ui_hint=0"
              title="A Diamond"
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 0 }}
              loading="lazy"
              allow="autoplay; fullscreen"
            />
          </div>

          {/* Greeting + heading */}
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', marginBottom: 40 }}>
            <p style={{ fontSize: 15, color: '#98989E', fontWeight: 400, marginBottom: 6 }}>Hello, Welcome</p>
            <h2 style={{ fontSize: 26, fontWeight: 600, color: '#FFFFFF', letterSpacing: '-0.01em' }}>How can I help you today?</h2>
          </div>

          {/* Quick action buttons */}
          <div className="flex gap-3 mb-6" style={{ position: 'relative', zIndex: 1 }}>
            <button onClick={onBrowseBoutique} className="px-5 py-3 rounded-full text-[13px] font-medium transition-colors" style={{ background: '#2C2C2E', color: '#FFFFFF', minHeight: 44 }}>Browse the boutique</button>
            <a href="https://wa.me/26772839152" target="_blank" rel="noopener noreferrer" className="px-5 py-3 rounded-full text-[13px] font-medium text-center flex items-center" style={{ background: '#C9A227', color: '#000000', minHeight: 44, textDecoration: 'none' }}>WhatsApp a human</a>
          </div>

          {/* Segmented control */}
          <div className="flex rounded-full p-[3px] mb-6" style={{ background: '#2C2C2E', position: 'relative', zIndex: 1 }}>
            <button onClick={() => setMode("instant")} className="px-6 py-1.5 rounded-full text-[13px] transition-all" style={{ background: mode === "instant" ? "#3A3A3C" : "transparent", color: mode === "instant" ? "#FFFFFF" : "#98989E" }}>Instant</button>
            <button onClick={() => setMode("expert")} className="px-6 py-1.5 rounded-full text-[13px] transition-all" style={{ background: mode === "expert" ? "#3A3A3C" : "transparent", color: mode === "expert" ? "#FFFFFF" : "#98989E" }}>Expert</button>
          </div>

          {/* CC credit */}
          <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.30)', position: 'relative', zIndex: 1 }}>3D: 'A Diamond' by 3Dee · 'Jewelery - Ring - Diamonds' by Cécile Amstad on Sketchfab</p>
        </div>
      )}

      {/* Composer - fixed at bottom (empty state only, chat mode has its own) */}
      {!chatStarted && (
        <div className="shrink-0 px-4 pb-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))', position: 'relative', zIndex: 1 }}>
          <div className="max-w-2xl mx-auto flex items-center gap-2 rounded-full px-4 py-2" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', minHeight: 48 }}>
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Ask AMES anything..." className="flex-1 bg-transparent outline-none" style={{ fontSize: 14, fontWeight: 400, color: '#FFFFFF' }} />
            <button onClick={() => handleSend()} disabled={!input.trim()} className="waveform-icon" style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#C9A227', flexShrink: 0, opacity: input.trim() ? 1 : 0.3, transition: 'opacity 0.15s' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


/* === STORE PANEL: Boutique storefront === */

const CATEGORY_MAP: { label: string; key: string; glyph: string }[] = [
  { label: "Rings", key: "Ring", glyph: "R" },
  { label: "Necklaces", key: "Necklace", glyph: "N" },
  { label: "Earrings", key: "Earring", glyph: "E" },
  { label: "Bracelets", key: "Bracelet", glyph: "B" },
];

function BoutiquePanel({ highlightStone }: { highlightStone: string | null }) {
  const [stones, setStones] = useState<StoreStone[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("All");
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

  function openGallery(photos: (string | null)[], index: number) {
    setGalleryPhotos(photos);
    setGalleryIndex(index);
    setGalleryOpen(true);
  }
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pull-to-refresh state
  const [pullDist, setPullDist] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const THRESHOLD = 80;
  const MAX_PULL = 120;

  const fetchStones = useCallback(async () => {
    try {
      const r = await fetch("/api/stones");
      if (r.ok) {
        const all: StoreStone[] = await r.json();
        setStones(all.filter(s => s.status === "Available" && (s.listing_category === "Polished" || s.listing_category === "Jewelry")));
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStones(); }, [fetchStones]);

  // Pull-to-refresh handlers
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

  // Find first piece per category for the circle thumbnails
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

  // Featured piece for the hero
  const featured = stones[0];

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "#0B0C0D" }}>

      {/* ═══ SPOTLIGHT HERO ═══ */}
      <div className="shrink-0 relative overflow-hidden" style={{ height: "46vh", minHeight: 300 }}>
        {/* CSS light beam: cone from top center */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 50% 70% at 50% 0%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 40%, transparent 70%)",
          pointerEvents: "none",
        }} />
        {/* Soft elliptical pool at base */}
        <div style={{
          position: "absolute", bottom: 0, left: "15%", right: "15%", height: "35%",
          background: "radial-gradient(ellipse at center bottom, rgba(255,255,255,0.05) 0%, transparent 65%)",
          pointerEvents: "none",
        }} />          {/* Sketchfab ring embed centered in the beam */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: "80%", height: "100%", maxWidth: 400, maxHeight: 340 }}>
            <iframe
              src="https://sketchfab.com/models/24b406272bc74fdb8b38c4a16547f0b1/embed?autostart=1&autospin=1&ui_theme=dark&transparent=1&ui_hint=0"
              title="Jewelery - Ring - Diamonds"
              style={{ width: "100%", height: "100%", border: "none" }}
              loading="lazy"
              allow="autoplay; fullscreen"
            />
          </div>
        </div>
        {/* Left-aligned text overlay */}
        <div style={{ position: "absolute", bottom: 48, left: 24, right: 24 }}>
          <p style={{ fontSize: 10, letterSpacing: "0.14em", fontWeight: 400, color: "#D6C193", textTransform: "uppercase", marginBottom: 6 }}>The House Stone</p>
          <h2 style={{ fontSize: 22, fontWeight: 500, color: "#FAF8F4", fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", letterSpacing: "0.01em", lineHeight: 1.2, marginBottom: 12 }}>
            {featured ? `${featured.shape}, ${featured.carat}ct ${featured.color}` : "Brilliance, cut for the bold"}
          </h2>
          <button
            onClick={() => {
              if (featured) {
                setShowReserveId(featured.id);
              }
            }}
            style={{ fontSize: 12, color: "#D6C193", background: "none", border: "none", padding: 0, cursor: "pointer", letterSpacing: "0.05em", fontWeight: 400, textDecoration: "none", borderBottom: "1px solid rgba(214,193,147,0.3)", paddingBottom: 2 }}
          >
            Reserve
          </button>
        </div>
      </div>

      {/* ═══ SCROLLABLE CONTENT ═══ */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>

        {/* Pull-to-refresh indicator */}
        <div className="overflow-hidden flex items-center justify-center" style={{ height: pullDist || 0, transition: isRefreshing ? "none" : "height 0.25s ease-out" }}>
          {pullDist > 10 && (
            <div className="flex items-center gap-2" style={{ opacity: Math.min(1, pullDist / THRESHOLD) }}>
              <svg className={isRefreshing ? "animate-spin" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A227" strokeWidth="2" strokeLinecap="round">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              <span className="text-[10px]" style={{ color: isRefreshing ? "#C9A227" : "#98989E" }}>
                {pullDist >= THRESHOLD ? (isRefreshing ? "Refreshing..." : "Release to refresh") : "Pull to refresh"}
              </span>
            </div>
          )}
        </div>

        {/* ═══ FEATURED CATEGORIES ═══ */}
        <div className="px-5 pt-6 pb-2">
          <h3 style={{ fontSize: 20, fontWeight: 500, color: "#FAF8F4", fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", letterSpacing: "0.02em", textAlign: "center", marginBottom: 16 }}>
            Featured Categories
          </h3>
          <div className="flex justify-center gap-6">
            {categoryImages.map(cat => {
              const hasImage = cat.photo && cat.photo.length > 10 && !cat.photo.startsWith("data:");
              const isActive = filter === cat.key;
              return (
                <button key={cat.key} onClick={() => setFilter(isActive ? "All" : cat.key)} className="flex flex-col items-center gap-2" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: "50%",
                    background: isActive ? "radial-gradient(circle, rgba(201,162,39,0.15) 0%, #141416 70%)" : "radial-gradient(circle, rgba(255,255,255,0.04) 0%, #141416 70%)",
                    border: isActive ? "1px solid #C9A227" : "1px solid rgba(255,255,255,0.08)",
                    overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {hasImage ? (
                      <img src={cat.photo!} alt={cat.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" style={{ width: 24, height: 24 }}>
                        <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: 10, letterSpacing: "0.1em", color: isActive ? "#FAF8F4" : "#98989E", textTransform: "uppercase", fontWeight: 400 }}>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══ SECTION: New Arrivals / Filtered ═══ */}
        <div className="px-5 pt-4 pb-2">
          <h3 style={{ fontSize: 20, fontWeight: 500, color: "#FAF8F4", fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", letterSpacing: "0.02em", textAlign: "center", marginBottom: 12 }}>
            {filter === "All" ? "New Arrivals" : `${filter.charAt(0).toUpperCase() + filter.slice(1)} Collection`}
          </h3>
        </div>

        {/* Grid */}
        <div className="px-5 pb-4">
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ background: "#141416", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div className="aspect-square relative" style={{ background: "#1a1c1e" }}>
                    <div className="absolute inset-0 shimmer" />
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="h-3 w-16 shimmer rounded" />
                    <div className="h-2.5 w-3/4 shimmer rounded" />
                    <div className="flex justify-between items-center pt-1"><div className="h-3 w-14 shimmer rounded" /><div className="h-7 w-16 shimmer rounded-full" /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            /* Empty boutique */
            <div className="text-center py-8">
              <p className="text-[12px] mb-4" style={{ color: "#98989E" }}>First pieces arriving soon</p>
              <a href="https://wa.me/26772839152" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#D6C193", border: "1px solid rgba(214,193,147,0.3)", padding: "6px 16px", borderRadius: 10, textDecoration: "none", display: "inline-block" }}>
                WhatsApp the desk to commission
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map(stone => (
                <BoutiqueCard
                  key={stone.id}
                  stone={stone}
                  reserved={false}
                  wishlisted={!!wishlist[stone.id]}
                  onToggleWishlist={() => toggleWishlist(stone.id)}
                  onReserve={() => setShowReserveId(stone.id)}
                  onOpenGallery={(photos, idx) => openGallery(photos, idx)}
                />
              ))}
            </div>
          )}
          <p className="text-center mt-3 pb-2" style={{ fontSize: 10, color: "#98989E", fontWeight: 300 }}>{filtered.length} {filtered.length === 1 ? "piece" : "pieces"}</p>
          <div className="h-4" />
        </div>

        {/* ═══ BOTTOM MARQUEE ═══ */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", padding: "10px 0" }}>
          <div className="marquee-track">
            {[...Array(4)].map((_, i) => (
              <span key={i} style={{ fontSize: 11, letterSpacing: "0.12em", color: "#D6C193", fontWeight: 400, whiteSpace: "nowrap", paddingRight: 32 }}>
                KIMBERLEY PROCESS CERTIFIED &middot; BOTSWANA LICENSED TRADE &middot; EVERY STONE INSURED IN TRANSIT &middot;&nbsp;
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Gallery overlay */}
      {galleryOpen && (
        <PhotoGallery photos={galleryPhotos} initialIndex={galleryIndex} onClose={() => setGalleryOpen(false)} />
      )}

      {/* Reserve modal */}
      {showReserveId && (
        <ReserveModal
          stoneId={showReserveId}
          stone={stones.find(s => s.id === showReserveId)}
          onClose={() => setShowReserveId(null)}
          onReserved={() => {
            setStones(p => p.filter(s => s.id !== showReserveId));
            setShowReserveId(null);
          }}
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
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full rounded-t-2xl flex flex-col" style={{ background: "#1C1C1E", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none" }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} /></div>
        <div className="px-5 pb-4 pt-2">
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#FAF8F4", marginBottom: 4 }}>Reserve {stone ? `${stone.ref}` : ""}</h3>
          <p style={{ fontSize: 12, color: "#98989E", marginBottom: 16 }}>Our desk will send an invoice and payment details via WhatsApp within one business day. No payment is taken in this app.</p>
          <div className="space-y-3">
            <div>
              <label style={{ fontSize: 10, letterSpacing: "0.1em", color: "#98989E", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Your Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="w-full px-3 py-2.5 text-[13px] rounded-lg outline-none" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#0B0C0D", color: "#FAF8F4" }} />
            </div>
            <div>
              <label style={{ fontSize: 10, letterSpacing: "0.1em", color: "#98989E", textTransform: "uppercase", display: "block", marginBottom: 4 }}>WhatsApp Number</label>
              <input value={wa} onChange={e => setWa(e.target.value)} placeholder="+267 ..." className="w-full px-3 py-2.5 text-[13px] rounded-lg outline-none" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#0B0C0D", color: "#FAF8F4" }} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 py-3 text-[13px] font-medium rounded-xl cursor-default" style={{ border: "1px solid rgba(255,255,255,0.08)", color: "#98989E" }}>Cancel</button>
              <button onClick={handleReserve} disabled={!name.trim() || sending} className="flex-1 py-3 text-[13px] font-medium rounded-xl cursor-default disabled:opacity-40" style={{ background: "#FAF8F4", color: "#000000" }}>
                {sending ? "Reserving..." : "Confirm Reserve"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Boutique Card (luxury style) ── */
/* ── Parse photo string into up to 3 URLs, pad with null ── */
function parsePhotos(photoStr: string | null | undefined): (string | null)[] {
  if (!photoStr) return [null, null, null];
  const parts = photoStr.split("|").map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith("data:"));
  return [parts[0] || null, parts[1] || null, parts[2] || null];
}

const GOLD_GLYPH_SVG = (
  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#141416" }}>
    <svg viewBox="0 0 24 24" fill="none" style={{ width: 40, height: 40 }}>
      <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    </svg>
  </div>
);

/* ── Photo Gallery Overlay (3-image swipe, dots, thumbnails on desktop) ── */
function PhotoGallery({ photos, initialIndex, onClose }: { photos: (string | null)[]; initialIndex: number; onClose: () => void }) {
  const [active, setActive] = useState(initialIndex);
  const trackRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef(0);

  // Scroll to active on change
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const child = track.children[active] as HTMLElement;
    if (child) child.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  // Detect active from scroll position
  function onScroll() {
    const track = trackRef.current;
    if (!track) return;
    const idx = Math.round(track.scrollLeft / track.clientWidth);
    if (idx !== active && idx >= 0 && idx < photos.length) setActive(idx);
  }

  // Double-tap to close
  function onDoubleTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 300) onClose();
    lastTapRef.current = now;
  }

  const validCount = photos.filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col" style={{ background: "rgba(0,0,0,0.95)" }} onClick={onClose}>
      {/* Close */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-4 pb-2" onClick={e => e.stopPropagation()}>
        <span className="text-[11px]" style={{ color: "#98989E" }}>{active + 1} / {validCount || 3}</span>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.15)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {/* Swipeable images */}
      <div ref={trackRef} onScroll={onScroll} onClick={e => { e.stopPropagation(); onDoubleTap(); }}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory"
        style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {photos.map((url, idx) => (
          <div key={idx} className="flex-none w-full h-full flex items-center justify-center p-4 snap-center" style={{ scrollSnapAlign: "center" }}>
            {url ? (
              <img src={url} alt={`Shot ${idx + 1}`} className="max-h-full max-w-full object-contain select-none" draggable={false} />
            ) : (
              <div style={{ width: 200, height: 200 }}>
                {GOLD_GLYPH_SVG}
                <p className="text-center mt-3 text-[10px]" style={{ color: "#98989E" }}>Not available</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Dots indicator */}
      {photos.length > 1 && (
        <div className="flex justify-center gap-2 py-3" onClick={e => e.stopPropagation()}>
          {photos.map((url, idx) => (
            <button key={idx} onClick={() => setActive(idx)}
              className="rounded-full transition-all"
              style={{ width: idx === active ? 16 : 6, height: 6, background: idx === active ? "#C9A227" : "rgba(255,255,255,0.3)" }} />
          ))}
        </div>
      )}

      {/* Thumbnails — desktop only */}
      <div className="hidden md:flex justify-center gap-2 pb-4 px-4" onClick={e => e.stopPropagation()}>
        {photos.map((url, idx) => (
          <button key={idx} onClick={() => setActive(idx)}
            className="w-16 h-16 overflow-hidden flex-shrink-0"
            style={{ border: idx === active ? "2px solid #C9A227" : "1px solid rgba(255,255,255,0.15)", borderRadius: 6, background: "#141416" }}>
            {url ? (
              <img src={url} alt={`Shot ${idx + 1}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16 }}>
                  <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Boutique Card (luxury style) ── */
function BoutiqueCard({ stone, wishlisted, onToggleWishlist, onReserve, onOpenGallery }: {
  stone: StoreStone; reserved: boolean; wishlisted: boolean;
  onToggleWishlist: () => void; onReserve: () => void;
  onOpenGallery: (photos: (string | null)[], index: number) => void;
}) {
  const photos = parsePhotos(stone.photo);
  const hasPhoto = photos[0] !== null;
  const spec = [stone.cut || stone.shape, stone.carat ? `${stone.carat}ct` : "", stone.color].filter(Boolean).join(" \u00b7 ");

  return (
    <div style={{ background: "#141416", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
      {/* Image area — tap to open gallery */}
      <div className="aspect-square relative cursor-pointer" style={{ overflow: "hidden" }}
        onClick={() => onOpenGallery(photos, 0)}>
        {hasPhoto ? (
          <>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgba(255,255,255,0.04) 0%, transparent 60%)", zIndex: 1, pointerEvents: "none" }} />
            <img src={photos[0]!} alt={stone.ref} style={{ width: "100%", height: "100%", objectFit: "cover", position: "relative", zIndex: 0 }} />
            {/* 1/3 indicator badge */}
            {photos.some(Boolean) && (
              <span className="absolute bottom-2 right-2 text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.7)" }}>
                1/{photos.filter(Boolean).length || 3}
              </span>
            )}
          </>
        ) : (
          GOLD_GLYPH_SVG
        )}
        {(stone as any).trader_preferred && (
          <span className="absolute top-2 left-2 flex items-center gap-1 text-[8px] font-medium uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full" style={{ color: "#C9A227", background: "rgba(20,20,22,0.9)", border: "1px solid #C9A227" }}>
            <svg viewBox="0 0 24 24" fill="none" style={{ width: 8, height: 8 }}><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
            Preferred
          </span>
        )}
      </div>
      {/* Content */}
      <div className="p-3">
        <p className="text-[13px] font-light truncate" style={{ color: "#FAF8F4", marginBottom: 2 }}>{stone.shape} {stone.carat}ct {stone.color}</p>
        {spec && <p className="text-[11px] truncate" style={{ color: "#98989E", marginBottom: 8 }}>{spec}</p>}
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium tabular-nums" style={{ color: stone.price ? "#C9A227" : "#98989E" }}>
            {stone.price ? `$${stone.price.toLocaleString()}` : "Price on request"}
          </span>
          <div className="flex items-center gap-1.5">
            <button onClick={(e) => { e.stopPropagation(); onToggleWishlist(); }} style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={wishlisted ? "#C9A227" : "none"} stroke={wishlisted ? "#C9A227" : "#98989E"} strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); onReserve(); }} className="text-[12px] font-medium" style={{ background: "#FAF8F4", color: "#000000", padding: "6px 14px", borderRadius: 10, border: "none", cursor: "pointer", lineHeight: 1 }}>
              Reserve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* === VIDEOS PANEL: TikTok-style feed === */

/* === VIDEOS PANEL: Cinematic vertical reel === */

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

  if (loading) return <div className="h-full flex items-center justify-center bg-black text-[#FAF8F4]/60 text-[12px]">Loading videos...</div>;
  if (!videos.length) return (
    <div className="h-full flex items-center justify-center bg-[#000000] text-[12px] text-center px-6">
      <div>
        <DiamondIcon />
        <p className="mt-3" style={{ color: "#98989E" }}>No videos published yet.</p>
        <p className="text-[10px] mt-1" style={{ color: "#98989E", opacity: 0.5 }}>Videos added from the dashboard appear here.</p>
      </div>
    </div>
  );

  return (
    <>
      <div ref={feedRef} className="h-[100dvh] overflow-y-scroll snap-y snap-mandatory bg-black relative" style={{ scrollSnapType: "y mandatory" }}>
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

/* ═══════════════════════════════════════════
   VIDEO SLIDE — Cinematic vertical
   ═══════════════════════════════════════════ */

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
  const [shareCount, setShareCount] = useState(0);

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
    setShareCount(c => c + 1);
  }

  const stoneInfo = video.stone_id ? { ref: video.stone_ref || "", shape: video.shape || "", carat: video.carat || 0, color: video.color || "", clarity: video.clarity || "", status: video.stone_status || null, photo: video.stone_photo || null, price: video.price } : null;

  return (
    <div data-video={index} className="h-[100dvh] snap-start snap-always relative bg-black flex items-center justify-center">
      <video ref={videoRef} src={video.video_url} className="absolute inset-0 w-full h-full object-cover" loop muted={muted} playsInline preload={isActive ? "auto" : "metadata"} />
      <button onClick={toggleMute} className="absolute inset-0 z-10" aria-label={muted ? "Tap to unmute" : "Tap to mute"} />

      {/* Progress dots — right edge */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1.5">
        {Array.from({ length: totalVideos }, (_, i) => (
          <div key={i} className="rounded-full transition-all" style={{ width: i === activeIndex ? 4 : 3, height: i === activeIndex ? 12 : 3, background: i === activeIndex ? "#C9A227" : "rgba(255,255,255,0.35)" }} />
        ))}
      </div>

      {/* Right rail — thin ivory line icons, gold when active */}
      <div className="absolute right-3 bottom-36 z-20 flex flex-col items-center gap-6">
        {/* Like */}
        <button onClick={(e) => { e.stopPropagation(); toggleLike(); }} className="flex flex-col items-center gap-1">
          <svg width="22" height="22" viewBox="0 0 24 24" fill={liked ? "#C9A227" : "none"} stroke={liked ? "#C9A227" : "rgba(255,255,255,0.85)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span style={{ fontSize: 10, color: liked ? "#C9A227" : "rgba(255,255,255,0.85)" }}>{likes}</span>
        </button>
        {/* Comment */}
        <button onClick={(e) => { e.stopPropagation(); onComments(); }} className="flex flex-col items-center gap-1">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.85)" }}>{commentCount ?? "-"}</span>
        </button>
        {/* WhatsApp share */}
        <button onClick={(e) => { e.stopPropagation(); handleShare(); }} className="flex flex-col items-center gap-1">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
          </svg>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.85)" }}>{shareCount || ""}</span>
        </button>
      </div>

      {/* Bottom overlay — model name, house note, piece chip */}
      <div className="absolute bottom-0 left-0 right-12 z-20 p-4 pb-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
        {/* Model name */}
        {video.model_instagram && (
          <p style={{ fontSize: 11, letterSpacing: "0.12em", color: "#98989E", fontWeight: 400, textTransform: "uppercase", marginBottom: 6 }}>
            {video.model_instagram}
          </p>
        )}
        {/* House note — AMES voice */}
        {(video.house_note || video.caption) && (
          <p style={{ fontSize: 15, fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", fontStyle: "italic", color: "#FAF8F4", marginBottom: 10, lineHeight: 1.4, letterSpacing: "0.01em" }}>
            <span style={{ fontWeight: 500, fontStyle: "normal" }}>AMES</span> &mdash; {video.house_note || video.caption}
          </p>
        )}
        {/* Piece chip — linked stone */}
        {stoneInfo && (
          <button onClick={(e) => { e.stopPropagation(); onOpenBoutiqueDetail(video.stone_id!); }}
            className="flex items-center gap-3 p-2 rounded-xl"
            style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", maxWidth: 280 }}>
            {/* 40px circular thumbnail */}
            <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "#1C1C1E", border: "1px solid rgba(255,255,255,0.1)" }}>
              {stoneInfo.photo ? (
                <img src={stoneInfo.photo} alt={stoneInfo.ref} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }}>
                    <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                  </svg>
                </div>
              )}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0 text-left">
              <p className="truncate" style={{ fontSize: 12, color: "#FAF8F4", fontWeight: 500, marginBottom: 1 }}>
                {stoneInfo.ref} &middot; {stoneInfo.shape} {stoneInfo.carat}ct
              </p>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 12, color: "#C9A227", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {stoneInfo.price != null ? `$${stoneInfo.price.toLocaleString()}` : "Price on request"}
                </span>
              </div>
            </div>
            {/* View piece label */}
            <span style={{ fontSize: 9, color: "#98989E", letterSpacing: "0.06em", flexShrink: 0, textTransform: "uppercase" }}>View piece</span>
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
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-h-[70dvh] bg-[#0B0C0D] rounded-t-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div className="flex justify-center py-2"><div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} /></div>
        <div className="px-4 pb-2 flex items-center justify-between">
          <span className="text-[13px] font-light" style={{ color: "#FAF8F4" }}>Comments</span>
          <button onClick={onClose} className="text-[11px] cursor-default" style={{ color: "#9A938A" }}>Close</button>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} />

        {/* Comment list */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[100px] max-h-[45dvh]">
          {loading ? (
            <div className="text-[11px] text-center py-4" style={{ color: "#9A938A" }}>Loading...</div>
          ) : comments.length === 0 ? (
            <div className="text-[11px] text-center py-4" style={{ color: "#9A938A" }}>No comments yet. Be the first.</div>
          ) : comments.map(c => (
            <div key={c.id} className="space-y-0.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-medium" style={{ color: "#FAF8F4" }}>{c.author}</span>
                <span className="text-[9px]" style={{ color: "#9A938A" }}>{timeAgo(c.created_at)}</span>
              </div>
              <p className="text-[12px] leading-relaxed">{c.text}</p>
            </div>
          ))}
        </div>

        {/* Input */}          <div className="px-4 py-3 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Name (optional)" className="w-full px-3 py-1.5 text-[11px] font-light rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A" }} />
          <div className="flex gap-2">
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }} placeholder="Add a comment..." className="flex-1 px-3 py-1.5 text-[11px] font-light rounded-lg outline-none" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A" }} />
            <button onClick={handleSubmit} disabled={!text.trim() || sending} className="px-4 py-1.5 text-white text-[11px] font-medium rounded-lg cursor-default disabled:opacity-40" style={{ background: "#C9A227" }}>
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

function DiamondIcon() {
  return <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" aria-hidden="true"><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#FAF8F4" strokeWidth="1.5" fill="none" /></svg>;
}

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
