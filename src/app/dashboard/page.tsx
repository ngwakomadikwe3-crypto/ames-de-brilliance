"use client";

import React from "react";
import { useEffect, useState, useCallback, useRef } from "react";
import { BrandMark } from "@/components/BrandMark";

interface Request {
  id: string; date: string; company: string; country: string; buyerName: string;
  contact: string; type: string; shape: string; caratMin: string; caratMax: string;
  color: string; clarity: string; certification: string; notes: string;
  mandate: string; status: "New" | "Sourcing" | "Quoted" | "Closed";
  offer_text?: string; offer_timestamp?: string;
}

interface Stone {  id: string; ref: string; stone_type: string; shape: string; carat: number; color: string; clarity: string;
  cut: string; certification: string; category: string; crystal_form: string; clarity_notes: string;
  kp_status: number; price: number | null; status: "Pending" | "Available" | "Reserved" | "Sold" | "Rejected"; photo: string; source: "Own stock" | "Consigned";
  listing_category: string;
  trader_name?: string; trader_whatsapp?: string; trader_licence?: string;
  trader_id: number | null; commission: number; sale_price: number | null;
}

interface Trader {
  id: number; name: string; whatsapp: string; licence: string;
  portal_code: string; email: string; status: "Pending" | "Active" | "Declined";
  company: string; country: string; licence_photo: string;
  created_at: string; preferred?: boolean;
  stone_count?: number; sales_count?: number;
}

type Tab = "requests" | "stones" | "orders" | "addstone" | "pastein" | "traders" | "videos" | "models" | "intelligence" | "billing";

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
  const [role, setRole] = useState<string | null>(null);
  const [orderCount, setOrderCount] = useState<number>(0);

  const refreshOrderCount = useCallback(() => {
    fetch("/api/orders").then(r => r.ok ? r.json() : []).then((orders: any[]) => setOrderCount(orders.length)).catch(() => {});
  }, []);

  useEffect(() => { refreshOrderCount(); fetch("/api/staff").then(r => r.ok ? r.json() : {role:"owner"} as any).then((d:any) => setRole(d.role || "owner")).catch(() => setRole("owner")); }, [refreshOrderCount]);

  function switchTab(t: Tab) {
    setTab(t);
    refreshOrderCount();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="min-h-full flex flex-col">
      <div className="px-4 md:px-6 pt-3 pb-0 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-3">
          <BrandMark variant="full" height={28} />
          <button onClick={handleLogout} className="text-[10px] text-muted hover:text-[#171717] whitespace-nowrap pb-2 cursor-default shrink-0">Logout</button>
        </div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-4 text-[12px] font-medium border-b border-border overflow-x-auto">
            {((role === "cousin" ? [["requests","Requests"],["stones","Stones"],["orders","Orders", orderCount]] : [["requests","Requests"],["stones","Stones"],["orders","Orders", orderCount],["addstone","Add Stone"],["pastein","Paste-in"],["traders","Traders"],["videos","Videos"],["models","Models"],["intelligence","Intelligence"],["billing","Billing"]]) as [Tab,string,number?][]).map(([t,label,badge]) => (
              <button key={t} onClick={() => switchTab(t)} className={`pb-2 whitespace-nowrap cursor-default inline-flex items-center gap-1.5 ${tab===t?"border-b border-[#1A1A1A] text-[#171717]":"text-muted"}`}>{label}{typeof badge === "number" && badge > 0 && <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold bg-[#A6A6AB] text-[#EAE8E4] rounded-full leading-none">{badge}</span>}</button>
            ))}
          </div>
          <button onClick={handleLogout} className="text-[10px] text-muted hover:text-[#171717] whitespace-nowrap ml-3 pb-2 cursor-default shrink-0">Logout</button>
        </div>
      </div>
      <div className="flex-1">
        {tab==="requests" && <RequestsTab />}
        {tab==="stones" && <StonesTab />}
        {tab==="orders" && <OrdersTab />}
        {tab==="addstone" && <AddStoneTab />}
        {tab==="pastein" && <PasteInTab />}
        {tab==="traders" && <TradersTab />}
        {tab==="videos" && <VideosTab />}
        {tab==="models" && <ModelsTab />}
        {tab==="intelligence" && <IntelligenceTab />}
        {tab==="billing" && <BillingTab />}
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
    switch (s) { case "New": return "bg-blue-600 text-white"; case "Sourcing": return "bg-yellow-500 text-white"; case "Quoted": return "bg-green-700 text-white"; case "Closed": return "bg-[#6E6C69] text-white"; default: return "bg-[#1a1c1e] text-[#171717]"; }
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
            <th className="px-3 py-1.5 font-medium text-muted w-24">Date</th>
            <th className="px-3 py-1.5 font-medium text-muted">Buyer</th>
            <th className="px-3 py-1.5 font-medium text-muted">Request</th>
            <th className="px-3 py-1.5 font-medium text-muted w-32">Status</th>
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
      <pre className="font-mono text-[10px] leading-relaxed whitespace-pre-wrap bg-[#FCFCFB] border border-border p-2 mt-2 select-all">{r.mandate}</pre>
      <div className="flex gap-2 flex-wrap">
        <button onClick={()=>handleCopy(buildReqWA(r),r.id)} className="px-3 py-1.5 md:py-1 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] font-medium cursor-default min-h-[36px]">{copiedId===r.id?"Copied":"Copy WhatsApp"}</button>
        <button onClick={()=>handleParseAI(r)} disabled={ai?.parsing} className="px-3 py-1.5 md:py-1 border border-border text-[11px] cursor-default disabled:opacity-50 min-h-[36px]">{ai?.parsing?"Parsing...":"Parse AI"}</button>
        <button onClick={()=>handleDraftReply(r)} disabled={ai?.drafting} className="px-3 py-1.5 md:py-1 border border-border text-[11px] cursor-default disabled:opacity-50 min-h-[36px]">{ai?.drafting?"Drafting...":"Draft reply"}</button>
        {ai?.draft&&<button onClick={()=>handleCopy(ai.draft,"draft-"+r.id)} className="px-3 py-1.5 md:py-1 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] font-medium cursor-default min-h-[36px]">{copiedId==="draft-"+r.id?"Copied":"Copy draft"}</button>}
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
            <pre className="font-mono text-[10px] whitespace-pre-wrap bg-[#FCFCFB] border border-border p-2 select-all">{r.offer_text}</pre>
            <button onClick={()=>handleCopy(r.offer_text||"","offer-"+r.id)} className="mt-1 px-3 py-1.5 md:py-1 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] font-medium cursor-default min-h-[36px]">{copiedId==="offer-"+r.id?"Copied":"Copy offer"}</button>
          </div>
        ) : (
          <div>
            <button onClick={()=>handleGenerateOffer(r)} disabled={offer?.generating} className="px-3 py-1.5 md:py-1 border border-border text-[11px] cursor-default disabled:opacity-50 min-h-[36px]">
              {offer?.generating?"Generating...":"Generate offer"}
            </button>
            {offer?.error&&<span className="text-[10px] text-red-600 ml-2">{offer.error}</span>}
            {offer?.text&&(
              <div className="mt-2">
                <textarea value={offer.text} onChange={(e)=>setOffer(r.id,{text:e.target.value})} rows={12} className="w-full font-mono text-[10px] leading-relaxed border border-border p-2 bg-[#FCFCFB] resize-y" />
                <div className="flex gap-2 mt-2 flex-wrap">
                  <button onClick={()=>handleCopyOffer(offer.text||"",r.id)} className="px-3 py-1.5 md:py-1 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] font-medium cursor-default min-h-[36px]">
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
  const [statusFilter, setStatusFilter] = useState<"All"|"Pending"|"Available"|"Reserved"|"Sold"|"Rejected">("All");
  const [approveModal, setApproveModal] = useState<Stone | null>(null);
  const [rejectModal, setRejectModal] = useState<Stone | null>(null);
  const [whatsAppMsg, setWhatsAppMsg] = useState<string | null>(null);
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
    switch(s){case"Pending":return"bg-yellow-500 text-white";case"Available":return"bg-green-700 text-white";case"Reserved":return"bg-blue-600 text-white";case"Sold":return"bg-[#6E6C69] text-white";case"Rejected":return"bg-red-600 text-white";default:return"bg-[#1a1c1e] text-[#171717]";}
  }

  async function handleApprove(s: Stone, edits: any) {
    await fetch("/api/stones/approve", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ id: s.id, action: "approve", edits }) });
    setStones(prev => prev.map(st => st.id===s.id ? {...st, status: "Available" as const, ...edits} : st));
    setApproveModal(null);
    buildWhatsAppUpdate(s, "Live");
  }

  async function handleReject(s: Stone, reason: string) {
    await fetch("/api/stones/approve", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ id: s.id, action: "reject", reason }) });
    setStones(prev => prev.map(st => st.id===s.id ? {...st, status: "Rejected" as const} : st));
    setRejectModal(null);
  }

  function buildWhatsAppUpdate(s: Stone, newStatus: string) {
    const tName = s.trader_name || "Trader";
    const specs = s.shape + " " + s.carat + "ct " + s.color;
    const msg = tName + ", your item " + s.ref + " " + specs + " is now " + newStatus + " on AMES DE BRILLIANTE.";
    navigator.clipboard.writeText(msg).catch(() => {});
    setWhatsAppMsg(s.ref + ": copied!"); setTimeout(() => setWhatsAppMsg(null), 2000);
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
          <button onClick={()=>setShowFilters(!showFilters)} className={`px-2 py-1 text-[10px] whitespace-nowrap cursor-default min-h-[36px] ${showFilters?"bg-[#A6A6AB] text-[#EAE8E4]":"border border-border text-muted"}`}>{showFilters?"Hide filters":"Filters"}</button>
          <button onClick={() => {
            const headers = ['Ref','Type','Specs','Color','Clarity','Cut','Cert','Category','Crystal','KP','Price','Status','Source','Trader','Commission%'];
            const rows = filtered.map(s => [s.ref, s.stone_type, specs(s), s.color, s.clarity, s.cut||'', s.certification||'', s.category||'', s.crystal_form||'', s.kp_status?'Yes':'No', s.price||'—', s.status, s.source, s.trader_name||'', s.commission]);
            downloadCSV('stones-' + new Date().toISOString().slice(0,10) + '.csv', headers, rows);
          }} className="px-2 py-1 border border-border text-[10px] text-muted hover:bg-surface cursor-default min-h-[36px]">Export</button>
        </div>
        {/* Source pills — always visible */}
        <div className="flex gap-1 text-[11px] overflow-x-auto">
          {(["All","Own stock","Consigned"] as const).map((f)=>(
            <button key={f} onClick={()=>setFilter(f)} className={`px-2 py-0.5 whitespace-nowrap cursor-default ${filter===f?"bg-[#A6A6AB] text-[#EAE8E4] font-medium":"border border-border bg-[#FCFCFB]"}`}>{f}</button>
          ))}
        </div>
        {/* Advanced filters — toggleable */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted">Type:</span>
              <select value={typeFilter} onChange={(e)=>setTypeFilter(e.target.value as any)} className="text-[10px] border border-border px-1 py-0.5 bg-[#FCFCFB] cursor-default">
                <option value="All">All</option><option value="rough">Rough</option><option value="polished">Polished</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted">Status:</span>
              <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value as any)} className="text-[10px] border border-border px-1 py-0.5 bg-[#FCFCFB] cursor-default">
                <option value="All">All</option><option value="Pending">Pending</option><option value="Available">Available</option><option value="Reserved">Reserved</option><option value="Sold">Sold</option><option value="Rejected">Rejected</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted">Cert:</span>
              <select value={certFilter} onChange={(e)=>setCertFilter(e.target.value as any)} className="text-[10px] border border-border px-1 py-0.5 bg-[#FCFCFB] cursor-default">
                <option value="All">All</option><option value="GIA">GIA</option><option value="IGI">IGI</option><option value="HRD">HRD</option><option value="None">None</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted">Sort:</span>
              <select value={sort} onChange={(e)=>setSort(e.target.value as any)} className="text-[10px] border border-border px-1 py-0.5 bg-[#FCFCFB] cursor-default">
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
            <th className="px-3 py-1.5 font-medium text-muted">Ref</th>
            <th className="px-3 py-1.5 font-medium text-muted">Specs</th>
            <th className="px-3 py-1.5 font-medium text-muted">Source</th>
            <th className="px-3 py-1.5 font-medium text-muted">Trader</th>
            <th className="px-3 py-1.5 font-medium text-muted text-right">Price</th>
            <th className="px-3 py-1.5 font-medium text-muted w-32">Status</th>
          </tr></thead>
          <tbody>
            {filtered.map((s)=>(
              <tr key={s.id} className="border-b border-border/60 hover:bg-surface/60">
                <td className="px-3 py-1.5 font-mono font-medium">{s.ref}</td>
                <td className="px-3 py-1.5 font-mono">{specs(s)}</td>
                <td className="px-3 py-1.5">{s.source}</td>
                <td className="px-3 py-1.5 text-muted">{s.source==="Consigned"?s.trader_name:"\u2014"}</td>
                <td className="px-3 py-1.5 text-right font-mono">{s.price?"$"+s.price.toLocaleString():"\u2014"}</td>                <td className="px-3 py-1.5">
                  {s.status === "Pending" ? (
                    <div className="flex gap-1">
                      <button onClick={()=>setApproveModal(s)} className="text-[9px] px-1.5 py-0.5 bg-green-700 text-white cursor-default">Approve</button>
                      <button onClick={()=>setRejectModal(s)} className="text-[9px] px-1.5 py-0.5 bg-red-600 text-white cursor-default">Reject</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <select value={s.status} onChange={(e)=>{if(e.target.value==="Sold"&&s.source==="Consigned"){setSaleModal({stone:s});}else{handleStatusChange(s.id,e.target.value);}}} className={"text-[10px] font-semibold uppercase px-1.5 py-0.5 cursor-default "+statusColor(s.status)+" border-0 outline-none"}>
                        <option>Available</option><option>Reserved</option><option>Sold</option>
                      </select>
                      {s.trader_name && (
                        <button onClick={()=>buildWhatsAppUpdate(s, s.status)} title="Copy WhatsApp update" className="text-[9px] px-1 py-0.5 border border-border hover:bg-surface cursor-default">WA</button>
                      )}
                    </div>
                  )}
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
              {s.status === "Pending" ? (
                <div className="flex gap-1">
                  <button onClick={()=>setApproveModal(s)} className="text-[9px] px-1.5 py-0.5 bg-green-700 text-white cursor-default">Approve</button>
                  <button onClick={()=>setRejectModal(s)} className="text-[9px] px-1.5 py-0.5 bg-red-600 text-white cursor-default">Reject</button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <select value={s.status} onChange={(e)=>{if(e.target.value==="Sold"&&s.source==="Consigned"){setSaleModal({stone:s});}else{handleStatusChange(s.id,e.target.value);}}} className={"text-[10px] font-semibold uppercase px-1.5 py-0.5 cursor-default "+statusColor(s.status)+" border-0 outline-none"}>
                    <option>Available</option><option>Reserved</option><option>Sold</option>
                  </select>
                  {s.trader_name && (
                    <button onClick={()=>buildWhatsAppUpdate(s, s.status)} title="Copy WhatsApp update" className="text-[9px] px-1 py-0.5 border border-border hover:bg-surface cursor-default">WA</button>
                  )}
                </div>
              )}
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
      {approveModal && <ApproveModal stone={approveModal} onApprove={(edits)=>handleApprove(approveModal,edits)} onCancel={()=>setApproveModal(null)} />}
      {rejectModal && <RejectModal stone={rejectModal} onReject={(reason)=>handleReject(rejectModal,reason)} onCancel={()=>setRejectModal(null)} />}
      {whatsAppMsg && <div className="fixed bottom-4 right-4 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] px-3 py-2 rounded z-50">{whatsAppMsg}</div>}
    </div>
  );
}

function SaleModal({ stone, onConfirm, onCancel }: { stone: Stone; onConfirm: (price: number) => void; onCancel: () => void }) {
  const [price, setPrice] = useState("");
  function handleSubmit() { const p = parseFloat(price); if(!isNaN(p)&&p>0) onConfirm(p); }
  const saleNum = parseFloat(price)||0;
  const commissionAmt = (saleNum*stone.commission)/100;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#FCFCFB] border border-border p-5 w-full max-w-md text-[12px]">
        <h3 className="font-medium mb-3">Record Sale {"\u2014"} {stone.ref}</h3>
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
          <button onClick={handleSubmit} disabled={!saleNum} className="px-3 py-1.5 md:py-1 bg-[#A6A6AB] text-[#EAE8E4] font-medium cursor-default disabled:opacity-30 min-h-[40px]">Confirm Sale</button>
        </div>
      </div>
    </div>
  );
}

