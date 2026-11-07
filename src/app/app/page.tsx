"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { subscribeCustomerPreferences, readCustomerDisplayName, hapticTap } from '../../lib/customer-preferences';
import { customerAnswer } from '../../lib/same-answer';
import dynamic from "next/dynamic";
import EngineBoutiquePanel from "../../components/EngineBoutiquePanel";
import EngineMediaPanel from "../../components/EngineMediaPanel";
import PageCurl, { usePageCurl, curlPageStyle } from '../../components/PageCurl';
import EngineCataloguePanel from "../../components/EngineCataloguePanel";
import PullToRefresh from "../../components/PullToRefresh";
import type { MediaRecord } from "../../lib/ames-media-content";
import type { BoutiquePiece } from "../../lib/ames-boutique-content";
import { assetSelectionMessage, parseAssetSelection, validatedAssetSelection, DEFAULT_CHAT_ASSET_ID } from '../../lib/chat-asset-selection';
import { parseViewerIntent } from '../../lib/chat-viewer-actions';
const ChatVisualStage = dynamic(() => import("../../components/ChatVisualStage"), { ssr: false });
const VideoIntro = dynamic(() => import("../../components/VideoIntro"), { ssr: false });

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */

const PANEL_LABELS = ["Boutique", "Chat", "Videos", "Catalogue"] as const;

