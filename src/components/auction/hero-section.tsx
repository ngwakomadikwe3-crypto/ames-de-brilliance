"use client";

import { formatCountdown } from "@/lib/auction/clock";
import type { PublicLot } from "@/lib/auction/public-projection";
import { DiamondGlyph } from "./diamond-glyph";
import { formatDateLabel } from "./format";

/* ─── Hero ─── */

/**
 * Session countdown target: the next scheduled opening, or — when a session
 * is already live — the earliest live closing. Null when nothing is on the
 * books (renders "To be announced", never a fake date).
 */
function nextSessionTarget(lots: PublicLot[]): { at: string; label: string } | null {
  const scheduled = lots
    .filter((lot) => lot.status === "scheduled")
    .map((lot) => lot.opensAt)
    .sort();
  if (scheduled.length > 0) return { at: scheduled[0], label: "Next auction session" };
  const live = lots
    .filter((lot) => lot.status === "live" || lot.status === "closing")
    .map((lot) => lot.closesAt)
    .sort();
  if (live.length > 0) return { at: live[0], label: "Current session closes" };
  return null;
}

export function HeroSection({ lots, nowMs }: { lots: PublicLot[]; nowMs: number }) {
  const openLots = lots.filter((lot) => lot.status === "live" || lot.status === "closing");
  const liveBids = openLots.reduce((sum, lot) => sum + lot.bidCount, 0);
  const target = nextSessionTarget(lots);

  return (
    <section id="auctions" className="relative overflow-hidden">
      {/* Subtle radial glow */}
      <div
        style={{
          position: "absolute",
          top: "-40%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 800,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(166,166,171,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div className="max-w-5xl mx-auto px-4 md:px-6 pt-20 md:pt-28 pb-16 md:pb-20 text-center relative">
        <div className="flex justify-center mb-6">
          <DiamondGlyph size={36} />
        </div>
        <h1
          className="text-[32px] md:text-[48px] mb-4"
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            color: "#F5F5F2",
          }}
        >
          The Botswana<br className="hidden md:block" /> Auction Room
        </h1>
        <p
          className="text-[13px] md:text-[14px] max-w-lg mx-auto mb-8"
          style={{ color: "#A6A6AB", lineHeight: 1.7 }}
        >
          Rough and polished stones, sold the Botswana way — licensed,
          certified, hammered in the open.
        </p>

        {/* Live countdown (server clock) */}
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.14em] mb-2" style={{ color: "#6E6C69" }}>
            {target ? target.label : "Next auction session"}
          </div>
          <div
            className="text-[28px] md:text-[36px] tabular-nums font-medium"
            style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
              letterSpacing: "0.02em",
              color: "#F5F5F2",
            }}
          >
            {target ? formatCountdown(target.at, nowMs) : "To be announced"}
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-8 md:gap-12">
          {[
            { value: String(openLots.length), label: "Open lots" },
            { value: String(liveBids), label: "Live bids" },
            { value: target ? formatDateLabel(target.at) : "—", label: "Next session" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-[18px] md:text-[22px] font-medium tabular-nums" style={{ color: "#F5F5F2" }}>
                {stat.value}
              </div>
              <div className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "#6E6C69" }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
