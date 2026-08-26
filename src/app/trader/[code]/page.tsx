"use client";

import { BrandMark } from "@/components/BrandMark";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";

interface Trader {
  id: number; name: string; whatsapp: string; licence: string;
  portal_code: string; email: string; status: "Pending" | "Active" | "Declined";
  company: string; country: string; licence_photo: string;
  created_at: string; preferred?: boolean;
}

interface StoneRow {
  id: string; ref: string; stone_type: string; shape: string;
  carat: number; color: string; clarity: string; cut: string;
  certification: string; price: number | null; status: string;
  photo: string; listing_category: string; created_at: string;
  status_log: { id: number; status: string; reason: string; changed_at: string }[];
  sales_count?: number;
}

const PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#1A1A1A" width="400" height="400"/><text x="200" y="200" font-family="sans-serif" font-size="13" fill="#9A938A" text-anchor="middle">No photo</text></svg>'
);

export default function TraderPage() {
  const params = useParams();
  const code = params.code as string;
  const [trader, setTrader] = useState<Trader | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [phone, setPhone] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);

  // Try loading via authenticated portal first (legacy codes / saved session)
  useEffect(() => {
    fetch("/api/trader/" + code)
      .then(r => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then(d => { setTrader(d); setAuthenticated(true); })
      .catch(() => setShowLogin(true))
      .finally(() => setLoading(false));
  }, [code]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLogging(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/trader/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, phone }),
      });
      if (!res.ok) {
        const data = await res.json();
        setLoginError(data.error || "Invalid credentials");
        return;
      }
      const data = await res.json();
      setTrader(data);
      setAuthenticated(true);
    } catch {
      setLoginError("Connection failed. Please try again.");
    } finally {
      setLogging(false);
    }
  }

  if (loading) return (
    <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: "#0B0C0D" }}>
      <div className="text-[12px]" style={{ color: "#9A938A" }}>Loading...</div>
    </div>
  );

  // Show public portfolio for inactive/unknown traders, or login for active ones
  if (showLogin && !authenticated) {
    return <TraderLogin code={code} />;
  }

  if (trader && trader.status !== "Active" && !authenticated) {
    return <TraderPublic code={code} />;
  }

  if (authenticated && trader) {
    return trader.status === "Active" ? <TraderTabs trader={trader} /> : <TraderPublic code={code} />;
  }

  return <TraderLogin code={code} />;
}