export default function AppPage() {
  const displayName = useSyncExternalStore(subscribeCustomerPreferences, readCustomerDisplayName, () => '');
  const { activePage: activePanel, turn, turnTo, cornerGesture } = usePageCurl(1, PANEL_LABELS.length);
  const [highlightStone, setHighlightStone] = useState<string | null>(null);
  const [chatPrefill, setChatPrefill] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatAssetId, setChatAssetId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Each page reloads its own content when pulled down; the other pages keep their state.
  const [refreshTokens, setRefreshTokens] = useState([0, 0, 0, 0]);
  const magazineRef = useRef<HTMLDivElement>(null);
  const refreshActivePage = useCallback(() => {
    hapticTap();
    setRefreshTokens(tokens => tokens.map((token, index) => index === activePanel ? token + 1 : token));
  }, [activePanel]);

  const [introDone, setIntroDone] = useState(true);
  const mediaOpened = useRef(false);
  useEffect(() => { if (mediaOpened.current) return; mediaOpened.current = true; if (new URLSearchParams(location.search).has("catalogue")) turnTo(3); else if (new URLSearchParams(location.search).has("media")) turnTo(2); }, [turnTo]);

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && !sessionStorage.getItem("ames_intro_seen")) queueMicrotask(() => setIntroDone(false));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || drawerOpen) return;
      if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"],model-viewer,[data-ames-engine-host],button,a')) return;
      if (e.key === "ArrowRight") { e.preventDefault(); turnTo(activePanel + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); turnTo(activePanel - 1); }
    }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [activePanel, drawerOpen, turnTo]);

  function handleSeePiece(stoneId: string) {
    setHighlightStone(stoneId);
    turnTo(0);
    setTimeout(() => setHighlightStone(null), 3000);
  }

  function handleAskMedia(record: MediaRecord) {
    setChatAssetId(record.assetId);
    setChatDraft(`Tell me about ${record.name} (AMES asset ${record.assetId})`);
    turnTo(1);
  }

  function handleAskBoutique(piece: BoutiquePiece) {
    setChatAssetId(piece.assetId);
    setChatDraft(`Tell me about ${piece.name} (AMES asset ${piece.assetId})`);
    turnTo(1);
  }

  const NAV_ITEMS = [
    { label: "My workspace", href: "/workspace" },
    { label: "Profile & settings", href: "/app/account" },
    { label: "Jeweller studio", href: "/jeweller" },
    { label: "My cart", href: "/cart" },
    { label: "Purchases & invoices", href: "/app/billing" },
  ];

  return (
    <div data-ames-app className="ames-app-shell">
      <style>{`
        :root { background: #061d19; }
        footer { display: none !important; }
        body { overflow: hidden; }
      `}</style>

      {/* Video intro overlay — plays once per session */}
      {!introDone && <VideoIntro onDone={() => setIntroDone(true)} />}

      {/* Minimal transparent top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-11" style={{ background: 'rgba(3,24,21,0.46)', borderBottom: '1px solid rgba(238,247,244,0.1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <button onClick={() => { hapticTap(); setDrawerOpen(!drawerOpen); }} className="flex flex-col justify-center items-center w-9 h-9 gap-[5px] shrink-0 z-60" aria-label="Menu" aria-expanded={drawerOpen}>
          <span className="block w-5 h-[1.5px] rounded-full" style={{ background: '#dceee8', transition: 'all 0.3s' }} />
          <span className="block w-4 h-[1.5px] rounded-full" style={{ background: '#dceee8', transition: 'all 0.3s' }} />
          <span className="block w-5 h-[1.5px] rounded-full" style={{ background: '#dceee8', transition: 'all 0.3s' }} />
        </button>
        <span className="absolute left-[3.25rem] select-none pointer-events-none" aria-label="House of Ames" style={{ fontFamily: 'var(--font-satoshi)', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.34em', lineHeight: 1, background: 'linear-gradient(100deg, #f4f2ed 0%, #c8c6c1 55%, #a6a6ab 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>HOUSEOFAMES</span>
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
          <div className="absolute top-14 left-4 right-auto w-64 rounded-2xl overflow-hidden" style={{ background: 'rgba(3,25,22,0.92)', border: '1px solid rgba(238,247,244,0.14)', backdropFilter: 'blur(18px)' }} onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(238,247,244,0.12)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', color: '#eef5f2' }}>AMES</div>
              <div className="mt-2 break-words text-sm text-[#eef5f2]" data-customer-name>{displayName || 'Guest profile'}</div>
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
                  style={{ color: '#b8d0c8', fontWeight: 400 }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="ames-page-index" aria-label="Magazine pages">
        {PANEL_LABELS.map((label, i) => <button key={label} type="button" data-page-tab={i}
          onClick={() => { hapticTap(); turnTo(i); }} aria-current={activePanel === i ? 'page' : undefined}
          aria-controls={`ames-page-${i}`} aria-label={label}>
          <span className="ames-page-number" aria-hidden="true">0{i + 1}</span>{label}
        </button>)}
      </nav>
      <span className="sr-only" role="status">{PANEL_LABELS[activePanel]}, page {activePanel + 1} of {PANEL_LABELS.length}</span>
      <div ref={magazineRef} className="ames-magazine" data-turning={turn ? true : undefined}>
        <section id="ames-page-0" data-panel="0" aria-label="Boutique" hidden={activePanel !== 0 && turn?.from !== 0} aria-hidden={activePanel !== 0} data-curl-source={turn?.from === 0} style={curlPageStyle(turn, 0)} inert={activePanel !== 0} className="ames-magazine-page flex-col">
          <EngineBoutiquePanel key={`boutique-${refreshTokens[0]}`} highlightAssetId={highlightStone} onAskSame={handleAskBoutique} />
        </section>
        <section id="ames-page-1" data-panel="1" aria-label="Chat" hidden={activePanel !== 1 && turn?.from !== 1} aria-hidden={activePanel !== 1} data-curl-source={turn?.from === 1} style={curlPageStyle(turn, 1)} inert={activePanel !== 1} className="ames-magazine-page flex-col">
          <ChatPanel stageActive={activePanel === 1} assetId={chatAssetId} prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill("")} draft={chatDraft} onDraftConsumed={() => setChatDraft("")} onBrowseBoutique={() => turnTo(0)} refreshToken={refreshTokens[1]} />
        </section>
        <section id="ames-page-2" data-panel="2" aria-label="Videos" hidden={activePanel !== 2 && turn?.from !== 2} aria-hidden={activePanel !== 2} data-curl-source={turn?.from === 2} style={curlPageStyle(turn, 2)} inert={activePanel !== 2} className="ames-magazine-page">
          <EngineMediaPanel key={`media-${refreshTokens[2]}`} active={activePanel === 2} onBuy={handleSeePiece} onAskSame={handleAskMedia} />
        </section>
        <section id="ames-page-3" data-panel="3" aria-label="Catalogue" hidden={activePanel !== 3 && turn?.from !== 3} aria-hidden={activePanel !== 3} data-curl-source={turn?.from === 3} style={curlPageStyle(turn, 3)} inert={activePanel !== 3} className="ames-magazine-page">
          <EngineCataloguePanel key={`catalogue-${refreshTokens[3]}`} />
        </section>
      </div>
      <PullToRefresh rootRef={magazineRef} disabled={!!turn || drawerOpen || !introDone} onRefresh={refreshActivePage} />
      <PageCurl turn={turn} />
      {/* Folded-corner page controls */}
      {(turn?.from ?? activePanel) > 0 && (
        <button {...cornerGesture(-1)} className="ames-curl-corner ames-curl-corner-left" aria-label="Turn to previous page" title="Drag inward or tap to turn back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dceee8" strokeWidth="1.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      )}
      {(turn?.from ?? activePanel) < PANEL_LABELS.length - 1 && (
        <button {...cornerGesture(1)} className="ames-curl-corner" aria-label="Turn to next page" title="Drag inward or tap to turn forward">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dceee8" strokeWidth="1.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      )}
    </div>
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



function ChatPanel({ stageActive, assetId, prefill, onPrefillConsumed, draft, onDraftConsumed, onBrowseBoutique, refreshToken = 0 }: { stageActive: boolean; assetId: string | null; prefill: string; onPrefillConsumed: () => void; draft: string; onDraftConsumed: () => void; onBrowseBoutique: () => void; refreshToken?: number }) {
  const [chats, setChats] = useState<ChatHistory[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [mode, setMode] = useState<"instant" | "expert">("instant");
  const [deepThink, setDeepThink] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const sessionReady = useRef<Promise<void> | null>(null);
  const sending = useRef(false);
  const [sendError, setSendError] = useState("");
  const [stageCommand, setStageCommand] = useState<{ id: number; value: unknown } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(assetId ?? DEFAULT_CHAT_ASSET_ID);
  const selectionVersion = useRef(0);
  const [stageRefresh, setStageRefresh] = useState(0);

  useEffect(() => {
    selectionVersion.current += 1;
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setStageCommand(null);
        setSelectedAssetId(assetId ?? DEFAULT_CHAT_ASSET_ID);
      }
    });
    return () => { active = false; };
  }, [assetId]);

  function selectStageAsset(nextAssetId: string | null) {
    selectionVersion.current += 1;
    setStageCommand(null);
    setSelectedAssetId(nextAssetId);
  }

  const chatStarted = messages.length > 0;
  const hasAmesReply = messages.some(m => m.role === "assistant");

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, typing]);

  const prepareSession = useCallback(() => {
    if (!sessionReady.current) {
      sessionReady.current = fetch("/api/chats").then(async response => {
        if (!response.ok) throw new Error("Chat is temporarily unavailable. Please try again shortly.");
        setChats(await response.json());
      }).catch(error => { sessionReady.current = null; throw error; });
    }
    return sessionReady.current;
  }, []);
  useEffect(() => { prepareSession().catch(error => setSendError(error.message)); }, [prepareSession]);

  // Pull-to-refresh: reload the conversation list, the open conversation and the 3D stage,
  // while keeping the visitor's draft, selected piece and page.
  const refreshedToken = useRef(refreshToken);
  useEffect(() => {
    if (refreshToken === refreshedToken.current) return;
    refreshedToken.current = refreshToken;
    queueMicrotask(() => {
      setSendError('');
      setStageRefresh(value => value + 1);
      sessionReady.current = null;
      prepareSession().catch(error => setSendError(error.message));
      if (activeChatId) fetch(`/api/chats/${activeChatId}/messages`).then(res => res.ok ? res.json() : null).then(list => { if (Array.isArray(list)) setMessages(list); }).catch(() => {});
    });
  }, [refreshToken, prepareSession, activeChatId]);

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
    await prepareSession();
    const res = await fetch("/api/chats", { method: "POST" });
    if (!res.ok) throw new Error((await res.json()).error || "Could not start a private conversation");
    const chat: ChatHistory = await res.json();
    setChats(p => [chat, ...p]);
    setActiveChatId(chat.id);
    return chat.id;
  }

  async function handleSend(text?: string) {
    const rawMsg = (text || input).trim();
    if (!rawMsg || sending.current) return;
    const query = deepThink ? `Consider this carefully and give a concise answer: ${rawMsg}` : rawMsg;
    if (query.length > 4000) { setSendError('Please shorten your message before sending.'); return; }

    // Visual intent is local and independent of Appwrite/Dify availability.
    const intent = parseAssetSelection(rawMsg, selectedAssetId);
    const clarification = assetSelectionMessage(intent);
    if (clarification) {
      const stamp = Date.now();
      setInput('');
      setSendError('');
      setMessages(previous => [...previous,
        { id: `local-user-${stamp}`, chat_id: activeChatId ?? 'local', role: 'user', text: rawMsg, thinking: '', created_at: new Date(stamp).toISOString() },
        { id: `local-assistant-${stamp}`, chat_id: activeChatId ?? 'local', role: 'assistant', text: clarification, thinking: '', created_at: new Date(stamp + 1).toISOString() },
      ]);
      return;
    }
    const requestedAssetId = intent.kind === 'select' || intent.kind === 'ring' ? intent.assetId : selectedAssetId;
    if (intent.kind === 'select' || intent.kind === 'ring') selectStageAsset(requestedAssetId);
    const localViewerAction = parseViewerIntent(rawMsg);
    if (localViewerAction) setStageCommand({ id: Date.now(), value: localViewerAction });
    const requestSelectionVersion = selectionVersion.current;

    sending.current = true; setTyping(true); setSendError('');
    let stored = false;
    try {
      const chatId = await ensureChat();
      const userRes = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', text: rawMsg }),
      });
      const userMsg = await userRes.json();
      if (!userRes.ok) throw new Error(userMsg.error || 'Could not save your message');
      stored = true; setInput(''); setMessages(previous => [...previous, userMsg]);
      const response = await fetch('/api/ames', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, chatId, assetId: requestedAssetId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'SAME is temporarily unavailable');
      // A delayed response may answer in text, but cannot restore an older stage or camera action.
      if (selectionVersion.current === requestSelectionVersion) {
        const remoteSelection = validatedAssetSelection(data.asset_selection);
        if (remoteSelection) selectStageAsset(remoteSelection.assetId);
        if (data.viewer_action !== undefined) setStageCommand({ id: Date.now(), value: data.viewer_action });
      }
      if (data.message) setMessages(previous => [...previous, data.message]);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Please try again shortly');
      if (!stored) setInput(rawMsg);
    } finally {
      sending.current = false; setTyping(false);
      fetch('/api/chats').then(r => r.ok ? r.json() : []).then(setChats).catch(() => {});
    }
  }

  return (
    <div data-chat-panel className="flex flex-col" style={{ height: '100dvh', overflow: 'hidden', background: 'transparent', position: 'relative' }}>

      {sendError && <p role="alert" className="absolute top-20 left-4 right-4 z-30 rounded-lg bg-[#082820] p-3 text-sm text-[#eef5f2]">{sendError}</p>}

      {chatStarted ? (
        /* === CHAT MODE === */
        <div className="flex-1 flex flex-col min-h-0">
          {/* Mini header */}
          <div data-chat-surface className="shrink-0 flex items-center gap-3 px-4 pt-12 pb-3" style={{ borderBottom: '1px solid rgba(238,247,244,0.12)', background: 'rgba(3,24,21,0.42)', backdropFilter: 'blur(12px)' }}>
            <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FCFCFB', border: '1px solid rgba(23,23,23,0.08)' }}>
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }}><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#A6A6AB" strokeWidth="1.5" strokeLinejoin="round" fill="none" /></svg>
            </div>
            <div className="flex gap-1.5 ml-auto" role="group" aria-label="Answer mode">
              <button onClick={() => setMode("instant")} aria-pressed={mode === "instant"} className="ames-pill px-3 min-h-8 rounded-full text-[11px]" style={{ color: mode === "instant" ? "#eef5f2" : "#9eb8ae" }}>Instant</button>
              <button onClick={() => setMode("expert")} aria-pressed={mode === "expert"} className="ames-pill px-3 min-h-8 rounded-full text-[11px]" style={{ color: mode === "expert" ? "#eef5f2" : "#9eb8ae" }}>Expert</button>
            </div>
          </div>

          <ChatVisualStage key={`${selectedAssetId ?? 'default'}-${stageRefresh}`} command={stageCommand} assetId={selectedAssetId} active={stageActive} compact />

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
              {messages.map((m) => (
                <div key={m.id} className="space-y-2">
                  <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "assistant" && (
                      <div style={{ width: 24, height: 24, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 2, background: '#F5F4F2', border: '1px solid rgba(23,23,23,0.08)' }}>
                        <svg viewBox="0 0 24 24" fill="none" style={{ width: 12, height: 12 }}><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#A6A6AB" strokeWidth="1.5" fill="none" /></svg>
                      </div>
                    )}
                    <div data-chat-message={m.role} className="max-w-[85%]" style={{ padding: '10px 14px', fontSize: 14, lineHeight: 1.45, fontWeight: 400, ...(m.role === 'user' ? { background: 'rgba(236,246,242,0.92)', color: '#08231e', borderRadius: '18px 18px 4px 18px' } : { background: 'rgba(4,31,27,0.58)', border: '1px solid rgba(235,247,243,0.14)', color: '#eef5f2', borderRadius: '18px 18px 18px 4px' }) }}>
                      {m.role === 'assistant' ? customerAnswer(m.text) : m.text}
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
              <div data-chat-surface style={{ background: 'rgba(3,24,21,0.62)', border: '1px solid rgba(235,247,243,0.14)', borderRadius: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.18)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" aria-label="Browse jewelry" onClick={onBrowseBoutique} className="ames-pill" style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dceee8" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
                </button>
                <input aria-label="Message SAME" maxLength={4000} ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); } }} placeholder="Ask SAME about a stone, a lot, or the house…" className="flex-1 bg-transparent outline-none border-none" style={{ fontSize: 16, fontWeight: 400, color: '#eef5f2', lineHeight: 1.4 }} />
                <button aria-label="Send message" onClick={() => handleSend()} disabled={!input.trim() || typing} className="ames-pill" aria-pressed={input.trim() ? true : undefined} style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eef5f2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* === EMPTY STATE — Claude-mobile minimalism === */
        /* The fixed top bar and page tabs cover the first 84px, so centre the piece in the visible area below them. */
        <div data-chat-empty-stage className="flex-1 flex flex-col items-center justify-center px-6" style={{ background: 'transparent', paddingTop: 84 }}>

          <ChatVisualStage key={`${selectedAssetId ?? 'default'}-${stageRefresh}`} command={stageCommand} assetId={selectedAssetId} active={stageActive} />
        </div>
      )}

      {/* Floating bottom input card — Claude style */}
      {!chatStarted && (
        <div className="shrink-0 px-4 pb-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))', position: 'relative', zIndex: 1 }}>
          <div className="mx-auto" style={{ maxWidth: 360 }}>
            {/* Floating card */}
            <div data-chat-surface style={{ background: 'rgba(3,24,21,0.62)', border: '1px solid rgba(235,247,243,0.14)', borderRadius: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.18)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" aria-label="Browse jewelry" onClick={onBrowseBoutique} className="ames-pill" style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dceee8" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
              </button>
              <input aria-label="Message SAME" maxLength={4000} ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); } }} placeholder="Ask SAME about a stone, a lot, or the house…" className="flex-1 bg-transparent outline-none border-none" style={{ fontSize: 16, fontWeight: 400, color: '#eef5f2', lineHeight: 1.4 }} />
              <button aria-label="Send message" onClick={() => handleSend()} disabled={!input.trim() || typing} className="ames-pill" aria-pressed={input.trim() ? true : undefined} style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eef5f2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

