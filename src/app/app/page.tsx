"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import EngineBoutiquePanel from "../../components/EngineBoutiquePanel";
import EngineMediaPanel from "../../components/EngineMediaPanel";
import type { MediaRecord } from "../../lib/ames-media-content";
import type { BoutiquePiece } from "../../lib/ames-boutique-content";
const ChatVisualStage = dynamic(() => import("../../components/ChatVisualStage"), { ssr: false });
const VideoIntro = dynamic(() => import("../../components/VideoIntro"), { ssr: false });
/* Native scroll-snap — no framer-motion needed */

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */

export default function AppPage() {
  const [activePanel, setActivePanel] = useState(1);
  const [highlightStone, setHighlightStone] = useState<string | null>(null);
  const [chatPrefill, setChatPrefill] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatAssetId, setChatAssetId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [ringLoaded, setRingLoaded] = useState(false);
  const [introDone, setIntroDone] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && !sessionStorage.getItem("ames_intro_seen")) queueMicrotask(() => setIntroDone(false));
  }, []);

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

  function handleAskMedia(record: MediaRecord) {
    setChatAssetId(record.assetId);
    setChatDraft(`Tell me about ${record.name} (AMES asset ${record.assetId})`);
    swipeTo(1);
  }

  function handleAskBoutique(piece: BoutiquePiece) {
    setChatAssetId(piece.assetId);
    setChatDraft(`Tell me about ${piece.name} (AMES asset ${piece.assetId})`);
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
        body { overflow: hidden; }
      `}</style>

      {/* Video intro overlay — plays once per session */}
      {!introDone && <VideoIntro onDone={() => setIntroDone(true)} />}

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

      <div ref={scrollRef} className="fixed inset-0 h-[100dvh] w-full overflow-x-auto" style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
        <style>{`.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{scrollbar-width:none}`}</style>
        <div className="flex h-full" style={{ width: '300dvw' }}>
          <section data-panel="0" className="w-[100dvw] h-full flex-shrink-0 flex flex-col" style={{ scrollSnapAlign: 'start' }}>
            <EngineBoutiquePanel highlightAssetId={highlightStone} onAskSame={handleAskBoutique} />
          </section>
          <section data-panel="1" className="w-[100dvw] h-full flex-shrink-0 flex flex-col" style={{ scrollSnapAlign: 'start' }}>
            <ChatPanel assetId={chatAssetId} prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill("")} draft={chatDraft} onDraftConsumed={() => setChatDraft("")} onBrowseBoutique={() => swipeTo(0)} />
          </section>
          <section data-panel="2" className="w-[100dvw] h-full flex-shrink-0" style={{ scrollSnapAlign: 'start' }}>
            <EngineMediaPanel active={activePanel === 2} onBuy={handleSeePiece} onAskSame={handleAskMedia} />
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



function ChatPanel({ assetId, prefill, onPrefillConsumed, draft, onDraftConsumed, onBrowseBoutique }: { assetId: string | null; prefill: string; onPrefillConsumed: () => void; draft: string; onDraftConsumed: () => void; onBrowseBoutique: () => void }) {
  const [chats, setChats] = useState<ChatHistory[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [mode, setMode] = useState<"instant" | "expert">("instant");
  const [deepThink, setDeepThink] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [stageCommand, setStageCommand] = useState<{ id: number; value: unknown } | null>(null);
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

  useEffect(() => {
    if (!draft) return;
    queueMicrotask(() => setInput(draft));
    onDraftConsumed();
  }, [draft]);

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
    const rawMsg = (text || input).trim();
    if (!rawMsg) return;
    setInput("");

    const chatId = await ensureChat();
    const userRes = await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", text: rawMsg }),
    });
    const userMsg: ChatMessage = await userRes.json();
    setMessages(p => [...p, userMsg]);
    setTyping(true);

    /* DeepThink prefixes the query; Expert mode sends as-is */
    const query = deepThink ? `Think step by step, then answer: ${rawMsg}` : rawMsg;
    const userId = typeof window !== "undefined" ? localStorage.getItem("ames_uid") || (() => { const u = `u-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; localStorage.setItem("ames_uid", u); return u; })() : "web-visitor";

    try {
      const amesRes = await fetch("/api/ames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, conversation_id: conversationId, user: userId }),
      });
      const amesData = await amesRes.json();
      // SAME may supply a typed action. The stage checks it against the contract.
      const viewerAction = amesData.viewer_action ?? amesData.outputs?.viewer_action;
      if (viewerAction !== undefined) setStageCommand({ id: Date.now(), value: viewerAction });

      /* Store conversation_id for multi-turn continuity */
      if (amesData.conversation_id) setConversationId(amesData.conversation_id);

      const replyText = amesData.answer || "That\u2019s a good question \u2014 let me confirm it with the desk so I give you the exact answer. You can also reach a human now on WhatsApp: +267 72 839 152.";
      const thinking = deepThink ? "Let me consider the details of this question carefully..." : "";

      const assistantRes = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", text: replyText, thinking }),
      });
      const assistantMsg: ChatMessage = await assistantRes.json();
      setMessages(p => [...p, assistantMsg]);
    } catch {
      const fallback = "The desk is quiet right now \u2014 please try again.";
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

          <ChatVisualStage key={assetId ?? 'default'} command={stageCommand} assetId={assetId} compact />

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
                <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Ask SAME about a stone, a lot, or the house…" className="flex-1 bg-transparent outline-none border-none" style={{ fontSize: 16, fontWeight: 400, color: '#171717', lineHeight: 1.4 }} />
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

          <ChatVisualStage key={assetId ?? 'default'} command={stageCommand} assetId={assetId} />

          {/* Serif time-of-day greeting */}
          <h2 style={{ fontSize: 26, fontWeight: 500, color: '#171717', fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", letterSpacing: '-0.01em', marginBottom: 6, textAlign: 'center' }}>
            {(() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; })()}
          </h2>
          <p style={{ fontSize: 14, fontWeight: 400, color: '#6E6C69', textAlign: 'center' }}>
            How can I help you today?
          </p>
          <p style={{ fontSize: 12, fontWeight: 400, color: '#A6A6AB', textAlign: 'center', marginTop: 16, maxWidth: 300 }}>
            SAME can answer questions about available stones, Botswana diamonds, and house services. Final prices, availability, and transactions are confirmed by the desk.
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
              <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Ask SAME about a stone, a lot, or the house…" className="flex-1 bg-transparent outline-none border-none" style={{ fontSize: 16, fontWeight: 400, color: '#171717', lineHeight: 1.4 }} />
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

