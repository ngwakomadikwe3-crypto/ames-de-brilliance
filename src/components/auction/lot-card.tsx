"use client";

import { formatCountdown } from "@/lib/auction/clock";
import type { PublicLot } from "@/lib/auction/public-projection";
import { LotArt } from "./diamond-glyph";
import { formatMoney } from "./format";

/* ─── Lot Card ─── */

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  live: { bg: "rgba(245,245,242,0.12)", text: "#F5F5F2", label: "Open" },
  closing: { bg: "rgba(245,245,242,0.12)", text: "#F5F5F2", label: "Closing" },
  scheduled: { bg: "rgba(166,166,171,0.15)", text: "#A6A6AB", label: "Upcoming" },
  sold: { bg: "rgba(166,166,171,0.08)", text: "#6E6C69", label: "Hammered" },
  unsold: { bg: "rgba(166,166,171,0.08)", text: "#6E6C69", label: "Unsold" },
};

export function LotCard({
  lot,
  nowMs,
  reserveMetVisible,
  onBidClick,
}: {
  lot: PublicLot;
  nowMs: number;
  reserveMetVisible: boolean;
  onBidClick: (lot: PublicLot) => void;
}) {
  const sc = STATUS_COLORS[lot.status] ?? STATUS_COLORS.scheduled;
  const isLive = lot.status === "live";
  const isClosing = lot.status === "closing";
  const isSold = lot.status === "sold";
  const isUnsold = lot.status === "unsold";
  const isBiddable = isLive;

  const priceMinor = lot.bidCount > 0 ? lot.currentBidMinor : lot.startingBidMinor;
  const priceLabel = isSold
    ? "Hammer price"
    : lot.bidCount > 0
      ? "Current bid"
      : "Starting bid";

  return (
    <div
      style={{
        background: "#14171A",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {/* Art */}
      <div style={{ height: 180, position: "relative", overflow: "hidden" }}>
        <LotArt title={lot.title} />
        {/* Status chip */}
        <span
          className="absolute top-3 left-3 text-[9px] font-medium uppercase tracking-[0.08em] px-2 py-0.5"
          style={{ background: sc.bg, color: sc.text, borderRadius: 6 }}
        >
          {sc.label}
        </span>
        {/* Lot reference */}
        <span
          className="absolute top-3 right-3 text-[10px] tabular-nums"
          style={{ color: "#6E6C69", background: "rgba(14,16,19,0.6)", padding: "2px 6px", borderRadius: 4 }}
        >
          Lot {lot.stoneRef || lot.id}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#6E6C69" }}>
            {lot.currency}
          </span>
          {reserveMetVisible && lot.reserveMet === true && (isLive || isClosing) && (
            <>
              <span style={{ color: "rgba(255,255,255,0.08)" }}>·</span>
              <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#A6A6AB" }}>
                Reserve met
              </span>
            </>
          )}
        </div>

        <h3
          className="text-[14px] mb-1"
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
            fontWeight: 600,
            color: "#F5F5F2",
            lineHeight: 1.3,
          }}
        >
          {lot.title}
        </h3>

        {lot.description && (
          <p className="text-[11px] mb-3" style={{ color: "#6E6C69" }}>
            {lot.description}
          </p>
        )}

        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] mb-0.5" style={{ color: "#6E6C69" }}>
              {priceLabel}
            </div>
            <div className="text-[18px] font-medium tabular-nums" style={{ color: "#F5F5F2" }}>
              {isUnsold && lot.bidCount === 0 ? "—" : formatMoney(priceMinor, lot.currency)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] mb-0.5" style={{ color: "#6E6C69" }}>
              {lot.bidCount} {lot.bidCount === 1 ? "bid" : "bids"}
            </div>
            {(isLive || isClosing) && (
              <div className="text-[12px] tabular-nums font-medium" style={{ color: "#A6A6AB" }}>
                {formatCountdown(lot.closesAt, nowMs)}
              </div>
            )}
            {lot.status === "scheduled" && (
              <div className="text-[12px] tabular-nums font-medium" style={{ color: "#6E6C69" }}>
                Opens {formatCountdown(lot.opensAt, nowMs)}
              </div>
            )}
          </div>
        </div>

        {isBiddable && (
          <button
            onClick={() => onBidClick(lot)}
            className="w-full py-2.5 text-[12px] font-medium"
            style={{
              background: "#F5F5F2",
              color: "#0E1013",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Place bid
          </button>
        )}
        {!isBiddable && (
          <div className="w-full py-2.5 text-[12px] text-center" style={{ color: "#6E6C69" }}>
            {isSold
              ? `Sold for ${formatMoney(lot.currentBidMinor, lot.currency)}`
              : isUnsold
                ? "Not sold"
                : isClosing
                  ? "Closing…"
                  : "Awaiting auction"}
          </div>
        )}
      </div>
    </div>
  );
}
