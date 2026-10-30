"use client";

import type { PublicLot } from "@/lib/auction/public-projection";
import { DiamondGlyph } from "./diamond-glyph";
import { LotCard } from "./lot-card";

/* ─── Catalogue ─── */

export function CatalogueSection({
  lots,
  nowMs,
  loading,
  error,
  reserveMetVisible,
  onBidClick,
}: {
  lots: PublicLot[];
  nowMs: number;
  loading: boolean;
  error: string | null;
  reserveMetVisible: boolean;
  onBidClick: (lot: PublicLot) => void;
}) {
  return (
    <section id="catalogue" className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
      <div className="flex items-center gap-3 mb-8">
        <DiamondGlyph size={18} />
        <h2
          className="text-[22px] md:text-[26px]"
          style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", fontWeight: 600, letterSpacing: "-0.01em" }}
        >
          Catalogue
        </h2>
        <span className="text-[10px] uppercase tracking-[0.12em] ml-auto" style={{ color: "#6E6C69" }}>
          {loading ? "…" : `${lots.length} ${lots.length === 1 ? "lot" : "lots"}`}
        </span>
      </div>

      {loading ? (
        <p className="text-[12px] py-8 text-center" style={{ color: "#6E6C69" }}>
          Loading the catalogue…
        </p>
      ) : lots.length === 0 ? (
        <div
          className="text-center py-12 px-6"
          style={{ background: "#14171A", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14 }}
        >
          <div className="flex justify-center mb-3">
            <DiamondGlyph size={28} />
          </div>
          <p className="text-[13px] mb-1" style={{ color: "#A6A6AB" }}>
            No auction is live right now.
          </p>
          <p className="text-[12px]" style={{ color: "#6E6C69" }}>
            {error
              ? "Live data temporarily unavailable — retrying automatically."
              : "New parcels are announced to registered dealers first. Register to bid below."}
          </p>
        </div>
      ) : (
        <>
          {error && (
            <p className="text-[11px] mb-4 text-center" style={{ color: "#6E6C69" }}>
              {error}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lots.map((lot) => (
              <LotCard
                key={lot.id}
                lot={lot}
                nowMs={nowMs}
                reserveMetVisible={reserveMetVisible}
                onBidClick={onBidClick}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
