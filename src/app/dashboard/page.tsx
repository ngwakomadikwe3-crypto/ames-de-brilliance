"use client";

import { useEffect, useState, useCallback } from "react";

interface Request {
  id: string; date: string; company: string; country: string; buyerName: string;
  contact: string; type: string; shape: string; caratMin: string; caratMax: string;
  color: string; clarity: string; certification: string; notes: string;
  mandate: string; status: "New" | "Sourcing" | "Quoted" | "Closed";
  offer_text?: string; offer_timestamp?: string;
}

interface Stone {
  id: string; ref: string; stone_type: string; shape: string; carat: number; color: string; clarity: string;
  cut: string; certification: string; category: string; crystal_form: string; clarity_notes: string;
  kp_status: number; price: number | null; status: "Available" | "Reserved" | "Sold";
  photo: string; source: "Own stock" | "Consigned";
  trader_name?: string; trader_whatsapp?: string; trader_licence?: string;
  trader_id: number | null; commission: number; sale_price: number | null;
}

interface Trader {
  id: number; name: string; whatsapp: string; licence: string; created_at: string;
}

type Tab = "requests" | "stones" | "addstone" | "pastein" | "traders";

function downloadCSV(filename: string, headers: string[], rows: (string|number)[][]) {
  const esc = (v: string|number) => '"' + String(v).replace(/"/g, '""') + '"';
  const csv = [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("requests");

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="min-h-full flex flex-col">
      <div className="px-4 md:px-6 pt-3 pb-0 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-4 text-[12px] font-medium border-b border-border overflow-x-auto">
            {([["requests","Requests"],["stones","Stones"],["addstone","Add Stone"],["pastein","Paste-in"],["traders","Traders"]] as [Tab,string][]).map(([t,label]) => (
              <button key={t} onClick={() => setTab(t)} className={`pb-2 whitespace-nowrap cursor-default ${tab===t?"border-b-2 border-black text-black":"text-muted"}`}>{label}</button>
            ))}
          </div>
          <button onClick={handleLogout} className="text-[10px] text-muted hover:text-black whitespace-nowrap ml-3 pb-2 cursor-default shrink-0">Logout</button>
        </div>
      </div>
      <div className="flex-1">
        {tab==="requests" && <RequestsTab />}
        {tab==="stones" && <StonesTab />}
        {tab==="addstone" && <AddStoneTab />}
        {tab==="pastein" && <PasteInTab />}
        {tab==="traders" && <TradersTab />}
      </div>
    </div>
  );
}

/* ═══════ REQUESTS TAB ═══════ */

function RequestsTab() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [aiStates, setAiStates] = useState<Record<string, { parsing?: boolean; drafting?: boolean; parsed?: any; draft?: string; error?: string }>>({});
  const [offerStates, setOfferStates] = useState<Record<string, { generating?: boolean; text?: string; error?: string; copied?: boolean }>>({});

  const fetchData = useCallback(async () => {
    try { const res = await fetch("/api/requests"); setRequests(await res.json()); }
    catch { /* */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  function setAi(id: string, patch: Record<string, any>) {
    setAiStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch("/api/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: status as Request["status"] } : r));
  }

  function buildWhatsAppText(r: Request): string {
    const cr = r.caratMin === r.caratMax ? r.caratMin + "ct" : r.caratMin + "\u2013" + r.caratMax + "ct";
    const cert = r.certification === "None" ? "" : " " + r.certification;
    const lines = ["SOURCING REQUEST", "", "Buyer: " + r.company + (r.country ? " (" + r.country + ")" : ""), "Contact: " + r.contact, "Type: " + r.type, "", "Requirement: " + r.shape + " " + cr + " " + r.color + " " + r.clarity + cert];
    if (r.notes) lines.push("", "Notes: " + r.notes);
    return lines.join("\n");
  }

  function setOffer(id: string, patch: Record<string, any>) {
    setOfferStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function handleGenerateOffer(r: Request) {
    setOffer(r.id, { generating: true, error: undefined });
    try {
      const res = await fetch("/api/ai/draft-offer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: r.id }) });
      if (!res.ok) throw new Error("Failed to generate offer");
      const data = await res.json();
      setOffer(r.id, { generating: false, text: data.offer });
    } catch (e: any) { setOffer(r.id, { generating: false, error: e.message }); }
  }

  async function handleCopyOffer(text: string, requestId: string) {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea"); ta.value = text;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
    setOffer(requestId, { copied: true }); setTimeout(() => setOffer(requestId, { copied: false }), 1500);
  }

  async function handleSaveOffer(r: Request) {
    const offerText = offerStates[r.id]?.text;
    if (!offerText) return;
    await fetch("/api/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, offerText, status: "Quoted" }) });
    setRequests((prev) => prev.map((req) => req.id === r.id ? { ...req, offer_text: offerText, offer_timestamp: new Date().toISOString(), status: "Quoted" as const } : req));
  }

  async function handleCopy(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea"); ta.value = text;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopiedId(id); setTimeout(() => setCopiedId(null), 1500);
  }

  async function handleParseAI(r: Request) {
    setAi(r.id, { parsing: true, error: undefined });
    try {
      const text = "Buyer: " + r.buyerName + " from " + r.company + ", " + r.country + ". " + r.type + " diamond. " + r.shape + " " + r.caratMin + "-" + r.caratMax + "ct " + r.color + " " + r.clarity + " " + r.certification + ". " + (r.notes || "No additional notes.");
      const res = await fetch("/api/ai/parse-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error("Parse failed");
      setAi(r.id, { parsing: false, parsed: await res.json() });
    } catch (e: any) { setAi(r.id, { parsing: false, error: e.message }); }
  }

  async function handleDraftReply(r: Request) {
    setAi(r.id, { drafting: true, error: undefined });
    try {
      const res = await fetch("/api/ai/draft-reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: r.id }) });
      if (!res.ok) throw new Error("Draft failed");
      const data = await res.json();
      setAi(r.id, { drafting: false, draft: data.reply });
    } catch (e: any) { setAi(r.id, { drafting: false, error: e.message }); }
  }

  function statusColor(s: string) {
    switch (s) { case "New": return "bg-blue-600 text-white"; case "Sourcing": return "bg-yellow-500 text-white"; case "Quoted": return "bg-green-700 text-white"; case "Closed": return "bg-gray-400 text-white"; default: return "bg-gray-200 text-black"; }
  }
  const STATUSES: Request["status"][] = ["New", "Sourcing", "Quoted", "Closed"];

  if (loading) return <div className="px-4 md:px-6 py-10 text-[12px] text-muted">Loading...</div>;
  if (requests.length === 0) return <div className="px-4 md:px-6 py-10 text-[12px] text-muted">No requests yet.</div>;

  return (
    <div className="px-4 md:px-6 py-4 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-muted font-mono">{requests.length} requests</span>
        <button onClick={() => {
          const headers = ['Date','Buyer','Company','Country','Contact','Type','Shape','Carat Min','Carat Max','Color','Clarity','Certification','Status','Notes','Mandate'];
          const rows = requests.map(r => [r.date, r.buyerName, r.company, r.country, r.contact, r.type, r.shape, r.caratMin, r.caratMax, r.color, r.clarity, r.certification, r.status, r.notes, r.mandate]);
          downloadCSV('requests-' + new Date().toISOString().slice(0,10) + '.csv', headers, rows);
        }} className="px-2 py-0.5 border border-border text-[10px] text-muted hover:bg-surface cursor-default">Export CSV</button>
      </div>
      {/* Desktop */}
      <div className="hidden md:block border border-border">
        <table className="w-full text-[12px]">
          <thead><tr className="text-left border-b border-border bg-surface">
            <th className="px-3 py-1.5 font-semibold text-muted w-24">Date</th>
            <th className="px-3 py-1.5 font-semibold text-muted">Buyer</th>
            <th className="px-3 py-1.5 font-semibold text-muted">Request</th>
            <th className="px-3 py-1.5 font-semibold text-muted w-32">Status</th>
          </tr></thead>
          <tbody>
            {requests.map((r) => {
              const brief = r.shape + " " + (r.caratMin===r.caratMax ? r.caratMin+"ct" : r.caratMin+"\u2013"+r.caratMax+"ct") + " " + r.color + " " + r.clarity;
              const ai = aiStates[r.id];
              return (
                <tr key={r.id}>
                  <tr onClick={() => setExpanded(expanded===r.id ? null : r.id)} className="border-b border-border/60 cursor-default hover:bg-surface/60">
                    <td className="px-3 py-1.5 font-mono text-muted">{r.date}</td>
                    <td className="px-3 py-1.5">{r.company}{r.country && <span className="text-muted ml-1">({r.country})</span>}</td>
                    <td className="px-3 py-1.5 font-mono">{brief}</td>
                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <select value={r.status} onChange={(e) => handleStatusChange(r.id, e.target.value)} className={"text-[10px] font-semibold uppercase px-1.5 py-0.5 cursor-default "+statusColor(r.status)+" border-0 outline-none"}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                  {expanded===r.id && <tr className="border-b border-border bg-surface/50"><td colSpan={4} className="px-3 py-3"><ExpandedRequest r={r} ai={ai} offer={offerStates[r.id]} handleCopy={handleCopy} handleParseAI={handleParseAI} handleDraftReply={handleDraftReply} handleGenerateOffer={handleGenerateOffer} handleCopyOffer={handleCopyOffer} handleSaveOffer={handleSaveOffer} setOffer={setOffer} aiStates={aiStates} copiedId={copiedId} /></td></tr>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {requests.map((r) => {
          const brief = r.shape+" "+(r.caratMin===r.caratMax?r.caratMin+"ct":r.caratMin+"\u2013"+r.caratMax+"ct")+" "+r.color+" "+r.clarity;
          const ai = aiStates[r.id];
          return (
            <div key={r.id} className="border border-border">
              <div className="p-3 cursor-default" onClick={() => setExpanded(expanded===r.id?null:r.id)}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-mono text-muted">{r.date}</span>
                  <select value={r.status} onClick={(e)=>e.stopPropagation()} onChange={(e)=>handleStatusChange(r.id,e.target.value)} className={"text-[10px] font-semibold uppercase px-1.5 py-0.5 cursor-default "+statusColor(r.status)+" border-0 outline-none"}>
                    {STATUSES.map((s)=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="text-[12px] font-medium">{r.company}{r.country&&<span className="text-muted ml-1">({r.country})</span>}</div>
                <div className="text-[11px] font-mono text-muted mt-0.5">{brief}</div>
              </div>
              {expanded===r.id && <div className="border-t border-border p-3 bg-surface/50"><ExpandedRequest r={r} ai={ai} offer={offerStates[r.id]} handleCopy={handleCopy} handleParseAI={handleParseAI} handleDraftReply={handleDraftReply} handleGenerateOffer={handleGenerateOffer} handleCopyOffer={handleCopyOffer} handleSaveOffer={handleSaveOffer} setOffer={setOffer} aiStates={aiStates} copiedId={copiedId} /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExpandedRequest({ r, ai, offer, handleCopy, handleParseAI, handleDraftReply, handleGenerateOffer, handleCopyOffer, handleSaveOffer, setOffer, aiStates, copiedId }: any) {
  return (
    <div className="text-[11px] space-y-2 max-w-xl">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <div><span className="text-muted">Buyer:</span> {r.buyerName||r.company}</div>
        <div><span className="text-muted">Contact:</span> {r.contact}</div>
        <div><span className="text-muted">Type:</span> {r.type}</div>
        <div><span className="text-muted">Shape:</span> {r.shape}</div>
        <div><span className="text-muted">Carat:</span> {r.caratMin}{"\u2013"}{r.caratMax}ct</div>
        <div><span className="text-muted">Color:</span> {r.color}</div>
        <div><span className="text-muted">Clarity:</span> {r.clarity}</div>
        <div><span className="text-muted">Certification:</span> {r.certification}</div>
      </div>
      {r.notes&&<div><span className="text-muted">Notes:</span> {r.notes}</div>}
      <pre className="font-mono text-[10px] leading-relaxed whitespace-pre-wrap bg-white border border-border p-2 mt-2 select-all">{r.mandate}</pre>
      <div className="flex gap-2 flex-wrap">
        <button onClick={()=>handleCopy(buildReqWA(r),r.id)} className="px-3 py-1.5 md:py-1 bg-black text-white text-[11px] font-medium cursor-default min-h-[36px]">{copiedId===r.id?"Copied":"Copy WhatsApp"}</button>
        <button onClick={()=>handleParseAI(r)} disabled={ai?.parsing} className="px-3 py-1.5 md:py-1 border border-border text-[11px] cursor-default disabled:opacity-50 min-h-[36px]">{ai?.parsing?"Parsing...":"Parse AI"}</button>
        <button onClick={()=>handleDraftReply(r)} disabled={ai?.drafting} className="px-3 py-1.5 md:py-1 border border-border text-[11px] cursor-default disabled:opacity-50 min-h-[36px]">{ai?.drafting?"Drafting...":"Draft reply"}</button>
        {ai?.draft&&<button onClick={()=>handleCopy(ai.draft,"draft-"+r.id)} className="px-3 py-1.5 md:py-1 bg-black text-white text-[11px] font-medium cursor-default min-h-[36px]">{copiedId==="draft-"+r.id?"Copied":"Copy draft"}</button>}
      </div>
      {ai?.error&&<div className="text-[10px] text-red-600 mt-1">Error: {ai.error}</div>}
      {ai?.parsed&&<div className="bg-surface border border-border p-2 mt-1"><div className="text-[10px] uppercase tracking-wider text-muted mb-1 font-medium">AI Parsed Output</div><pre className="font-mono text-[10px] whitespace-pre-wrap select-all">{JSON.stringify(ai.parsed,null,2)}</pre></div>}
      {ai?.draft&&<div className="bg-surface border border-border p-2 mt-1"><div className="text-[10px] uppercase tracking-wider text-muted mb-1 font-medium">AI Draft Reply</div><pre className="font-mono text-[10px] whitespace-pre-wrap select-all">{ai.draft}</pre></div>}

      {/* ── Offer Generator ── */}
      <div className="border-t border-border pt-2 mt-2">
        {r.offer_text ? (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-muted font-medium">Saved Offer{r.offer_timestamp ? " — " + r.offer_timestamp.split("T")[0] : ""}</span>
              <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5">Quoted</span>
            </div>
            <pre className="font-mono text-[10px] whitespace-pre-wrap bg-white border border-border p-2 select-all">{r.offer_text}</pre>
            <button onClick={()=>handleCopy(r.offer_text||"","offer-"+r.id)} className="mt-1 px-3 py-1.5 md:py-1 bg-black text-white text-[11px] font-medium cursor-default min-h-[36px]">{copiedId==="offer-"+r.id?"Copied":"Copy offer"}</button>
          </div>
        ) : (
          <div>
            <button onClick={()=>handleGenerateOffer(r)} disabled={offer?.generating} className="px-3 py-1.5 md:py-1 border border-border text-[11px] cursor-default disabled:opacity-50 min-h-[36px]">
              {offer?.generating?"Generating...":"Generate offer"}
            </button>
            {offer?.error&&<span className="text-[10px] text-red-600 ml-2">{offer.error}</span>}
            {offer?.text&&(
              <div className="mt-2">
                <textarea value={offer.text} onChange={(e)=>setOffer(r.id,{text:e.target.value})} rows={12} className="w-full font-mono text-[10px] leading-relaxed border border-border p-2 bg-white resize-y" />
                <div className="flex gap-2 mt-2 flex-wrap">
                  <button onClick={()=>handleCopyOffer(offer.text||"",r.id)} className="px-3 py-1.5 md:py-1 bg-black text-white text-[11px] font-medium cursor-default min-h-[36px]">
                    {offer.copied?"Copied":"Copy"}
                  </button>
                  <button onClick={()=>handleSaveOffer(r)} className="px-3 py-1.5 md:py-1 border border-border text-[11px] font-medium cursor-default min-h-[36px]">
                    Save and mark Quoted
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function buildReqWA(r: Request): string {
  const cr = r.caratMin===r.caratMax ? r.caratMin+"ct" : r.caratMin+"\u2013"+r.caratMax+"ct";
  const cert = r.certification==="None"?"":" "+r.certification;
  const lines = ["SOURCING REQUEST","","Buyer: "+r.company+(r.country?" ("+r.country+")":""),"Contact: "+r.contact,"Type: "+r.type,"","Requirement: "+r.shape+" "+cr+" "+r.color+" "+r.clarity+cert];
  if(r.notes) lines.push("","Notes: "+r.notes);
  return lines.join("\n");
}

/* ═══════ STONES TAB ═══════ */

function StonesTab() {
  const [stones, setStones] = useState<Stone[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"All"|"Own stock"|"Consigned">("All");
  const [saleModal, setSaleModal] = useState<{stone:Stone}|null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All"|"rough"|"polished">("All");
  const [statusFilter, setStatusFilter] = useState<"All"|"Available"|"Reserved"|"Sold">("All");
  const [certFilter, setCertFilter] = useState<"All"|"GIA"|"IGI"|"HRD"|"None">("All");
  const [sort, setSort] = useState<"ref-asc"|"ref-desc"|"carat-asc"|"carat-desc"|"price-asc"|"price-desc"|"newest">("ref-asc");
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = useCallback(async () => {
    try { const res = await fetch("/api/stones"); setStones(await res.json()); }
    catch { /* */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleStatusChange(id: string, status: string, salePrice?: number) {
    await fetch("/api/stones", { method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify({id,status,salePrice}) });
    setStones((prev) => prev.map((s) => s.id===id ? {...s,status:status as Stone["status"],sale_price:salePrice??s.sale_price} : s));
  }

  function statusColor(s: string) {
    switch(s){case"Available":return"bg-green-700 text-white";case"Reserved":return"bg-yellow-500 text-white";case"Sold":return"bg-gray-400 text-white";default:return"bg-gray-200 text-black";}
  }
  function specs(s: Stone) {
    if(s.stone_type==="rough") return s.category+" "+s.crystal_form+" "+s.carat+"ct "+s.color;
    return s.shape+" "+s.carat+"ct "+s.color+" "+s.clarity+" "+s.certification;
  }

  const q = search.toLowerCase();
  let filtered = stones.filter((s) => {
    if(filter!=="All" && s.source!==filter) return false;
    if(typeFilter!=="All" && s.stone_type!==typeFilter) return false;
    if(statusFilter!=="All" && s.status!==statusFilter) return false;
    if(certFilter!=="All") {
      const c = (s.certification||"None").toUpperCase();
      if(certFilter!==c) return false;
    }
    if(q) {
      const hay = [s.ref, s.stone_type, specs(s), s.color, s.clarity, s.cut, s.certification, s.source, s.trader_name||"", s.category, s.crystal_form, s.clarity_notes].join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  filtered.sort((a,b) => {
    switch(sort) {
      case "ref-asc": return a.ref.localeCompare(b.ref);
      case "ref-desc": return b.ref.localeCompare(a.ref);
      case "carat-asc": return a.carat - b.carat;
      case "carat-desc": return b.carat - a.carat;
      case "price-asc": return (a.price||0) - (b.price||0);
      case "price-desc": return (b.price||0) - (a.price||0);
      case "newest": return b.id.localeCompare(a.id);
      default: return 0;
    }
  });

  if(loading) return <div className="px-4 md:px-6 py-10 text-[12px] text-muted">Loading...</div>;

  return (
    <div className="px-4 md:px-6 py-4 max-w-5xl mx-auto w-full">
      <div className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search ref, specs, trader..." className="field-input min-h-[36px] flex-1 text-[11px]" />
          <span className="text-[11px] text-muted font-mono shrink-0">{filtered.length}/{stones.length}</span>
          <button onClick={()=>setShowFilters(!showFilters)} className={`px-2 py-1 text-[10px] whitespace-nowrap cursor-default min-h-[36px] ${showFilters?"bg-black text-white":"border border-border text-muted"}`}>{showFilters?"Hide filters":"Filters"}</button>
          <button onClick={() => {
            const headers = ['Ref','Type','Specs','Color','Clarity','Cut','Cert','Category','Crystal','KP','Price','Status','Source','Trader','Commission%'];
            const rows = filtered.map(s => [s.ref, s.stone_type, specs(s), s.color, s.clarity, s.cut||'', s.certification||'', s.category||'', s.crystal_form||'', s.kp_status?'Yes':'No', s.price||'—', s.status, s.source, s.trader_name||'', s.commission]);
            downloadCSV('stones-' + new Date().toISOString().slice(0,10) + '.csv', headers, rows);
          }} className="px-2 py-1 border border-border text-[10px] text-muted hover:bg-surface cursor-default min-h-[36px]">Export</button>
        </div>
        {/* Source pills — always visible */}
        <div className="flex gap-1 text-[11px] overflow-x-auto">
          {(["All","Own stock","Consigned"] as const).map((f)=>(
            <button key={f} onClick={()=>setFilter(f)} className={`px-2 py-0.5 whitespace-nowrap cursor-default ${filter===f?"bg-black text-white font-medium":"border border-border bg-white"}`}>{f}</button>
          ))}
        </div>
        {/* Advanced filters — toggleable */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted">Type:</span>
              <select value={typeFilter} onChange={(e)=>setTypeFilter(e.target.value as any)} className="text-[10px] border border-border px-1 py-0.5 bg-white cursor-default">
                <option value="All">All</option><option value="rough">Rough</option><option value="polished">Polished</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted">Status:</span>
              <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value as any)} className="text-[10px] border border-border px-1 py-0.5 bg-white cursor-default">
                <option value="All">All</option><option value="Available">Available</option><option value="Reserved">Reserved</option><option value="Sold">Sold</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted">Cert:</span>
              <select value={certFilter} onChange={(e)=>setCertFilter(e.target.value as any)} className="text-[10px] border border-border px-1 py-0.5 bg-white cursor-default">
                <option value="All">All</option><option value="GIA">GIA</option><option value="IGI">IGI</option><option value="HRD">HRD</option><option value="None">None</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted">Sort:</span>
              <select value={sort} onChange={(e)=>setSort(e.target.value as any)} className="text-[10px] border border-border px-1 py-0.5 bg-white cursor-default">
                <option value="ref-asc">Ref A→Z</option><option value="ref-desc">Ref Z→A</option>
                <option value="carat-asc">Carat ↑</option><option value="carat-desc">Carat ↓</option>
                <option value="price-asc">Price ↑</option><option value="price-desc">Price ↓</option>
                <option value="newest">Newest</option>
              </select>
            </div>
            {(typeFilter!=="All"||statusFilter!=="All"||certFilter!=="All") && (
              <button onClick={()=>{setTypeFilter("All");setStatusFilter("All");setCertFilter("All");}} className="text-[10px] text-muted underline cursor-default">Clear</button>
            )}
          </div>
        )}
      </div>
      {/* Desktop */}
      <div className="hidden md:block border border-border">
        <table className="w-full text-[12px]">
          <thead><tr className="text-left border-b border-border bg-surface">
            <th className="px-3 py-1.5 font-semibold text-muted">Ref</th>
            <th className="px-3 py-1.5 font-semibold text-muted">Specs</th>
            <th className="px-3 py-1.5 font-semibold text-muted">Source</th>
            <th className="px-3 py-1.5 font-semibold text-muted">Trader</th>
            <th className="px-3 py-1.5 font-semibold text-muted text-right">Price</th>
            <th className="px-3 py-1.5 font-semibold text-muted w-32">Status</th>
          </tr></thead>
          <tbody>
            {filtered.map((s)=>(
              <tr key={s.id} className="border-b border-border/60 hover:bg-surface/60">
                <td className="px-3 py-1.5 font-mono font-medium">{s.ref}</td>
                <td className="px-3 py-1.5 font-mono">{specs(s)}</td>
                <td className="px-3 py-1.5">{s.source}</td>
                <td className="px-3 py-1.5 text-muted">{s.source==="Consigned"?s.trader_name:"\u2014"}</td>
                <td className="px-3 py-1.5 text-right font-mono">{s.price?"$"+s.price.toLocaleString():"\u2014"}</td>
                <td className="px-3 py-1.5">
                  <select value={s.status} onChange={(e)=>{if(e.target.value==="Sold"&&s.source==="Consigned"){setSaleModal({stone:s});}else{handleStatusChange(s.id,e.target.value);}}} className={"text-[10px] font-semibold uppercase px-1.5 py-0.5 cursor-default "+statusColor(s.status)+" border-0 outline-none"}>
                    <option>Available</option><option>Reserved</option><option>Sold</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {filtered.map((s)=>(
          <div key={s.id} className="border border-border p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-mono font-medium">{s.ref}</span>
              <select value={s.status} onChange={(e)=>{if(e.target.value==="Sold"&&s.source==="Consigned"){setSaleModal({stone:s});}else{handleStatusChange(s.id,e.target.value);}}} className={"text-[10px] font-semibold uppercase px-1.5 py-0.5 cursor-default "+statusColor(s.status)+" border-0 outline-none"}>
                <option>Available</option><option>Reserved</option><option>Sold</option>
              </select>
            </div>
            <div className="text-[11px] font-mono text-muted">{specs(s)}</div>
            <div className="flex justify-between items-center mt-1 text-[10px]">
              <span>{s.source}{s.source==="Consigned"&&s.trader_name?" · "+s.trader_name:""}</span>
              <span className="font-mono font-medium">{s.price?"$"+s.price.toLocaleString():"\u2014"}</span>
            </div>
          </div>
        ))}
      </div>
      {saleModal&&<SaleModal stone={saleModal.stone} onConfirm={(p)=>{handleStatusChange(saleModal.stone.id,"Sold",p);setSaleModal(null);}} onCancel={()=>setSaleModal(null)} />}
    </div>
  );
}

function SaleModal({ stone, onConfirm, onCancel }: { stone: Stone; onConfirm: (price: number) => void; onCancel: () => void }) {
  const [price, setPrice] = useState("");
  function handleSubmit() { const p = parseFloat(price); if(!isNaN(p)&&p>0) onConfirm(p); }
  const saleNum = parseFloat(price)||0;
  const commissionAmt = (saleNum*stone.commission)/100;
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-border p-5 w-full max-w-md text-[12px]">
        <h3 className="font-bold mb-3">Record Sale {"\u2014"} {stone.ref}</h3>
        <div className="text-muted mb-3">Consigned by {stone.trader_name} · {stone.commission}% commission</div>
        <div className="mb-3">
          <label className="block text-[10px] uppercase tracking-wider font-medium text-muted mb-1">Final Sale Price (USD)</label>
          <input type="number" min="1" value={price} onChange={(e)=>setPrice(e.target.value)} className="field-input min-h-[40px]" placeholder="0.00" autoFocus />
        </div>
        {saleNum>0&&(
          <div className="bg-surface border border-border p-3 mb-3">
            <div className="flex justify-between text-[11px] mb-1"><span className="text-muted">Sale price</span><span className="font-mono">${saleNum.toLocaleString()}</span></div>
            <div className="flex justify-between text-[11px] mb-1"><span className="text-muted">Commission ({stone.commission}%)</span><span className="font-mono font-semibold">${commissionAmt.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
            <div className="flex justify-between text-[11px] font-bold border-t border-border pt-1 mt-1"><span>Owes to {stone.trader_name}</span><span className="font-mono">${commissionAmt.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 md:py-1 border border-border cursor-default min-h-[40px]">Cancel</button>
          <button onClick={handleSubmit} disabled={!saleNum} className="px-3 py-1.5 md:py-1 bg-black text-white font-medium cursor-default disabled:opacity-30 min-h-[40px]">Confirm Sale</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════ ADD STONE TAB ═══════ */

function AddStoneTab() {
  const [saved, setSaved] = useState<{ref:string}|null>(null);
  const [stoneType, setStoneType] = useState<"rough"|"polished">("polished");
  const [source, setSource] = useState<"Own stock"|"Consigned">("Own stock");
  const [traderText, setTraderText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string|null>(null);

  async function handleParseTrader() {
    if(!traderText.trim()) return;
    setParsing(true); setParseError(null);
    try {
      const res = await fetch("/api/ai/parse-stone",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:traderText})});
      if(!res.ok) throw new Error("Parse failed");
      const parsed = await res.json();
      const form = document.querySelector("form") as HTMLFormElement;
      if(form){
        const setField=(name:string,value:string)=>{
          const el=form.querySelector(`[name="${name}"]`) as HTMLInputElement|HTMLSelectElement;
          if(el){const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;if(setter) setter.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}
        };
        if(parsed.carat) setField("carat",String(parsed.carat));
        if(parsed.color) setField("color",parsed.color);
        if(parsed.price) setField("price",String(parsed.price));
        if(parsed.source){setSource(parsed.source);setField("source",parsed.source);}
        if(parsed.traderName) setField("traderName",parsed.traderName);
        if(parsed.traderWhatsapp) setField("traderWhatsapp",parsed.traderWhatsapp);
        if(parsed.traderLicence) setField("traderLicence",parsed.traderLicence);
        if(parsed.commission) setField("commission",String(parsed.commission));
      }
      setTraderText("");
    } catch(e:any){setParseError(e.message);}finally{setParsing(false);}
  }

  async function handleSubmit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form=e.currentTarget;
    const fd=new FormData(form);
    fd.set("stone_type",stoneType);
    const res=await fetch("/api/stones",{method:"POST",body:fd});
    if(res.ok){const data=await res.json();setSaved({ref:data.ref});form.reset();setSource("Own stock");setStoneType("polished");}
  }

  if(saved) return <div className="px-4 md:px-6 py-10 max-w-lg mx-auto w-full"><p className="text-[13px] mb-2">Stone <strong>{saved.ref}</strong> added. Visible on the <a href="/" className="underline">public stock page</a>.</p><button onClick={()=>setSaved(null)} className="text-[12px] underline text-muted">Add another</button></div>;

  return (
    <div className="px-4 md:px-6 py-6 max-w-lg mx-auto w-full flex flex-col gap-4">
      <div className="border border-border p-3 bg-surface">
        <label className="block text-[11px] font-medium mb-1">Paste trader text (auto-fill with AI)</label>
        <textarea value={traderText} onChange={(e)=>setTraderText(e.target.value)} rows={3} className="field-input resize-none mb-2" placeholder="Paste WhatsApp message or trader note here..." />
        <div className="flex items-center gap-2">
          <button onClick={handleParseTrader} disabled={parsing||!traderText.trim()} className="px-3 py-1.5 md:py-1 bg-black text-white text-[11px] font-medium cursor-default disabled:opacity-50 min-h-[36px]">{parsing?"Parsing...":"Auto-fill from text"}</button>
          {parseError&&<span className="text-[10px] text-red-600">{parseError}</span>}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-[11px] font-medium mb-1">Stone Type</label>
          <div className="flex gap-2">
            <button type="button" onClick={()=>setStoneType("rough")} className={`px-3 py-1.5 md:py-1 text-[11px] cursor-default min-h-[36px] ${stoneType==="rough"?"bg-black text-white font-medium":"border border-border bg-white"}`}>Rough</button>
            <button type="button" onClick={()=>setStoneType("polished")} className={`px-3 py-1.5 md:py-1 text-[11px] cursor-default min-h-[36px] ${stoneType==="polished"?"bg-black text-white font-medium":"border border-border bg-white"}`}>Polished</button>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium mb-1">Photo (actual stone only)</label>
          <input name="photo" className="field-input min-h-[40px]" placeholder="Upload or paste URL of actual stone photo" />
          <p className="text-[9px] text-muted mt-0.5">Only photos of the actual stone will be published. Otherwise, a placeholder is shown.</p>
        </div>
        {stoneType==="rough"?(
          <>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-[11px] font-medium mb-1">Carat</label><input name="carat" type="number" step="0.01" min="0.01" required className="field-input min-h-[40px]" /></div>
              <div><label className="block text-[11px] font-medium mb-1">Color</label><input name="color" required className="field-input min-h-[40px]" placeholder="e.g. Near colourless" /></div>
            </div>
            <div><label className="block text-[11px] font-medium mb-1">Category</label><select name="category" required className="field-input min-h-[40px]" defaultValue=""><option value="" disabled>Select...</option><option>Sawable</option><option>Makeable</option><option>Near-gem</option><option>Industrial</option></select></div>
            <div><label className="block text-[11px] font-medium mb-1">Crystal Form</label><select name="crystal_form" required className="field-input min-h-[40px]" defaultValue=""><option value="" disabled>Select...</option><option>Octahedron</option><option>Macle</option><option>Irregular</option></select></div>
            <div><label className="block text-[11px] font-medium mb-1">Clarity Notes</label><input name="clarity_notes" className="field-input min-h-[40px]" placeholder="e.g. Clean, minimal inclusions" /></div>
            <div><label className="block text-[11px] font-medium mb-1">KP Status</label><select name="kp_status" className="field-input min-h-[40px]" defaultValue="false"><option value="false">Not certified</option><option value="true">KP cert on file</option></select></div>
          </>
        ):(
          <>
            <div><label className="block text-[11px] font-medium mb-1">Shape</label><select name="shape" required className="field-input min-h-[40px]" defaultValue=""><option value="" disabled>Select...</option><option>Round Brilliant</option><option>Princess</option><option>Oval</option><option>Emerald</option><option>Cushion</option><option>Marquise</option><option>Pear</option><option>Heart</option></select></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-[11px] font-medium mb-1">Carat</label><input name="carat" type="number" step="0.01" min="0.01" required className="field-input min-h-[40px]" /></div>
              <div><label className="block text-[11px] font-medium mb-1">Color</label><select name="color" required className="field-input min-h-[40px]" defaultValue=""><option value="" disabled>Select...</option>{["D","E","F","G","H","I","J","K","L","M"].map((c)=><option key={c}>{c}</option>)}</select></div>
              <div><label className="block text-[11px] font-medium mb-1">Clarity</label><select name="clarity" required className="field-input min-h-[40px]" defaultValue=""><option value="" disabled>Select...</option><option>FL</option><option>IF</option><option>VVS1</option><option>VVS2</option><option>VS1</option><option>VS2</option><option>SI1</option><option>SI2</option><option>I1</option><option>I2</option><option>I3</option></select></div>
              <div><label className="block text-[11px] font-medium mb-1">Cut</label><select name="cut" required className="field-input min-h-[40px]" defaultValue=""><option value="" disabled>Select...</option><option>Excellent</option><option>Very Good</option><option>Good</option><option>Fair</option><option>Poor</option></select></div>
            </div>
            <div><label className="block text-[11px] font-medium mb-1">Certification</label><select name="certification" required className="field-input min-h-[40px]" defaultValue=""><option value="" disabled>Select...</option><option>GIA</option><option>IGI</option><option>HRD</option><option>None</option></select></div>
            <div><label className="block text-[11px] font-medium mb-1">Price (USD)</label><input name="price" type="number" min="0" className="field-input min-h-[40px]" placeholder="Optional" /></div>
          </>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-[11px] font-medium mb-1">Status</label><select name="status" required className="field-input min-h-[40px]" defaultValue="Available"><option>Available</option><option>Reserved</option><option>Sold</option></select></div>
          <div><label className="block text-[11px] font-medium mb-1">Source</label><select name="source" required className="field-input min-h-[40px]" value={source} onChange={(e)=>setSource(e.target.value as "Own stock"|"Consigned")}><option>Own stock</option><option>Consigned</option></select></div>
        </div>
        {source==="Consigned"&&(
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-[11px] font-medium mb-1">Trader Name</label><input name="traderName" required className="field-input min-h-[40px]" /></div>
            <div><label className="block text-[11px] font-medium mb-1">Trader WhatsApp</label><input name="traderWhatsapp" required className="field-input min-h-[40px]" placeholder="+267..." /></div>
            <div><label className="block text-[11px] font-medium mb-1">Trader Licence No.</label><input name="traderLicence" required className="field-input min-h-[40px]" /></div>
            <div><label className="block text-[11px] font-medium mb-1">Commission (%)</label><input name="commission" type="number" min="0" max="100" step="0.5" required className="field-input min-h-[40px]" defaultValue="10" /></div>
          </div>
        )}
        {source==="Own stock"&&<input type="hidden" name="traderName" value="" />}
        <button type="submit" className="w-full py-2 bg-black text-white text-[13px] font-medium cursor-default mt-1 min-h-[40px]">Save Stone</button>
      </form>
    </div>
  );
}

/* ═══════ PASTE-IN TAB ═══════ */

function PasteInTab() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [source, setSource] = useState<string>("Own stock");
  const [stockText, setStockText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ stones: any[]; skipped: string[] } | null>(null);
  const [edits, setEdits] = useState<Record<number, any>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<string[] | null>(null);

  useEffect(() => {
    fetch("/api/traders").then(r => r.json()).then(d => setTraders(d)).catch(() => {});
  }, []);

  const selectedTrader = traders.find(t => String(t.id) === source);
  const needsLicence = source !== "Own stock" && selectedTrader && !selectedTrader.licence;
  const canPublish = !needsLicence && !publishing && parsed?.stones.some((_, i) => checked[i] !== false);

  async function handleParse() {
    if (!stockText.trim()) return;
    setParsing(true); setParseError(null); setParsed(null); setEdits({}); setChecked({}); setPublished(null);
    try {
      const res = await fetch("/api/ai/parse-stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: stockText }) });
      if (!res.ok) throw new Error("Parse failed");
      const data = await res.json();
      setParsed(data);
      // Default all checked
      const c: Record<number, boolean> = {};
      data.stones.forEach((_: any, i: number) => { c[i] = true; });
      setChecked(c);
    } catch (e: any) { setParseError(e.message); } finally { setParsing(false); }
  }

  function updateEdit(idx: number, field: string, value: any) {
    setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], [field]: value } }));
  }

  function getStone(idx: number) {
    const base = parsed?.stones[idx] || {};
    return { ...base, ...(edits[idx] || {}) };
  }

  async function handlePublish() {
    if (!parsed || !canPublish) return;
    setPublishing(true);
    const published: string[] = [];
    for (let i = 0; i < parsed.stones.length; i++) {
      if (checked[i] === false) continue;
      const s = getStone(i);
      const isRough = s.type === "rough";
      const payload: Record<string, string> = {
        stone_type: s.type || "polished",
        shape: isRough ? (s.shape_or_form || "") : (s.shape_or_form || "Round Brilliant"),
        carat: String(s.carat || 0),
        color: s.color || "",
        clarity: s.clarity || "",
        cut: isRough ? "" : (s.notes || ""),
        certification: s.certification || "None",
        category: isRough ? (s.category || "") : "",
        crystal_form: isRough ? (s.shape_or_form || "") : "",
        clarity_notes: isRough ? (s.clarity || "") : "",
        kp_status: isRough ? "true" : "false",
        price: s.price != null ? String(s.price) : "",
        status: "Available",
        photo: "",
        source: source === "Own stock" ? "Own stock" : "Consigned",
        traderName: selectedTrader?.name || "",
        traderWhatsapp: selectedTrader?.whatsapp || "",
        traderLicence: selectedTrader?.licence || "",
        commission: "0",
      };
      try {
        const res = await fetch("/api/stones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.ok) { const d = await res.json(); published.push(d.ref); }
      } catch { /* skip */ }
    }
    setPublishing(false);
    setPublished(published);
  }

  return (
    <div className="px-4 md:px-6 py-4 max-w-3xl mx-auto w-full flex flex-col gap-4">
      {/* Source selector */}
      <div>
        <label className="block text-[11px] font-medium mb-1">Source</label>
        <select value={source} onChange={e => setSource(e.target.value)} className="field-input min-h-[40px]">
          <option value="Own stock">Own stock</option>
          {traders.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
        </select>
      </div>

      {/* Guardrail */}
      {needsLicence && (
        <div className="border border-red-300 bg-red-50 p-3 text-[11px] text-red-700">
          Add this trader's licence number in the Traders tab first.
        </div>
      )}

      {/* Textarea */}
      <div>
        <label className="block text-[11px] font-medium mb-1">Paste stock text</label>
        <textarea value={stockText} onChange={e => setStockText(e.target.value)} rows={10} className="field-input resize-y min-h-[120px]" placeholder="Paste WhatsApp messages, spreadsheets, or any stone listing text here..." />
      </div>

      {/* Parse button */}
      <button onClick={handleParse} disabled={parsing || !stockText.trim()} className="w-full py-2 bg-black text-white text-[13px] font-medium cursor-default disabled:opacity-50 min-h-[40px]">
        {parsing ? "Parsing..." : "Parse"}
      </button>

      {parseError && <div className="border border-red-300 bg-red-50 p-3 text-[11px] text-red-700">{parseError}</div>}

      {/* Parsed results */}
      {parsed && (
        <div className="space-y-3">
          <div className="text-[11px] text-muted font-mono">{parsed.stones.length} stones parsed, {parsed.skipped.length} lines skipped</div>

          {/* Stone cards */}
          {parsed.stones.map((_: any, i: number) => {
            const s = getStone(i);
            const isRough = s.type === "rough";
            return (
              <div key={i} className="border border-border p-3">
                <label className="flex items-start gap-2 cursor-default">
                  <input type="checkbox" checked={checked[i] !== false} onChange={e => setChecked(prev => ({ ...prev, [i]: e.target.checked }))} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">{s.type}</span>
                      <span className="text-[10px] font-mono">{i + 1}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <label className="text-muted text-[10px]">{isRough ? "Crystal Form" : "Shape"}</label>
                        <input value={s.shape_or_form || ""} onChange={e => updateEdit(i, "shape_or_form", e.target.value)} className="field-input min-h-[32px] text-[11px]" />
                      </div>
                      <div>
                        <label className="text-muted text-[10px]">Carat</label>
                        <input type="number" step="0.01" value={s.carat || ""} onChange={e => updateEdit(i, "carat", parseFloat(e.target.value) || 0)} className="field-input min-h-[32px] text-[11px]" />
                      </div>
                      <div>
                        <label className="text-muted text-[10px]">Color</label>
                        <input value={s.color || ""} onChange={e => updateEdit(i, "color", e.target.value)} className="field-input min-h-[32px] text-[11px]" />
                      </div>
                      <div>
                        <label className="text-muted text-[10px]">Clarity</label>
                        <input value={s.clarity || ""} onChange={e => updateEdit(i, "clarity", e.target.value)} className="field-input min-h-[32px] text-[11px]" />
                      </div>
                      <div>
                        <label className="text-muted text-[10px]">Certification</label>
                        <input value={s.certification || ""} onChange={e => updateEdit(i, "certification", e.target.value)} className="field-input min-h-[32px] text-[11px]" />
                      </div>
                      <div>
                        <label className="text-muted text-[10px]">Price</label>
                        <input type="number" value={s.price ?? ""} onChange={e => updateEdit(i, "price", e.target.value === "" ? null : parseFloat(e.target.value))} className="field-input min-h-[32px] text-[11px]" placeholder="null" />
                      </div>
                      {isRough && (
                        <div>
                          <label className="text-muted text-[10px]">Category</label>
                          <select value={s.category || ""} onChange={e => updateEdit(i, "category", e.target.value)} className="field-input min-h-[32px] text-[11px]">
                            <option value="">Select...</option>
                            <option>Sawable</option><option>Makeable</option><option>Near-gem</option><option>Industrial</option>
                          </select>
                        </div>
                      )}
                    </div>
                    {s.notes && <div className="text-[10px] text-muted mt-1">Notes: {s.notes}</div>}
                  </div>
                </label>
              </div>
            );
          })}

          {/* Skipped lines */}
          {parsed.skipped.length > 0 && (
            <div className="border border-border p-3 bg-surface">
              <div className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Skipped lines</div>
              <pre className="font-mono text-[10px] whitespace-pre-wrap text-muted">{parsed.skipped.join("\n")}</pre>
            </div>
          )}

          {/* Publish */}
          {published ? (
            <div className="border border-green-300 bg-green-50 p-3 text-[11px]">
              <p className="font-bold mb-1">Published {published.length} stones: {published.join(", ")}</p>
              <p>They are now visible on the <a href="/" className="underline">public stock page</a>.</p>
            </div>
          ) : (
            <button onClick={handlePublish} disabled={!canPublish} className="w-full py-2 bg-black text-white text-[13px] font-medium cursor-default disabled:opacity-50 min-h-[40px]">
              {publishing ? "Publishing..." : "Publish selected"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════ TRADERS TAB ═══════ */

function TradersTab() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try { const res = await fetch("/api/traders"); if(res.ok) setTraders(await res.json()); }
    catch {/* */} finally { setLoading(false); }
  }, []);
  useEffect(()=>{fetchData();},[fetchData]);

  if(loading) return <div className="px-4 md:px-6 py-10 text-[12px] text-muted">Loading...</div>;
  if(traders.length===0) return <div className="px-4 md:px-6 py-10 text-[12px] text-muted">No traders yet. Traders are added automatically when you save a consigned stone.</div>;

  return (
    <div className="px-4 md:px-6 py-4 max-w-5xl mx-auto w-full">
      <div className="hidden md:block border border-border">
        <table className="w-full text-[12px]">
          <thead><tr className="text-left border-b border-border bg-surface">
            <th className="px-3 py-1.5 font-semibold text-muted">Name</th>
            <th className="px-3 py-1.5 font-semibold text-muted">WhatsApp</th>
            <th className="px-3 py-1.5 font-semibold text-muted">Licence</th>
            <th className="px-3 py-1.5 font-semibold text-muted text-right">Created</th>
          </tr></thead>
          <tbody>
            {traders.map((t)=>(
              <tr key={t.id} className="border-b border-border/60">
                <td className="px-3 py-1.5 font-medium">{t.name}</td>
                <td className="px-3 py-1.5 font-mono">{t.whatsapp||"\u2014"}</td>
                <td className="px-3 py-1.5 font-mono">{t.licence||"\u2014"}</td>
                <td className="px-3 py-1.5 font-mono text-muted text-right">{t.created_at.split("T")[0]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden space-y-3">
        {traders.map((t)=>(
          <div key={t.id} className="border border-border p-3">
            <div className="text-[12px] font-medium">{t.name}</div>
            <div className="text-[10px] text-muted mt-1">
              {t.whatsapp&&<div>WhatsApp: {t.whatsapp}</div>}
              {t.licence&&<div>Licence: {t.licence}</div>}
              <div>Added: {t.created_at.split("T")[0]}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