function ApproveModal({ stone, onApprove, onCancel }: { stone: Stone; onApprove: (edits: any) => void; onCancel: () => void }) {
  const [shape, setShape] = useState(stone.shape);
  const [carat, setCarat] = useState(String(stone.carat));
  const [color, setColor] = useState(stone.color);
  const [clarity, setClarity] = useState(stone.clarity);
  const [cert, setCert] = useState(stone.certification);
  const [price, setPrice] = useState(stone.price ? String(stone.price) : "");
  const [lc, setLc] = useState(stone.listing_category);
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#FCFCFB] border border-border p-5 w-full max-w-md text-[12px]">
        <h3 className="font-medium mb-3">Approve {stone.ref}</h3>
        <div className="space-y-3">
          <div><label className="block text-[10px] uppercase tracking-wider font-medium text-muted mb-1">Shape</label><input value={shape} onChange={e=>setShape(e.target.value)} className="field-input min-h-[36px]" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[10px] uppercase tracking-wider font-medium text-muted mb-1">Carat</label><input value={carat} onChange={e=>setCarat(e.target.value)} type="number" step="0.01" className="field-input min-h-[36px]" /></div>
            <div><label className="block text-[10px] uppercase tracking-wider font-medium text-muted mb-1">Color</label><input value={color} onChange={e=>setColor(e.target.value)} className="field-input min-h-[36px]" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[10px] uppercase tracking-wider font-medium text-muted mb-1">Clarity</label><input value={clarity} onChange={e=>setClarity(e.target.value)} className="field-input min-h-[36px]" /></div>
            <div><label className="block text-[10px] uppercase tracking-wider font-medium text-muted mb-1">Certification</label><input value={cert} onChange={e=>setCert(e.target.value)} className="field-input min-h-[36px]" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[10px] uppercase tracking-wider font-medium text-muted mb-1">Price (USD)</label><input value={price} onChange={e=>setPrice(e.target.value)} type="number" className="field-input min-h-[36px]" placeholder="Optional" /></div>
            <div><label className="block text-[10px] uppercase tracking-wider font-medium text-muted mb-1">Listing</label>
              <select value={lc} onChange={e=>setLc(e.target.value)} className="field-input min-h-[36px]"><option>Rough</option><option>Polished</option><option>Jewelry</option></select></div>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onCancel} className="px-3 py-1.5 border border-border cursor-default min-h-[36px]">Cancel</button>
          <button onClick={()=>onApprove({shape, carat:parseFloat(carat)||0, color, clarity, certification:cert, price:price?Number(price):null, listing_category:lc})} className="px-3 py-1.5 bg-green-700 text-white font-medium cursor-default min-h-[36px]">Approve &amp; Publish</button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ stone, onReject, onCancel }: { stone: Stone; onReject: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#FCFCFB] border border-border p-5 w-full max-w-md text-[12px]">
        <h3 className="font-medium mb-3">Reject {stone.ref}</h3>
        <div><label className="block text-[10px] uppercase tracking-wider font-medium text-muted mb-1">Reason (optional)</label>
          <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} className="field-input resize-none" placeholder="Why is this being rejected?" /></div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onCancel} className="px-3 py-1.5 border border-border cursor-default min-h-[36px]">Cancel</button>
          <button onClick={()=>onReject(reason)} className="px-3 py-1.5 bg-red-600 text-white font-medium cursor-default min-h-[36px]">Reject</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════ ADD STONE TAB ═══════ */

