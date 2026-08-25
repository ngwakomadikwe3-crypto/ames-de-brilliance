"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";

interface Trader {
  id: number; name: string; whatsapp: string; licence: string;
  portal_code: string; email: string; status: "Pending" | "Active" | "Declined";
  company: string; country: string; licence_photo: string;
  created_at: string;
}

interface StoneRow {
  id: string; ref: string; stone_type: string; shape: string;
  carat: number; color: string; clarity: string; cut: string;
  certification: string; price: number | null; status: string;
  photo: string; listing_category: string; created_at: string;
  status_log: { id: number; status: string; reason: string; changed_at: string }[];
}

const PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#e5e7eb" width="400" height="400"/><text x="200" y="200" font-family="system-ui,sans-serif" font-size="13" fill="#9ca3af" text-anchor="middle">No photo</text></svg>'
);

export default function TraderPortal() {
  const params = useParams();
  const code = params.code as string;
  const [trader, setTrader] = useState<Trader | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/trader/" + code)
      .then(r => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then(d => setTrader(d))
      .catch(() => setError("Trader not found"))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) return <div className="min-h-[100dvh] flex items-center justify-center text-[12px] text-muted">Loading...</div>;
  if (error || !trader) return <div className="min-h-[100dvh] flex items-center justify-center text-[12px] text-muted">{error || "Not found"}</div>;

  if (trader.status !== "Active") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-4">
          <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mx-auto">
            <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#000" strokeWidth="1.5" fill="none" />
          </svg>
          <h1 className="text-[16px] font-bold">{trader.name}</h1>
          <p className="text-[13px] text-muted leading-relaxed">
            Contact the desk on WhatsApp to complete onboarding.
          </p>
        </div>
      </div>
    );
  }

  return <TraderTabs trader={trader} />;
}

type Tab = "list" | "items" | "reports";

function TraderTabs({ trader }: { trader: Trader }) {
  const [tab, setTab] = useState<Tab>("list");
  return (
    <div className="min-h-[100dvh] flex flex-col bg-white">
      <header className="border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4"><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#000" strokeWidth="1.5" fill="none" /></svg>
          <span className="text-[13px] font-bold tracking-tight">{trader.name}</span>
        </div>
      </header>
      <div className="flex border-b border-border shrink-0">
        <button onClick={() => setTab("list")} className={`flex-1 py-2.5 text-[12px] font-medium text-center cursor-default ${tab === "list" ? "border-b-2 border-black text-black" : "text-muted"}`}>List items</button>
        <button onClick={() => setTab("items")} className={`flex-1 py-2.5 text-[12px] font-medium text-center cursor-default ${tab === "items" ? "border-b-2 border-black text-black" : "text-muted"}`}>My items</button>
        <button onClick={() => setTab("reports")} className={`flex-1 py-2.5 text-[12px] font-medium text-center cursor-default ${tab === "reports" ? "border-b-2 border-black text-black" : "text-muted"}`}>Reports</button>
      </div>
      <div className="flex-1 min-h-0">
        {tab === "list" && <ListItemsTab trader={trader} />}
        {tab === "items" && <MyItemsTab trader={trader} />}
        {tab === "reports" && <ReportsTab trader={trader} />}
      </div>
    </div>
  );
}

type ListMode = "single" | "paste";

function ListItemsTab({ trader }: { trader: Trader }) {
  const [mode, setMode] = useState<ListMode>("single");
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex border-b border-border shrink-0">
        <button onClick={() => setMode("single")} className={`flex-1 py-2 text-[11px] font-medium text-center cursor-default ${mode === "single" ? "border-b-2 border-black text-black" : "text-muted"}`}>Single item</button>
        <button onClick={() => setMode("paste")} className={`flex-1 py-2 text-[11px] font-medium text-center cursor-default ${mode === "paste" ? "border-b-2 border-black text-black" : "text-muted"}`}>Paste a list</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {mode === "single" ? <SingleItemForm trader={trader} /> : <PasteListTab trader={trader} />}
      </div>
    </div>
  );
}

