"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types ─── */
type LotCategory = "Rough" | "Polished" | "Jewellery";
type LotStatus = "upcoming" | "open" | "hammered";
type MineOrigin = "Jwaneng" | "Orapa" | "Karowe" | "Letlhakane";

interface Lot {
  id: string;
  lotNo: string;
  title: string;
  category: LotCategory;
  mineOrigin: MineOrigin;
  carat: number;
  colour: string;
  clarity: string;
  shape: string;
  reserve: number;
  currentBid: number;
  bidCount: number;
  currency: string;
  status: LotStatus;
  closesAt: string; // ISO
  hammerPrice?: number;
  photos: string[];
}

/* ─── Demo Data ─── */
const NOW = new Date();
const HOUR = 3600000;
const DAY = 86400000;

const DEMO_LOTS: Lot[] = [
  {
    id: "1", lotNo: "001", title: "Jwaneng Select Parcel — 4.82 ct",
    category: "Rough", mineOrigin: "Jwaneng", carat: 4.82,
    colour: "D–F", clarity: "VVS1–VS2", shape: "Mixed crystal",
    reserve: 18000, currentBid: 22500, bidCount: 7, currency: "USD",
    status: "open", closesAt: new Date(NOW.getTime() + 2 * HOUR + 14 * 60000).toISOString(),
    photos: [],
  },
  {
    id: "2", lotNo: "002", title: "Orapa Dme Parcel — 3.16 ct",
    category: "Rough", mineOrigin: "Orapa", carat: 3.16,
    colour: "G–H", clarity: "VS1–SI1", shape: "Dodecahedron",
    reserve: 9500, currentBid: 11200, bidCount: 4, currency: "USD",
    status: "open", closesAt: new Date(NOW.getTime() + 5 * HOUR + 42 * 60000).toISOString(),
    photos: [],
  },
  {
    id: "3", lotNo: "003", title: "Karowe Exceptional — 2.04 ct",
    category: "Rough", mineOrigin: "Karowe", carat: 2.04,
    colour: "D", clarity: "VVS2", shape: "Octahedron",
    reserve: 32000, currentBid: 35800, bidCount: 11, currency: "USD",
    status: "open", closesAt: new Date(NOW.getTime() + 8 * HOUR + 7 * 60000).toISOString(),
    photos: [],
  },
  {
    id: "4", lotNo: "004", title: "Letlhakane Mixed — 6.31 ct",
    category: "Rough", mineOrigin: "Letlhakane", carat: 6.31,
    colour: "J–K", clarity: "SI1–SI2", shape: "Macles",
    reserve: 7200, currentBid: 7200, bidCount: 0, currency: "USD",
    status: "upcoming", closesAt: new Date(NOW.getTime() + 3 * DAY).toISOString(),
    photos: [],
  },
  {
    id: "5", lotNo: "005", title: "Aurora Solitaire",
    category: "Polished", mineOrigin: "Jwaneng", carat: 1.20,
    colour: "D", clarity: "VVS1", shape: "Round Brilliant",
    reserve: 5500, currentBid: 6800, bidCount: 9, currency: "USD",
    status: "open", closesAt: new Date(NOW.getTime() + 1 * HOUR + 33 * 60000).toISOString(),
    photos: ["/demo/ring-front.svg"],
  },
  {
    id: "6", lotNo: "006", title: "Halo Pendant",
    category: "Jewellery", mineOrigin: "Orapa", carat: 0.85,
    colour: "E", clarity: "VVS2", shape: "Round Brilliant",
    reserve: 3200, currentBid: 3200, bidCount: 0, currency: "USD",
    status: "upcoming", closesAt: new Date(NOW.getTime() + 5 * DAY).toISOString(),
    photos: ["/demo/ring-angle.svg"],
  },
  {
    id: "7", lotNo: "007", title: "Stellar Studs — Pair",
    category: "Jewellery", mineOrigin: "Karowe", carat: 0.60,
    colour: "F", clarity: "VS1", shape: "Round Brilliant × 2",
    reserve: 2400, currentBid: 2400, bidCount: 0, currency: "USD",
    status: "upcoming", closesAt: new Date(NOW.getTime() + 5 * DAY).toISOString(),
    photos: ["/demo/ring-worn.svg"],
  },
  {
    id: "8", lotNo: "008", title: "River Bracelet",
    category: "Jewellery", mineOrigin: "Letlhakane", carat: 2.40,
    colour: "G–H", clarity: "VS2", shape: "Channel set rounds",
    reserve: 4800, currentBid: 5600, bidCount: 3, currency: "USD",
    status: "hammered", closesAt: new Date(NOW.getTime() - 2 * DAY).toISOString(),
    hammerPrice: 5600, photos: ["/demo/ring-front.svg"],
  },
];

