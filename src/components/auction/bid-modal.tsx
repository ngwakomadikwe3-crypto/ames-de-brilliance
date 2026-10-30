"use client";

import { useRef, useState } from "react";
import type { PublicLot } from "@/lib/auction/public-projection";
import { publicMinimumBidMinor } from "@/lib/auction/public-projection";
import { bidRejectionMessage } from "./bid-errors";
import { DiamondGlyph } from "./diamond-glyph";
import { formatMoney } from "./format";

/* ─── Bidding Modal ───
   Posts to POST /api/lots/[id]/bids and renders every rejection reason the
   engine returns. Idempotency: one key per submit attempt; the key is kept
   across network failures (so a retry of an uncertain attempt is a safe
   replay) and rotated after every definitive server response. */

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `bid-${crypto.randomUUID()}`;
  }
  return `bid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

interface BidModalProps {
  lot: PublicLot | null;
  onClose: () => void;
  /** Accepted (fresh or idempotent replay). Parent toasts and refreshes. */
  onPlaced: (message: string) => void;
  /** The API rejected the session itself — parent swaps in the gate modal. */
  onUnauthorized: () => void;
}

export function BidModal({ lot, onClose, onPlaced, onUnauthorized }: BidModalProps) {
  // Remount per lot so the form state initializes fresh (no effect needed).
  if (!lot) return null;
  return (
    <BidModalInner
      key={lot.id}
      lot={lot}
      onClose={onClose}
      onPlaced={onPlaced}
      onUnauthorized={onUnauthorized}
    />
  );
}

function BidModalInner({ lot, onClose, onPlaced, onUnauthorized }: { lot: PublicLot } & Omit<BidModalProps, "lot">) {
  const [amountMajor, setAmountMajor] = useState(() => (publicMinimumBidMinor(lot) / 100).toFixed(2));
  const [serverMinimumMinor, setServerMinimumMinor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string>(newIdempotencyKey());

  // Displayed/enforced minimum always reflects the freshest lot state (polls)
  // and any minimum the engine returned with a rejection.
  const minimumMinor = Math.max(publicMinimumBidMinor(lot), serverMinimumMinor ?? 0);

  const lotLive = lot.status === "live";
  const amountMinor = Math.round(Number.parseFloat(amountMajor || "0") * 100);
  const amountValid = Number.isFinite(amountMinor) && amountMinor >= minimumMinor;

  const submit = async () => {
    if (!amountValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/lots/${lot.id}/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMinor, idempotencyKey: idempotencyKey.current }),
      });

      if (res.status === 401) {
        onUnauthorized();
        return;
      }

      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        replayed?: boolean;
        extended?: boolean;
        reason?: string;
        minimumMinor?: number;
      } | null;

      if ((res.status === 201 || res.status === 200) && body?.ok) {
        // Definitive outcome: rotate the key so the NEXT bid is a new intent.
        idempotencyKey.current = newIdempotencyKey();
        onPlaced(
          body.replayed
            ? "Bid already recorded (safe retry)."
            : body.extended
              ? "Bid placed — closing time extended (anti-snipe)."
              : "Bid placed.",
        );
        return;
      }

      // Definitive rejection: rotate the key, surface the engine's reason.
      idempotencyKey.current = newIdempotencyKey();
      const reason = typeof body?.reason === "string" ? body.reason : "internal_error";
      if (reason === "amount_below_minimum" && typeof body?.minimumMinor === "number") {
        setServerMinimumMinor(body.minimumMinor);
      }
      setError(bidRejectionMessage(reason, { minimumMinor: body?.minimumMinor, currency: lot.currency }));
    } catch {
      // Uncertain outcome (network cut, timeout): KEEP the idempotency key so
      // retrying is a safe replay rather than a possible double bid.
      setError(
        "Network error — your bid may or may not have been placed. " +
          "Retrying now is safe; the catalogue will refresh with the outcome.",
      );
    } finally {
      setSubmitting(false);
    }
  };

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
            Lot {lot.stoneRef || lot.id}
          </span>
        </div>
        <h3
          className="text-[18px] mb-1"
          style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", fontWeight: 600, color: "#F5F5F2", letterSpacing: "-0.01em" }}
        >
          {lot.title}
        </h3>
        {lot.description && (
          <p className="text-[12px] mb-4" style={{ color: "#6E6C69" }}>
            {lot.description}
          </p>
        )}

        <div className="mb-4" style={{ background: "rgba(166,166,171,0.06)", borderRadius: 10, padding: 14 }}>
          <div className="flex justify-between mb-2">
            <span className="text-[11px]" style={{ color: "#6E6C69" }}>
              {lot.bidCount > 0 ? "Current bid" : "Starting bid"}
            </span>
            <span className="text-[13px] font-medium tabular-nums" style={{ color: "#F5F5F2" }}>
              {formatMoney(lot.bidCount > 0 ? lot.currentBidMinor : lot.startingBidMinor, lot.currency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[11px]" style={{ color: "#6E6C69" }}>Minimum next bid</span>
            <span className="text-[13px] font-medium tabular-nums" style={{ color: "#A6A6AB" }}>
              {formatMoney(minimumMinor, lot.currency)}
            </span>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[11px] uppercase tracking-[0.12em] mb-1.5 block" style={{ color: "#6E6C69" }}>
            Your bid ({lot.currency})
          </label>
          <input
            type="number"
            value={amountMajor}
            onChange={(e) => setAmountMajor(e.target.value)}
            min={(minimumMinor / 100).toFixed(2)}
            step="0.01"
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
          {!error && amountMajor !== "" && !amountValid && (
            <p className="text-[11px] mt-1" style={{ color: "#EF4444" }}>
              Minimum bid is {formatMoney(minimumMinor, lot.currency)}
            </p>
          )}
          {error && (
            <p className="text-[11px] mt-1" style={{ color: "#EF4444", lineHeight: 1.5 }}>
              {error}
            </p>
          )}
          {!lotLive && (
            <p className="text-[11px] mt-1" style={{ color: "#EF4444" }}>
              {lot.status === "scheduled" ? "This lot is not open for bidding yet." : "Bidding for this lot has closed."}
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
            onClick={submit}
            disabled={!amountValid || submitting || !lotLive}
            className="flex-1 py-2.5 text-[12px] font-medium"
            style={{
              background: amountValid && lotLive && !submitting ? "#F5F5F2" : "rgba(166,166,171,0.15)",
              color: amountValid && lotLive && !submitting ? "#0E1013" : "#6E6C69",
              border: "none",
              borderRadius: 10,
              cursor: amountValid && lotLive && !submitting ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "Placing…" : "Place bid"}
          </button>
        </div>
      </div>
    </div>
  );
}
