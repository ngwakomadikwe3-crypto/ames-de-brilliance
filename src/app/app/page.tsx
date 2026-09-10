"use client";

import { createElement, useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { CHAT_STONES, isChatStone, stoneRequest } from "@/lib/chat-stone-selection";
import SplashExperience from "@/components/SplashExperience";
import ModelViewer from "@/components/ModelViewer";
import DiamondViewer from "@/components/DiamondViewer";
import JewelryViewer, { preloadJewelryModel } from "@/components/jewelry/JewelryViewer";
import { products, type Product } from "@/data/products";
import type { AmesIntegration } from "@ames/engine";
import { detectMessageLanguage, matchBoutiquePiece, updateBuyingIntent, type BuyingIntent, type BoutiqueRecommendation, type ConversationLanguage } from "@/lib/buying-intelligence";
const AmesBoutiqueSurface = dynamic(() => import("@/components/AmesEngineSurfaces").then(m => m.AmesBoutiqueSurface), { ssr: false });
const AmesStoneTraySurface = dynamic(() => import("@/components/AmesEngineSurfaces").then(m => m.AmesStoneTraySurface), { ssr: false });
import {CustomerProvider,useCustomer,customerRequest} from '@/components/CustomerState';
/* Native scroll-snap — no framer-motion needed */


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

export default function AppPage(){return <CustomerProvider><AppPageContent/></CustomerProvider>;}
function AppPageContent() {
  const customer=useCustomer();
  const [activePanel, setActivePanel] = useState(1);
  const [highlightStone, setHighlightStone] = useState<string | null>(null);
  const [chatPrefill, setChatPrefill] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [houseSettingsOpen, setHouseSettingsOpen] = useState(false);
  const [housePrefs, setHousePrefs] = useState({ appearance: "Midnight", glow: "Rich", sound: true, haptics: true });
  const [chatLoaded, setChatLoaded] = useState(false);
  const [amesIntegration, setAmesIntegration] = useState<AmesIntegration | null>(null);
  const [splashComplete, setSplashComplete] = useState(false);

  useEffect(() => {
    if (!splashComplete) return;
    let disposed = false; let integration: AmesIntegration | null = null;
    void import("@ames/engine").then(({createAmesEngine,createAmesIntegration}) => {
      if (disposed) return;
      const engine = createAmesEngine({ backend: { render() {}, setSize() {}, dispose() {} } });
      integration = createAmesIntegration({ engine }); integration.init(); setAmesIntegration(integration);
    });
    return () => { disposed = true; if (integration) void integration.dispose(); };
  }, [splashComplete]);

  useEffect(() => {
    try {
      setHousePrefs({ appearance: localStorage.getItem("ames_appearance") || "Midnight", glow: localStorage.getItem("ames_glow") || "Rich", sound: localStorage.getItem("ames_sound") !== "off", haptics: localStorage.getItem("ames_haptics") !== "off" });
    } catch {}
  }, []);
  function updateHousePref(key: keyof typeof housePrefs, value: string | boolean) {
    setHousePrefs((current) => ({ ...current, [key]: value }));
    try { localStorage.setItem(`ames_${key}`, String(value).toLowerCase()); } catch {}
    if(customer.user)void customerRequest('preferences','PUT',{[key]:value}).catch(()=>window.dispatchEvent(new CustomEvent('ames:diagnostic',{detail:{code:'PREFERENCE_SAVE_FAILED'}})));
  }
  useEffect(()=>{const prefs=customer.state.profile?.preferences;if(prefs)setHousePrefs(current=>({...current,...prefs}));},[customer.state.profile]);
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
    let measuredWidth = window.innerWidth;
    function onScroll() {
      if (measuredWidth !== window.innerWidth) return;
      const idx = Math.round(container!.scrollLeft / window.innerWidth);
      if (idx !== activePanel && idx >= 0 && idx <= 2) setActivePanel(idx);
    }
    container.addEventListener('scroll', onScroll, { passive: true });
    function onResize() {
      measuredWidth = window.innerWidth;
      container!.scrollTo({ left: activePanel * measuredWidth, behavior: 'instant' });
    }
    window.addEventListener('resize', onResize);
    return () => { container.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); };
  }, [activePanel]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey ||
        (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
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

  const NAV_ITEMS = activePanel === 0
    ? [
        { label: "Collections", action: () => swipeTo(0) },
        { label: "Pricing", action: () => { setChatPrefill("Tell me about pricing"); swipeTo(1); } },
        { label: "Compliance", href: "/compliance" },
      ]
    : [
        { label: "Account", href: "/app" },
        { label: "Favorites", href: "/favorites" },
      ];

  return (
    <>
      <SplashExperience onComplete={() => { setSplashComplete(true); swipeTo(1); }} />
      <div className={`ames-product-shell${splashComplete ? " is-ready" : ""}`} aria-hidden={!splashComplete}>
      <style>{`.ames-product-shell{opacity:0;pointer-events:none;visibility:hidden;transition:opacity 560ms cubic-bezier(.22,.61,.36,1),visibility 0s linear 560ms}.ames-product-shell.is-ready{opacity:1;pointer-events:auto;visibility:visible;transition-delay:0s}`}</style>
      <style>{` .house-settings-backdrop{position:fixed;inset:0;z-index:90;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.58);backdrop-filter:blur(8px)}.house-settings{position:relative;width:min(100%,460px);padding:32px 24px 28px;background:rgba(8,8,8,.7);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.18);border-radius:24px 24px 0 0;color:#F1F4F7}.house-settings h2{font-family:var(--font-cormorant,Georgia,serif);font-size:32px;font-weight:500}.house-kicker,.house-setting-group h3{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#A6A6AB}.house-kicker{margin:0 0 8px}.house-setting-group{padding:18px 0;border-bottom:1px solid rgba(255,255,255,.12)}.house-setting-group h3{margin-bottom:10px}.house-choice{display:flex;gap:8px}.house-choice button,.house-link{border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:8px 14px;background:transparent;color:#9AA5B1;font-size:12px}.house-choice button.selected{border-color:#f2efe6;color:#F1F4F7}.house-setting-line{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid rgba(255,255,255,.12);font-size:14px}.house-setting-line strong{font-size:11px;color:#f2efe6}.house-toggle{width:42px;height:24px;border:1px solid rgba(255,255,255,.25);border-radius:20px;background:#26231f;padding:2px;text-align:left}.house-toggle span{display:block;width:18px;height:18px;border-radius:50%;background:#9AA5B1;transition:transform .2s}.house-toggle.on{border-color:#f2efe6}.house-toggle.on span{transform:translateX(18px);background:#f2efe6}.house-privacy,.house-about{font-size:11px;line-height:1.5;color:#9AA5B1}.house-privacy{margin:18px 0}.house-link{color:#F1F4F7;border-color:#f2efe6}.house-link span{margin-left:20px;color:#f2efe6}.house-about{margin:22px 0 0}.house-settings-close{position:absolute;top:16px;right:20px;border:0;background:none;color:#F1F4F7;font-size:28px;font-weight:200}@media(min-width:768px){.house-settings-backdrop{align-items:center}.house-settings{border-radius:24px}} 
        :root`}</style>
      <style>{`
        :root { font-family: var(--font-inter, -apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', Arial, sans-serif); background: #0b0d10; }
        footer { display: none !important; }
        body > header { display: none !important; }
        html, body { overflow: hidden; overscroll-behavior: none; }
      `}</style>

      {/* Minimal transparent top bar */}
      <div hidden={activePanel === 1} className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-11" style={{ display: activePanel === 1 ? 'none' : undefined, background: 'rgba(8,8,8,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <button onClick={() => setDrawerOpen(!drawerOpen)} className="flex flex-col justify-center items-center w-9 h-9 gap-[5px] shrink-0 z-60" aria-label="Menu">
          <span className="block w-5 h-[1.5px] rounded-full" style={{ background: drawerOpen ? '#F1F4F7' : '#9AA5B1', transition: 'all 0.3s' }} />
          <span className="block w-4 h-[1.5px] rounded-full" style={{ background: drawerOpen ? '#F1F4F7' : '#9AA5B1', transition: 'all 0.3s' }} />
          <span className="block w-5 h-[1.5px] rounded-full" style={{ background: drawerOpen ? '#F1F4F7' : '#9AA5B1', transition: 'all 0.3s' }} />
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
          <div className="absolute top-14 left-4 right-auto w-64 rounded-2xl overflow-hidden" style={{ background: '#151515', border: '1px solid rgba(23,23,23,0.08)' }} onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(23,23,23,0.08)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', color: '#F1F4F7' }}>AMES</div>
            </div>
            <div className="py-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    setDrawerOpen(false);
                    if (item.action) item.action(); else if (item.href) window.location.href = item.href;
                  }}
                  className="w-full text-left px-5 py-3 text-[13px] transition-colors"
                  style={{ color: '#9AA5B1', fontWeight: 400 }}
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
              background: activePanel === i ? '#A6A6AB' : '#2b323a',
            }}
            aria-label={['Boutique', 'Chat', 'Video'][i]}
          />
        ))}
      </div>

      <div ref={scrollRef} className="fixed inset-0 h-[100dvh] w-full overflow-x-auto ames-screen-scroller" style={{ scrollSnapType: 'x proximity', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
        <style>{`.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{scrollbar-width:none}`}</style>
        <div className="flex h-full" style={{ width: '300dvw' }}>
          <section data-panel="0" aria-label="Boutique" className="w-[100dvw] h-full flex-shrink-0 flex flex-col" style={{ scrollSnapAlign: 'start' }}>
            <BoutiquePanel active={activePanel===0} highlightStone={highlightStone} onAskPiece={(piece) => { setChatPrefill(`Tell me about ${piece}`); swipeTo(1); }} integration={amesIntegration} />
          </section>
          <section data-panel="1" aria-label="Chat" className="w-[100dvw] h-full flex-shrink-0 flex flex-col" style={{ scrollSnapAlign: 'start' }}>
            <ChatPanel prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill("")} onBrowseBoutique={() => swipeTo(0)} integration={amesIntegration} />
          </section>
          <section data-panel="2" aria-label="Video" className="w-[100dvw] h-full flex-shrink-0" style={{ scrollSnapAlign: 'start' }}>
            <VideosPanel isPanelActive={activePanel === 2} onSeePiece={handleSeePiece} onAskAmes={handleAskAmes} onOpenBoutiqueDetail={(stoneId) => { setHighlightStone(stoneId); swipeTo(0); setTimeout(() => setHighlightStone(null), 3000); }} />
          </section>
        </div>
      </div>

      {/* Desktop edge arrows */}
      {activePanel > 0 && (
        <button onClick={() => swipeTo(activePanel - 1)} className="fixed left-2 top-1/2 -translate-y-1/2 z-40 w-10 h-10 flex items-center justify-center rounded-full bg-[#080808]/60 backdrop-blur-sm border border-[rgba(23,23,23,0.08)] opacity-40 hover:opacity-70 transition-opacity hidden md:flex" aria-label="Previous panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F1F4F7" strokeWidth="1.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      )}
      {activePanel < 2 && (
        <button onClick={() => swipeTo(activePanel + 1)} className="fixed right-2 top-1/2 -translate-y-1/2 z-40 w-10 h-10 flex items-center justify-center rounded-full bg-[#080808]/60 backdrop-blur-sm border border-[rgba(23,23,23,0.08)] opacity-40 hover:opacity-70 transition-opacity hidden md:flex" aria-label="Next panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F1F4F7" strokeWidth="1.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      )}
      {houseSettingsOpen && <div className="house-settings-backdrop" onClick={() => setHouseSettingsOpen(false)}><section className="house-settings" role="dialog" aria-modal="true" aria-labelledby="house-settings-title" onClick={(event) => event.stopPropagation()}><button className="house-settings-close" aria-label="Close settings" onClick={() => setHouseSettingsOpen(false)}>×</button><p className="house-kicker">The House</p><h2 id="house-settings-title">Settings</h2><div className="house-setting-group"><h3>Appearance</h3><div className="house-choice"><button className={housePrefs.appearance === "Midnight" ? "selected" : ""} onClick={() => updateHousePref("appearance", "Midnight")}>Midnight</button><button className={housePrefs.appearance === "Ivory" ? "selected" : ""} onClick={() => updateHousePref("appearance", "Ivory")}>Ivory stage</button></div></div><div className="house-setting-group"><h3>Stone glow</h3><div className="house-choice"><button className={housePrefs.glow === "Subtle" ? "selected" : ""} onClick={() => updateHousePref("glow", "Subtle")}>Subtle</button><button className={housePrefs.glow === "Rich" ? "selected" : ""} onClick={() => updateHousePref("glow", "Rich")}>Rich</button></div></div><SettingToggle label="Sound" value={housePrefs.sound} onChange={() => updateHousePref("sound", !housePrefs.sound)} /><SettingToggle label="Haptics" value={housePrefs.haptics} onChange={() => updateHousePref("haptics", !housePrefs.haptics)} /><div className="house-setting-line"><span>Language</span><strong>EN</strong></div><p className="house-privacy">Your preferences stay on this device and are never shared by the House.</p><button className="house-link" onClick={() => { setHouseSettingsOpen(false); swipeTo(1); }}>Ask SAME <span>→</span></button><a className="house-link" href="https://ames-de-brilliance.vercel.app" target="_blank" rel="noreferrer">Visit the Website <span>↗</span></a><p className="house-about">About the House · AMES</p></section></div>}
      </div>
    </>
  );
}

function SettingToggle({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) { return <div className="house-setting-line"><span>{label}</span><button className={`house-toggle ${value ? "on" : ""}`} aria-pressed={value} onClick={onChange}><span /></button></div>; }

/* ════════════════════════════���═══════════���══
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

function ChatPanel({ prefill, onPrefillConsumed, onBrowseBoutique, integration }: { prefill: string; onPrefillConsumed: () => void; onBrowseBoutique: () => void; integration: AmesIntegration | null }) {
  const [selectedStoneId, setSelectedStoneId] = useState("stone-001");
  const [gem, setGem] = useState("diamond");
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const customer=useCustomer(),restoredStone=useRef(false);
  useEffect(()=>{if(!customer.ready||restoredStone.current)return;restoredStone.current=true;const saved=customer.state.saved.find(a=>a.kind==='stone');if(saved && isChatStone(saved.assetId))setSelectedStoneId(saved.assetId);},[customer.ready,customer.state.saved]);
  const [chats, setChats] = useState<ChatHistory[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const conversationToken = useRef<string | null>(null);
  const sending = useRef(false);
  const conversationEpoch = useRef(0);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [buyingIntent, setBuyingIntent] = useState<BuyingIntent>({ stage: 'BROWSING' });
  const [conversationLanguage, setConversationLanguage] = useState<ConversationLanguage>('en');
  const [recommendation, setRecommendation] = useState<BoutiqueRecommendation | null>(null);
  const [recommendationNotice, setRecommendationNotice] = useState<string | null>(null);
  const sourcingSent = useRef<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chatStarted = messages.length > 0;
  const hasAmesReply = messages.some(m => m.role === "assistant");


  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, typing]);

  useEffect(() => {
    if (!customer.ready) return;
    conversationEpoch.current++;
    conversationToken.current = null;
    setChats([]);setMessages([]);setActiveChatId(null);
    try {
      const saved = JSON.parse(sessionStorage.getItem('ames-dify:' + (customer.user?.id || 'guest')) || 'null');
      if (saved && typeof saved.token === 'string' && Array.isArray(saved.messages)) {
        conversationToken.current = saved.token;
        setMessages(saved.messages);
      }
      const memory = (customer.state.profile?.preferences as Record<string, unknown> | undefined)?.memory as Record<string, unknown> | undefined;
      const rememberedLanguage = memory?.language;
      if (rememberedLanguage === 'en' || rememberedLanguage === 'zh' || rememberedLanguage === 'ar') setConversationLanguage(rememberedLanguage);
      const rememberedRequest = memory?.lastSourcingRequest as Record<string, unknown> | undefined;
      if (rememberedRequest && typeof rememberedRequest.category === 'string') setBuyingIntent({ stage: 'CONSIDERING', category: rememberedRequest.category as BuyingIntent['category'], budget: typeof rememberedRequest.budget === 'number' ? rememberedRequest.budget : undefined, metal: typeof rememberedRequest.metal === 'string' ? rememberedRequest.metal : undefined, shape: typeof rememberedRequest.shape === 'string' ? rememberedRequest.shape : undefined });
    } catch {}
    if(customer.user)fetch("/api/chats").then(r => r.ok ? r.json() : []).then((d: ChatHistory[]) => setChats(d)).catch(() => {});
  }, [customer.ready, customer.user?.id]);

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

  async function ensureChat(): Promise<string|null> {
    if(!customer.user)return null;
    if (activeChatId) return activeChatId;
    const res = await fetch("/api/chats", { method: "POST" });
    if(!res.ok)throw new Error('Chat history unavailable');
    const chat: ChatHistory = await res.json();
    setChats(p => [chat, ...p]);
    setActiveChatId(chat.id);
    return chat.id;
  }
  async function appendMessage(chatId:string|null,role:'user'|'assistant',text:string,thinking=''){
    let message={id:crypto.randomUUID(),role,text,thinking,created_at:new Date().toISOString()} as ChatMessage;
    if(chatId){const response=await fetch(`/api/chats/${chatId}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,text,thinking})});if(!response.ok)throw new Error('Chat history unavailable');message=await response.json();}
    setMessages(p=>[...p,message]);
  }

  async function handleSend(text?: string) {
    const msg = (text || input).trim();
    if (!msg || sending.current) return;
    sending.current = true;
    const language = detectMessageLanguage(msg);
    setConversationLanguage(language);
    const epoch = conversationEpoch.current;
    setTyping(true);
    setInput("");
    const selection = stoneRequest(msg);
    if (selection?.assetId) setSelectedStoneId(selection.assetId);
    if (selection?.gem) setGem(selection.gem);
    const nextIntent = updateBuyingIntent(buyingIntent, msg);
    setBuyingIntent(nextIntent);
    const nextRecommendation = matchBoutiquePiece(customer.catalog, nextIntent);
    if (nextRecommendation && nextRecommendation.id !== recommendation?.id) setRecommendation(nextRecommendation);
    if (!nextRecommendation && nextIntent.category && nextIntent.category !== buyingIntent.category) setRecommendation(null);
    if (nextRecommendation) setRecommendationNotice('This may be worth a closer look.');
    try {
      await appendMessage(null, 'user', msg);
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, conversationToken: conversationToken.current }),
      });
      const data = await response.json();
      if (epoch !== conversationEpoch.current) return;
      if (!response.ok) throw new Error(data.error || 'AMES chat is unavailable. Please try again.');
      if (typeof data.reply !== 'string' || typeof data.conversationToken !== 'string') throw new Error('AMES chat returned an incomplete response.');
      conversationToken.current = data.conversationToken;
      const selected = stoneRequest(data.reply);
      if (selected?.assetId) setSelectedStoneId(selected.assetId);
      if (selected?.gem) setGem(selected.gem);
      const activePiece = nextRecommendation || recommendation;
      const reserveRequested = /\b(reserve|hold|keep this|take it|secure this|i(?:'|’)?d like to speak to someone about this)\b|预订|预定|保留|留着|(?:احجز|حجز|احتفظ)/i.test(msg);
      const deskRequested = /\b(human|someone|whatsapp|private consultation|pricing confirmation|legal|compliance|availability|available)\b|人工|顾问|微信|咨询|有货|(?:موظف|شخص|واتساب|استشارة|التوفر|متاح)/i.test(msg);
      let assistantReply = data.reply;
      const sourcingKey = JSON.stringify([nextIntent.category,nextIntent.budget,nextIntent.metal,nextIntent.shape,nextIntent.occasion]);
      if (!activePiece && nextIntent.category && nextIntent.stage !== 'BROWSING' && sourcingSent.current !== sourcingKey) {
        try {
          await customerRequest('request','POST',{profile:nextIntent,notes:msg,conversationId:data.conversationToken});
          sourcingSent.current = sourcingKey;
          const label = [nextIntent.metal,nextIntent.shape,nextIntent.category,nextIntent.budget ? `around $${nextIntent.budget.toLocaleString()}` : ''].filter(Boolean).join(' ');
          assistantReply = language === 'zh' ? `明白了，您在寻找${label}。Boutique 目前还没有公开匹配款式，但我可以将需求交给专属顾问，并留意后续上架。` : language === 'ar' ? `فهمت ما تبحث عنه: ${label}. لا توجد مطابقة منشورة في Boutique حالياً، ويمكنني حفظ الطلب لدى المستشار الخاص ومتابعة القطع الجديدة.` : `Understood. You're looking for ${label}. We don't have a published match in the Boutique yet, but I can save the request for the desk and future jeweller inventory.`;
        } catch { assistantReply = language === 'zh' ? '明白了。我可以将您的需求交给专属顾问，并为您寻找合适的公开款式。' : language === 'ar' ? 'فهمت طلبك. يمكنني حفظه لدى المستشار الخاص والبحث عن قطعة منشورة مناسبة.' : 'I understand what you are looking for. I can save the request for the desk while we source a published match.'; }
      }
      if (reserveRequested && activePiece) {
        try {
          await customerRequest('reserve','POST',{assetId:activePiece.id,conversationId:data.conversationToken,context:msg});
          assistantReply = language === 'zh' ? `我已为您准备好 ${activePiece.name} 的预订请求。专属顾问会与您确认库存和结算方式。` : language === 'ar' ? `أعددت طلب حجز ${activePiece.name}. سيؤكد المستشار الخاص التوفر وتسوية الشراء معك.` : `I've prepared the reserve request for the ${activePiece.name}. The desk can confirm availability and settlement with you.`;
        } catch { assistantReply = language === 'zh' ? `我可以为您准备 ${activePiece.name} 的预订请求，但仍需由专属顾问确认库存。` : language === 'ar' ? `يمكنني إعداد طلب حجز ${activePiece.name}، لكن سيحتاج المستشار الخاص إلى تأكيد التوفر.` : `I can prepare a reserve request for the ${activePiece.name}, but the desk will need to confirm availability.`; }
      } else if (deskRequested) {
        try {
          const handoff=await customerRequest('handoff','POST',{assetId:activePiece?.id||'',intent:reserveRequested?'reserve':'enquiry',context:msg});
          assistantReply = language === 'zh' ? (handoff.whatsappUrl ? '我可以通过 WhatsApp 为您联系专属顾问，以确认细节。' : '我可以为您联系专属顾问确认细节，WhatsApp 联系方式将由 AMES 顾问提供。') : language === 'ar' ? (handoff.whatsappUrl ? 'يمكنني وصلك بالمستشار الخاص عبر WhatsApp لتأكيد التفاصيل.' : 'يمكنني وصلك بالمستشار الخاص لتأكيد التفاصيل. سيحدد مستشار AMES وسيلة WhatsApp المناسبة.') : (handoff.whatsappUrl ? 'I can connect you with the desk on WhatsApp to confirm the details.' : 'I can connect you with the desk to confirm the details. The WhatsApp contact will be configured by the AMES desk.');
          if (handoff.whatsappUrl) window.open(handoff.whatsappUrl,'_blank','noopener,noreferrer');
        } catch { assistantReply = language === 'zh' ? '我可以为您联系专属顾问确认细节。' : language === 'ar' ? 'يمكنني وصلك بالمستشار الخاص لتأكيد التفاصيل.' : 'I can connect you with the desk to confirm the details.'; }
      }
      await appendMessage(null, 'assistant', assistantReply);
      if (customer.user) {
        const priorMemory = ((customer.state.profile?.preferences as Record<string, unknown> | undefined)?.memory || {}) as Record<string, unknown>;
        const list = (key: string, value: string | undefined) => Array.from(new Set([...(Array.isArray(priorMemory[key]) ? priorMemory[key] as unknown[] : []).filter((item): item is string => typeof item === 'string'), ...(value ? [value] : [])])).slice(-8);
        const memory = {
          categories: list('categories', nextIntent.category), shapes: list('shapes', nextIntent.shape), metals: list('metals', nextIntent.metal),
          occasions: list('occasions', nextIntent.occasion), recentInterests: list('recentInterests', nextIntent.category || nextIntent.shape),
          budgetRange: nextIntent.budget ? { latest: nextIntent.budget } : priorMemory.budgetRange,
          language, lastConversationContext: msg.slice(0, 300),
          ...(nextIntent.stage !== 'BROWSING' && nextIntent.category ? { lastSourcingRequest: { category: nextIntent.category, budget: nextIntent.budget, metal: nextIntent.metal, shape: nextIntent.shape } } : {}),
        };
        void customerRequest('preferences', 'PUT', { memory }).catch(() => window.dispatchEvent(new CustomEvent('ames:diagnostic', { detail: { code: 'MEMORY_SAVE_FAILED' } })));
      }
      try {
        const stamp = new Date().toISOString();
        sessionStorage.setItem('ames-dify:' + (customer.user?.id || 'guest'), JSON.stringify({ token: data.conversationToken, messages: [...messages, { id: crypto.randomUUID(), role: 'user', text: msg, created_at: stamp }, { id: crypto.randomUUID(), role: 'assistant', text: assistantReply, created_at: stamp }] }));
      } catch {}
      // Keep the existing account transcript store independent of Dify availability.
      if (customer.user) {
        try {
          const chatId = await ensureChat();
          for (const entry of [{ role: 'user', text: msg }, { role: 'assistant', text: assistantReply }]) {
            const saved = await fetch(`/api/chats/${chatId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
            if (!saved.ok) break;
          }
        } catch {}
      }
    } catch (error) {
      if (epoch === conversationEpoch.current) await appendMessage(null, 'assistant', error instanceof Error ? error.message : 'AMES chat could not connect. Please try again.');
    } finally {
      sending.current = false;
      setTyping(false);
    }
  }

  return (
    <div className={`chat-paper ames-chat${chatStarted ? " has-messages" : ""}`}>
      <header className="ames-chat-topbar">
        <button className="ames-chat-menu" aria-label="Chat menu" aria-expanded={chatMenuOpen} onClick={() => setChatMenuOpen(open => !open)}><span /><span /><span /></button>
        <span className="ames-chat-mark">AMES</span>
        {chatMenuOpen && <nav className="ames-chat-menu-popover" aria-label="Chat navigation"><a href="/app">Account</a><a href="/favorites">Favorites</a></nav>}
      </header>
      <div className="ames-chat-stage" aria-label="Gemstone showcase">
        <AmesStoneTraySurface integration={integration} assetId={selectedStoneId} gem={gem} />
      </div>
      <div dir={conversationLanguage === 'ar' ? 'rtl' : 'ltr'} data-language={conversationLanguage} ref={scrollRef} className="ames-chat-messages" role="log" aria-label="Conversation" aria-live="polite">
        <div>{recommendation && <ChatRecommendation key={recommendation.id} piece={recommendation} notice={recommendationNotice || ''} onView={onBrowseBoutique} onSave={async () => { if (!customer.user) { window.location.assign('/account'); return; } try { await customerRequest('favorites', 'PUT', { assetId: recommendation.id }); setRecommendationNotice('Saved to your favorites.'); } catch { setRecommendationNotice('I could not save that piece just now.'); } }} onReserve={() => { setInput('Reserve this'); setRecommendationNotice('I can prepare a request while you decide.'); inputRef.current?.focus(); }} onAsk={() => { setInput(`Tell me more about ${recommendation.name}.`); inputRef.current?.focus(); }} />}
        {messages.map(m => <p key={m.id} className={`ames-chat-message is-${m.role}`}>{m.text}</p>)}
        {typing && <p className="ames-chat-wait" role="status">AMES is thinking...</p>}</div>
      </div>
      <div className="ames-chat-composer-wrap">
        {composerMenuOpen && <div className="ames-composer-menu" aria-label="Conversation options">
          <span className="ames-composer-menu-label">Choose a stone</span>
          {CHAT_STONES.map(stone => <button key={stone.id} aria-pressed={selectedStoneId === stone.id} onClick={() => { setSelectedStoneId(stone.id); setComposerMenuOpen(false); }}>{stone.name}</button>)}
          <button disabled={typing} className="ames-new-conversation" onClick={() => { conversationEpoch.current++; conversationToken.current = null; try { sessionStorage.removeItem('ames-dify:' + (customer.user?.id || 'guest')); } catch {} setMessages([]); setActiveChatId(null); setConversationLanguage('en'); setSelectedStoneId("stone-001"); setGem("diamond"); setBuyingIntent({ stage: 'BROWSING' }); setRecommendation(null); setRecommendationNotice(null); setComposerMenuOpen(false); }}>New Chat</button>
        </div>}
        <form className="ames-chat-composer" onSubmit={e => { e.preventDefault(); void handleSend(); }}>
          <button type="button" aria-label="Conversation options" aria-expanded={composerMenuOpen} onClick={() => setComposerMenuOpen(open => !open)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <input dir={conversationLanguage === 'ar' ? 'rtl' : 'ltr'} ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="Tell me what you’re looking for..." aria-label="Message AMES" autoComplete="off" enterKeyHint="send" />
          <button type="submit" aria-label="Send message" disabled={!input.trim() || typing} className="ames-chat-send">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
        </form>
      </div>
    </div>
  );
}

function ChatRecommendation({ piece, notice, onView, onSave, onReserve, onAsk }: { piece: BoutiqueRecommendation; notice: string; onView: () => void; onSave: () => void; onReserve: () => void; onAsk: () => void }) {
  const data = piece as BoutiqueRecommendation & Record<string, unknown>;
  const specs = typeof data.specs === 'string' ? data.specs : [data.metal, ...(piece.tags || [])].filter(Boolean).join(' · ');
  return <article className="ames-chat-recommendation" aria-label={`Boutique recommendation ${piece.name}`}>
    <div className="ames-chat-recommendation-copy"><span className="ames-chat-recommendation-kicker">A piece to consider</span><h3>{piece.name}</h3><p>{piece.category}{specs ? ` · ${specs}` : ''}</p><strong>{data.price ? `$${Number(data.price).toLocaleString()}` : 'Price on request'}</strong>{notice && <small>{notice}</small>}</div>
    <div className="ames-chat-recommendation-actions"><button type="button" onClick={onView}>View in 3D</button><button type="button" onClick={onSave}>Save</button><button type="button" onClick={onReserve}>Reserve</button><button type="button" onClick={onAsk}>Ask SAME</button></div>
  </article>;
}

/* ═══════════════════════════════════════════
   BOUTIQUE PANEL
   ═══════════════════════════════════════════ */

const CATEGORY_MAP: { label: string; key: string }[] = [
  { label: "Rings", key: "Ring" },
  { label: "Watches", key: "Watch" },
  { label: "Bracelets", key: "Bracelet" },
  { label: "Necklaces", key: "Necklace" },
  { label: "Earrings", key: "Earring" },
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

function BoutiqueVitrine({ product, onAsk }: { product: Product; onAsk: (piece: string) => void }) {
  const { name, src, kind, tagline } = product;
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [tryOnOpen, setTryOnOpen] = useState(false);
  const [showTryOnGuide, setShowTryOnGuide] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const arActivateRef = useRef<(() => void) | null>(null);
  useEffect(() => { const node = ref.current; if (!node) return; const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setMounted(true); observer.disconnect(); } }, { rootMargin: "160px" }); observer.observe(node); return () => observer.disconnect(); }, []);
  const openTryOn = async () => {
    if (kind !== "hintspo") { setOpen(true); return; }
    setTryOnOpen(true);
    try {
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { setCameraUnavailable(true); return; }
      const permission = await navigator.permissions?.query({ name: "camera" as PermissionName });
      if (permission?.state === "denied") setCameraUnavailable(true);
      if (sessionStorage.getItem("ames_tryon_guide_seen") !== "1") setShowTryOnGuide(true);
    } catch { if (sessionStorage.getItem("ames_tryon_guide_seen") !== "1") setShowTryOnGuide(true); }
  };
  const dismissTryOnGuide = () => { try { sessionStorage.setItem("ames_tryon_guide_seen", "1"); } catch {} setShowTryOnGuide(false); };
  return <>
    <article className="boutique-vitrine">
      <div ref={ref} className="boutique-vitrine-viewer" onClick={() => setOpen(true)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setOpen(true); }}>
        {mounted ? (kind === "hintspo" ? <iframe src={src} title={name} loading="lazy" referrerPolicy="no-referrer" allow="camera" /> : kind === "glb" ? <JewelryViewer modelUrl={product.modelUrl || product.model3d || src || "placeholder:ames-signature-solitaire"} caption="Private viewing — not for sale" /> : createElement("jewelry-viewer", { gem: product.gem, metal: product.metal, ring: product.ring, "aria-label": name })) : <div className="vitrine-placeholder"><strong>{name}</strong></div>}
        <div className="vitrine-vignette" aria-hidden="true" /><div className="vitrine-nameplate"><span>AMES</span><strong>{name}</strong></div>
      </div>
      <div className="boutique-vitrine-footer"><div><h3>{name}</h3><p className="text-[10px] text-[#9AA5B1]">{tagline}</p></div><div className="flex gap-2">{kind === "hintspo" ? <button onClick={openTryOn} aria-label={`Try on ${name}`}><span aria-hidden="true">◌</span> Try On</button> : null}<button onClick={() => onAsk(name)}>Enquire via SAME</button></div></div>
    </article>
    {tryOnOpen && <div className="viewing-room-backdrop" onClick={() => setTryOnOpen(false)}><section className="viewing-room" role="dialog" aria-modal="true" aria-labelledby={`try-on-${name.replace(/\\s/g, "-")}`} onClick={(event) => event.stopPropagation()}><button className="viewing-close" aria-label="Close Try On" onClick={() => setTryOnOpen(false)}>×</button><div className="viewing-room-frame"><iframe src={`${src}?tryon=1`} title={`${name} Try On`} referrerPolicy="no-referrer" allow="camera camera *" /></div>{cameraUnavailable ? <div className="try-on-fallback"><p>AR try-on needs your camera — or ask SAME to arrange a private viewing.</p><button className="viewing-ask" onClick={() => { setTryOnOpen(false); onAsk(name); }}>Ask SAME <span>→</span></button></div> : <h2 id={`try-on-${name.replace(/\\s/g, "-")}`}>{name}</h2>}{showTryOnGuide && !cameraUnavailable && <div className="try-on-guide"><p>Point your camera at your hand and move slowly.</p><button className="viewing-ask" onClick={dismissTryOnGuide}>Begin</button></div>}</section></div>}
      {open && <div className="viewing-room-backdrop" onClick={() => setOpen(false)}><section className="viewing-room" role="dialog" aria-modal="true" aria-labelledby={`viewing-${name.replace(/\\s/g, "-")}`} onClick={(event) => event.stopPropagation()}><button className="viewing-close" aria-label="Close Viewing Room" onClick={() => setOpen(false)}>×</button><div className="viewing-room-frame">{mounted && (kind === "hintspo" ? <iframe src={src} title={name} referrerPolicy="no-referrer" allow="camera" /> : kind === "glb" ? <JewelryViewer modelUrl={product.modelUrl || product.model3d || src || "placeholder:ames-signature-solitaire"} caption="Private viewing — not for sale" /> : createElement("jewelry-viewer", { gem: product.gem, metal: product.metal, ring: product.ring, "aria-label": name }))}</div><h2 id={`viewing-${name.replace(/\\s/g, "-")}`}>{name}</h2><button className="viewing-ask" onClick={() => { setOpen(false); onAsk(name); }}>Ask SAME about this piece <span>→</span></button></section></div>}
  </>;
}

function BoutiqueShowcase({ onAskPiece }: { onAskPiece: (piece: string) => void }) {
  const pieces = products;
  const showcaseRef = useRef<HTMLElement>(null);
  const [jewelshopReady, setJewelshopReady] = useState(false);
  const [active, setActive] = useState(0);
  const [preMounted, setPreMounted] = useState<number[]>([0]);
  const touchStart = useRef<number | null>(null);
  const activePiece = pieces[active];
  useEffect(() => {
    const node = showcaseRef.current;
    if (!node || jewelshopReady) return;
    const load = () => { if (document.querySelector('script[src="https://jewelshop.ai/embed/jewelry-viewer.js"]')) { setJewelshopReady(true); return; } const script = document.createElement("script"); script.src = "https://jewelshop.ai/embed/jewelry-viewer.js"; script.type = "module"; script.onload = () => setJewelshopReady(true); document.head.appendChild(script); observer.disconnect(); };
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) load(); }, { rootMargin: "200px" });
    observer.observe(node); return () => observer.disconnect();
  }, [jewelshopReady]);
  useEffect(() => {
    const next = (active + 1) % pieces.length;
    const idle = "requestIdleCallback" in window ? window.requestIdleCallback(() => { const product = pieces[next]; if (product.kind === "glb" && product.modelUrl) preloadJewelryModel(product.modelUrl); setPreMounted([active, next]); }) : setTimeout(() => setPreMounted([active, next]), 160);
    return () => { if ("cancelIdleCallback" in window && typeof idle === "number") window.cancelIdleCallback(idle); else window.clearTimeout(idle as number); };
  }, [active, pieces]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % pieces.length), 60000);
    return () => window.clearInterval(timer);
  }, [pieces.length]);
  if (!activePiece) return null;
  const change = (direction: number) => setActive((current) => (current + direction + pieces.length) % pieces.length);
  return <section ref={showcaseRef} className="boutique-showcase" aria-label="AMES boutique showcase">
    <div className="showcase-frame" onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }} onTouchEnd={(event) => { if (touchStart.current === null) return; const distance = event.changedTouches[0].clientX - touchStart.current; if (Math.abs(distance) > 45) change(distance < 0 ? 1 : -1); touchStart.current = null; }}>
      <div className="showcase-track" style={{ transform: `translateX(-${active * 100}%)` }}>{pieces.map((piece, index) => <div key={piece.id} className="showcase-slide" aria-hidden={index !== active}>{preMounted.includes(index) && (piece.kind !== "glb" || index === active) ? (piece.kind === "hintspo" ? <iframe src={piece.src} title={piece.name} loading={index === active ? "eager" : "lazy"} referrerPolicy="no-referrer" allow="camera camera *" /> : piece.kind === "glb" ? <JewelryViewer modelUrl={piece.modelUrl || piece.model3d || piece.src || "placeholder:ames-signature-solitaire"} caption="Private viewing — not for sale" /> : createElement("jewelry-viewer", { gem: piece.gem, metal: piece.metal, ring: piece.ring, "aria-label": piece.name })) : <div className="showcase-shimmer" />}<div className="vitrine-vignette" aria-hidden="true" /></div>)}</div>
      {pieces.length > 1 && <><button className="showcase-arrow left" onClick={() => change(-1)} aria-label="Previous piece">‹</button><button className="showcase-arrow right" onClick={() => change(1)} aria-label="Next piece">›</button></>}
    </div>
    <div className="showcase-caption"><div><p>{activePiece.tagline}</p><h2>{activePiece.name}</h2></div><div className="showcase-actions"><button onClick={() => onAskPiece(activePiece.name)}>Enquire via SAME</button>{activePiece.kind !== "jewelshop" && <button onClick={() => onAskPiece(activePiece.name)}>Try On</button>}</div></div>
    <div className="showcase-dots" role="tablist" aria-label="Showcase pieces">{pieces.map((piece, index) => <button key={piece.id} role="tab" aria-selected={index === active} aria-label={`View ${piece.name}`} className={index === active ? "active" : ""} onClick={() => setActive(index)} />)}</div>
  </section>;
}

