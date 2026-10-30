"use client";

import type { PublicLot } from "@/lib/auction/public-projection";
import { DiamondGlyph } from "./diamond-glyph";
import { formatMoney } from "./format";

/* ─── Results ─── */

export function ResultsSection({ lots }: { lots: PublicLot[] }) {
  const settled = lots
    .filter((lot) => lot.status === "sold" || lot.status === "unsold")
    .sort((a, b) => Date.parse(b.closesAt) - Date.parse(a.closesAt));

  return (
    <section id="results" className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
      <div className="flex items-center gap-3 mb-8">
        <DiamondGlyph size={18} />
        <h2
          className="text-[22px] md:text-[26px]"
          style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", fontWeight: 600, letterSpacing: "-0.01em" }}
        >
          Results
        </h2>
      </div>

      {settled.length === 0 ? (
        <p className="text-[12px] py-8 text-center" style={{ color: "#6E6C69" }}>
          No hammered lots yet. Results appear here after each session closes.
        </p>
      ) : (
        <div style={{ background: "#14171A", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-[0.12em] font-medium" style={{ color: "#6E6C69" }}>Lot</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-[0.12em] font-medium" style={{ color: "#6E6C69" }}>Title</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-[0.12em] font-medium" style={{ color: "#6E6C69" }}>Spec</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-[0.12em] font-medium text-right" style={{ color: "#6E6C69" }}>Hammer price</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-[0.12em] font-medium text-right" style={{ color: "#6E6C69" }}>Bids</th>
                </tr>
              </thead>
              <tbody>
                {settled.map((lot) => (
                  <tr key={lot.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className="px-4 py-3 tabular-nums" style={{ color: "#A6A6AB" }}>Lot {lot.stoneRef || lot.id}</td>
                    <td className="px-4 py-3" style={{ color: "#F5F5F2" }}>{lot.title}</td>
                    <td className="px-4 py-3" style={{ color: "#6E6C69" }}>{lot.description}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: "#F5F5F2" }}>
                      {lot.status === "sold"
                        ? formatMoney(lot.currentBidMinor, lot.currency)
                        : <span style={{ color: "#6E6C69", fontWeight: 400 }}>Not sold</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#A6A6AB" }}>
                      {lot.bidCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
