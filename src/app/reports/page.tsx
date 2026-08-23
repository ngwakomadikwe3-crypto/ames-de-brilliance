"use client";

import { useEffect, useState, useCallback } from "react";

interface SalesData {
  summary: {
    total_sold: number;
    total_revenue: number;
    total_commission: number;
    total_carat: number;
    rough_count: number;
    polished_count: number;
    rough_revenue: number;
    polished_revenue: number;
  };
  byTrader: {
    trader_name: string;
    trader_whatsapp: string;
    trader_licence: string;
    stones_sold: number;
    total_revenue: number;
    total_commission: number;
    total_carat: number;
    avg_commission_pct: number;
  }[];
  sales: {
    id: string;
    ref: string;
    stone_type: string;
    shape: string;
    carat: number;
    color: string;
    clarity: string;
    certification: string;
    sale_price: number;
    commission: number;
    commission_amount: number;
    trader_name: string;
    created_at: string;
  }[];
}

function fmt(n: number) {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDec(n: number) {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function specs(s: { stone_type: string; shape?: string; carat: number; color: string; clarity?: string; certification?: string }) {
  if (s.stone_type === "rough") return s.carat + "ct " + s.color;
  return (s.shape || "") + " " + s.carat + "ct " + s.color + " " + (s.clarity || "") + " " + (s.certification || "");
}

export default function ReportsPage() {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/reports/sales");
      if (!res.ok) throw new Error("Failed to load");
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="px-4 md:px-6 py-10 text-[12px] text-muted max-w-5xl mx-auto">Loading...</div>;
  if (error) return <div className="px-4 md:px-6 py-10 text-[12px] text-red-600 max-w-5xl mx-auto">Error: {error}</div>;
  if (!data) return null;

  const { summary, byTrader, sales } = data;
  const noSales = summary.total_sold === 0;

  return (
    <div className="px-4 md:px-6 py-6 max-w-5xl mx-auto w-full">
      <h2 className="text-[14px] font-bold mb-1">Sales Report</h2>
      <p className="text-[11px] text-muted mb-5">Consigned stone sales and commission earnings</p>

      {noSales ? (
        <div className="border border-border p-6 text-center">
          <p className="text-[12px] text-muted">No consigned stones have been sold yet.</p>
          <p className="text-[11px] text-muted mt-1">When you record a sale in the Stones tab, it will appear here.</p>
        </div>
      ) : (
        <>
          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Stones Sold</div>
              <div className="text-[18px] font-bold font-mono">{summary.total_sold}</div>
              <div className="text-[10px] text-muted mt-0.5">{summary.rough_count} rough · {summary.polished_count} polished</div>
            </div>
            <div className="border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Total Revenue</div>
              <div className="text-[18px] font-bold font-mono">{fmt(summary.total_revenue)}</div>
              <div className="text-[10px] text-muted mt-0.5">{fmt(summary.rough_revenue)} rough · {fmt(summary.polished_revenue)} polished</div>
            </div>
            <div className="border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Commission Owed</div>
              <div className="text-[18px] font-bold font-mono text-green-700">{fmtDec(summary.total_commission)}</div>
              <div className="text-[10px] text-muted mt-0.5">To consigned traders</div>
            </div>
            <div className="border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Total Carat</div>
              <div className="text-[18px] font-bold font-mono">{summary.total_carat.toFixed(2)}ct</div>
              <div className="text-[10px] text-muted mt-0.5">Across all sold stones</div>
            </div>
          </div>

          {/* ── By Trader ── */}
          {byTrader.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[12px] font-bold mb-2">Commission by Trader</h3>
              {/* Desktop */}
              <div className="hidden md:block border border-border">
                <table className="w-full text-[12px]">
                  <thead><tr className="text-left border-b border-border bg-surface">
                    <th className="px-3 py-1.5 font-semibold text-muted">Trader</th>
                    <th className="px-3 py-1.5 font-semibold text-muted text-right">Licence</th>
                    <th className="px-3 py-1.5 font-semibold text-muted text-right">Sold</th>
                    <th className="px-3 py-1.5 font-semibold text-muted text-right">Carat</th>
                    <th className="px-3 py-1.5 font-semibold text-muted text-right">Revenue</th>
                    <th className="px-3 py-1.5 font-semibold text-muted text-right">Commission</th>
                  </tr></thead>
                  <tbody>
                    {byTrader.map((t) => (
                      <tr key={t.trader_name} className="border-b border-border/60">
                        <td className="px-3 py-1.5">
                          <div className="font-medium">{t.trader_name}</div>
                          <div className="text-[10px] text-muted">{t.trader_whatsapp}</div>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-muted">{t.trader_licence || "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{t.stones_sold}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{t.total_carat.toFixed(2)}ct</td>
                        <td className="px-3 py-1.5 text-right font-mono">{fmt(t.total_revenue)}</td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold text-green-700">{fmtDec(t.total_commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile */}
              <div className="md:hidden space-y-3">
                {byTrader.map((t) => (
                  <div key={t.trader_name} className="border border-border p-3">
                    <div className="font-medium text-[12px]">{t.trader_name}</div>
                    <div className="text-[10px] text-muted mb-2">{t.trader_whatsapp}{t.trader_licence ? " · " + t.trader_licence : ""}</div>
                    <div className="grid grid-cols-2 gap-y-1 text-[11px]">
                      <div className="text-muted">Stones sold</div><div className="text-right font-mono">{t.stones_sold}</div>
                      <div className="text-muted">Total carat</div><div className="text-right font-mono">{t.total_carat.toFixed(2)}ct</div>
                      <div className="text-muted">Revenue</div><div className="text-right font-mono">{fmt(t.total_revenue)}</div>
                      <div className="text-muted">Commission</div><div className="text-right font-mono font-semibold text-green-700">{fmtDec(t.total_commission)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Individual Sales ── */}
          <div>
            <h3 className="text-[12px] font-bold mb-2">Sale Records</h3>
            {/* Desktop */}
            <div className="hidden md:block border border-border">
              <table className="w-full text-[12px]">
                <thead><tr className="text-left border-b border-border bg-surface">
                  <th className="px-3 py-1.5 font-semibold text-muted">Ref</th>
                  <th className="px-3 py-1.5 font-semibold text-muted">Type</th>
                  <th className="px-3 py-1.5 font-semibold text-muted">Specs</th>
                  <th className="px-3 py-1.5 font-semibold text-muted">Trader</th>
                  <th className="px-3 py-1.5 font-semibold text-muted text-right">Sale Price</th>
                  <th className="px-3 py-1.5 font-semibold text-muted text-right">Comm %</th>
                  <th className="px-3 py-1.5 font-semibold text-muted text-right">Commission</th>
                </tr></thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className="border-b border-border/60">
                      <td className="px-3 py-1.5 font-mono font-medium">{s.ref}</td>
                      <td className="px-3 py-1.5">
                        <span className={`text-[9px] font-semibold uppercase px-1 py-0.5 ${s.stone_type === "rough" ? "bg-black text-white" : "border border-border"}`}>
                          {s.stone_type}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px]">{specs(s)}</td>
                      <td className="px-3 py-1.5">{s.trader_name}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{fmt(s.sale_price)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{s.commission}%</td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold text-green-700">{fmtDec(s.commission_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile */}
            <div className="md:hidden space-y-3">
              {sales.map((s) => (
                <div key={s.id} className="border border-border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono font-medium">{s.ref}</span>
                    <span className={`text-[9px] font-semibold uppercase px-1 py-0.5 ${s.stone_type === "rough" ? "bg-black text-white" : "border border-border"}`}>
                      {s.stone_type}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-muted">{specs(s)}</div>
                  <div className="text-[10px] text-muted mt-1">Trader: {s.trader_name}</div>
                  <div className="grid grid-cols-3 gap-1 mt-2 text-[11px]">
                    <div><span className="text-muted">Price:</span></div>
                    <div className="text-right font-mono" style={{ gridColumn: "2 / span 2" }}>{fmt(s.sale_price)}</div>
                    <div><span className="text-muted">Comm:</span></div>
                    <div className="text-right font-mono">{s.commission}%</div>
                    <div className="text-right font-mono font-semibold text-green-700">{fmtDec(s.commission_amount)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Totals row ── */}
          <div className="mt-4 border-t border-border pt-3 flex flex-wrap gap-6 text-[12px]">
            <div><span className="text-muted">Total revenue: </span><span className="font-mono font-bold">{fmt(summary.total_revenue)}</span></div>
            <div><span className="text-muted">Total commission: </span><span className="font-mono font-bold text-green-700">{fmtDec(summary.total_commission)}</span></div>
            <div><span className="text-muted">Net after commission: </span><span className="font-mono font-bold">{fmt(summary.total_revenue - summary.total_commission)}</span></div>
          </div>
        </>
      )}
    </div>
  );
}
