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
}

interface VideoItem {
  id: string; video_url: string; caption: string;
  stone_id: string | null; stone_ref: string | null;
  shape: string | null; carat: number | null;
  color: string | null; clarity: string | null;
  certification: string | null; price: number | null;
  stone_status: string | null; model_instagram: string | null;
  likes_count: number;
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
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window !== "undefined") return !sessionStorage.getItem("ames_splash_seen");
    return true;
  });
  const [splashFading, setSplashFading] = useState(false);
  const [activePanel, setActivePanel] = useState(1);
  const [highlightStone, setHighlightStone] = useState<string | null>(null);
  const [chatPrefill, setChatPrefill] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSplash) return;
    const f = setTimeout(() => setSplashFading(true), 2500);
    const h = setTimeout(() => { sessionStorage.setItem("ames_splash_seen", "1"); setShowSplash(false); }, 3200);
    return () => { clearTimeout(f); clearTimeout(h); };
  }, [showSplash]);

  function handleSplashTap() {
    setSplashFading(true);
    setTimeout(() => { sessionStorage.setItem("ames_splash_seen", "1"); setShowSplash(false); }, 400);
  }

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const obs = new IntersectionObserver(
      (entries) => { entries.forEach((e) => { if (e.isIntersecting && e.intersectionRatio > 0.5) setActivePanel(Number(e.target.getAttribute("data-panel"))); }); },
      { root: c, threshold: 0.5 }
    );
    c.querySelectorAll("[data-panel]").forEach((p) => obs.observe(p));
    return () => obs.disconnect();
  }, [showSplash]);

  // Scroll to Chat (middle) on initial load
  useEffect(() => {
    if (!showSplash) setTimeout(() => scrollToPanel(1), 100);
  }, [showSplash]);

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

  const LABELS = ["Boutique", "Chat", "Videos"];
  const isDesktop = typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;

  return (
    <>
      {showSplash && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center transition-opacity duration-700 ease-out cursor-pointer" style={{ opacity: splashFading ? 0 : 1 }} onClick={handleSplashTap}>
          <DiamondHero />
        </div>
      )}

      {/* Slim transparent top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-10" style={{ background: "rgba(250,248,244,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid #EAE4DA" }}>
        {/* Left: AMES wordmark */}
        <div className="flex items-center">
          <span className="text-[12px] font-light tracking-[0.18em]" style={{ color: "#1A1A1A" }}>AMES</span>
        </div>
        {/* Centre: panel labels */}
        <div className="flex items-center gap-4">
          {LABELS.map((l, i) => (
            <button key={i} onClick={() => scrollToPanel(i)} className="relative flex flex-col items-center">
              <span className="text-[11px] uppercase tracking-[0.12em] transition-colors duration-300" style={{ color: activePanel === i ? "#1A1A1A" : "#9A938A", fontWeight: activePanel === i ? 400 : 300 }}>{l}</span>
              {activePanel === i && <span className="absolute -bottom-1 w-3 h-[3px] rounded-full" style={{ background: "#C9A227" }} />}
            </button>
          ))}
        </div>
        {/* Right: WhatsApp icon */}
        <a href="https://wa.me/26772839152" target="_blank" rel="noopener noreferrer" className="flex items-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: "#1A1A1A" }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="currentColor"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" fill="currentColor"/></svg>
        </a>
      </div>

      <div ref={containerRef} className="h-[100dvh] w-[100dvw] overflow-x-scroll snap-x snap-mandatory flex" style={{ scrollSnapType: "x mandatory" }}>
        <section data-panel="0" className="relative w-[100dvw] h-full snap-start snap-always flex-shrink-0 flex flex-col">
          <BoutiquePanel highlightStone={highlightStone} />
        </section>

        <section data-panel="1" className="relative w-[100dvw] h-full snap-start snap-always flex-shrink-0 flex flex-col">
          <ChatPanel prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill("")} onBrowseBoutique={() => scrollToPanel(0)} />
        </section>

        <section data-panel="2" className="relative w-[100dvw] h-full snap-start snap-always flex-shrink-0">
          <VideosPanel onSeePiece={handleSeePiece} onAskAmes={handleAskAmes} />
        </section>
      </div>

      {/* Desktop edge arrows — 40% opacity */}
      {activePanel > 0 && (
        <button onClick={() => scrollToPanel(activePanel - 1)} className="fixed left-2 top-1/2 -translate-y-1/2 z-40 w-10 h-10 flex items-center justify-center rounded-full bg-black/5 backdrop-blur-sm border border-black/10 opacity-40 hover:opacity-70 transition-opacity hidden md:flex" aria-label="Previous panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="1.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      )}
      {activePanel < 2 && (
        <button onClick={() => scrollToPanel(activePanel + 1)} className="fixed right-2 top-1/2 -translate-y-1/2 z-40 w-10 h-10 flex items-center justify-center rounded-full bg-black/5 backdrop-blur-sm border border-black/10 opacity-40 hover:opacity-70 transition-opacity hidden md:flex" aria-label="Next panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="1.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   HERO SPLASH — WebGL Diamond
   ═══════════════════════════════════════════ */

function DiamondHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) return;
    const vs = `attribute vec2 a_pos; void main(){gl_Position=vec4(a_pos,0,1);}`;
    const fs = `
      precision mediump float;
      uniform float u_t;
      uniform vec2 u_r;
      float sdHex(vec2 p,float r){vec2 q=abs(p);float d=dot(q,vec2(.866,.5));d=max(d,q.y);return(d-r)*2.;}
      void main(){
        vec2 uv=(gl_FragCoord.xy-.5*u_r)/min(u_r.x,u_r.y);
        float t=u_t*.4;float c=cos(t),s=sin(t);uv=mat2(c,s,-s,c)*uv;
        vec2 p=uv*1.8;float angle=atan(p.y,p.x);
        float facets=pow(abs(sin(angle*6.+t*2.)),3.);
        float diamond=sdHex(p,.6);float edge=smoothstep(.02,.0,abs(diamond));float fill=1.-smoothstep(0.,.02,diamond);
        float sparkle=facets*fill*.4;vec3 col=vec3(.95+sparkle);
        col.r+=sin(angle*3.+t)*.05*fill;col.b+=cos(angle*2.+t*1.5)*.05*fill;
        col+=edge*vec3(1.)*.8;col*=1.-length(uv)*.8;
        gl_FragColor=vec4(col,fill*.9+edge);
      }`;
    const G = gl;
    function compile(type: number, src: string) { const sh = G.createShader(type)!; G.shaderSource(sh, src); G.compileShader(sh); return sh; }
    const prog = G.createProgram()!;
    G.attachShader(prog, compile(G.VERTEX_SHADER, vs));
    G.attachShader(prog, compile(G.FRAGMENT_SHADER, fs));
    G.linkProgram(prog); G.useProgram(prog);
    const buf = G.createBuffer(); G.bindBuffer(G.ARRAY_BUFFER, buf);
    G.bufferData(G.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), G.STATIC_DRAW);
    const aP = G.getAttribLocation(prog, "a_pos"); G.enableVertexAttribArray(aP); G.vertexAttribPointer(aP, 2, G.FLOAT, false, 0, 0);
    const uT = G.getUniformLocation(prog, "u_t"); const uR = G.getUniformLocation(prog, "u_r");
    let raf: number; const start = performance.now();
    function draw() {
      canvas!.width = innerWidth * devicePixelRatio; canvas!.height = innerHeight * devicePixelRatio;
      G.viewport(0, 0, canvas!.width, canvas!.height); G.clearColor(0, 0, 0, 1); G.clear(G.COLOR_BUFFER_BIT);
      G.uniform1f(uT, (performance.now() - start) / 1000); G.uniform2f(uR, canvas!.width, canvas!.height);
      G.drawArrays(G.TRIANGLE_STRIP, 0, 4); raf = requestAnimationFrame(draw);
    }
    draw(); return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="relative z-10 text-center space-y-3 animate-pulse">
        <div className="text-white text-[32px] font-bold tracking-[0.25em]">AMES</div>
        <div className="text-white/50 text-[11px] tracking-[0.15em] uppercase">Botswana&apos;s Diamond GPT</div>
      </div>
    </div>
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setSidebarOpen(false);
    setChatLoading(true);
    try {
      const res = await fetch(`/api/chats/${id}/messages`);
      if (res.ok) setMessages(await res.json());
    } catch {}
    setChatLoading(false);
  }

  async function newChat() {
    setActiveChatId(null);
    setMessages([]);
    setSidebarOpen(false);
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

    // Save user message
    const userRes = await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", text: msg }),
    });
    const userMsg: ChatMessage = await userRes.json();
    setMessages(p => [...p, userMsg]);
    setTyping(true);

    // Simulate AMES reply
    setTimeout(async () => {
      const replies = [
        "That\u2019s a great question. Let me look into our current inventory and sourcing options for you.",
        "We have several stones that may match what you\u2019re looking for. Shall I pull up the latest offerings?",
        "Absolutely. Our desk can arrange a private viewing or send you detailed specifications. What\u2019s your preference?",
        "Every stone in our collection comes with full certification. I can walk you through the verification process.",
        "That\u2019s a beautiful choice. Botswana diamonds carry a unique story \u2014 would you like to know more about the origin?",
      ];
      const thinking = deepThink ? "Let me consider the details of this question carefully..." : "";
      const replyText = replies[Math.floor(Math.random() * replies.length)];
      const assistantRes = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", text: replyText, thinking }),
      });
      const assistantMsg: ChatMessage = await assistantRes.json();
      setMessages(p => [...p, assistantMsg]);
      setTyping(false);
      // Refresh chat list to update titles
      fetch("/api/chats").then(r => r.ok ? r.json() : []).then((d: ChatHistory[]) => setChats(d)).catch(() => {});
    }, 1200 + Math.random() * 800);
  }

  // If no AI configured, show WhatsApp fallback
  if (!DIFY_URL && !activeChatId && messages.length === 0) {
    // Show the full DeepSeek-style UI even without DIFY — AMES responds with built-in replies
  }

  const groups = groupChats(chats);
  const showEmpty = !activeChatId && messages.length === 0;

  return (
    <div className="flex-1 flex min-h-0" style={{ background: "#FAF8F4" }}>
      {/* Sidebar — desktop: always visible; mobile: toggle */}
      <div className={`${sidebarOpen ? "flex" : "hidden"} md:flex flex-col shrink-0 w-[260px] border-r`} style={{ borderColor: "#EAE4DA", background: "#FAF8F4" }}>
        {/* New chat pill */}
        <div className="px-3 pt-14 pb-2">
          <button onClick={newChat} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-light transition-colors" style={{ border: "1px solid #EAE4DA", color: "#1A1A1A" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>
            New chat
          </button>
        </div>
        {/* History */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map(g => (
            <div key={g.label} className="mb-3">
              <div className="text-[10px] uppercase tracking-[0.08em] px-2 py-1.5 font-light" style={{ color: "#9A938A" }}>{g.label}</div>
              {g.items.map(c => (
                <button key={c.id} onClick={() => loadChat(c.id)} className={`w-full text-left px-2 py-1.5 rounded-md text-[12px] font-light truncate transition-colors ${activeChatId === c.id ? "" : ""}`} style={{ color: activeChatId === c.id ? "#1A1A1A" : "#9A938A", background: activeChatId === c.id ? "#FFFFFF" : "transparent", border: activeChatId === c.id ? "1px solid #EAE4DA" : "1px solid transparent" }}>
                  {c.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[80] md:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Top bar with mobile history toggle */}
        <div className="shrink-0 flex items-center px-3 pt-12 pb-1 md:hidden">
          <button onClick={() => setSidebarOpen(p => !p)} className="p-2 rounded-lg" style={{ color: "#1A1A1A" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
        </div>

        {/* Messages scroll area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
          {showEmpty ? (
            /* Empty state — centred heading */
            <div className="h-full flex flex-col items-center justify-center px-4">
              <div className="flex items-center gap-2 mb-6">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.5" fill="none" /></svg>
                <span className="text-[14px] font-light tracking-[0.18em]" style={{ color: "#1A1A1A" }}>AMES</span>
              </div>
              <h2 className="text-[18px] font-light mb-6" style={{ color: "#1A1A1A" }}>Start chatting with AMES</h2>

              {/* Mode segmented control */}
              <div className="flex rounded-full p-0.5 mb-6" style={{ background: "#FFFFFF", border: "1px solid #EAE4DA" }}>
                <button onClick={() => setMode("instant")} className="px-5 py-1.5 rounded-full text-[11px] font-light transition-all" style={{ background: mode === "instant" ? "#1A1A1A" : "transparent", color: mode === "instant" ? "#FFFFFF" : "#9A938A" }}>Instant</button>
                <button onClick={() => setMode("expert")} className="px-5 py-1.5 rounded-full text-[11px] font-light transition-all" style={{ background: mode === "expert" ? "#1A1A1A" : "transparent", color: mode === "expert" ? "#FFFFFF" : "#9A938A" }}>Expert</button>
              </div>

              {/* Quick actions */}
              <div className="flex gap-2">
                <button onClick={onBrowseBoutique} className="px-4 py-2 text-[11px] font-light rounded-lg transition-colors" style={{ border: "1px solid #EAE4DA", color: "#1A1A1A" }}>Browse the boutique</button>
                <a href="https://wa.me/26772839152" target="_blank" rel="noopener noreferrer" className="px-4 py-2 text-[11px] font-medium text-white rounded-lg" style={{ background: "#C9A227" }}>WhatsApp a human</a>
              </div>
            </div>
          ) : (
            /* Messages */
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
              {messages.map((m) => (
                <div key={m.id} className="space-y-2">
                  {/* Expert thinking block — collapsible */}
                  {m.role === "assistant" && m.thinking && (
                    <div className="ml-2">
                      <details className="group">
                        <summary className="text-[10px] font-light cursor-pointer select-none" style={{ color: "#9A938A" }}>Reasoning</summary>
                        <div className="mt-1 px-3 py-2 text-[11px] font-light leading-relaxed rounded-lg" style={{ background: "#FFFFFF", border: "1px solid #EAE4DA", color: "#9A938A" }}>{m.thinking}</div>
                      </details>
                    </div>
                  )}
                  <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "assistant" && (
                      <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center mr-2 mt-0.5" style={{ background: "#C9A227" }}>
                        <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3"><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="white" strokeWidth="1.5" fill="none" /></svg>
                      </div>
                    )}
                    <div className="max-w-[85%] px-4 py-2.5 text-[13px] leading-relaxed font-light" style={m.role === "user" ? { background: "#1A1A1A", color: "#FFFFFF", borderRadius: "18px 18px 4px 18px" } : { background: "#FFFFFF", border: "1px solid #EAE4DA", color: "#1A1A1A", borderRadius: "18px 18px 18px 4px" }}>
                      {m.text}
                    </div>
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center mr-2 mt-0.5" style={{ background: "#C9A227" }}>
                    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3"><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="white" strokeWidth="1.5" fill="none" /></svg>
                  </div>
                  <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 flex gap-1" style={{ border: "1px solid #EAE4DA" }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#C9A227", animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#C9A227", animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#C9A227", animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 px-4 pb-4 pt-2">
          <div className="max-w-2xl mx-auto flex items-center gap-2 rounded-2xl px-4 py-2" style={{ background: "#FFFFFF", border: "1px solid #EAE4DA" }}>
            {/* DeepThink toggle chip */}
            <button onClick={() => setDeepThink(p => !p)} className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-light transition-all" style={{ background: deepThink ? "#C9A227" : "transparent", color: deepThink ? "#FFFFFF" : "#9A938A", border: deepThink ? "none" : "1px solid #EAE4DA" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
              DeepThink
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Message AMES"
              className="flex-1 bg-transparent text-[13px] font-light outline-none placeholder:text-[#9A938A]/50"
            />
            <button onClick={() => handleSend()} disabled={!input.trim()} className="w-8 h-8 flex items-center justify-center rounded-full text-white disabled:opacity-30 transition-opacity shrink-0" style={{ background: "#C9A227" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STORE PANEL — Boutique storefront
   ═══════════════════════════════════════════ */

function BoutiquePanel({ highlightStone }: { highlightStone: string | null }) {
  const [stones, setStones] = useState<StoreStone[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"All" | "Polished" | "Jewelry">("All");
  const [reserved, setReserved] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/stones").then(r => r.ok ? r.json() : []).then((all: StoreStone[]) => {
      setStones(all.filter(s => s.status === "Available" && (s.listing_category === "Polished" || s.listing_category === "Jewelry")));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!highlightStone || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-stone-id="${highlightStone}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightStone]);

  const filtered = filter === "All" ? stones : stones.filter(s => s.listing_category === filter);

  async function handleReserve(stoneId: string, name: string, wa: string) {
    try {
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stoneId, buyerName: name, buyerWhatsapp: wa }) });
      if (res.ok) { setReserved(p => ({ ...p, [stoneId]: true })); setStones(p => p.filter(s => s.id !== stoneId)); }
    } catch {}
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "#FAF8F4" }}>
      {/* Category chips */}
      <div className="shrink-0 px-5 pt-14 pb-3 flex gap-2">
        {(["All", "Polished", "Jewelry"] as const).map(c => (
          <button key={c} onClick={() => setFilter(c)} className="px-4 py-1.5 rounded-full text-[11px] font-light transition-colors cursor-default" style={{ background: filter === c ? "#C9A227" : "#FFFFFF", color: filter === c ? "#FFFFFF" : "#1A1A1A", border: filter === c ? "none" : "1px solid #EAE4DA" }}>
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
        {loading ? (
          <div className="text-[11px] text-center py-12" style={{ color: "#9A938A" }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <p className="text-[11px] text-center py-12" style={{ color: "#9A938A" }}>No pieces currently available.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filtered.map(stone => (
              <BoutiqueCard key={stone.id} stone={stone} onReserve={(n, w) => handleReserve(stone.id, n, w)} reserved={!!reserved[stone.id]} highlighted={highlightStone === stone.id} />
            ))}
          </div>
        )}
        <p className="text-center mt-4" style={{ fontSize: 11, color: "#9A938A", fontWeight: 300 }}>{filtered.length} {filtered.length === 1 ? "piece" : "pieces"}</p>
        <div className="h-8" />
      </div>
    </div>
  );
}

function BoutiqueCard({ stone, onReserve, reserved, highlighted }: { stone: StoreStone; onReserve: (name: string, whatsapp: string) => void; reserved: boolean; highlighted?: boolean }) {
  const hasPhoto = stone.photo && stone.photo.length > 10 && !stone.photo.startsWith("data:");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [wa, setWa] = useState("");

  return (
    <div className="overflow-hidden" style={{ background: "#FFFFFF", border: highlighted ? "1px solid #C9A227" : "1px solid #EAE4DA" }}>
      <div className="aspect-square overflow-hidden relative">
        <img src={hasPhoto ? stone.photo : PLACEHOLDER} alt={stone.ref} className="w-full h-full object-cover" />
        {stone.listing_category === "Jewelry" && (
          <span className="absolute top-2 left-2 text-white text-[8px] font-medium uppercase tracking-wider px-2 py-0.5" style={{ background: "#1A1A1A" }}>Jewelry</span>
        )}
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-light truncate" style={{ color: "#9A938A", fontFamily: "monospace" }}>{stone.ref}</span>
          <span className="text-[12px] font-light" style={{ color: "#1A1A1A" }}>{stone.price ? `$${stone.price.toLocaleString()}` : "Price on request"}</span>
        </div>
        <p className="text-[10px] leading-snug font-light" style={{ color: "#1A1A1A" }}>{stone.shape} {stone.carat}ct {stone.color}</p>
        {reserved ? (
          <p className="text-[10px] pt-1 font-light" style={{ color: "#9A938A" }}>Reserved. Our desk will be in touch.</p>
        ) : showForm ? (
          <div className="space-y-1.5 pt-1">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="w-full px-2 py-1.5 text-[10px] font-light rounded" style={{ border: "1px solid #EAE4DA", background: "#FAF8F4" }} />
            <input value={wa} onChange={e => setWa(e.target.value)} placeholder="WhatsApp" className="w-full px-2 py-1.5 text-[10px] font-light rounded" style={{ border: "1px solid #EAE4DA", background: "#FAF8F4" }} />
            <div className="flex gap-1.5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-1.5 text-[10px] font-light rounded cursor-default" style={{ border: "1px solid #EAE4DA", color: "#9A938A" }}>Cancel</button>
              <button onClick={() => onReserve(name, wa)} disabled={!name.trim()} className="flex-1 py-1.5 text-white text-[10px] font-medium rounded cursor-default disabled:opacity-40" style={{ background: "#C9A227" }}>Confirm</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)} className="w-full py-2 text-white text-[11px] font-medium text-center cursor-default mt-1 rounded" style={{ background: "#C9A227" }}>Reserve</button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   VIDEOS PANEL — TikTok-style feed
   ═══════════════════════════════════════════ */

function VideosPanel({ onSeePiece, onAskAmes }: { onSeePiece: (id: string) => void; onAskAmes: (ref: string, shape: string, carat: number, color: string, clarity: string) => void }) {
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

  if (loading) return <div className="h-full flex items-center justify-center bg-black text-white/60 text-[12px]">Loading videos...</div>;
  if (!videos.length) return (
    <div className="h-full flex items-center justify-center bg-black text-white/60 text-[12px] text-center px-6">
      <div>
        <DiamondIcon />
        <p className="mt-3">No videos published yet.</p>
        <p className="text-[10px] mt-1 opacity-50">Videos added from the dashboard appear here.</p>
      </div>
    </div>
  );

  return (
    <>
      <div ref={feedRef} className="h-[100dvh] overflow-y-scroll snap-y snap-mandatory bg-black" style={{ scrollSnapType: "y mandatory" }}>
        {videos.map((v, i) => (
          <VideoSlide key={v.id} video={v} index={i} isActive={activeVideo === i} onSeePiece={onSeePiece} onAskAmes={onAskAmes} onComments={() => setDrawerVideoId(v.id)} />
        ))}
      </div>
      {drawerVideoId && <CommentDrawer videoId={drawerVideoId} onClose={() => setDrawerVideoId(null)} />}
    </>
  );
}

/* ═══════════════════════════════════════════
   VIDEO SLIDE
   ═══════════════════════════════════════════ */

function VideoSlide({ video, index, isActive, onSeePiece, onAskAmes, onComments }: {
  video: VideoItem; index: number; isActive: boolean;
  onSeePiece: (id: string) => void; onAskAmes: (ref: string, shape: string, carat: number, color: string, clarity: string) => void;
  onComments: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(() => typeof window !== "undefined" && !!localStorage.getItem(`liked_${video.id}`));
  const [likes, setLikes] = useState(video.likes_count || 0);
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [shareCount, setShareCount] = useState(0);

  // Load comment count
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
    const text = `${video.caption} — AMES`;
    if (navigator.share) {
      navigator.share({ title: "AMES", text, url }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + url)}`, "_blank");
    }
    setShareCount(c => c + 1);
  }

  function handleCopyLink() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
    }
  }

  const stoneInfo = video.stone_id ? { ref: video.stone_ref || "", shape: video.shape || "", carat: video.carat || 0, color: video.color || "", clarity: video.clarity || "", status: video.stone_status || null } : null;
  const isSold = stoneInfo?.status === "Sold";

  return (
    <div data-video={index} className="h-[100dvh] snap-start snap-always relative bg-black flex items-center justify-center">
      <video ref={videoRef} src={video.video_url} className="absolute inset-0 w-full h-full object-cover" loop muted={muted} playsInline preload={isActive ? "auto" : "metadata"} />
      <button onClick={toggleMute} className="absolute inset-0 z-10" aria-label={muted ? "Tap to unmute" : "Tap to mute"} />

      {/* Mute button */}
      <div className="absolute top-4 right-4 z-20">
        <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="w-8 h-8 bg-black/50 backdrop-blur-sm flex items-center justify-center rounded-full">
          {muted ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
          )}
        </button>
      </div>

      {/* Action rail — right side */}
      <div className="absolute right-3 bottom-36 z-20 flex flex-col items-center gap-5">
        {/* Like */}
        <button onClick={(e) => { e.stopPropagation(); toggleLike(); }} className="flex flex-col items-center gap-1">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${liked ? "bg-red-500" : "bg-black/40 backdrop-blur-sm"}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={liked ? "white" : "none"} stroke="white" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          </div>
          <span className="text-white text-[10px] font-medium">{likes}</span>
        </button>
        {/* Comment */}
        <button onClick={(e) => { e.stopPropagation(); onComments(); }} className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          </div>
          <span className="text-white text-[10px] font-medium">{commentCount ?? "-"}</span>
        </button>
        {/* Share */}
        <button onClick={(e) => { e.stopPropagation(); handleShare(); }} className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
          </div>
          <span className="text-white text-[10px] font-medium">{shareCount}</span>
        </button>
      </div>

      {/* Price tag */}
      {stoneInfo && (
        <button onClick={(e) => { e.stopPropagation(); onSeePiece(video.stone_id!); }} className="absolute bottom-28 left-4 z-20 bg-black/60 backdrop-blur-sm border border-white/20 px-3 py-2 cursor-default text-left">
          {isSold ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-white bg-white/20 px-2 py-0.5">Sold</span>
          ) : (
            <>
              <div className="text-white text-[11px] font-medium">{stoneInfo.ref} &middot; {stoneInfo.shape} {stoneInfo.carat}ct {stoneInfo.color}</div>
              <div className="text-white text-[13px] font-bold mt-0.5">{video.price != null ? `$${video.price.toLocaleString()}` : "Price on request"}</div>
            </>
          )}
        </button>
      )}

      {/* Caption */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <p className="text-white text-[13px] font-medium mb-1">{video.caption}</p>
        {video.model_instagram && <p className="text-white/50 text-[10px] font-mono mb-2">@{video.model_instagram}</p>}
        {stoneInfo && (
          <div className="flex gap-2">
            <button onClick={(e) => { e.stopPropagation(); onSeePiece(video.stone_id!); }} className="px-3 py-2 bg-white text-black text-[11px] font-medium cursor-default rounded-lg">See this piece &rarr;</button>
            <button onClick={(e) => { e.stopPropagation(); onAskAmes(stoneInfo.ref, stoneInfo.shape, stoneInfo.carat, stoneInfo.color, stoneInfo.clarity); }} className="px-3 py-2 bg-white/20 backdrop-blur-sm text-white text-[11px] font-medium border border-white/30 cursor-default rounded-lg">Ask AMES</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   COMMENT DRAWER
   ═══════════════════════════════════════════ */

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
      <div className="relative w-full max-h-[70dvh] bg-[#FAF8F4] rounded-t-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div className="flex justify-center py-2"><div className="w-10 h-1 rounded-full" style={{ background: "#EAE4DA" }} /></div>
        <div className="px-4 pb-2 flex items-center justify-between">
          <span className="text-[13px] font-light" style={{ color: "#1A1A1A" }}>Comments</span>
          <button onClick={onClose} className="text-[11px] cursor-default" style={{ color: "#9A938A" }}>Close</button>
        </div>
        <div style={{ borderTop: "1px solid #EAE4DA" }} />

        {/* Comment list */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[100px] max-h-[45dvh]">
          {loading ? (
            <div className="text-[11px] text-center py-4" style={{ color: "#9A938A" }}>Loading...</div>
          ) : comments.length === 0 ? (
            <div className="text-[11px] text-center py-4" style={{ color: "#9A938A" }}>No comments yet. Be the first.</div>
          ) : comments.map(c => (
            <div key={c.id} className="space-y-0.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-medium" style={{ color: "#1A1A1A" }}>{c.author}</span>
                <span className="text-[9px]" style={{ color: "#9A938A" }}>{timeAgo(c.created_at)}</span>
              </div>
              <p className="text-[12px] leading-relaxed">{c.text}</p>
            </div>
          ))}
        </div>

        {/* Input */}          <div className="px-4 py-3 space-y-2" style={{ borderTop: "1px solid #EAE4DA" }}>
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Name (optional)" className="w-full px-3 py-1.5 text-[11px] font-light rounded-lg" style={{ border: "1px solid #EAE4DA", background: "#FFFFFF" }} />
          <div className="flex gap-2">
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }} placeholder="Add a comment..." className="flex-1 px-3 py-1.5 text-[11px] font-light rounded-lg outline-none" style={{ border: "1px solid #EAE4DA", background: "#FFFFFF" }} />
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
  return <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" aria-hidden="true"><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#000" strokeWidth="1.5" fill="none" /></svg>;
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