// ──────────────────────────────────────
// Public Portfolio Page
// ──────────────────────────────────────
function TraderPublic({ code }: { code: string }) {
  const [stones, setStones] = useState<any[]>([]);
  const [trader, setTrader] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/trader/public/${code}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setTrader(d.trader); setStones(d.stones || []); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) return (
    <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: "#0B0C0D" }}>
      <div className="text-[12px]" style={{ color: "#9A938A" }}>Loading...</div>
    </div>
  );

  if (!trader) return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6" style={{ background: "#0B0C0D" }}>
      <div className="max-w-sm text-center space-y-4">
        <BrandMark height={36} />
        <p className="text-[13px] font-light text-[#9A938A]">This portfolio is not available.</p>
      </div>
    </div>
  );

  const live = stones.filter((s: any) => s.status === "Available");

  return (
    <div className="min-h-[100dvh]" style={{ background: "#0B0C0D" }}>
      {/* Header */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 pt-12 pb-8">
        <div className="mb-6"><BrandMark height={28} /></div>

        <div className="flex items-start gap-6 mb-6">
          <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center shrink-0"
            style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#1a1c1e" }}>
            <span className="text-[20px] font-light text-[#9A938A]">{(trader.name || "?")[0]}</span>
          </div>
          <div>
            <h1 className="text-[20px] font-light text-[#FAF8F4] mb-1">{trader.name}</h1>
            {trader.company && <p className="text-[12px] font-light text-[#9A938A]">{trader.company}</p>}
            {trader.country && <p className="text-[11px] font-light text-[#9A938A] mt-1">{trader.country}</p>}
          </div>
        </div>

        {trader.preferred && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-6"
            style={{ border: "1px solid #C9A227", background: "rgba(22,24,26,0.9)" }}>
            <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
              <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.5" fill="none" />
            </svg>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: "#C9A227" }}>
              Preferred Source
            </span>
          </div>
        )}

        <p className="text-[11px] font-light text-[#9A938A]">
          Licensed partner &middot; {live.length} {live.length === 1 ? "stone" : "stones"} listed
        </p>
      </div>

      {/* Stones Grid */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 pb-12">
        <h2 className="text-[12px] font-medium text-[#9A938A] uppercase tracking-wider mb-4">Listed Stones</h2>
        {live.length === 0 ? (
          <p className="text-[12px] text-[#9A938A]">No stones currently listed.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {live.map((s: any) => {
              const photos = (s.photo || "").split("|").filter((u: string) => u.length > 10 && u.startsWith("http"));
              return (
                <div key={s.id} style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A" }}>
                  <div className="aspect-square overflow-hidden relative" style={{ background: "#1a1c1e" }}>
                    {photos.length > 0 ? (
                      <img src={photos[0]} alt={s.ref} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[11px] text-[#9A938A]">No photo</div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-mono text-[#9A938A]">{s.ref}</span>
                      <span className="text-[11px] font-light text-[#FAF8F4]">{s.price ? `$${s.price.toLocaleString()}` : "Price on request"}</span>
                    </div>
                    <p className="text-[10px] font-light text-[#9A938A]">{s.shape} {s.carat}ct {s.color}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────
// Login Page
// ──────────────────────────────────────
function TraderLogin({ code }: { code: string }) {
  const [trader, setTrader] = useState<Trader | null>(null);
  const [phone, setPhone] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [view, setView] = useState<"login" | "notfound">("login");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLogging(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/trader/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, phone }),
      });
      if (!res.ok) {
        const data = await res.json();
        setLoginError(data.error || "Invalid credentials");
        return;
      }
      const data = await res.json();
      window.location.reload();
    } catch {
      setLoginError("Connection failed. Please try again.");
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6" style={{ background: "#0B0C0D" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <BrandMark height={32} />
          <p className="text-[11px] mt-3" style={{ color: "#9A938A" }}>Trader Portal</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+267 XX XXX XXX"
              className="w-full px-4 py-2.5 text-[13px] font-light rounded-lg outline-none"
              style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }}
              required
            />
          </div>

          {loginError && (
            <div className="text-[11px] p-3 rounded-lg" style={{ color: "#B91C1C", background: "#FEE2E2", border: "1px solid #FECACA" }}>
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={logging || !phone.trim()}
            className="w-full py-2.5 text-white text-[13px] font-medium rounded-lg disabled:opacity-50 transition-opacity"
            style={{ background: "#1A1A1A" }}>
            {logging ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-[10px] mt-6" style={{ color: "#9A938A" }}>
          Contact the desk on WhatsApp for your access code
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────
// Private Portal Tabs
// ──────────────────────────────────────
type Tab = "list" | "items" | "numbers" | "reports";

function TraderTabs({ trader }: { trader: Trader }) {
  const [tab, setTab] = useState<Tab>("list");
  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "#0B0C0D" }}>
      <div className="shrink-0 px-4 py-3" style={{ borderBottom: "1px solid #EAE4DA", background: "rgba(250,248,244,0.95)" }}>
        <div className="flex items-center gap-2">
          <BrandMark variant="compact" height={18} />
          <span className="text-[13px] font-light tracking-[0.1em]" style={{ color: "#FAF8F4" }}>{trader.name}</span>
        </div>
      </div>

      <div className="flex shrink-0 overflow-x-auto" style={{ borderBottom: "1px solid #EAE4DA" }}>
        {(["list", "items", "numbers", "reports"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-3 py-2.5 text-[11px] font-light text-center whitespace-nowrap transition-colors"
            style={{
              color: tab === t ? "#1A1A1A" : "#9A938A",
              borderBottom: tab === t ? "2px solid #C9A227" : "2px solid transparent"
            }}>
            {t === "list" ? "List items" : t === "items" ? "My items" : t === "numbers" ? "My numbers" : "Reports"}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "list" && <ListItemsTab trader={trader} />}
        {tab === "items" && <MyItemsTab trader={trader} />}
        {tab === "numbers" && <TraderNumbersTab trader={trader} />}
        {tab === "reports" && <ReportsTab trader={trader} />}
      </div>
    </div>
  );
}

// ──────────────────────────────────────
// My Numbers Tab
// ──────────────────────────────────────
function TraderNumbersTab({ trader }: { trader: Trader }) {
  const [stones, setStones] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/trader/" + trader.portal_code + "/stones").then(r => r.ok ? r.json() : []),
      fetch("/api/trader/" + trader.portal_code + "/stones").then(r => r.ok ? r.json() : []),
    ]).then(([s]) => {
      setStones(s);
      // Fetch orders for these stones
      const stoneIds = s.map((st: any) => st.id);
      if (stoneIds.length > 0) {
        fetch("/api/orders").then(r => r.ok ? r.json() : []).then((o: any[]) => {
          setOrders(o.filter(ord => stoneIds.includes(ord.stone_id)));
        }).catch(() => {});
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [trader.portal_code]);

  if (loading) return <div className="p-6 text-[12px] text-center" style={{ color: "#9A938A" }}>Loading...</div>;

  const live = stones.filter((s: any) => s.status === "Available");
  const totalViews = stones.reduce((sum: number, s: any) => sum + (s.views || 0), 0);
  const totalReserves = stones.filter((s: any) => s.status === "Reserved" || s.status === "Sold").length;
  const totalSold = stones.filter((s: any) => s.status === "Sold").length;
  const totalSalesValue = orders
    .filter((o: any) => o.status === "Paid" || o.status === "Shipped" || o.status === "Closed")
    .reduce((sum: number, o: any) => sum + (o.price || 0), 0);
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const thisMonthSold = orders.filter((o: any) => {
    const d = new Date(o.created_at);
    return (o.status === "Paid" || o.status === "Sold") && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;
  const lastMonthSold = orders.filter((o: any) => {
    const d = new Date(o.created_at);
    return (o.status === "Paid" || o.status === "Sold") && d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
  });
  const convRate = totalReserves > 0 ? Math.round((totalSold / totalReserves) * 100) : 0;

  const stats = [
    { label: "Live Stones", value: live.length },
    { label: "Total Views", value: totalViews.toLocaleString() },
    { label: "Reserves", value: totalReserves },
    { label: "Sales", value: totalSold },
    { label: "Reserve → Sale", value: `${convRate}%` },
    { label: "Total Revenue", value: `$${totalSalesValue.toLocaleString()}` },
  ];

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <div className="text-[12px] font-medium text-[#9A938A] uppercase tracking-wider">Performance</div>
      <div className="grid grid-cols-3 gap-3">
        {stats.map(s => (
          <div key={s.label} className="text-center p-3" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A" }}>
            <div className="text-[18px] font-light text-[#FAF8F4]">{s.value}</div>
            <div className="text-[9px] uppercase tracking-wider text-[#9A938A] mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A" }}>
          <div className="text-[10px] uppercase tracking-wider text-[#9A938A] mb-1">This Month — Sales</div>
          <div className="text-[14px] font-light">{thisMonthSold.length}</div>
          <div className="text-[11px] text-[#9A938A]">${thisMonthSold.reduce((s: number, o: any) => s + (o.price || 0), 0).toLocaleString()}</div>
        </div>
        <div className="p-3" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A" }}>
          <div className="text-[10px] uppercase tracking-wider text-[#9A938A] mb-1">Last Month — Sales</div>
          <div className="text-[14px] font-light">{lastMonthSold.length}</div>
          <div className="text-[11px] text-[#9A938A]">${lastMonthSold.reduce((s: number, o: any) => s + (o.price || 0), 0).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────
// List Items Tab
// ──────────────────────────────────────
type ListMode = "single" | "paste";

function ListItemsTab({ trader }: { trader: Trader }) {
  const [mode, setMode] = useState<ListMode>("single");
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex shrink-0" style={{ borderBottom: "1px solid #EAE4DA" }}>
        {(["single", "paste"] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className="flex-1 py-2 text-[11px] font-light text-center transition-colors"
            style={{
              color: mode === m ? "#1A1A1A" : "#9A938A",
              borderBottom: mode === m ? "2px solid #C9A227" : "2px solid transparent"
            }}>
            {m === "single" ? "Single item" : "Paste a list"}
          </button>
        ))}
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
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  function handlePhotosChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, 6);
    setPhotos(files);
    const urls: string[] = [];
    files.forEach(f => { urls.push(URL.createObjectURL(f)); });
    setPhotoUrls(urls);
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
    setPhotoUrls(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploading(true);
    try {
      let allPhotoUrls: string[] = [];
      if (photos.length > 0) {
        const formData = new FormData();
        photos.forEach(f => formData.append("photos", f));
        const uploadRes = await fetch("/api/stones/photos", { method: "POST", body: formData });
        if (uploadRes.ok) { const data = await uploadRes.json(); allPhotoUrls = data.urls; }
      }
      const fd = new FormData(e.currentTarget);
      fd.set("listing_category", lc);
      fd.set("stone_type", lc === "Rough" ? "rough" : "polished");
      fd.set("photo", allPhotoUrls.join("|"));
      const res = await fetch("/api/trader/" + trader.portal_code + "/stones", { method: "POST", body: fd });
      if (res.ok) { const d = await res.json(); setSaved(d.ref); (e.target as HTMLFormElement).reset(); setLc("Polished"); setPhotos([]); setPhotoUrls([]); }
    } catch {}
    setUploading(false);
  }

  if (saved) return (
    <div className="p-6 text-center space-y-3">
      <p className="text-[13px] font-light" style={{ color: "#FAF8F4" }}><strong>{saved}</strong> submitted for review.</p>
      <p className="text-[11px] font-light" style={{ color: "#9A938A" }}>The desk will review and publish your item.</p>
      <button onClick={() => setSaved(null)} className="text-[12px] font-light" style={{ color: "#C9A227" }}>List another</button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="p-4 max-w-lg mx-auto w-full flex flex-col gap-4">
      <div>
        <label className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Photos (up to 6)</label>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {photoUrls.map((url, idx) => (
            <div key={idx} className="relative aspect-square overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => removePhoto(idx)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]"
                style={{ background: "rgba(0,0,0,0.5)" }}>×</button>
            </div>
          ))}
          {photos.length < 6 && (
            <label className="aspect-square flex flex-col items-center justify-center cursor-pointer"
              style={{ border: "1px dashed #C9A227", color: "#C9A227" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>
              <span className="text-[9px] mt-1">Add photo</span>
              <input type="file" accept="image/*" multiple onChange={handlePhotosChange} className="hidden" />
            </label>
          )}
        </div>
        <p className="text-[10px]" style={{ color: "#9A938A" }}>{photos.length}/6 photos selected</p>
      </div>

      <div>
        <label className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Category</label>
        <select value={lc} onChange={e => setLc(e.target.value as any)}
          className="w-full px-4 py-2.5 text-[13px] font-light rounded-lg outline-none"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }}>
          <option>Rough</option>
          <option>Polished</option>
          <option>Jewelry</option>
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>{lc === "Jewelry" ? "Piece description" : "Shape"}</label>
        <input name="shape" required className="w-full px-4 py-2.5 text-[13px] font-light rounded-lg outline-none"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }}
          placeholder={lc === "Jewelry" ? "e.g. Tennis bracelet" : "e.g. Round Brilliant"} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Carat</label>
          <input name="carat" type="number" step="0.01" min="0.01" required
            className="w-full px-4 py-2.5 text-[13px] font-light rounded-lg outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }} />
        </div>
        <div>
          <label className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Color</label>
          <input name="color" required className="w-full px-4 py-2.5 text-[13px] font-light rounded-lg outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }} placeholder="e.g. G" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Clarity</label>
          <input name="clarity" className="w-full px-4 py-2.5 text-[13px] font-light rounded-lg outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }} placeholder="e.g. VS1" />
        </div>
        <div>
          <label className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Certification</label>
          <input name="certification" className="w-full px-4 py-2.5 text-[13px] font-light rounded-lg outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }} placeholder="e.g. GIA" />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Asking Price (USD)</label>
        <input name="price" type="number" min="0" className="w-full px-4 py-2.5 text-[13px] font-light rounded-lg outline-none"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }} placeholder="Leave blank for price on request" />
      </div>

      <div>
        <label className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Notes</label>
        <textarea name="clarity_notes" rows={3} className="w-full px-4 py-2.5 text-[13px] font-light rounded-lg outline-none resize-none"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }} placeholder="Any extra detail..." />
      </div>

      <button type="submit" disabled={uploading}
        className="w-full py-2.5 text-white text-[13px] font-medium rounded-lg disabled:opacity-50 transition-opacity"
        style={{ background: "#1A1A1A" }}>
        {uploading ? "Submitting..." : "Submit for Review"}
      </button>
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
      const c: Record<number, boolean> = {};
      data.stones.forEach((_: any, i: number) => { c[i] = true; });
      setChecked(c);
    } catch (e: any) { setParseError(e.message); } finally { setParsing(false); }
  }

  function updateEdit(idx: number, field: string, value: any) {
    setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], [field]: value } }));
  }

  function getStone(idx: number) {
    return { ...(parsed?.stones[idx] || {}), ...(edits[idx] || {}) };
  }

  async function handlePublish() {
    if (!parsed) return;
    setPublishing(true);
    const refs: string[] = [];
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
        listing_category: isRough ? "Rough" : "Polished",
      };
      try {
        const res = await fetch("/api/trader/" + trader.portal_code + "/stones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) { const d = await res.json(); refs.push(d.ref); }
      } catch {}
    }
    setPublishing(false);
    setPublished(refs);
  }

  return (
    <div className="p-4 max-w-3xl mx-auto w-full flex flex-col gap-4">
      <div>
        <label className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Paste stock text</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
          className="w-full px-4 py-3 text-[13px] font-light rounded-lg outline-none resize-y"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }}
          placeholder="Paste WhatsApp messages or stone listing text here..." />
      </div>
      <button onClick={handleParse} disabled={parsing || !text.trim()}
        className="w-full py-2.5 text-white text-[13px] font-medium rounded-lg disabled:opacity-50 transition-opacity"
        style={{ background: "#C9A227" }}>
        {parsing ? "Parsing..." : "Parse"}
      </button>
      {parseError && (
        <div className="p-3 rounded-lg text-[11px]" style={{ color: "#B91C1C", background: "#FEE2E2", border: "1px solid #FECACA" }}>{parseError}</div>
      )}
      {parsed && (
        <div className="space-y-3">
          <div className="text-[11px]" style={{ color: "#9A938A", fontFamily: "monospace" }}>
            {parsed.stones.length} stones parsed, {parsed.skipped.length} skipped
          </div>
          {parsed.stones.map((_: any, i: number) => {
            const s = getStone(i);
            const isRough = s.type === "rough";
            return (
              <div key={i} className="p-3" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A" }}>
                <label className="flex items-start gap-2 cursor-default">
                  <input type="checkbox" checked={checked[i] !== false}
                    onChange={e => setChecked(prev => ({ ...prev, [i]: e.target.checked }))} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="text-[10px] uppercase tracking-wider font-light mb-1" style={{ color: "#9A938A" }}>{s.type}</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <label className="text-[10px]" style={{ color: "#9A938A" }}>{isRough ? "Crystal Form" : "Shape"}</label>
                        <input value={s.shape_or_form || ""} onChange={e => updateEdit(i, "shape_or_form", e.target.value)}
                          className="w-full px-2 py-1.5 text-[11px] font-light rounded outline-none" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#0B0C0D" }} />
                      </div>
                      <div>
                        <label className="text-[10px]" style={{ color: "#9A938A" }}>Carat</label>
                        <input value={s.carat || ""} onChange={e => updateEdit(i, "carat", e.target.value)}
                          className="w-full px-2 py-1.5 text-[11px] font-light rounded outline-none" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#0B0C0D" }} />
                      </div>
                      <div>
                        <label className="text-[10px]" style={{ color: "#9A938A" }}>Color</label>
                        <input value={s.color || ""} onChange={e => updateEdit(i, "color", e.target.value)}
                          className="w-full px-2 py-1.5 text-[11px] font-light rounded outline-none" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#0B0C0D" }} />
                      </div>
                      <div>
                        <label className="text-[10px]" style={{ color: "#9A938A" }}>Clarity</label>
                        <input value={s.clarity || ""} onChange={e => updateEdit(i, "clarity", e.target.value)}
                          className="w-full px-2 py-1.5 text-[11px] font-light rounded outline-none" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#0B0C0D" }} />
                      </div>
                      <div>
                        <label className="text-[10px]" style={{ color: "#9A938A" }}>Certification</label>
                        <input value={s.certification || ""} onChange={e => updateEdit(i, "certification", e.target.value)}
                          className="w-full px-2 py-1.5 text-[11px] font-light rounded outline-none" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#0B0C0D" }} />
                      </div>
                      <div>
                        <label className="text-[10px]" style={{ color: "#9A938A" }}>Price</label>
                        <input value={s.price ?? ""} onChange={e => updateEdit(i, "price", e.target.value ? Number(e.target.value) : null)} type="number"
                          className="w-full px-2 py-1.5 text-[11px] font-light rounded outline-none" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#0B0C0D" }} />
                      </div>
                    </div>
                  </div>
                </label>
              </div>
            );
          })}
          {published ? (
            <div className="p-3 rounded-lg text-[11px]" style={{ background: "#16181A", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="font-medium mb-1">{published.length} items submitted for review.</p>
              <p style={{ color: "#9A938A" }}>The desk will review and publish.</p>
            </div>
          ) : (
            <button onClick={handlePublish}
              disabled={publishing || !parsed.stones.some((_: any, i: number) => checked[i] !== false)}
              className="w-full py-2.5 text-white text-[13px] font-medium rounded-lg disabled:opacity-50 transition-opacity"
              style={{ background: "#C9A227" }}>
              {publishing ? "Submitting..." : "Submit Selected for Review"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────
// My Items Tab
// ──────────────────────────────────────
function MyItemsTab({ trader }: { trader: Trader }) {
  const [stones, setStones] = useState<StoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchStones = useCallback(async () => {
    try {
      const res = await fetch("/api/trader/" + trader.portal_code + "/stones");
      if (res.ok) setStones(await res.json());
    } catch {} finally { setLoading(false); }
  }, [trader.portal_code]);

  useEffect(() => { fetchStones(); }, [fetchStones]);

  if (loading) return <div className="p-6 text-[12px] text-center" style={{ color: "#9A938A" }}>Loading...</div>;
  if (stones.length === 0) return <div className="p-6 text-[12px] text-center" style={{ color: "#9A938A" }}>No items listed yet.</div>;

  function statusBadge(s: string) {
    switch (s) {
      case "Pending": return { bg: "#FEF3C7", text: "#92400E" };
      case "Available": return { bg: "#D1FAE5", text: "#065F46" };
      case "Reserved": return { bg: "#DBEAFE", text: "#1E40AF" };
      case "Sold": return { bg: "#F3F4F6", text: "#374151" };
      case "Rejected": return { bg: "#FEE2E2", text: "#991B1B" };
      default: return { bg: "#F3F4F6", text: "#374151" };
    }
  }

  return (
    <div className="p-4 space-y-3">
      {stones.map(s => {
        const photoField = s.photo || "";
        const photos = photoField.split("|").filter(u => u.length > 10 && u.startsWith("http"));
        const mainPhoto = photos.length > 0 ? photos[0] : PLACEHOLDER;
        const isOpen = expanded === s.id;
        const badge = statusBadge(s.status);

        return (
          <div key={s.id} style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A" }}>
            <div className="flex gap-3 p-3 cursor-default" onClick={() => setExpanded(isOpen ? null : s.id)}>
              <div className="w-16 h-16 overflow-hidden shrink-0" style={{ background: "#0B0C0D" }}>
                <img src={mainPhoto} alt={s.ref} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium" style={{ color: "#FAF8F4", fontFamily: "monospace" }}>{s.ref}</span>
                  <span className="text-[9px] font-medium uppercase px-1.5 py-0.5 rounded" style={{ background: badge.bg, color: badge.text }}>{s.status}</span>
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "#9A938A" }}>
                  {s.shape} · {s.carat}ct · {s.color} · {s.clarity || s.certification}
                </div>
                <div className="text-[11px] font-medium mt-0.5" style={{ color: "#FAF8F4" }}>
                  {s.price ? `$${s.price.toLocaleString()}` : "Price on request"}
                </div>
                {s.sales_count != null && s.sales_count > 0 && (
                  <div className="text-[10px] mt-0.5" style={{ color: "#9A938A" }}>
                    {s.sales_count} {s.sales_count === 1 ? "sale" : "sales"}
                  </div>
                )}
              </div>
            </div>
            {isOpen && s.status_log && s.status_log.length > 0 && (
              <div className="p-3 space-y-1.5" style={{ borderTop: "1px solid #EAE4DA" }}>
                <div className="text-[10px] uppercase tracking-wider font-light mb-1" style={{ color: "#9A938A" }}>Status History</div>
                {s.status_log.map(log => {
                  const lb = statusBadge(log.status);
                  return (
                    <div key={log.id} className="flex items-center gap-2 text-[10px]">
                      <span className="font-medium uppercase px-1 py-0.5 rounded" style={{ background: lb.bg, color: lb.text }}>{log.status}</span>
                      <span style={{ color: "#9A938A", fontFamily: "monospace" }}>{log.changed_at.split("T")[0]}</span>
                      {log.reason && <span style={{ color: "#9A938A" }}>- {log.reason}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────
// Reports Tab
// ──────────────────────────────────────
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

  if (loading) return <div className="p-6 text-[12px] text-center" style={{ color: "#9A938A" }}>Loading...</div>;
  if (reports.length === 0) return (
    <div className="p-6 text-[12px] text-center" style={{ color: "#9A938A" }}>
      No reports yet. Your first weekly report will appear here after the desk generates one.
    </div>
  );

  return (
    <div className="p-4 space-y-3">
      {reports.map((r) => {
        let data: any = {};
        try { data = JSON.parse(r.data || "{}"); } catch {}
        return (
          <div key={r.id} style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A" }}>
            <div className="p-3 cursor-default" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-light" style={{ color: "#FAF8F4" }}>
                  Week of {r.period_start?.split("T")[0] || ""} — {r.period_end?.split("T")[0] || ""}
                </div>
                <span className="text-[10px] font-mono" style={{ color: "#9A938A" }}>{r.created_at?.split("T")[0] || ""}</span>
              </div>
              {data.total_commission != null && (
                <div className="text-[11px] mt-1" style={{ color: "#9A938A" }}>
                  Commission earned: <strong>${data.total_commission.toLocaleString()}</strong>
                  {data.total_revenue != null && <span className="ml-2">(Revenue: ${data.total_revenue.toLocaleString()})</span>}
                </div>
              )}
            </div>
            {expanded === r.id && (
              <div className="p-3 space-y-3" style={{ borderTop: "1px solid #EAE4DA" }}>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-2" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="text-[18px] font-light">{data.live?.length || 0}</div>
                    <div className="text-[9px] uppercase tracking-wider" style={{ color: "#9A938A" }}>Live</div>
                  </div>
                  <div className="p-2" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="text-[18px] font-light">{data.sold?.length || 0}</div>
                    <div className="text-[9px] uppercase tracking-wider" style={{ color: "#9A938A" }}>Sold</div>
                  </div>
                  <div className="p-2" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="text-[18px] font-light">${(data.total_commission || 0).toLocaleString()}</div>
                    <div className="text-[9px] uppercase tracking-wider" style={{ color: "#9A938A" }}>Commission</div>
                  </div>
                </div>
                {data.sold && data.sold.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-light mb-1" style={{ color: "#9A938A" }}>Items Sold</div>
                    <div className="space-y-1">
                      {data.sold.map((s: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-[11px] p-2" style={{ border: "1px solid rgba(234,228,218,0.6)" }}>
                          <span><strong>{s.ref}</strong> {s.shape} {s.carat}ct {s.color}</span>
                          <span style={{ fontFamily: "monospace" }}>${s.sale_price?.toLocaleString() || 0} <span style={{ color: "#9A938A" }}>({s.commission_pct}% → ${s.commission_amount?.toLocaleString() || 0})</span></span>
                        </div>
                      ))}
                    </div>
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