/* ─── Helpers ─── */
function formatUsd(n: number) {
  return n.toLocaleString("en-US");
}

function countDown(target: string) {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function nextAuctionCountdown() {
  const diff = new Date(NOW.getTime() + 3 * DAY).getTime() - Date.now();
  if (diff <= 0) return "Next session imminent";
  const d = Math.floor(diff / DAY);
  const h = Math.floor((diff % DAY) / HOUR);
  const m = Math.floor((diff % HOUR) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${d}d ${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

const STATUS_COLORS: Record<LotStatus, { bg: string; text: string; label: string }> = {
  open: { bg: "rgba(245,245,242,0.12)", text: "#F5F5F2", label: "Open" },
  upcoming: { bg: "rgba(166,166,171,0.15)", text: "#A6A6AB", label: "Upcoming" },
  hammered: { bg: "rgba(166,166,171,0.08)", text: "#6E6C69", label: "Hammered" },
};

/* ─── Diamond SVG glyph (platinum) ─── */
function DiamondGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: size, height: size }} aria-hidden="true">
      <defs>
        <linearGradient id="auction-pg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8E6E1" />
          <stop offset="50%" stopColor="#C8C6C1" />
          <stop offset="100%" stopColor="#A6A6AB" />
        </linearGradient>
      </defs>
      <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="url(#auction-pg)" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/* ─── Lot Card Placeholder Art ─── */
function LotArt({ lot }: { lot: Lot }) {
  const hasPhoto = lot.photos.length > 0 && lot.photos[0];
  if (hasPhoto) {
    return (
      <div className="w-full h-full" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
        <img
          src={lot.photos[0]}
          alt={lot.title}
          style={{ width: "100%", height: "100%", objectFit: "contain", filter: "brightness(0.9) contrast(1.1)", mixBlendMode: "screen" }}
        />
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(166,166,171,0.04)" }}>
      <DiamondGlyph size={48} />
    </div>
  );
}

/* ─── Bidding Modal ─── */
function BidModal({
  lot,
  onClose,
  onConfirmBid,
}: {
  lot: Lot | null;
  onClose: () => void;
  onConfirmBid: (lotId: string, amount: number) => void;
}) {
  const [bidAmount, setBidAmount] = useState(0);

  useEffect(() => {
    if (lot) {
      const minBid = lot.currentBid > 0
        ? Math.ceil(lot.currentBid * 1.02)
        : lot.reserve;
      setBidAmount(minBid);
    }
  }, [lot]);

  if (!lot) return null;

  const minBid = lot.currentBid > 0
    ? Math.ceil(lot.currentBid * 1.02)
    : lot.reserve;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm"
        style={{ background: "#14171A", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <DiamondGlyph size={20} />
          <span className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "#A6A6AB" }}>
            Lot {lot.lotNo}
          </span>
        </div>
        <h3
          className="text-[18px] mb-1"
          style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", fontWeight: 600, color: "#F5F5F2", letterSpacing: "-0.01em" }}
        >
          {lot.title}
        </h3>
        <p className="text-[12px] mb-4" style={{ color: "#6E6C69" }}>
          {lot.carat} ct · {lot.colour} · {lot.clarity} · {lot.mineOrigin}
        </p>

        <div className="mb-4" style={{ background: "rgba(166,166,171,0.06)", borderRadius: 10, padding: 14 }}>
          <div className="flex justify-between mb-2">
            <span className="text-[11px]" style={{ color: "#6E6C69" }}>Current bid</span>
            <span className="text-[13px] font-medium tabular-nums" style={{ color: "#F5F5F2" }}>
              ${formatUsd(lot.currentBid)}
            </span>
          </div>
          <div className="flex justify-between mb-2">
            <span className="text-[11px]" style={{ color: "#6E6C69" }}>Minimum next bid (+2%)</span>
            <span className="text-[13px] font-medium tabular-nums" style={{ color: "#A6A6AB" }}>
              ${formatUsd(minBid)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[11px]" style={{ color: "#6E6C69" }}>Reserve</span>
            <span className="text-[13px] tabular-nums" style={{ color: "#6E6C69" }}>
              ${formatUsd(lot.reserve)}
            </span>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[11px] uppercase tracking-[0.12em] mb-1.5 block" style={{ color: "#6E6C69" }}>
            Your bid (USD)
          </label>
          <input
            type="number"
            value={bidAmount}
            onChange={(e) => setBidAmount(Number(e.target.value))}
            min={minBid}
            step={Math.max(100, Math.round(lot.reserve * 0.02))}
            className="w-full text-[14px] tabular-nums"
            style={{
              background: "#0E1013",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: "10px 14px",
              color: "#F5F5F2",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          {bidAmount < minBid && (
            <p className="text-[11px] mt-1" style={{ color: "#EF4444" }}>
              Minimum bid is ${formatUsd(minBid)}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-[12px] font-medium"
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              color: "#A6A6AB",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (bidAmount >= minBid) {
                onConfirmBid(lot.id, bidAmount);
                onClose();
              }
            }}
            disabled={bidAmount < minBid}
            className="flex-1 py-2.5 text-[12px] font-medium"
            style={{
              background: bidAmount >= minBid ? "#F5F5F2" : "rgba(166,166,171,0.15)",
              color: bidAmount >= minBid ? "#0E1013" : "#6E6C69",
              border: "none",
              borderRadius: 10,
              cursor: bidAmount >= minBid ? "pointer" : "not-allowed",
            }}
          >
            Place bid
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Gate Modal (visitor) ─── */
function GateModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm"
        style={{ background: "#14171A", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 28, textAlign: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <DiamondGlyph size={32} />
        </div>
        <h3
          className="text-[18px] mb-2"
          style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", fontWeight: 600, color: "#F5F5F2" }}
        >
          Licensed Dealer Access
        </h3>
        <p className="text-[12px] mb-6" style={{ color: "#6E6C69", lineHeight: 1.6 }}>
          Bidding is reserved for licensed accounts under Botswana diamond trading law. Complete registration and licence verification to participate.
        </p>
        <div className="flex gap-2">
          <a
            href="/login"
            className="flex-1 py-2.5 text-[12px] font-medium text-center"
            style={{
              background: "#F5F5F2",
              color: "#0E1013",
              borderRadius: 10,
              textDecoration: "none",
            }}
          >
            Dealer login
          </a>
          <a
            href="https://wa.me/26772839152?text=I%20would%20like%20to%20register%20as%20a%20licensed%20bidder%20for%20the%20AMES%20auction%20room."
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 text-[12px] font-medium text-center"
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#A6A6AB",
              borderRadius: 10,
              textDecoration: "none",
            }}
          >
            Register interest
          </a>
        </div>
      </div>
    </div>
  );
}

/* ─── Toast ─── */
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] text-[12px] font-medium px-4 py-2.5"
      style={{ background: "#1A1D21", color: "#F5F5F2", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}
    >
      {message}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */
export default function Home() {
  const [lots, setLots] = useState<Lot[]>(DEMO_LOTS);
  const [, setTick] = useState(0); // force re-render for countdowns
  const [bidLot, setBidLot] = useState<Lot | null>(null);
  const [showGate, setShowGate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Tick every second for live countdowns
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // Auto-hammer lots whose countdowns have expired
  useEffect(() => {
    setLots((prev) =>
      prev.map((l) => {
        if (l.status === "open" && new Date(l.closesAt).getTime() <= Date.now()) {
          return { ...l, status: "hammered" as LotStatus, hammerPrice: l.currentBid };
        }
        return l;
      })
    );
  }, []);

  const handlePlaceBid = useCallback((lotId: string, amount: number) => {
    setLots((prev) =>
      prev.map((l) =>
        l.id === lotId ? { ...l, currentBid: amount, bidCount: l.bidCount + 1 } : l
      )
    );
    setToast("Bid placed");
  }, []);

  const openLots = lots.filter((l) => l.status === "open");
  const upcomingLots = lots.filter((l) => l.status === "upcoming");
  const hammeredLots = lots.filter((l) => l.status === "hammered");
  const totalCarats = lots.reduce((sum, l) => sum + l.carat, 0);

  return (
    <div style={{ background: "#0E1013", minHeight: "100vh", color: "#F5F5F2" }}>
      {/* ═══ HERO ═══ */}
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

          {/* Live countdown */}
          <div className="mb-8">
            <div className="text-[10px] uppercase tracking-[0.14em] mb-2" style={{ color: "#6E6C69" }}>
              Next auction session
            </div>
            <div
              className="text-[28px] md:text-[36px] tabular-nums font-medium"
              style={{
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                letterSpacing: "0.02em",
                color: "#F5F5F2",
              }}
            >
              {nextAuctionCountdown()}
            </div>
          </div>

          {/* Stats */}
          <div className="flex justify-center gap-8 md:gap-12">
            {[
              { value: openLots.length, label: "Open lots" },
              { value: totalCarats.toFixed(1), label: "Total carats" },
              { value: "Aug 31", label: "Next session" },
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

      {/* ═══ CATALOGUE ═══ */}
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
            {lots.length} lots
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lots.map((lot) => {
            const sc = STATUS_COLORS[lot.status];
            const isOpen = lot.status === "open";
            const isHammered = lot.status === "hammered";

            return (
              <div
                key={lot.id}
                style={{
                  background: "#14171A",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                {/* Art */}
                <div style={{ height: 180, position: "relative", overflow: "hidden" }}>
                  <LotArt lot={lot} />
                  {/* Status chip */}
                  <span
                    className="absolute top-3 left-3 text-[9px] font-medium uppercase tracking-[0.08em] px-2 py-0.5"
                    style={{ background: sc.bg, color: sc.text, borderRadius: 6 }}
                  >
                    {sc.label}
                  </span>
                  {/* Lot number */}
                  <span
                    className="absolute top-3 right-3 text-[10px] tabular-nums"
                    style={{ color: "#6E6C69", background: "rgba(14,16,19,0.6)", padding: "2px 6px", borderRadius: 4 }}
                  >
                    Lot {lot.lotNo}
                  </span>
                </div>

                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#6E6C69" }}>
                      {lot.mineOrigin}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.08)" }}>·</span>
                    <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#6E6C69" }}>
                      {lot.category}
                    </span>
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

                  <p className="text-[11px] mb-3" style={{ color: "#6E6C69" }}>
                    {lot.carat} ct · {lot.colour} · {lot.clarity} · {lot.shape}
                  </p>

                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.1em] mb-0.5" style={{ color: "#6E6C69" }}>
                        {isHammered ? "Hammer price" : "Current bid"}
                      </div>
                      <div className="text-[18px] font-medium tabular-nums" style={{ color: "#F5F5F2" }}>
                        ${formatUsd(isHammered && lot.hammerPrice ? lot.hammerPrice : lot.currentBid)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] mb-0.5" style={{ color: "#6E6C69" }}>
                        {lot.bidCount} {lot.bidCount === 1 ? "bid" : "bids"}
                      </div>
                      {isOpen && (
                        <div className="text-[12px] tabular-nums font-medium" style={{ color: "#A6A6AB" }}>
                          {countDown(lot.closesAt)}
                        </div>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <button
                      onClick={() => setBidLot(lot)}
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
                  {!isOpen && (
                    <div className="w-full py-2.5 text-[12px] text-center" style={{ color: "#6E6C69" }}>
                      {isHammered ? `Sold for $${formatUsd(lot.hammerPrice || lot.currentBid)}` : "Awaiting auction"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="flex items-center gap-3 mb-10">
          <DiamondGlyph size={18} />
          <h2
            className="text-[22px] md:text-[26px]"
            style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", fontWeight: 600, letterSpacing: "-0.01em" }}
          >
            How it works
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {[
            { step: "01", title: "Registration", desc: "Create an account and submit your Botswana diamond trading licence for verification." },
            { step: "02", title: "KYC & bid bond", desc: "Complete know-your-customer checks and place a refundable bid bond." },
            { step: "03", title: "Bidding", desc: "Participate in sealed tender or live ascending auctions — bid online from anywhere." },
            { step: "04", title: "The hammer", desc: "When the countdown ends, the highest bid wins. The lot is officially hammered." },
            { step: "05", title: "Settlement", desc: "Pay by bank transfer. Stone ships with Kimberley Process certified documentation." },
          ].map((item, i) => (
            <div key={item.step} className="relative">
              {i < 4 && (
                <div
                  className="hidden md:block absolute top-5 left-full w-full h-px"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                />
              )}
              <div className="text-[10px] uppercase tracking-[0.14em] mb-2 tabular-nums" style={{ color: "#A6A6AB" }}>
                {item.step}
              </div>
              <h3
                className="text-[15px] mb-1.5"
                style={{
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                  fontWeight: 600,
                  color: "#F5F5F2",
                }}
              >
                {item.title}
              </h3>
              <p className="text-[11px] leading-relaxed" style={{ color: "#6E6C69" }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ RESULTS ═══ */}
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

        {hammeredLots.length === 0 ? (
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
                    <th className="px-4 py-3 text-[10px] uppercase tracking-[0.12em] font-medium" style={{ color: "#6E6C69" }}>Origin</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-[0.12em] font-medium" style={{ color: "#6E6C69" }}>Spec</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-[0.12em] font-medium text-right" style={{ color: "#6E6C69" }}>Hammer price</th>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-[0.12em] font-medium text-right" style={{ color: "#6E6C69" }}>Bids</th>
                  </tr>
                </thead>
                <tbody>
                  {hammeredLots.map((lot) => (
                    <tr key={lot.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td className="px-4 py-3 tabular-nums" style={{ color: "#A6A6AB" }}>Lot {lot.lotNo}</td>
                      <td className="px-4 py-3" style={{ color: "#F5F5F2" }}>{lot.title}</td>
                      <td className="px-4 py-3" style={{ color: "#6E6C69" }}>{lot.mineOrigin}</td>
                      <td className="px-4 py-3" style={{ color: "#6E6C69" }}>{lot.carat} ct · {lot.colour} · {lot.clarity}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: "#F5F5F2" }}>
                        ${formatUsd(lot.hammerPrice || lot.currentBid)}
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

      {/* ═══ COMPLIANCE NOTE ═══ */}
      <section id="compliance" className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div
          style={{
            background: "#14171A",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
            padding: 24,
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <DiamondGlyph size={16} />
            <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "#A6A6AB" }}>
              Kimberley Process
            </span>
          </div>
          <p className="text-[12px] leading-relaxed" style={{ color: "#6E6C69" }}>
            All rough diamond transactions are conducted under the Kimberley Process Certification Scheme.
            AMES DE BRILLIANTE (Pty) Ltd is a licensed participant in the Botswana diamond trade, subject to
            the Diamonds Act, the Diamonds Trading Act, and the national customs regime. Every stone in this
            auction room carries verified chain-of-custody documentation from mine to market.
          </p>
        </div>
      </section>

      {/* ═══ HOUSE SERVICES ═══ */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <h2
          className="text-[22px] md:text-[26px] mb-8 text-center"
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
            fontWeight: 600,
            color: "#F5F5F2",
          }}
        >
          House Services
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { title: "Diamond Sourcing", desc: "We source rough and polished stones directly from Botswana\u2019s licensed mines and trading partners." },
            { title: "Private Viewings", desc: "Arrange an in-person or virtual viewing of any lot or piece in the collection." },
            { title: "Custom Commissions", desc: "Work with the desk to design and set a bespoke piece to your specification." },
            { title: "Valuation Support", desc: "Professional valuation and documentation for insurance, resale, or personal records." },
            { title: "Insured Delivery", desc: "Every shipment is insured in transit and coordinated through the desk." },
            { title: "Industry Document Reports", desc: "Upload a diamond, mining, trade, policy, or market document and receive a structured research report from the house." },
          ].map((s) => (
            <div
              key={s.title}
              style={{
                background: "#14171A",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: 20,
              }}
            >
              <h3 className="text-[13px] font-medium mb-1.5" style={{ color: "#F5F5F2" }}>{s.title}</h3>
              <p className="text-[12px] leading-relaxed" style={{ color: "#6E6C69" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ DIAMOND INDUSTRY REPORTS CTA ═══ */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16 text-center">
        <div
          style={{
            background: "#14171A",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
            padding: 32,
            maxWidth: 480,
            margin: "0 auto",
          }}
        >
          <DiamondGlyph size={20} />
          <h2
            className="text-[18px] md:text-[22px] mt-3 mb-2"
            style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
              fontWeight: 600,
              color: "#F5F5F2",
            }}
          >
            Diamond Industry Reports
          </h2>
          <p className="text-[12px] leading-relaxed mb-5" style={{ color: "#6E6C69" }}>
            Upload a diamond, mining, trade, policy, or market document and receive a structured research report from the house.
          </p>
          <button
            onClick={() => setShowReportModal(true)}
            style={{
              background: "#F5F5F2",
              color: "#0E1013",
              borderRadius: 10,
              padding: "10px 24px",
              fontSize: 13,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            Request Report
          </button>
        </div>
      </section>

      {/* ═══ FOOTER CTA ═══ */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16 text-center">
        <DiamondGlyph size={28} />
        <h2
          className="text-[22px] md:text-[28px] mt-4 mb-2"
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
            fontWeight: 600,
            color: "#F5F5F2",
          }}
        >
          Register to bid
        </h2>
        <p className="text-[12px] mb-6" style={{ color: "#6E6C69" }}>
          Complete your dealer registration to access the auction room.
        </p>
        <a
          href="/login"
          className="inline-block py-3 px-8 text-[13px] font-medium"
          style={{
            background: "#F5F5F2",
            color: "#0E1013",
            borderRadius: 10,
            textDecoration: "none",
          }}
        >
          Start registration
        </a>
      </section>

      {/* Modals */}
      <BidModal lot={bidLot} onClose={() => setBidLot(null)} onConfirmBid={(id, amt) => handlePlaceBid(id, amt)} />
      {showGate && <GateModal onClose={() => setShowGate(false)} />}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {showReportModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center" onClick={() => setShowReportModal(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative z-10 w-full max-w-sm mx-4 rounded-2xl p-6" style={{ background: "#14171A", border: "1px solid rgba(255,255,255,0.06)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-medium mb-2" style={{ color: "#F5F5F2", fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif" }}>Diamond Industry Reports</h3>
            <p className="text-[13px] leading-relaxed mb-5" style={{ color: "#6E6C69" }}>
              Paid reports are coming soon. Contact the desk for early access.
            </p>
            <div className="flex gap-2">
              <a href="https://wa.me/26772839152" target="_blank" rel="noopener noreferrer"
                className="flex-1 text-center py-2.5 text-[12px] font-medium rounded-lg"
                style={{ background: "#F5F5F2", color: "#0E1013", textDecoration: "none" }}>
                Contact the desk
              </a>
              <button onClick={() => setShowReportModal(false)}
                className="flex-1 py-2.5 text-[12px] rounded-lg"
                style={{ background: "transparent", color: "#6E6C69", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