function AddStoneTab() {
  const [saved, setSaved] = useState<{ref:string}|null>(null);
  const [stoneType, setStoneType] = useState<"rough"|"polished">("polished");
  const [listingCategory, setListingCategory] = useState<"Rough"|"Polished"|"Jewelry">("Polished");
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
    fd.set("listing_category",listingCategory);
    const res=await fetch("/api/stones",{method:"POST",body:fd});
    if(res.ok){const data=await res.json();setSaved({ref:data.ref});form.reset();setSource("Own stock");setStoneType("polished");setListingCategory("Polished");}
  }

  if(saved) return <div className="px-4 md:px-6 py-10 max-w-lg mx-auto w-full"><p className="text-[13px] mb-2">Stone <strong>{saved.ref}</strong> added. Visible on the <a href="/" className="underline">public stock page</a>.</p><button onClick={()=>setSaved(null)} className="text-[12px] underline text-muted">Add another</button></div>;

  return (
    <div className="px-4 md:px-6 py-6 max-w-lg mx-auto w-full flex flex-col gap-4">
      <div className="border border-border p-3 bg-surface">
        <label className="block text-[11px] font-medium mb-1">Paste trader text (auto-fill with AI)</label>
        <textarea value={traderText} onChange={(e)=>setTraderText(e.target.value)} rows={3} className="field-input resize-none mb-2" placeholder="Paste WhatsApp message or trader note here..." />
        <div className="flex items-center gap-2">
          <button onClick={handleParseTrader} disabled={parsing||!traderText.trim()} className="px-3 py-1.5 md:py-1 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] font-medium cursor-default disabled:opacity-50 min-h-[36px]">{parsing?"Parsing...":"Auto-fill from text"}</button>
          {parseError&&<span className="text-[10px] text-red-600">{parseError}</span>}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-[11px] font-medium mb-1">Stone Type</label>
          <div className="flex gap-2">
            <button type="button" onClick={()=>{setStoneType("rough");setListingCategory("Rough");}} className={`px-3 py-1.5 md:py-1 text-[11px] cursor-default min-h-[36px] ${stoneType==="rough"?"bg-[#A6A6AB] text-[#EAE8E4] font-medium":"border border-border bg-[#FCFCFB]"}`}>Rough</button>
            <button type="button" onClick={()=>{setStoneType("polished");if(listingCategory==="Rough")setListingCategory("Polished");}} className={`px-3 py-1.5 md:py-1 text-[11px] cursor-default min-h-[36px] ${stoneType==="polished"?"bg-[#A6A6AB] text-[#EAE8E4] font-medium":"border border-border bg-[#FCFCFB]"}`}>Polished</button>
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
          <div><label className="block text-[11px] font-medium mb-1">Source</label><select name="source" required className="field-input min-h-[40px]" value={source} onChange={(e)=>setSource(e.target.value as "Own stock"|"Consigned")}><option>Own stock</option><option>Consigned</option></select>          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium mb-1">Listing Category</label>
          <select name="listing_category" required className="field-input min-h-[40px]" value={listingCategory} onChange={(e)=>setListingCategory(e.target.value as "Rough"|"Polished"|"Jewelry")}>
            <option value="Rough">Rough — website only</option>
            <option value="Polished">Polished — store + website</option>
            <option value="Jewelry">Jewelry — store + website</option>
          </select>
          <p className="text-[9px] text-muted mt-0.5">Rough items appear only on the sourcing site. Polished &amp; Jewelry appear in the /app store.</p>
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
        <button type="submit" className="w-full py-2 bg-[#A6A6AB] text-[#EAE8E4] text-[13px] font-medium cursor-default mt-1 min-h-[40px]">Save Stone</button>
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
  const [listingCategory, setListingCategory] = useState<"Rough"|"Polished"|"Jewelry">("Polished");
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
        listing_category: listingCategory,
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

      {/* Listing category */}
      <div>
        <label className="block text-[11px] font-medium mb-1">Listing Category</label>
        <select value={listingCategory} onChange={e => setListingCategory(e.target.value as "Rough"|"Polished"|"Jewelry")} className="field-input min-h-[40px]">
          <option value="Rough">Rough — website only</option>
          <option value="Polished">Polished — store + website</option>
          <option value="Jewelry">Jewelry — store + website</option>
        </select>
        <p className="text-[9px] text-muted mt-0.5">Rough items appear only on the sourcing site. Polished &amp; Jewelry appear in the /app store.</p>
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
      <button onClick={handleParse} disabled={parsing || !stockText.trim()} className="w-full py-2 bg-[#A6A6AB] text-[#EAE8E4] text-[13px] font-medium cursor-default disabled:opacity-50 min-h-[40px]">
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
            <button onClick={handlePublish} disabled={!canPublish} className="w-full py-2 bg-[#A6A6AB] text-[#EAE8E4] text-[13px] font-medium cursor-default disabled:opacity-50 min-h-[40px]">
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
  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [generatingReport, setGeneratingReport] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [tRes, rRes] = await Promise.all([
        fetch("/api/traders"),
        fetch("/api/reports/weekly"),
      ]);
      if (tRes.ok) setTraders(await tRes.json());
      if (rRes.ok) setReports(await rRes.json());
    } catch {/* */} finally { setLoading(false); }
  }, []);
  useEffect(()=>{fetchData();},[fetchData]);

  async function handleCreateTrader() {
    if (!newName.trim()) { setCreateError("Name required"); return; }
    setCreateError(null);
    try {
      const res = await fetch("/api/traders", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ name: newName, phone: newPhone }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const trader = await res.json();
      setTraders(prev => [trader, ...prev]);
      setNewName(""); setNewPhone("");
      setShowCreateForm(false);
      // Copy portal link
      const url = `${window.location.origin}/trader/${trader.portal_code}`;
      const msg = `Welcome to AMES DE BRILLIANTE, ${trader.name}!\n\nHere is your trader portal link:\n${url}\n\nUse this to list your items.`;
      navigator.clipboard.writeText(msg).catch(() => {});
      setCopiedAction(`link-${trader.id}`);
      setTimeout(() => setCopiedAction(null), 2000);
    } catch (e: any) { setCreateError(e.message); }
  }

  async function handleApprove(t: Trader) {
    await fetch("/api/traders/approve", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ id: t.id }) });
    setTraders(prev => prev.map(tr => tr.id===t.id ? {...tr, status: "Active" as const} : tr));
    // Re-fetch to get the portal code
    const res = await fetch("/api/traders");
    if (res.ok) setTraders(await res.json());
  }

  async function handleDecline(t: Trader, reason: string) {
    await fetch("/api/traders/decline", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ id: t.id, reason }) });
    setTraders(prev => prev.map(tr => tr.id===t.id ? {...tr, status: "Declined" as const} : tr));
    setRejectReason(null);
    setExpanded(null);
  }

  function copyPortalLink(t: Trader) {
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/trader/${t.portal_code}`;
    const msg = `Welcome to AMES DE BRILLIANTE, ${t.name}!\n\nHere is your trader portal link:\n${url}\n\nUse this to list your items. If you have any questions, reply here on WhatsApp.`;
    navigator.clipboard.writeText(msg).catch(() => {});
    setCopiedAction(`link-${t.id}`); setTimeout(() => setCopiedAction(null), 1500);
  }

  async function togglePreferred(t: Trader) {
    const res = await fetch("/api/traders/preferred", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ id: t.id }) });
    if (res.ok) {
      const data = await res.json();
      setTraders(prev => prev.map(tr => tr.id === t.id ? { ...tr, preferred: data.preferred } : tr));
    }
  }

  async function handleGenerateReport(t: Trader) {
    setGeneratingReport(t.id);
    try {
      await fetch("/api/reports/weekly", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ traderId: t.id }) });
      // Re-fetch reports
      const res = await fetch("/api/reports/weekly");
      if (res.ok) setReports(await res.json());
    } finally { setGeneratingReport(null); }
  }

  function copyReportWA(r: any) {
    const msg = r.summary || `Weekly report for ${r.period_start?.split("T")[0]} to ${r.period_end?.split("T")[0]}`;
    navigator.clipboard.writeText(msg).catch(() => {});
    setCopiedAction(`report-${r.id}`); setTimeout(() => setCopiedAction(null), 1500);
  }

  function traderStatusColor(s: string) {
    switch(s) {
      case "Pending": return "bg-yellow-500 text-white";
      case "Active": return "bg-green-700 text-white";
      case "Declined": return "bg-red-600 text-white";
      default: return "bg-[#1a1c1e] text-[#171717]";
    }
  }

  if(loading) return <div className="px-4 md:px-6 py-10 text-[12px] text-muted">Loading...</div>;

  return (
    <div className="px-4 md:px-6 py-4 max-w-5xl mx-auto w-full">
      {/* Create Trader Button + Form */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-mono text-muted">{traders.length} traders</div>
          <button onClick={()=>setShowCreateForm(!showCreateForm)} className="px-3 py-1.5 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] font-medium cursor-default min-h-[36px]">
            {showCreateForm ? "Cancel" : "Create trader"}
          </button>
        </div>
        {showCreateForm && (
          <div className="border border-border p-4 mb-4 space-y-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted">New trader</div>
            {createError && <div className="text-[10px] text-red-600 border border-red-300 p-2 bg-red-50">{createError}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-[10px] text-muted mb-1">Name *</span>
                <input value={newName} onChange={e => setNewName(e.target.value)} className="field-input min-h-[36px] text-[11px]" placeholder="Full name" />
              </div>
              <div>
                <span className="block text-[10px] text-muted mb-1">WhatsApp</span>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} className="field-input min-h-[36px] text-[11px]" placeholder="Phone number" />
              </div>
            </div>
            <button onClick={handleCreateTrader} disabled={!newName.trim()} className="px-4 py-2 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] font-medium cursor-default disabled:opacity-40 min-h-[36px]">Create &amp; copy portal link</button>
          </div>
        )}
      </div>

      {traders.length===0 && !showCreateForm ? <div className="text-[12px] text-muted">No traders yet. Create one above.</div> : null}

      <div className="hidden md:block border border-border">
        <table className="w-full text-[12px]">
          <thead><tr className="text-left border-b border-border bg-surface">
            <th className="px-3 py-1.5 font-medium text-muted">Name</th>
            <th className="px-3 py-1.5 font-medium text-muted">Company</th>
            <th className="px-3 py-1.5 font-medium text-muted">WhatsApp</th>
            <th className="px-3 py-1.5 font-medium text-muted">Licence</th>
            <th className="px-3 py-1.5 font-medium text-muted w-20">Status</th>
            <th className="px-3 py-1.5 font-medium text-muted text-right">Created</th>
            <th className="px-3 py-1.5 font-medium text-muted text-center w-20">Preferred</th>
            <th className="px-3 py-1.5 font-medium text-muted w-40"></th>
          </tr></thead>
          <tbody>
            {traders.map((t)=>(
              <React.Fragment key={t.id}>
                <tr className="border-b border-border/60">
                  <td className="px-3 py-1.5 font-medium">{t.name}</td>
                  <td className="px-3 py-1.5 text-muted">{t.company||"\u2014"}</td>
                  <td className="px-3 py-1.5 font-mono">{t.whatsapp||"\u2014"}</td>
                  <td className="px-3 py-1.5 font-mono">{t.licence||"\u2014"}</td>
                  <td className="px-3 py-1.5">
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 ${traderStatusColor(t.status)}`}>{t.status}</span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-muted text-right">{t.created_at.split("T")[0]}</td>
                  <td className="px-3 py-1.5 text-center">
                    {t.status === "Active" ? (
                      <button onClick={() => togglePreferred(t)} className="px-1.5 py-0.5 text-[9px] font-semibold uppercase whitespace-nowrap cursor-default" style={t.preferred ? { background: "#A6A6AB", color: "#EAE8E4", border: "none" } : { background: "#FCFCFB", color: "#6E6C69", border: "1px solid rgba(23,23,23,0.08)" }}>
                        {t.preferred ? "Preferred" : "Set Preferred"}
                      </button>
                    ) : <span className="text-[10px]" style={{ color: "#6E6C69" }}>—</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1">
                      {t.status === "Pending" && (
                        <>
                          <button onClick={()=>setExpanded(expanded===t.id?null:t.id)} className="text-[10px] px-1.5 py-0.5 border border-border hover:bg-surface cursor-default whitespace-nowrap">
                            Review
                          </button>
                        </>
                      )}
                      {t.status === "Active" && t.portal_code && (
                        <button onClick={()=>copyPortalLink(t)} className="text-[10px] px-1.5 py-0.5 bg-[#A6A6AB] text-[#EAE8E4] hover:bg-black/80 cursor-default whitespace-nowrap">
                          {copiedAction===`link-${t.id}` ? "Copied ✓" : "Copy portal link"}
                        </button>
                      )}
                      {t.status === "Active" && (
                        <button onClick={()=>handleGenerateReport(t)} disabled={generatingReport===t.id} className="text-[10px] px-1.5 py-0.5 border border-border hover:bg-surface cursor-default whitespace-nowrap disabled:opacity-50">
                          {generatingReport===t.id ? "Generating..." : "Report"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expanded===t.id && t.status === "Pending" && (
                  <tr className="border-b border-border bg-surface/50"><td colSpan={7} className="px-3 py-3">
                    <div className="text-[11px] space-y-2">
                      <div className="grid grid-cols-3 gap-4">
                        <div><span className="text-muted">Company:</span> {t.company||"\u2014"}</div>
                        <div><span className="text-muted">Country:</span> {t.country||"\u2014"}</div>
                        <div><span className="text-muted">Email:</span> {t.email||"\u2014"}</div>
                      </div>
                      {t.licence_photo && (
                        <div><span className="text-muted">Licence photo:</span><br/>
                          <img src={t.licence_photo} alt="Licence" className="w-32 h-32 object-cover border border-border mt-1" />
                        </div>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button onClick={()=>handleApprove(t)} className="px-3 py-1.5 bg-green-700 text-white text-[11px] font-medium cursor-default">
                          Approve
                        </button>
                        <button onClick={()=>setRejectReason(rejectReason===String(t.id)?null:String(t.id))} className="px-3 py-1.5 border border-red-300 text-red-600 text-[11px] font-medium cursor-default">
                          Decline
                        </button>
                      </div>
                      {rejectReason===String(t.id) && (
                        <div className="mt-2 flex gap-2">
                          <input id={`reason-${t.id}`} placeholder="Decline reason..." className="field-input min-h-[36px] flex-1 text-[11px]" />
                          <button onClick={()=>{
                            const input = document.getElementById(`reason-${t.id}`) as HTMLInputElement;
                            handleDecline(t, input?.value || "Application declined");
                          }} className="px-3 py-1.5 bg-red-600 text-white text-[11px] font-medium cursor-default">
                            Confirm decline
                          </button>
                        </div>
                      )}
                    </div>
                  </td></tr>
                )}
                {t.status === "Active" && reports.filter((r:any)=>r.trader_id===t.id).length > 0 && (
                  <tr className="border-b border-border bg-surface/30"><td colSpan={7} className="px-3 py-2">
                    <div className="text-[9px] uppercase tracking-wider text-muted font-medium mb-1">Recent reports</div>
                    <div className="flex gap-3 flex-wrap">
                      {reports.filter((r:any)=>r.trader_id===t.id).slice(0,5).map((r:any)=>(
                        <div key={r.id} className="flex items-center gap-1.5 text-[10px]">
                          <span className="font-mono text-muted">{r.period_end?.split("T")[0]||""}</span>
                          <button onClick={()=>copyReportWA(r)} className="px-1.5 py-0.5 border border-border hover:bg-surface cursor-default whitespace-nowrap">
                            {copiedAction===`report-${r.id}` ? "Copied" : "Copy WA"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {traders.map((t)=>(
          <div key={t.id} className="border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-medium">{t.name}</div>
              <div className="flex items-center gap-1.5">
                {t.status === "Active" && (
                  <button onClick={() => togglePreferred(t)} className="px-1.5 py-0.5 text-[9px] font-semibold uppercase cursor-default" style={t.preferred ? { background: "#A6A6AB", color: "#EAE8E4", border: "none" } : { background: "#FCFCFB", color: "#6E6C69", border: "1px solid rgba(23,23,23,0.08)" }}>
                    {t.preferred ? "Preferred" : "Set Preferred"}
                  </button>
                )}
                <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 ${traderStatusColor(t.status)}`}>{t.status}</span>
              </div>
            </div>
            <div className="text-[10px] text-muted mt-1">
              {t.company&&<div>Company: {t.company}</div>}
              {t.whatsapp&&<div>WhatsApp: {t.whatsapp}</div>}
              {t.email&&<div>Email: {t.email}</div>}
              {t.licence&&<div>Licence: {t.licence}</div>}
              <div>Added: {t.created_at.split("T")[0]}</div>
            </div>
            {t.status === "Pending" && (
              <div className="flex gap-2 mt-2">
                <button onClick={()=>handleApprove(t)} className="flex-1 py-1.5 bg-green-700 text-white text-[10px] font-medium cursor-default">Approve</button>
                <button onClick={()=>setExpanded(expanded===t.id?null:t.id)} className="flex-1 py-1.5 border border-red-300 text-red-600 text-[10px] font-medium cursor-default">Decline</button>
              </div>
            )}
            {t.status === "Active" && t.portal_code && (
              <button onClick={()=>copyPortalLink(t)} className="mt-2 w-full py-1.5 bg-[#A6A6AB] text-[#EAE8E4] text-[10px] font-medium cursor-default">
                {copiedAction===`link-${t.id}` ? "Copied ✓" : "Copy portal link + welcome message"}
              </button>
            )}
            {t.status === "Active" && (
              <button onClick={()=>handleGenerateReport(t)} disabled={generatingReport===t.id} className="mt-1 w-full py-1.5 border border-border text-[10px] text-muted hover:bg-surface cursor-default disabled:opacity-50">
                {generatingReport===t.id ? "Generating..." : "Generate weekly report"}
              </button>
            )}
            {t.status === "Active" && reports.filter((r:any)=>r.trader_id===t.id).length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="text-[9px] uppercase tracking-wider text-muted font-medium">Recent reports</div>
                {reports.filter((r:any)=>r.trader_id===t.id).slice(0,3).map((r:any)=>(
                  <div key={r.id} className="flex items-center justify-between border border-border/60 p-2">
                    <span className="text-[10px] text-muted font-mono">{r.period_end?.split("T")[0]||""}</span>
                    <button onClick={()=>copyReportWA(r)} className="text-[10px] px-1.5 py-0.5 border border-border hover:bg-surface cursor-default whitespace-nowrap">
                      {copiedAction===`report-${r.id}` ? "Copied" : "Copy WA report"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {expanded===t.id && t.status === "Pending" && (
              <div className="mt-2 space-y-2 border-t border-border pt-2">
                {t.licence_photo && <img src={t.licence_photo} alt="Licence" className="w-24 h-24 object-cover border border-border" />}
                <input id={`reason-mob-${t.id}`} placeholder="Decline reason..." className="w-full field-input min-h-[36px] text-[11px]" />
                <button onClick={()=>{
                  const input = document.getElementById(`reason-mob-${t.id}`) as HTMLInputElement;
                  handleDecline(t, input?.value || "Application declined");
                }} className="w-full py-1.5 bg-red-600 text-white text-[10px] font-medium cursor-default">Confirm decline</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════ ORDERS TAB ═══════ */

interface OrderRow {
  id: number; stone_id: string; stone_ref: string;
  buyer_name: string; buyer_whatsapp: string; price: number | null;
  status: string; created_at: string;
  shape: string; carat: number; color: string; clarity: string;
  certification: string; stone_status: string;
}

function OrdersTab() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  const fetchData = useCallback(async () => {
    try { const res = await fetch("/api/orders"); if (res.ok) setOrders(await res.json()); }
    catch { /* */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleStatusChange(id: number, status: string) {
    await fetch("/api/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
    const order = orders.find(o => o.id === id);
    if (order) {
      const priceStr = order.price ? `$${order.price.toLocaleString()}` : 'price on request';
      showToast(`Order ${order.stone_ref} (${order.buyer_name || 'buyer'}) → ${status}${order.price ? ' · ' + priceStr : ''}`);
    }
  }

  function buildInvoiceMsg(o: OrderRow) {
    const priceStr = o.price ? `$${o.price.toLocaleString()}` : "price on request";
    return `Hello ${o.buyer_name || ""},\n\nThank you for your interest. Your reservation for ${o.stone_ref} (${o.shape} ${o.carat}ct ${o.color} ${o.clarity} ${o.certification}) has been noted.\n\nPrice: ${priceStr}\n\nPayment details are shared below.`;
  }

  function buildWaUrl(o: OrderRow) {
    const num = (o.buyer_whatsapp || "").replace(/[^0-9]/g, "");
    if (!num) return null;
    return `https://wa.me/${num}?text=${encodeURIComponent(buildInvoiceMsg(o))}`;
  }

  async function handleCopy(o: OrderRow) {
    const msg = buildInvoiceMsg(o);
    try { await navigator.clipboard.writeText(msg); } catch {
      const ta = document.createElement("textarea"); ta.value = msg;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopiedId(o.id); setTimeout(() => setCopiedId(null), 1500);
  }

  function statusColor(s: string) {
    switch (s) {
      case "Reserved": return "bg-yellow-500 text-white";
      case "Invoiced": return "bg-blue-600 text-white";
      case "Paid": return "bg-green-700 text-white";
      case "Shipped": return "bg-purple-600 text-white";
      case "Closed": return "bg-[#6E6C69] text-white";
      default: return "bg-[#1a1c1e] text-[#171717]";
    }
  }
  const STATUSES = ["Reserved", "Invoiced", "Paid", "Shipped", "Closed"];

  if (loading) return <div className="px-4 md:px-6 py-10 text-[12px] text-muted">Loading...</div>;
  if (orders.length === 0) return <div className="px-4 md:px-6 py-10 text-[12px] text-muted">No orders yet.</div>;

  const q = search.toLowerCase();
  const filtered = q
    ? orders.filter((o) =>
        o.buyer_name.toLowerCase().includes(q) ||
        o.stone_ref.toLowerCase().includes(q) ||
        o.buyer_whatsapp.toLowerCase().includes(q)
      )
    : orders;

  return (
    <div className="px-4 md:px-6 py-4 max-w-5xl mx-auto w-full">
      <div className="flex items-center gap-2 mb-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search buyer, ref, WhatsApp..." className="field-input min-h-[36px] flex-1 text-[11px]" />
        <span className="text-[11px] text-muted font-mono shrink-0">{filtered.length}/{orders.length}</span>
      </div>
      {/* Desktop */}
      <div className="hidden md:block border border-border">
        <table className="w-full text-[12px]">
          <thead><tr className="text-left border-b border-border bg-surface">
            <th className="px-3 py-1.5 font-medium text-muted w-24">Date</th>
            <th className="px-3 py-1.5 font-medium text-muted">Buyer</th>
            <th className="px-3 py-1.5 font-medium text-muted">WhatsApp</th>
            <th className="px-3 py-1.5 font-medium text-muted">Item</th>
            <th className="px-3 py-1.5 font-medium text-muted text-right">Price</th>
            <th className="px-3 py-1.5 font-medium text-muted w-32">Status</th>
            <th className="px-3 py-1.5 font-medium text-muted w-10"></th>
          </tr></thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-b border-border/60 hover:bg-surface/60">
                <td className="px-3 py-1.5 font-mono text-muted">{o.created_at.split("T")[0]}</td>
                <td className="px-3 py-1.5">{o.buyer_name || "\u2014"}</td>
                <td className="px-3 py-1.5 font-mono text-muted">{o.buyer_whatsapp || "\u2014"}</td>
                <td className="px-3 py-1.5 font-mono">{o.stone_ref}<span className="text-muted ml-1">{o.shape} {o.carat}ct {o.color}</span></td>
                <td className="px-3 py-1.5 text-right font-mono">{o.price ? "$" + o.price.toLocaleString() : "\u2014"}</td>
                <td className="px-3 py-1.5">
                  <select value={o.status} onChange={(e) => handleStatusChange(o.id, e.target.value)} className={"text-[10px] font-semibold uppercase px-1.5 py-0.5 cursor-default " + statusColor(o.status) + " border-0 outline-none"}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => handleCopy(o)} title="Copy invoice message" className="text-[10px] px-1.5 py-0.5 border border-border hover:bg-surface cursor-default whitespace-nowrap">
                      {copiedId === o.id ? "Copied" : "Copy"}
                    </button>
                    {o.status === "Paid" && (
                      <button onClick={async () => {
                        try {
                          const res = await fetch("/api/intelligence/issues");
                          const issues = await res.json();
                          const latest = issues[0];
                          if (latest) {
                            const link = window.location.origin + latest.pdf_url;
                            await navigator.clipboard.writeText(link);
                            setCopiedId(o.id + 0.5); setTimeout(() => setCopiedId(null), 1500);
                          }
                        } catch { /* */ }
                      }} title="Copy latest report download link" className="text-[10px] px-1.5 py-0.5 border border-border hover:bg-surface cursor-default whitespace-nowrap">
                        {copiedId === o.id + 0.5 ? "Copied" : "Link"}
                      </button>
                    )}
                    {buildWaUrl(o) && (
                      <a href={buildWaUrl(o)!} target="_blank" rel="noopener noreferrer" title="Send invoice via WhatsApp" className="text-[10px] px-1.5 py-0.5 bg-green-700 text-white hover:bg-green-800 cursor-default whitespace-nowrap inline-block">WA</a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {filtered.map((o) => (
          <div key={o.id} className="border border-border p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-mono text-muted">{o.created_at.split("T")[0]}</span>
              <select value={o.status} onChange={(e) => handleStatusChange(o.id, e.target.value)} className={"text-[10px] font-semibold uppercase px-1.5 py-0.5 cursor-default " + statusColor(o.status) + " border-0 outline-none"}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="text-[12px] font-medium">{o.stone_ref} <span className="text-muted font-normal">{o.shape} {o.carat}ct {o.color}</span></div>
            <div className="flex justify-between items-center mt-1 text-[10px]">
              <span className="text-muted">{o.buyer_name || "\u2014"}{o.buyer_whatsapp ? " · " + o.buyer_whatsapp : ""}</span>
              <span className="font-mono font-medium">{o.price ? "$" + o.price.toLocaleString() : "\u2014"}</span>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => handleCopy(o)} className="flex-1 py-1.5 border border-border text-[10px] text-muted hover:bg-surface cursor-default">
                {copiedId === o.id ? "Copied" : "Copy invoice"}
              </button>
              {o.status === "Paid" && (
                <button onClick={async () => {
                  try {
                    const res = await fetch("/api/intelligence/issues");
                    const issues = await res.json();
                    const latest = issues[0];
                    if (latest) {
                      const link = window.location.origin + latest.pdf_url;
                      await navigator.clipboard.writeText(link);
                      setCopiedId(o.id + 0.5); setTimeout(() => setCopiedId(null), 1500);
                    }
                  } catch { /* */ }
                }} className="flex-1 py-1.5 border border-border text-[10px] text-muted hover:bg-surface cursor-default">
                  {copiedId === o.id + 0.5 ? "Copied" : "Copy report link"}
                </button>
              )}
              {buildWaUrl(o) && (
                <a href={buildWaUrl(o)!} target="_blank" rel="noopener noreferrer" className="flex-1 py-1.5 bg-green-700 text-white text-[10px] font-medium text-center hover:bg-green-800 cursor-default inline-block">Send WhatsApp</a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg flex items-center gap-2" style={{ background: '#1A1A1A', color: '#171717' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A6A6AB" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
          <span className="text-[11px] font-light whitespace-nowrap">{toast}</span>
        </div>
      )}
    </div>
  );
}

/* ═══════ VIDEOS TAB ═══════ */

interface VideoRow {
  id: number; video_url: string; caption: string;
  stone_id: string | null; published: number;
  model_id: number | null; status: string; tap_count: number;
  created_at: string; stone_ref: string | null;
  model_name: string | null; model_instagram: string | null;
  house_note: string; featured_piece: string | null;
}

function PendingVideoCard({ video, stones, onApprove, onDecline }: { video: VideoRow; stones: Stone[]; onApprove: (edits: {house_note?: string; featured_piece?: string}) => void; onDecline: () => void }) {
  const [houseNote, setHouseNote] = useState(video.house_note || "");
  const [featuredPiece, setFeaturedPiece] = useState(video.featured_piece || "");

  return (
    <div className="border border-yellow-300 bg-yellow-50/50 p-3 flex gap-3 items-start">
      <div className="w-16 h-24 bg-black overflow-hidden shrink-0">
        <video src={video.video_url} className="w-full h-full object-cover" muted preload="metadata" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 bg-yellow-500 text-white">Pending</span>
          {video.model_name && <span className="text-[10px] text-muted">{video.model_name}</span>}
          {video.model_instagram && <span className="text-[10px] text-muted font-mono">@{video.model_instagram}</span>}
          {video.stone_ref && <span className="text-[10px] text-muted font-mono">→ {video.stone_ref}</span>}
        </div>
        <div className="text-[11px] truncate">{video.caption || "No caption"}</div>
        <div className="text-[10px] text-muted font-mono mt-0.5">{video.created_at.split("T")[0]}</div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <span className="block text-[9px] text-muted mb-0.5">House note</span>
            <input value={houseNote} onChange={e => setHouseNote(e.target.value)} placeholder="Curator's voice" className="w-full px-2 py-1 text-[10px] border border-yellow-300 bg-white rounded" />
          </div>
          <div>
            <span className="block text-[9px] text-muted mb-0.5">Featured piece</span>
            <select value={featuredPiece} onChange={e => setFeaturedPiece(e.target.value)} className="w-full px-2 py-1 text-[10px] border border-yellow-300 bg-white rounded">
              <option value="">None</option>
              {stones.map(s => (
                <option key={s.id} value={s.id}>{s.ref} — {s.shape} {s.carat}ct</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={() => onApprove({ house_note: houseNote, featured_piece: featuredPiece || undefined })} className="text-[10px] px-2 py-1 bg-green-700 text-white cursor-default min-h-[32px]">Approve</button>
          <button onClick={onDecline} className="text-[10px] px-2 py-1 border border-red-300 text-red-600 cursor-default min-h-[32px]">Decline</button>
        </div>
      </div>
    </div>
  );
}

function VideosTab() {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stones, setStones] = useState<Stone[]>([]);
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [linkedStone, setLinkedStone] = useState<string>("");
  const [houseNote, setHouseNote] = useState("");
  const [featuredPiece, setFeaturedPiece] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [vRes, sRes] = await Promise.all([
        fetch("/api/videos"),
        fetch("/api/stones"),
      ]);
      if (vRes.ok) setVideos(await vRes.json());
      if (sRes.ok) {
        const all: Stone[] = await sRes.json();
        setStones(all.filter(s => s.status === "Available"));
      }
    } catch {/* */} finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/videos/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      const data = await res.json();
      setUrl(data.url);
    } catch (e: any) { setError(e.message); } finally { setUploading(false); }
  }

  async function handleCreate() {
    if (!url.trim()) { setError("Video URL required"); return; }
    setError(null);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ video_url: url, caption, stone_id: linkedStone || null, house_note: houseNote, featured_piece: featuredPiece || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const v = await res.json();
      setVideos(prev => [{ ...v, stone_ref: stones.find(s => s.id === v.stone_id)?.ref || null }, ...prev]);
      setUrl(""); setCaption(""); setLinkedStone(""); setHouseNote(""); setFeaturedPiece("");
    } catch (e: any) { setError(e.message); }
  }

  async function togglePublish(v: VideoRow) {
    const newPub = v.published ? 0 : 1;
    await fetch("/api/videos", {
      method: "PATCH",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ id: v.id, published: newPub }),
    });
    setVideos(prev => prev.map(vid => vid.id === v.id ? {...vid, published: newPub} : vid));
  }

  async function handleDelete(v: VideoRow) {
    await fetch(`/api/videos?id=${v.id}`, { method: "DELETE" });
    setVideos(prev => prev.filter(vid => vid.id !== v.id));
  }

  if (loading) return <div className="px-4 md:px-6 py-10 text-[12px] text-muted">Loading...</div>;

  return (
    <div className="px-4 md:px-6 py-4 max-w-5xl mx-auto w-full">
      {/* Create form */}
      <div className="border border-border p-4 mb-4 space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Add video</div>
        {error && <div className="text-[10px] text-red-600 border border-red-300 p-2 bg-red-50">{error}</div>}
        <div className="flex gap-2">
          <label className="flex-1">
            <span className="block text-[10px] text-muted mb-1">Upload mp4</span>
            <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleFileUpload} disabled={uploading} className="w-full text-[11px] file:mr-2 file:py-1 file:px-2 file:border file:border-border file:text-[10px] file:bg-surface file:cursor-default" />
            {uploading && <span className="text-[10px] text-muted">Uploading...</span>}
          </label>
          <span className="text-[10px] text-muted self-end">or</span>
          <div className="flex-1">
            <span className="block text-[10px] text-muted mb-1">Paste URL</span>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://...mp4" className="field-input min-h-[36px] text-[11px]" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="block text-[10px] text-muted mb-1">Caption</span>
            <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="One line caption" className="field-input min-h-[36px] text-[11px]" />
          </div>
          <div>
            <span className="block text-[10px] text-muted mb-1">Link to stone (optional)</span>
            <select value={linkedStone} onChange={e => setLinkedStone(e.target.value)} className="field-input min-h-[36px] text-[11px]">
              <option value="">None</option>
              {stones.map(s => (
                <option key={s.id} value={s.id}>{s.ref} — {s.shape} {s.carat}ct {s.color}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="block text-[10px] text-muted mb-1">House note (optional)</span>
            <input value={houseNote} onChange={e => setHouseNote(e.target.value)} placeholder="Curator's note under the video" className="field-input min-h-[36px] text-[11px]" />
          </div>
          <div>
            <span className="block text-[10px] text-muted mb-1">Featured piece (optional)</span>
            <select value={featuredPiece} onChange={e => setFeaturedPiece(e.target.value)} className="field-input min-h-[36px] text-[11px]">
              <option value="">None</option>
              {stones.map(s => (
                <option key={s.id} value={s.id}>{s.ref} — {s.shape} {s.carat}ct {s.color}</option>
              ))}
            </select>
          </div>
        </div>
        <button onClick={handleCreate} disabled={!url.trim()} className="px-4 py-2 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] font-medium cursor-default disabled:opacity-40 min-h-[36px]">Add video</button>
      </div>

      {/* Pending model videos */}
      {videos.some(v => v.status === "Pending") && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-wider text-muted font-medium mb-2">Pending model videos</div>
          <div className="space-y-2">
            {videos.filter(v => v.status === "Pending").map(v => (
              <PendingVideoCard key={v.id} video={v} stones={stones} onApprove={(edits) => {
                fetch("/api/videos", { method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ id: v.id, action: "approve", ...edits }) });
                setVideos(prev => prev.map(vid => vid.id === v.id ? {...vid, status: "Live", published: 1, ...edits} : vid));
              }} onDecline={() => {
                fetch("/api/videos", { method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ id: v.id, action: "decline" }) });
                setVideos(prev => prev.filter(vid => vid.id !== v.id));
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Video list */}
      <div className="text-[11px] text-muted font-mono mb-2">{videos.filter(v => v.status !== "Pending").length} published videos</div>
      {videos.filter(v => v.status !== "Pending").length === 0 ? (
        <div className="text-[12px] text-muted">No published videos yet.</div>
      ) : (
        <div className="space-y-3">
          {videos.filter(v => v.status !== "Pending").map(v => (
            <div key={v.id} className="border border-border p-3 flex gap-3 items-start">
              <div className="w-20 h-28 bg-black overflow-hidden shrink-0">
                <video src={v.video_url} className="w-full h-full object-cover" muted preload="metadata" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 ${v.published ? "bg-green-700 text-white" : "bg-[#1a1c1e] text-[#171717]"}`}>{v.published ? "Published" : "Draft"}</span>
                  {v.stone_ref && <span className="text-[10px] text-muted font-mono">→ {v.stone_ref}</span>}
                  {v.model_instagram && <span className="text-[10px] text-muted font-mono">@{v.model_instagram}</span>}
                </div>
                <div className="text-[11px] truncate">{v.caption || "No caption"}</div>
                <div className="text-[10px] text-muted font-mono mt-0.5">{v.created_at.split("T")[0]}</div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => togglePublish(v)} className={`text-[10px] px-2 py-1 cursor-default min-h-[32px] ${v.published ? "border border-border text-muted hover:bg-surface" : "bg-[#A6A6AB] text-[#EAE8E4]"}`}>{v.published ? "Unpublish" : "Publish"}</button>
                  <button onClick={() => handleDelete(v)} className="text-[10px] px-2 py-1 border border-red-300 text-red-600 cursor-default hover:bg-red-50 min-h-[32px]">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════ MODELS TAB ═══════ */

interface ModelRow {
  id: number; name: string; whatsapp: string; instagram: string;
  portal_code: string; status: string; created_at: string;
  live_count: number; pending_count: number; video_count?: number; total_views?: number; total_likes?: number;
  approved_this_month: number; commission_earnings: number;
  monthly_video_quota: number; monthly_base_fee: number; commission_rate: number;
  payment_method: string; payment_details: string; total_paid: number;
}

function ModelsTab() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [rosterFull, setRosterFull] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [paymentModal, setPaymentModal] = useState<ModelRow | null>(null);
  const [report, setReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      if (res.ok) {
        const data = await res.json();
        setModels(data.models);
        setActiveCount(data.activeCount);
        setRosterFull(data.rosterFull);
      }
    } catch {/* */} finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleInvite() {
    if (!name.trim()) { setError("Name required"); return; }
    setError(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ name, whatsapp, instagram }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const model = await res.json();
      setModels(prev => [{ ...model, live_count: 0, pending_count: 0, approved_this_month: 0, commission_earnings: 0, monthly_video_quota: 30, monthly_base_fee: 200, commission_rate: 0.005, payment_method: "", payment_details: "", total_paid: 0 }, ...prev]);
      setActiveCount(prev => prev + 1);
      setName(""); setWhatsapp(""); setInstagram("");
      setShowForm(false);
      const url = `${window.location.origin}/model/${model.portal_code}`;
      navigator.clipboard.writeText(url).catch(() => {});
      setCopiedId(model.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e: any) { setError(e.message); }
  }

  function copyPortalLink(m: ModelRow) {
    const url = `${window.location.origin}/model/${m.portal_code}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function openReport(m: ModelRow) {
    setPaymentModal(m);
    setReportLoading(true);
    setReport(null);
    try {
      const res = await fetch(`/api/models?report=${m.id}`);
      if (res.ok) setReport(await res.json());
    } catch {/* */} finally { setReportLoading(false); }
  }

  function copyPaymentInstructions(m: ModelRow, totalDue: number) {
    const method = m.payment_method || "bank transfer";
    const details = m.payment_details || "Contact desk for details";
    const msg = `Hi ${m.name},\n\nYour AMES DE BRILLIANTE model payment for this month is ready.\n\nAmount due: $${totalDue.toLocaleString()}\nPayment method: ${method}\nDetails: ${details}\n\nPlease confirm once sent. Thank you.`;
    navigator.clipboard.writeText(msg).catch(() => {});
  }

  async function handleMarkPaid(m: ModelRow, amount: number) {
    await fetch("/api/models", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ action: "mark_paid", model_id: m.id, amount }),
    });
    setModels(prev => prev.map(mod => mod.id === m.id ? {...mod, total_paid: mod.total_paid + amount} : mod));
    // Re-fetch report
    const res = await fetch(`/api/models?report=${m.id}`);
    if (res.ok) setReport(await res.json());
  }

  function baseEarned(m: ModelRow) {
    return Math.min(m.approved_this_month, m.monthly_video_quota) * (m.monthly_base_fee / m.monthly_video_quota);
  }

  function totalDue(m: ModelRow) {
    return baseEarned(m) + m.commission_earnings - m.total_paid;
  }

  if (loading) return <div className="px-4 md:px-6 py-10 text-[12px] text-muted">Loading...</div>;

  return (
    <div className="px-4 md:px-6 py-4 max-w-5xl mx-auto w-full">
      {/* Payment modal */}
      {paymentModal && (
        <div className="fixed inset-0 z-50 bg-white/50 flex items-center justify-center p-4" onClick={() => setPaymentModal(null)}>
          <div className="bg-[#FCFCFB] border border-border max-w-lg w-full max-h-[80vh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-bold">{paymentModal.name} — Payment Report</div>
              <button onClick={() => setPaymentModal(null)} className="text-[11px] text-muted cursor-default">Close</button>
            </div>
            {reportLoading ? (
              <div className="text-[11px] text-muted py-4">Loading report...</div>
            ) : report ? (
              <div className="space-y-3">
                <div className="text-[10px] text-muted">Month: {report.month}</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="border border-border p-2"><div className="text-[16px] font-bold">{report.videos.length}</div><div className="text-[9px] uppercase text-muted">Approved</div></div>
                  <div className="border border-border p-2"><div className="text-[16px] font-bold">${report.base_earned.toFixed(0)}</div><div className="text-[9px] uppercase text-muted">Base</div></div>
                  <div className="border border-border p-2"><div className="text-[16px] font-bold">${report.commission_total.toFixed(0)}</div><div className="text-[9px] uppercase text-muted">Commission</div></div>
                </div>
                <div className="border border-border p-2 text-center"><div className="text-[14px] font-bold">${report.total_due.toFixed(2)}</div><div className="text-[9px] uppercase text-muted">Total due (base + commission - paid: ${report.model.total_paid})</div></div>
                {report.videos.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase text-muted font-medium mb-1">Videos this month</div>
                    <div className="space-y-1">
                      {report.videos.map((v: any) => (
                        <div key={v.id} className="flex items-center justify-between text-[10px] border border-border/60 p-1.5">
                          <span>{v.stone_ref || "—"} <span className="text-muted">{v.caption?.slice(0, 30)}</span></span>
                          <span className="font-mono">{v.sales_count > 0 ? `$${v.sales_value.toFixed(0)} sale · $${v.commission_earned.toFixed(0)} comm` : "no sales"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => copyPaymentInstructions(paymentModal, report.total_due)} className="flex-1 py-2 border border-border text-[11px] font-medium cursor-default">Copy payment instructions</button>
                  <button onClick={() => handleMarkPaid(paymentModal, report.total_due)} disabled={report.total_due <= 0} className="flex-1 py-2 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] font-medium cursor-default disabled:opacity-40">Mark Paid (${report.total_due.toFixed(2)})</button>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-muted py-4">No report data.</div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="text-[12px] font-medium">
            <span className="font-mono font-bold">{activeCount}</span>
            <span className="text-muted"> / 100</span>
          </div>
          {rosterFull && <span className="text-[10px] font-semibold uppercase px-2 py-0.5 bg-red-100 text-red-700">Roster full</span>}
        </div>
        {!rosterFull && (
          <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] font-medium cursor-default min-h-[36px]">
            {showForm ? "Cancel" : "Invite model"}
          </button>
        )}
        {rosterFull && <span className="text-[10px] text-muted">100 active models reached</span>}
      </div>
      {showForm && (
        <div className="border border-border p-4 mb-4 space-y-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted">New model</div>
          {error && <div className="text-[10px] text-red-600 border border-red-300 p-2 bg-red-50">{error}</div>}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="block text-[10px] text-muted mb-1">Name *</span>
              <input value={name} onChange={e => setName(e.target.value)} className="field-input min-h-[36px] text-[11px]" placeholder="Full name" />
            </div>
            <div>
              <span className="block text-[10px] text-muted mb-1">WhatsApp</span>
              <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="field-input min-h-[36px] text-[11px]" placeholder="Number" />
            </div>
            <div>
              <span className="block text-[10px] text-muted mb-1">Instagram</span>
              <input value={instagram} onChange={e => setInstagram(e.target.value)} className="field-input min-h-[36px] text-[11px]" placeholder="handle" />
            </div>
          </div>
          <button onClick={handleInvite} disabled={!name.trim()} className="px-4 py-2 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] font-medium cursor-default disabled:opacity-40 min-h-[36px]">Invite &amp; copy portal link</button>
        </div>
      )}
      <div className="text-[11px] text-muted font-mono mb-2">{models.length} models</div>
      {models.length === 0 ? (
        <div className="text-[12px] text-muted">No models yet.</div>
      ) : (
        <div className="hidden md:block border border-border">
          <table className="w-full text-[12px]">
            <thead><tr className="text-left border-b border-border bg-surface">
              <th className="px-3 py-1.5 font-medium text-muted">Name</th>
              <th className="px-2 py-1.5 font-medium text-muted text-right">Live</th>
              <th className="px-2 py-1.5 font-medium text-muted text-right">Pending</th>
              <th className="px-2 py-1.5 font-medium text-muted text-right">This mo.</th>
              <th className="px-2 py-1.5 font-medium text-muted text-right">Base</th>
              <th className="px-2 py-1.5 font-medium text-muted text-right">Commission</th>
              <th className="px-2 py-1.5 font-medium text-muted text-right">Due</th>
              <th className="px-2 py-1.5 font-medium text-muted w-28"></th>
            </tr></thead>
            <tbody>
              {models.map(m => (
                <tr key={m.id} className="border-b border-border/60">
                  <td className="px-3 py-1.5 font-medium">{m.name}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{m.live_count}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{m.pending_count}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{m.approved_this_month}/{m.monthly_video_quota}</td>
                  <td className="px-2 py-1.5 text-right font-mono">${baseEarned(m).toFixed(0)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">${m.commission_earnings.toFixed(0)}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-medium">${totalDue(m).toFixed(2)}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <button onClick={() => copyPortalLink(m)} className="text-[9px] px-1 py-0.5 border border-border hover:bg-surface cursor-default whitespace-nowrap">{copiedId === m.id ? "Copied" : "Link"}</button>
                      <button onClick={() => openReport(m)} className="text-[9px] px-1 py-0.5 bg-[#A6A6AB] text-[#EAE8E4] hover:bg-black/80 cursor-default whitespace-nowrap">Report</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {models.map(m => (
          <div key={m.id} className="border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-medium">{m.name}</div>
              <span className="text-[11px] font-mono font-medium">${totalDue(m).toFixed(2)}</span>
            </div>
            <div className="flex gap-3 mt-1 text-[10px] text-muted font-mono">
              <span>{m.live_count} live</span>
              <span>{m.pending_count} pending</span>
              <span>{m.approved_this_month}/{m.monthly_video_quota} this mo.</span>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => copyPortalLink(m)} className="flex-1 py-1.5 border border-border text-[10px] text-muted cursor-default">{copiedId === m.id ? "Copied" : "Copy link"}</button>
              <button onClick={() => openReport(m)} className="flex-1 py-1.5 bg-[#A6A6AB] text-[#EAE8E4] text-[10px] cursor-default">Payment report</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/* ════════ INTELLIGENCE TAB ════════ */

function IntelligenceTab() {
  const [issues, setIssues] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [iRes, oRes] = await Promise.all([
        fetch("/api/intelligence/issues"),
        fetch("/api/intelligence/orders"),
      ]);
      if (iRes.ok) setIssues(await iRes.json());
      if (oRes.ok) setOrders(await oRes.json());
    } catch { /* */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleGenerate(reportType: string) {
    setGenerating(reportType);
    setError(null);
    try {
      const res = await fetch("/api/intelligence/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType })
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Generation failed"); }
      await fetchData();
    } catch (e: any) { setError(e.message); } finally { setGenerating(null); }
  }

  async function handleCopyLink(url: string) {
    const full = window.location.origin + url;
    try { await navigator.clipboard.writeText(full); } catch {
      const ta = document.createElement("textarea"); ta.value = full;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
  }

  function buildInvoiceMsg(o: any) {
    const chargeStr = o.charge ? "$" + o.charge.toLocaleString() : "price on request";
    return "Hello " + (o.buyer_name || "") + ",\n\nThank you for your interest in our " + (o.tier_label || o.tier) + " service.\n\nReport: " + o.product_name + "\nCharge: " + chargeStr + "\n\nBank Details:\nBank: First National Bank Botswana\nAccount Name: AMES DE BRILLIANTE (Pty) Ltd\nAccount Number: 62XXXXXXXXXX\nBranch: 28-XXX-XXX\nSWIFT: FIRNBWGX\n\nPlease use your company name as reference.\nOnce payment is confirmed, your report will be delivered within one business day.\n\nCompiled from licensed dealer data. Not investment advice.";
  }

  function buildOrderWaUrl(o: any) {
    const num = (o.buyer_whatsapp || "").replace(/[^0-9]/g, "");
    if (!num) return null;
    return "https://wa.me/" + num + "?text=" + encodeURIComponent(buildInvoiceMsg(o));
  }

  async function handleCopyInvoice(o: any) {
    const msg = buildInvoiceMsg(o);
    try { await navigator.clipboard.writeText(msg); } catch {
      const ta = document.createElement("textarea"); ta.value = msg;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
  }

  async function handleOrderStatus(id: string, status: string) {
    await fetch("/api/intelligence/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status })
    });
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
  }

  if (loading) return <div className="px-4 md:px-6 py-10 text-[12px] text-muted">Loading...</div>;

  return (
    <div className="px-4 md:px-6 py-4 max-w-5xl mx-auto w-full">
      {/* Generate */}
      <div className="mb-6">
        <h2 className="text-[14px] font-semibold mb-1">Generate Reports</h2>
        <div className="flex gap-3 mt-2 flex-wrap">
          <button onClick={() => handleGenerate("ground_report")} disabled={!!generating} className="px-4 py-2 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] font-medium cursor-default disabled:opacity-50 min-h-[40px]">
            {generating === "ground_report" ? "Generating..." : "Generate Ground Report"}
          </button>
          <button onClick={() => handleGenerate("compliance_briefing")} disabled={!!generating} className="px-4 py-2 border border-border text-[11px] cursor-default disabled:opacity-50 min-h-[40px]">
            {generating === "compliance_briefing" ? "Generating..." : "Generate Compliance Briefing"}
          </button>
          <a href="/api/intelligence/sample" target="_blank" className="px-4 py-2 border border-border text-[11px] cursor-default min-h-[40px] inline-flex items-center">
            Download Sample PDF
          </a>
        </div>
        {error && <div className="text-[11px] text-red-600 mt-2">Error: {error}</div>}
      </div>

      {/* Generated Issues */}
      <div className="mb-6">
        <h2 className="text-[12px] font-semibold mb-2">Generated Issues</h2>
        <div className="hidden md:block border border-border">
          <table className="w-full text-[12px]">
            <thead><tr className="text-left border-b border-border bg-surface">
              <th className="px-3 py-1.5 font-medium text-muted">Issue</th>
              <th className="px-3 py-1.5 font-medium text-muted">Tier</th>
              <th className="px-3 py-1.5 font-medium text-muted">Generated</th>
              <th className="px-3 py-1.5 font-medium text-muted">Actions</th>
            </tr></thead>
            <tbody>
              {issues.map((issue: any) => (
                <tr key={issue.id} className="border-b border-border/60 hover:bg-surface/60">
                  <td className="px-3 py-1.5">{issue.issue_label}</td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-muted">{issue.tier || "\u2014"}</td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-muted">{issue.created_at?.split("T")[0] || ""}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1.5">
                      <a href={issue.pdf_url} target="_blank" className="text-[9px] px-1.5 py-0.5 border border-border hover:bg-surface cursor-default">View PDF</a>
                      <button onClick={() => handleCopyLink(issue.pdf_url)} className="text-[9px] px-1.5 py-0.5 border border-border hover:bg-surface cursor-default">Copy download link</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {issues.length === 0 && <div className="text-[11px] text-muted py-3">No reports generated yet.</div>}
      </div>

      {/* Report Orders */}
      <div>
        <h2 className="text-[12px] font-semibold mb-2">Report Requests</h2>
        <div className="hidden md:block border border-border">
          <table className="w-full text-[12px]">
            <thead><tr className="text-left border-b border-border bg-surface">
              <th className="px-3 py-1.5 font-medium text-muted">Date</th>
              <th className="px-3 py-1.5 font-medium text-muted">Product</th>
              <th className="px-3 py-1.5 font-medium text-muted">Tier</th>
              <th className="px-3 py-1.5 font-medium text-muted">Buyer</th>
              <th className="px-3 py-1.5 font-medium text-muted text-right">Charge</th>
              <th className="px-3 py-1.5 font-medium text-muted">Status</th>
              <th className="px-3 py-1.5 font-medium text-muted">Actions</th>
            </tr></thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id} className="border-b border-border/60 hover:bg-surface/60">
                  <td className="px-3 py-1.5 font-mono text-[10px] text-muted">{o.created_at?.split("T")[0] || ""}</td>
                  <td className="px-3 py-1.5">{o.product_name}</td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-muted">{o.tier_label}</td>
                  <td className="px-3 py-1.5">{o.buyer_name || "\u2014"}{o.company ? " (" + o.company + ")" : ""}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{o.charge ? "$" + o.charge.toLocaleString() : "\u2014"}</td>
                  <td className="px-3 py-1.5">
                    <select value={o.status} onChange={(e) => handleOrderStatus(o.id, e.target.value)}
                            className={"text-[10px] font-semibold uppercase px-1.5 py-0.5 cursor-default border-0 outline-none " + (o.status === "Requested" ? "bg-yellow-500 text-white" : o.status === "Invoiced" ? "bg-blue-600 text-white" : o.status === "Paid" ? "bg-green-700 text-white" : "bg-[#6E6C69] text-white")}>
                      <option>Requested</option><option>Invoiced</option><option>Paid</option><option>Delivered</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => handleCopyInvoice(o)} className="text-[9px] px-1.5 py-0.5 border border-border hover:bg-surface cursor-default">Copy invoice</button>
                      {buildOrderWaUrl(o) && (
                        <a href={buildOrderWaUrl(o)!} target="_blank" className="text-[9px] px-1.5 py-0.5 bg-[#25D366] text-white cursor-default">WA</a>
                      )}
                      {o.status === "Paid" && (
                        <button onClick={() => handleOrderStatus(o.id, "Delivered")} className="text-[9px] px-1.5 py-0.5 bg-[#A6A6AB] text-[#EAE8E4] cursor-default">Mark delivered</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden space-y-3">
          {orders.map((o: any) => (
            <div key={o.id} className="border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-mono">{o.tier_label}</span>
                <select value={o.status} onChange={(e) => handleOrderStatus(o.id, e.target.value)}
                        className={"text-[10px] font-semibold uppercase px-1.5 py-0.5 cursor-default border-0 outline-none " + (o.status === "Requested" ? "bg-yellow-500 text-white" : o.status === "Invoiced" ? "bg-blue-600 text-white" : o.status === "Paid" ? "bg-green-700 text-white" : "bg-[#6E6C69] text-white")}>
                  <option>Requested</option><option>Invoiced</option><option>Paid</option><option>Delivered</option>
                </select>
              </div>
              <div className="text-[12px] font-medium">{o.product_name}</div>
              <div className="flex justify-between items-center mt-1 text-[10px]">
                <span className="text-muted">{o.buyer_name || "\u2014"}{o.buyer_email ? " \u00b7 " + o.buyer_email : ""}</span>
                <span className="font-mono font-medium">{o.charge ? "$" + o.charge.toLocaleString() : "\u2014"}</span>
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                <button onClick={() => handleCopyInvoice(o)} className="flex-1 py-1.5 border border-border text-[10px] text-muted cursor-default">Copy invoice</button>
                {buildOrderWaUrl(o) && (
                  <a href={buildOrderWaUrl(o)!} target="_blank" className="flex-1 py-1.5 bg-[#25D366] text-white text-[10px] font-medium text-center cursor-default">Send WA</a>
                )}
                {o.status === "Paid" && (
                  <button onClick={() => handleOrderStatus(o.id, "Delivered")} className="flex-1 py-1.5 bg-[#A6A6AB] text-[#EAE8E4] text-[10px] cursor-default">Mark delivered</button>
                )}
              </div>
            </div>
          ))}
        </div>
        {orders.length === 0 && <div className="text-[11px] text-muted py-3">No report requests yet.</div>}
      </div>
    </div>
  );
}

/* BILLING & USAGE TAB */

function BillingTab() {
  const [stats, setStats] = useState<any>(null);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBalance, setEditingBalance] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [service, setService] = useState("");
  useEffect(() => {
    Promise.all([
      fetch("/api/usage").then(r => r.ok ? r.json() : null),
      fetch("/api/balances").then(r => r.ok ? r.json() : []),
    ]).then(([s, b]) => { setStats(s); setBalances(b || []); }).finally(() => setLoading(false));
  }, []);
  async function handleSaveBalance() {
    if (!service || !amount) return;
    await fetch("/api/balances", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({service, amount: parseFloat(amount), note}) });
    const b = await fetch("/api/balances").then(r => r.ok ? r.json() : []);
    setBalances(b || []); setEditingBalance(null); setService(""); setAmount(""); setNote("");
  }
  if (loading) return <div className="px-4 md:px-6 py-10 text-[12px] text-[#6E6C69]">Loading...</div>;
  const days = stats?.byDay ? Object.entries(stats.byDay).sort(([a]:any,[b]:any) => a.localeCompare(b)) : [];
  const maxCost = Math.max(...days.map(([,d]:any) => d.cost), 0.01);
  return (
    <div className="px-4 md:px-6 py-4 max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h2 className="text-[12px] font-medium mb-3">This Month - DeepSeek Usage</h2>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="border border-[rgba(23,23,23,0.08)] bg-[#EAE8E4] p-3 text-center">
            <div className="text-[20px] font-light text-[#171717]">{stats?.totalCalls || 0}</div>
            <div className="text-[9px] uppercase tracking-wider text-[#6E6C69]">API Calls</div>
          </div>
          <div className="border border-[rgba(23,23,23,0.08)] bg-[#EAE8E4] p-3 text-center">
            <div className="text-[20px] font-light text-[#171717]">{stats?.totalTokens?.toLocaleString() || 0}</div>
            <div className="text-[9px] uppercase tracking-wider text-[#6E6C69]">Tokens</div>
          </div>
          <div className="border border-[rgba(23,23,23,0.08)] bg-[#EAE8E4] p-3 text-center">
            <div className="text-[20px] font-light text-[#171717]">${stats?.totalCost?.toFixed(4) || "0.0000"}</div>
            <div className="text-[9px] uppercase tracking-wider text-[#6E6C69]">Est. Cost</div>
          </div>
        </div>
        {days.length > 0 && (
          <div className="border border-[rgba(23,23,23,0.08)] bg-[#EAE8E4] p-4">
            <div className="text-[10px] uppercase tracking-wider text-[#6E6C69] font-medium mb-3">Daily Usage</div>
            <div className="flex items-end gap-1" style={{height:80}}>
              {days.map(([day, d]: any) => (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t" style={{height: `${(d.cost/maxCost)*60}px`, background: "#A6A6AB", minHeight: 2}} title={`${day}: ${d.calls} calls, $${d.cost.toFixed(4)}`} />
                  <span className="text-[7px] text-[#6E6C69]">{day.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {days.length === 0 && <div className="text-[11px] text-[#6E6C69]">No usage data this month.</div>}
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[12px] font-medium">Service Balances</h2>
          <button onClick={() => setEditingBalance(editingBalance ? null : "new")} className="text-[10px] px-2 py-1 bg-[#A6A6AB] text-[#EAE8E4] cursor-default">
            {editingBalance ? "Cancel" : "Edit Balance"}
          </button>
        </div>
        {editingBalance && (
          <div className="border border-[rgba(23,23,23,0.08)] bg-[#EAE8E4] p-3 mb-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <select value={service} onChange={e => setService(e.target.value)} className="field-input min-h-[32px] text-[11px]">
                <option value="">Service...</option>
                <option value="deepseek">DeepSeek API</option>
                <option value="jina">Jina AI Tokens</option>
                <option value="dify">Dify Credits</option>
              </select>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (USD)" className="field-input min-h-[32px] text-[11px]" />
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note" className="field-input min-h-[32px] text-[11px]" />
            </div>
            <button onClick={handleSaveBalance} className="px-4 py-1.5 bg-[#A6A6AB] text-[#EAE8E4] text-[11px] font-medium cursor-default">Save</button>
          </div>
        )}
        <div className="border border-[rgba(23,23,23,0.08)]">
          <table className="w-full text-[12px]">
            <thead><tr className="text-left border-b border-[rgba(23,23,23,0.08)] bg-[#EAE8E4]">
              <th className="px-3 py-1.5 font-medium text-[#6E6C69]">Service</th>
              <th className="px-3 py-1.5 font-medium text-[#6E6C69] text-right">Balance</th>
              <th className="px-3 py-1.5 font-medium text-[#6E6C69]">Note</th>
              <th className="px-3 py-1.5 font-medium text-[#6E6C69]">Updated</th>
            </tr></thead>
            <tbody>
              {balances.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-[#6E6C69] text-center">No balances set.</td></tr>
              ) : balances.map((b: any) => (
                <tr key={b.id} className="border-b border-[rgba(23,23,23,0.08)]/60">
                  <td className="px-3 py-1.5 font-medium text-[#171717]">{b.service}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-[#171717]">${b.amount?.toFixed(2) || "0"}</td>
                  <td className="px-3 py-1.5 text-[#6E6C69]">{b.note || "\u2014"}</td>
                  <td className="px-3 py-1.5 text-[#6E6C69] font-mono">{b.updated_at?.split("T")[0] || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 border border-[rgba(23,23,23,0.08)] bg-[#EAE8E4] p-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase tracking-wider text-[#6E6C69] font-medium">Monthly Estimated Total</span>
            <span className="text-[14px] font-light text-[#171717]">${stats?.totalCost?.toFixed(4) || "0.0000"}</span>
          </div>
        </div>
      </div>
      <div>
        <h2 className="text-[12px] font-medium mb-3">Platform Links</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <a href="https://platform.deepseek.com/usage" target="_blank" rel="noopener noreferrer" className="border border-[rgba(23,23,23,0.08)] bg-[#EAE8E4] p-3 text-center text-[11px] text-[#171717] font-light hover:border-[#A6A6AB] transition-colors">DeepSeek Usage</a>
          <a href="https://jina.ai/dashboard" target="_blank" rel="noopener noreferrer" className="border border-[rgba(23,23,23,0.08)] bg-[#EAE8E4] p-3 text-center text-[11px] text-[#171717] font-light hover:border-[#A6A6AB] transition-colors">Jina AI Dashboard</a>
          <a href="https://vercel.com/dashboard/usage" target="_blank" rel="noopener noreferrer" className="border border-[rgba(23,23,23,0.08)] bg-[#EAE8E4] p-3 text-center text-[11px] text-[#171717] font-light hover:border-[#A6A6AB] transition-colors">Vercel Usage</a>
          <a href="https://cloud.appwrite.io" target="_blank" rel="noopener noreferrer" className="border border-[rgba(23,23,23,0.08)] bg-[#EAE8E4] p-3 text-center text-[11px] text-[#171717] font-light hover:border-[#A6A6AB] transition-colors">Appwrite Overview</a>
        </div>
      </div>
    </div>
  );
}