function BoutiquePanel({ highlightStone, onAskPiece, integration, active }: { highlightStone: string | null; onAskPiece: (piece: string) => void; integration: AmesIntegration | null; active:boolean }) {
  const [stones, setStones] = useState<StoreStone[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("All");
  const customer=useCustomer();
  const wishlist:Record<string,boolean>=Object.fromEntries(customer.state.favorites.map(a=>[a.assetId,true]));
  const [wishlistError,setWishlistError]=useState<string|null>(null);
  const wishlistPending=useRef(false);
  const [showReserveId, setShowReserveId] = useState<string | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<(string | null)[]>([null, null, null]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [boutiqueMenuOpen, setBoutiqueMenuOpen] = useState(false);
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
        const live = all.filter(s => s.id !== "_demo_aurora" && s.status === "Available" && s.listing_category === "Jewelry" && parsePhotos(s.photo).some(Boolean));
        setStones(live);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStones(); }, [fetchStones]);

  function handleTouchStart(e: React.TouchEvent) {
    if (e.target instanceof Element && e.target.closest("canvas")) return;
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

  async function toggleWishlist(id: string) {
    if(!customer.user){window.location.assign('/account');return;}
    if(wishlistPending.current)return;wishlistPending.current=true;setWishlistError(null);
    try{await customerRequest('favorites',wishlist[id]?'DELETE':'PUT',{assetId:id});await customer.reloadState();}
    catch(e){setWishlistError(e instanceof Error?e.message:'Favorite could not be saved');}
    finally{wishlistPending.current=false;}
  }

  return (
    <div data-active={active} className="flex-1 flex flex-col min-h-0 ames-boutique-panel" style={{ background: "#0b0d10", color: "#f4f5f6" }}>
      {wishlistError&&<p role="status">{wishlistError}</p>}

      {/* ═══ SCROLLABLE CONTENT ═══ */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain ames-boutique-scroll" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>

        {/* Pull-to-refresh */}
        <div className="overflow-hidden flex items-center justify-center" style={{ height: pullDist || 0, transition: isRefreshing ? "none" : "height 0.25s ease-out" }}>
          {pullDist > 10 && (
            <div className="flex items-center gap-2" style={{ opacity: Math.min(1, pullDist / THRESHOLD) }}>
              <svg className={isRefreshing ? "animate-spin" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A6A6AB" strokeWidth="2" strokeLinecap="round">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              <span className="text-[10px]" style={{ color: isRefreshing ? "#F1F4F7" : "#9AA5B1" }}>
                {pullDist >= THRESHOLD ? (isRefreshing ? "Refreshing..." : "Release to refresh") : "Pull to refresh"}
              </span>
            </div>
          )}
        </div>

        <header className="ames-boutique-topbar">
          <button className="ames-boutique-menu" aria-label="Boutique menu" aria-expanded={boutiqueMenuOpen} onClick={() => setBoutiqueMenuOpen(open => !open)}><span /><span /><span /></button>
          <span className="ames-boutique-brand">AMES</span>
          <button className="ames-boutique-action" aria-label="Browse collections" onClick={() => scrollRef.current?.querySelector('.ames-boutique-categories-bottom')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z" /></svg></button>
          {boutiqueMenuOpen && <nav className="ames-boutique-menu-popover" aria-label="Boutique navigation"><button onClick={() => { setFilter("All"); setBoutiqueMenuOpen(false); scrollRef.current?.querySelector('.ames-boutique-categories-bottom')?.scrollIntoView({ behavior: 'smooth' }); }}>Collections</button><button onClick={() => onAskPiece("pricing")}>Pricing</button><a href="/compliance">Compliance</a></nav>}
        </header>
        <section className="ames-boutique-hero" aria-label="Interactive jewelry hero">
          <div className="ames-boutique-hero-copy"><h1>Eclipse Collection</h1><p className="ames-boutique-hero-subtitle">Unveiling timeless brilliance</p><button onClick={() => scrollRef.current?.querySelector(".ames-boutique-categories-bottom")?.scrollIntoView({ behavior: "smooth" })}>Explore the collection</button></div>
          <AmesBoutiqueSurface integration={integration} active={active} />
        </section>
        <section className="ames-boutique-categories-bottom" aria-label="Browse categories">
          <div className="ames-boutique-category-strip">
            {CATEGORY_MAP.map(cat => (
              <button key={cat.key} className={filter.toLowerCase() === cat.key.toLowerCase() ? "active" : ""} aria-expanded={filter === cat.key} onClick={() => { setFilter(current => current === cat.key ? "All" : cat.key); scrollRef.current?.querySelector(".ames-boutique-categories-bottom")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                <CategoryIcon category={cat.key} />
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
          {filter !== "All" && <div className="ames-boutique-category-content" aria-label={`${filter} collection`}>
          <div className="ames-boutique-product-grid">
            {filter === "Ring" && <BoutiqueCollectionRing onView={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })} />}
            {filtered.map(stone => <BoutiqueCard key={stone.id} stone={stone} wishlisted={!!wishlist[stone.id]} onToggleWishlist={() => toggleWishlist(stone.id)} onReserve={() => setShowReserveId(stone.id)} onOpenGallery={(photos, idx) => openGallery(photos, idx)} />)}
          </div>
          {!loading && !filtered.length && filter !== "All" && filter !== "Ring" && <p className="ames-boutique-collection-note">No {CATEGORY_MAP.find(cat => cat.key === filter)?.label.toLowerCase()} are available to view yet.</p>}
          </div>}
        </section>


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

function CategoryIcon({ category }: { category: string }) {
  const paths: Record<string,string> = { Ring: 'M4 12c0-3 2-6 8-6s8 3 8 6-2 6-8 6-8-3-8-6Zm4 0a4 4 0 1 0 8 0', Watch: 'M8 4h8v4H8zM8 16h8v4H8zM6 8h12v8H6z', Bracelet: 'M5 7c2-3 12-3 14 0M5 17c2 3 12 3 14 0M5 7v10M19 7v10', Necklace: 'M5 5c1 6 3 10 7 14 4-4 6-8 7-14M8 8h8', Earring: 'M8 5a2 2 0 1 0 4 0v10a4 4 0 1 1-4-4' };
  return <svg className="ames-boutique-category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[category] || paths.Ring} /></svg>;
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
      <div className="relative w-full rounded-t-2xl flex flex-col" style={{ background: "#151515", border: "1px solid rgba(23,23,23,0.08)", borderBottom: "none" }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full" style={{ background: "rgba(23,23,23,0.12)" }} /></div>
        <div className="px-5 pb-4 pt-2">
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#F1F4F7", marginBottom: 4 }}>Reserve {stone ? stone.ref : ""}</h3>
          <p style={{ fontSize: 12, color: "#9AA5B1", marginBottom: 16 }}>Our desk will send an invoice and payment details via WhatsApp within one business day.</p>
          <div className="space-y-3">
            <div>
              <label style={{ fontSize: 10, letterSpacing: "0.1em", color: "#9AA5B1", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Your Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="w-full px-3 py-2.5 text-[13px] rounded-lg outline-none" style={{ border: "1px solid rgba(23,23,23,0.08)", background: "#080808", color: "#F1F4F7" }} />
            </div>
            <div>
              <label style={{ fontSize: 10, letterSpacing: "0.1em", color: "#9AA5B1", textTransform: "uppercase", display: "block", marginBottom: 4 }}>WhatsApp Number</label>
              <input value={wa} onChange={e => setWa(e.target.value)} placeholder="+267 ..." className="w-full px-3 py-2.5 text-[13px] rounded-lg outline-none" style={{ border: "1px solid rgba(23,23,23,0.08)", background: "#080808", color: "#F1F4F7" }} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 py-3 text-[13px] font-medium rounded-xl cursor-default" style={{ border: "1px solid rgba(23,23,23,0.08)", color: "#9AA5B1" }}>Cancel</button>
              <button onClick={handleReserve} disabled={!name.trim() || sending} className="flex-1 py-3 text-[13px] font-medium rounded-xl cursor-default disabled:opacity-40" style={{ background: "#F1F4F7", color: "#151515" }}>
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
              style={{ width: idx === active ? 16 : 6, height: 6, background: idx === active ? "#F1F4F7" : "rgba(23,23,23,0.15)" }} />
          ))}
        </div>
      )}
      <div className="hidden md:flex justify-center gap-2 pb-4 px-4" onClick={e => e.stopPropagation()}>
        {photos.map((url, idx) => (
          <button key={idx} onClick={() => setActive(idx)}
            className="w-16 h-16 overflow-hidden flex-shrink-0"
            style={{ border: idx === active ? "2px solid #8E8E93" : "1px solid rgba(23,23,23,0.08)", borderRadius: 6, background: "#202020" }}>
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
function BoutiqueCard({ stone, wishlisted, onToggleWishlist, onOpenGallery }: {
  stone: StoreStone; wishlisted: boolean;
  onToggleWishlist: () => void; onReserve: () => void;
  onOpenGallery: (photos: (string | null)[], index: number) => void;
}) {
  const photos = parsePhotos(stone.photo);
  const [failed, setFailed] = useState(false);
  const photoIndex = photos.findIndex(photo => !!photo && !photo.startsWith("/demo/"));
  if (failed || photoIndex < 0) return null;
  const name = stone.shape || stone.ref;
  const detail = [stone.cut, stone.carat ? `${stone.carat} ct` : "", stone.color].filter(Boolean).join(" \u00b7 ");
  return <article className="ames-boutique-product" data-stone-id={stone.id}>
    <button className="ames-boutique-product-image" onClick={() => onOpenGallery(photos, photoIndex)} aria-label={`View ${name}`}>
      <img src={photos[photoIndex]!} alt={name} onError={() => setFailed(true)} />
    </button>
    {<button className="ames-boutique-favorite" onClick={onToggleWishlist} aria-label={`${wishlisted ? "Remove" : "Add"} ${name} ${wishlisted ? "from" : "to"} favorites`} aria-pressed={wishlisted}><svg width="19" height="19" viewBox="0 0 24 24" fill={wishlisted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg></button>}
    <div className="ames-boutique-product-copy"><h3>{name}</h3><p>{detail}</p><div className="ames-boutique-product-footer"><span>{stone.price ? `$${stone.price.toLocaleString()}` : "Price on request"}</span><button onClick={() => onOpenGallery(photos, photoIndex)}>View <span aria-hidden="true">&rarr;</span></button></div></div>
  </article>;
}

function BoutiqueCollectionRing({ onView }: { onView: () => void }) {
  const [favorite, setFavorite] = useState(false);
  useEffect(() => { try { setFavorite(localStorage.getItem("ames-boutique-pave-favorite") === "true"); } catch {} }, []);
  function toggle() { setFavorite(value => { const next = !value; try { localStorage.setItem("ames-boutique-pave-favorite", String(next)); } catch {} return next; }); }
  return <article className="ames-boutique-product ames-boutique-collection-ring">
    <div className="ames-boutique-product-image"><img src="/models/jewelry/ames-pave-solitaire.png" alt="Pavé Solitaire ring" /></div>
    <button className="ames-boutique-favorite" onClick={toggle} aria-label={favorite ? "Remove Pavé Solitaire from favorites on this device" : "Favorite Pavé Solitaire on this device"} aria-pressed={favorite}><svg width="17" height="17" viewBox="0 0 24 24" fill={favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg></button>
    <div className="ames-boutique-product-copy"><h3>Pavé Solitaire</h3><p>Round center · Pavé shoulders</p><div className="ames-boutique-product-footer"><span>AMES Collection</span><button onClick={onView}>View <span aria-hidden="true">&rarr;</span></button></div></div>
  </article>;
}

/* ════════��══════════════════════════════════
   VIDEOS PANEL
   ═══════��═══════════════════════════════════ */

function VideosPanel({ isPanelActive, onSeePiece, onAskAmes, onOpenBoutiqueDetail }: {
  isPanelActive: boolean;
  onSeePiece: (id: string) => void;
  onAskAmes: (ref: string, shape: string, carat: number, color: string, clarity: string) => void;
  onOpenBoutiqueDetail: (stoneId: string) => void;
}) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(0);
  const [videoMenuOpen, setVideoMenuOpen] = useState(false);
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

  return <div className="ames-video-panel" data-active={isPanelActive}>
    <header className="ames-video-header">
      <button aria-label="Video menu" aria-expanded={videoMenuOpen} onClick={() => setVideoMenuOpen(open => !open)} className="ames-video-menu-button"><span /><span /></button>
      <span className="ames-video-brand">AMES</span>
      {videoMenuOpen && <nav className="ames-video-menu" aria-label="Video navigation"><a href="/app">Account</a><a href="/favorites">Favorites</a></nav>}
    </header>
    {loading ? <div className="ames-video-empty" role="status">Loading films...</div> : !videos.length ? <div className="ames-video-empty"><p>Films from the house</p><span>No films published yet.</span></div> : <div ref={feedRef} className="ames-video-feed" style={{ scrollSnapType: "y mandatory" }}>
      {videos.map((v, i) => <VideoSlide key={v.id} video={v} index={i} isActive={isPanelActive && activeVideo === i} onSeePiece={onSeePiece} onAskAmes={onAskAmes} onComments={() => {}} onOpenBoutiqueDetail={onOpenBoutiqueDetail} totalVideos={videos.length} activeIndex={activeVideo} />)}
    </div>}
  </div>;
}

function VideoSlide({ video, index, isActive, onSeePiece, onAskAmes, onComments, onOpenBoutiqueDetail, totalVideos, activeIndex }: {
  video: VideoItem; index: number; isActive: boolean;
  onSeePiece: (id: string) => void; onAskAmes: (ref: string, shape: string, carat: number, color: string, clarity: string) => void;
  onComments: () => void; onOpenBoutiqueDetail: (stoneId: string) => void;
  totalVideos: number; activeIndex: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => { if (isActive && !document.hidden) v.play().catch(() => {}); else v.pause(); };
    sync(); document.addEventListener('visibilitychange', sync);
    return () => { document.removeEventListener('visibilitychange', sync); v.pause(); };
  }, [isActive]);

  function toggleMute() { const v = videoRef.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } }
  const stoneInfo = video.stone_id;

  return <div data-video={index} className="ames-video-slide">
    <div className="ames-video-frame">
      <video ref={videoRef} src={video.video_url} className="ames-video-media" loop muted={muted} playsInline preload={isActive ? "auto" : "metadata"} />
      <button onClick={toggleMute} className="ames-video-tap" aria-label={muted ? "Tap to unmute" : "Tap to mute"} />
      <button onClick={toggleMute} className="ames-video-sound" aria-label={muted ? "Enable sound" : "Mute sound"} aria-pressed={!muted}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M11 5L6 9H3v6h3l5 4V5Z" />{muted ? <path d="m16 9 6 6m0-6-6 6" /> : <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}</svg>
      </button>
      <div className="ames-video-caption">
        <span className="ames-video-kicker">AMES FILMS</span>
        {(video.house_note || video.caption) && <p>{video.house_note || video.caption}</p>}
        {stoneInfo && <button onClick={() => onOpenBoutiqueDetail(video.stone_id!)} className="ames-video-piece">View piece <span aria-hidden="true">&rarr;</span></button>}
      </div>
      {totalVideos > 1 && <div className="ames-video-position" aria-label={`Film ${activeIndex + 1} of ${totalVideos}`}>{Array.from({length:totalVideos},(_,i)=><span key={i} className={i === activeIndex ? "active" : ""} />)}</div>}
    </div>
  </div>;
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
      <div className="relative w-full max-h-[70dvh] rounded-t-2xl flex flex-col" style={{ background: "#151515" }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center py-2"><div className="w-10 h-1 rounded-full" style={{ background: "rgba(23,23,23,0.12)" }} /></div>
        <div className="px-4 pb-2 flex items-center justify-between">
          <span className="text-[13px] font-light" style={{ color: "#F1F4F7" }}>Comments</span>
          <button onClick={onClose} className="text-[11px] cursor-default" style={{ color: "#9AA5B1" }}>Close</button>
        </div>
        <div style={{ borderTop: "1px solid rgba(23,23,23,0.08)" }} />
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[100px] max-h-[45dvh]">
          {loading ? (
            <div className="text-[11px] text-center py-4" style={{ color: "#9AA5B1" }}>Loading...</div>
          ) : comments.length === 0 ? (
            <div className="text-[11px] text-center py-4" style={{ color: "#9AA5B1" }}>No comments yet. Be the first.</div>
          ) : comments.map(c => (
            <div key={c.id} className="space-y-0.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-medium" style={{ color: "#F1F4F7" }}>{c.author}</span>
                <span className="text-[9px]" style={{ color: "#A6A6AB" }}>{timeAgo(c.created_at)}</span>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "#F1F4F7" }}>{c.text}</p>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 space-y-2" style={{ borderTop: "1px solid rgba(23,23,23,0.08)" }}>
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Name (optional)" className="w-full px-3 py-1.5 text-[11px] font-light rounded-lg" style={{ border: "1px solid rgba(23,23,23,0.08)", background: "#080808", color: "#F1F4F7" }} />
          <div className="flex gap-2">
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }} placeholder="Add a comment..." className="flex-1 px-3 py-1.5 text-[11px] font-light rounded-lg outline-none" style={{ border: "1px solid rgba(23,23,23,0.08)", background: "#080808", color: "#F1F4F7" }} />
            <button onClick={handleSubmit} disabled={!text.trim() || sending} className="px-4 py-1.5 text-[11px] font-medium rounded-lg cursor-default disabled:opacity-40" style={{ background: "#F1F4F7", color: "#151515" }}>
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