function SingleItemForm({ trader }: { trader: Trader }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [lc, setLc] = useState<"Rough"|"Polished"|"Jewelry">("Polished");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("listing_category", lc);
    fd.set("stone_type", lc === "Rough" ? "rough" : "polished");
    const res = await fetch("/api/trader/" + trader.portal_code + "/stones", { method: "POST", body: fd });
    if (res.ok) { const d = await res.json(); setSaved(d.ref); e.currentTarget.reset(); setLc("Polished"); }
  }

  if (saved) return (
    <div className="p-6 text-center space-y-3">
      <p className="text-[13px]"><strong>{saved}</strong> submitted for review.</p>
      <p className="text-[11px] text-muted">The desk will review and publish your item.</p>
      <button onClick={() => setSaved(null)} className="text-[12px] underline text-muted">List another</button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="p-4 max-w-lg mx-auto w-full flex flex-col gap-4">
      <div><label className="block text-[11px] font-medium mb-1">Photo</label><input name="photo" type="file" accept="image/*" className="field-input min-h-[40px]" /></div>
      <div><label className="block text-[11px] font-medium mb-1">Category</label>
        <select value={lc} onChange={e => setLc(e.target.value as any)} className="field-input min-h-[40px]"><option>Rough</option><option>Polished</option><option>Jewelry</option></select></div>
      <div><label className="block text-[11px] font-medium mb-1">{lc==="Jewelry"?"Piece description":"Shape"}</label>
        <input name="shape" required className="field-input min-h-[40px]" placeholder={lc==="Jewelry"?"e.g. Tennis bracelet":"e.g. Round Brilliant"} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-[11px] font-medium mb-1">Carat</label><input name="carat" type="number" step="0.01" min="0.01" required className="field-input min-h-[40px]" /></div>
        <div><label className="block text-[11px] font-medium mb-1">Color</label><input name="color" required className="field-input min-h-[40px]" placeholder="e.g. G" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-[11px] font-medium mb-1">Clarity</label><input name="clarity" className="field-input min-h-[40px]" placeholder="e.g. VS1" /></div>
        <div><label className="block text-[11px] font-medium mb-1">Certification</label><input name="certification" className="field-input min-h-[40px]" placeholder="e.g. GIA" /></div>
      </div>
      <div><label className="block text-[11px] font-medium mb-1">Price (USD)</label><input name="price" type="number" min="0" className="field-input min-h-[40px]" placeholder="Leave blank for price on request" /></div>
      <div><label className="block text-[11px] font-medium mb-1">Notes</label><textarea name="clarity_notes" rows={2} className="field-input resize-none" placeholder="Any extra detail..." /></div>
      <button type="submit" className="w-full py-2 bg-black text-white text-[13px] font-medium cursor-default min-h-[40px]">Submit for review</button>
    </form>
  );
}

function PasteListTab({ trader }: { trader: Trader }) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ stones: any[]; skipped: string[] } | null>(null);
  const [edits, setEdits] = useState<Record<number, any>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<string[] | null>(null);

  async function handleParse() {
    if (!text.trim()) return;
    setParsing(true); setParseError(null); setParsed(null); setEdits({}); setChecked({}); setPublished(null);
    try {
      const res = await fetch("/api/ai/parse-stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error("Parse failed");
      const data = await res.json(); setParsed(data);
      const c: Record<number, boolean> = {}; data.stones.forEach((_: any, i: number) => { c[i] = true; }); setChecked(c);
    } catch (e: any) { setParseError(e.message); } finally { setParsing(false); }
  }

  function updateEdit(idx: number, field: string, value: any) { setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], [field]: value } })); }
  function getStone(idx: number) { return { ...(parsed?.stones[idx] || {}), ...(edits[idx] || {}) }; }

  async function handlePublish() {
    if (!parsed) return; setPublishing(true); const refs: string[] = [];
    for (let i = 0; i < parsed.stones.length; i++) {
      if (checked[i] === false) continue;
      const s = getStone(i); const isRough = s.type === "rough";
      const payload: Record<string, string> = {
        stone_type: s.type || "polished", shape: isRough ? (s.shape_or_form || "") : (s.shape_or_form || "Round Brilliant"),
        carat: String(s.carat || 0), color: s.color || "", clarity: s.clarity || "", cut: isRough ? "" : (s.notes || ""),
        certification: s.certification || "None", category: isRough ? (s.category || "") : "",
        crystal_form: isRough ? (s.shape_or_form || "") : "", clarity_notes: isRough ? (s.clarity || "") : "",
        kp_status: isRough ? "true" : "false", price: s.price != null ? String(s.price) : "",
        listing_category: isRough ? "Rough" : "Polished",
      };
      try { const res = await fetch("/api/trader/" + trader.portal_code + "/stones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (res.ok) { const d = await res.json(); refs.push(d.ref); } } catch { /* skip */ }
    }
    setPublishing(false); setPublished(refs);
  }

  return (
    <div className="p-4 max-w-3xl mx-auto w-full flex flex-col gap-4">
      <div><label className="block text-[11px] font-medium mb-1">Paste stock text</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={8} className="field-input resize-y min-h-[100px]" placeholder="Paste WhatsApp messages or stone listing text here..." /></div>
      <button onClick={handleParse} disabled={parsing || !text.trim()} className="w-full py-2 bg-black text-white text-[13px] font-medium cursor-default disabled:opacity-50 min-h-[40px]">{parsing ? "Parsing..." : "Parse"}</button>
      {parseError && <div className="border border-red-300 bg-red-50 p-3 text-[11px] text-red-700">{parseError}</div>}
      {parsed && (
        <div className="space-y-3">
          <div className="text-[11px] text-muted font-mono">{parsed.stones.length} stones parsed, {parsed.skipped.length} skipped</div>
          {parsed.stones.map((_: any, i: number) => {
            const s = getStone(i); const isRough = s.type === "rough";
            return (
              <div key={i} className="border border-border p-3">
                <label className="flex items-start gap-2 cursor-default">
                  <input type="checkbox" checked={checked[i] !== false} onChange={e => setChecked(prev => ({ ...prev, [i]: e.target.checked }))} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">{s.type}</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><label className="text-muted text-[10px]">{isRough?"Crystal Form":"Shape"}</label><input value={s.shape_or_form||""} onChange={e=>updateEdit(i,"shape_or_form",e.target.value)} className="field-input min-h-[32px] text-[11px]" /></div>
                      <div><label className="text-muted text-[10px]">Carat</label><input value={s.carat||""} onChange={e=>updateEdit(i,"carat",e.target.value)} className="field-input min-h-[32px] text-[11px]" /></div>
                      <div><label className="text-muted text-[10px]">Color</label><input value={s.color||""} onChange={e=>updateEdit(i,"color",e.target.value)} className="field-input min-h-[32px] text-[11px]" /></div>
                      <div><label className="text-muted text-[10px]">Clarity</label><input value={s.clarity||""} onChange={e=>updateEdit(i,"clarity",e.target.value)} className="field-input min-h-[32px] text-[11px]" /></div>
                      <div><label className="text-muted text-[10px]">Certification</label><input value={s.certification||""} onChange={e=>updateEdit(i,"certification",e.target.value)} className="field-input min-h-[32px] text-[11px]" /></div>
                      <div><label className="text-muted text-[10px]">Price</label><input value={s.price??""} onChange={e=>updateEdit(i,"price",e.target.value?Number(e.target.value):null)} type="number" className="field-input min-h-[32px] text-[11px]" /></div>
                    </div>
                  </div>
                </label>
              </div>
            );
          })}
          {published ? (
            <div className="bg-surface border border-border p-3 text-[11px]"><p className="font-medium mb-1">{published.length} items submitted for review.</p><p className="text-muted">The desk will review and publish.</p></div>
          ) : (
            <button onClick={handlePublish} disabled={publishing||!parsed.stones.some((_:any,i:number)=>checked[i]!==false)} className="w-full py-2 bg-black text-white text-[13px] font-medium cursor-default disabled:opacity-50 min-h-[40px]">{publishing?"Submitting...":"Submit selected for review"}</button>
          )}
        </div>
      )}
    </div>
  );
}

function MyItemsTab({ trader }: { trader: Trader }) {
  const [stones, setStones] = useState<StoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchStones = useCallback(async () => {
    try { const res = await fetch("/api/trader/" + trader.portal_code + "/stones"); if (res.ok) setStones(await res.json()); }
    catch { /* */ } finally { setLoading(false); }
  }, [trader.portal_code]);

  useEffect(() => { fetchStones(); }, [fetchStones]);

  if (loading) return <div className="p-6 text-[12px] text-muted text-center">Loading...</div>;
  if (stones.length === 0) return <div className="p-6 text-[12px] text-muted text-center">No items listed yet.</div>;

  function sc(s: string) {
    switch (s) { case "Pending": return "bg-yellow-500 text-white"; case "Available": return "bg-green-700 text-white"; case "Reserved": return "bg-blue-600 text-white"; case "Sold": return "bg-gray-400 text-white"; case "Rejected": return "bg-red-600 text-white"; default: return "bg-gray-200 text-black"; }
  }

  return (
    <div className="p-4 space-y-3">
      {stones.map(s => {
        const hasPhoto = s.photo && s.photo.length > 10 && !s.photo.startsWith("data:");
        const photo = hasPhoto ? s.photo : PLACEHOLDER;
        const isOpen = expanded === s.id;
        return (
          <div key={s.id} className="border border-border bg-white">
            <div className="flex gap-3 p-3 cursor-default" onClick={() => setExpanded(isOpen ? null : s.id)}>
              <div className="w-16 h-16 bg-surface overflow-hidden shrink-0"><img src={photo} alt={s.ref} className="w-full h-full object-cover" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-medium">{s.ref}</span>
                  <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 ${sc(s.status)}`}>{s.status}</span>
                </div>
                <div className="text-[11px] text-muted mt-0.5">{s.shape} &middot; {s.carat}ct &middot; {s.color} &middot; {s.clarity || s.certification}</div>
                <div className="text-[11px] font-medium mt-0.5">{s.price ? "$" + s.price.toLocaleString() : "Price on request"}</div>
              </div>
            </div>
            {isOpen && s.status_log.length > 0 && (
              <div className="border-t border-border p-3 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Status history</div>
                {s.status_log.map(log => (
                  <div key={log.id} className="flex items-center gap-2 text-[10px]">
                    <span className={`font-semibold uppercase px-1 py-0.5 ${sc(log.status)}`}>{log.status}</span>
                    <span className="text-muted font-mono">{log.changed_at.split("T")[0]}</span>
                    {log.reason && <span className="text-muted">- {log.reason}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReportsTab({ trader }: { trader: Trader }) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/reports/weekly?trader_id=" + trader.id)
      .then(r => r.ok ? r.json() : [])
      .then(d => setReports(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [trader.id]);

  if (loading) return <div className="p-6 text-[12px] text-muted text-center">Loading...</div>;
  if (reports.length === 0) return <div className="p-6 text-[12px] text-muted text-center">No reports yet. Your first weekly report will appear here after the desk generates one.</div>;

  return (
    <div className="p-4 space-y-3">
      {reports.map((r) => {
        let data: any = {};
        try { data = JSON.parse(r.data || "{}"); } catch { /* */ }
        return (
          <div key={r.id} className="border border-border bg-white">
            <div className="p-3 cursor-default" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-medium">
                  Week of {r.period_start?.split("T")[0] || ""} — {r.period_end?.split("T")[0] || ""}
                </div>
                <span className="text-[10px] text-muted font-mono">{r.created_at?.split("T")[0] || ""}</span>
              </div>
              {data.total_commission != null && (
                <div className="text-[11px] text-muted mt-1">
                  Commission earned: <strong>${data.total_commission.toLocaleString()}</strong>
                  {data.total_revenue != null && <span className="ml-2">(Revenue: ${data.total_revenue.toLocaleString()})</span>}
                </div>
              )}
            </div>
            {expanded === r.id && (
              <div className="border-t border-border p-3 space-y-3">
                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="border border-border p-2">
                    <div className="text-[18px] font-bold">{data.live?.length || 0}</div>
                    <div className="text-[9px] uppercase tracking-wider text-muted">Live</div>
                  </div>
                  <div className="border border-border p-2">
                    <div className="text-[18px] font-bold">{data.sold?.length || 0}</div>
                    <div className="text-[9px] uppercase tracking-wider text-muted">Sold</div>
                  </div>
                  <div className="border border-border p-2">
                    <div className="text-[18px] font-bold">${(data.total_commission || 0).toLocaleString()}</div>
                    <div className="text-[9px] uppercase tracking-wider text-muted">Commission</div>
                  </div>
                </div>
                {/* Sold items detail */}
                {data.sold && data.sold.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Items sold</div>
                    <div className="space-y-1">
                      {data.sold.map((s: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-[11px] border border-border/60 p-2">
                          <span><strong>{s.ref}</strong> {s.shape} {s.carat}ct {s.color}</span>
                          <span className="font-mono">${s.sale_price?.toLocaleString() || 0} <span className="text-muted">({s.commission_pct}% → ${s.commission_amount?.toLocaleString() || 0})</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Full status list */}
                {data.full_status && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Full status list</div>
                    <pre className="text-[10px] font-mono whitespace-pre-wrap bg-surface border border-border p-2">{r.summary}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
