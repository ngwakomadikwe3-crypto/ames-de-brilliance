"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { computeOffsetMs } from "@/lib/auction/clock";
import type { PublicLot } from "@/lib/auction/public-projection";
import { AUCTION_POLL_HIDDEN_INTERVAL_MS, AUCTION_POLL_INTERVAL_MS } from "./config";

/**
 * Short-polling hook for the public auction feed.
 *
 * - Polls GET /api/lots every AUCTION_POLL_INTERVAL_MS while the tab is
 *   visible, backing off to AUCTION_POLL_HIDDEN_INTERVAL_MS while hidden and
 *   refreshing immediately when the tab becomes visible again.
 * - On fetch errors, backs off exponentially (x2 per consecutive failure,
 *   capped at 60s) and keeps showing the last good data.
 * - Tracks the server-clock offset from each response's `serverTime`, so
 *   countdowns render from server time rather than the visitor's clock.
 * - No Appwrite Realtime, no client-side database access: this plain HTTPS
 *   poll is the only live channel in Phase 2b.
 */
export interface UseLotsResult {
  lots: PublicLot[];
  /** Add to Date.now() for the current server-time estimate. */
  serverOffsetMs: number;
  /** Whether the API would accept a bid from this session (staff for now). */
  biddingEnabled: boolean;
  reserveMetVisible: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface LotsResponse {
  lots?: PublicLot[];
  serverTime?: string;
  biddingEnabled?: boolean;
  reserveMetVisible?: boolean;
}

export function useLots(): UseLotsResult {
  const [lots, setLots] = useState<PublicLot[]>([]);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [biddingEnabled, setBiddingEnabled] = useState(false);
  const [reserveMetVisible, setReserveMetVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const failures = useRef(0);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/lots", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as LotsResponse;
      setLots(Array.isArray(body.lots) ? body.lots : []);
      if (typeof body.serverTime === "string") {
        setServerOffsetMs(computeOffsetMs(body.serverTime, Date.now()));
      }
      setBiddingEnabled(body.biddingEnabled === true);
      setReserveMetVisible(body.reserveMetVisible === true);
      failures.current = 0;
      setError(null);
    } catch {
      failures.current += 1;
      setError("Live data temporarily unavailable — retrying.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      const hidden = document.visibilityState === "hidden";
      const base = hidden ? AUCTION_POLL_HIDDEN_INTERVAL_MS : AUCTION_POLL_INTERVAL_MS;
      const delay =
        failures.current > 0
          ? Math.min(base * 2 ** Math.min(failures.current, 4), 60_000)
          : base;
      timer = setTimeout(async () => {
        if (cancelled) return;
        await poll();
        if (!cancelled) scheduleNext();
      }, delay);
    };

    const kick = () => {
      if (timer) clearTimeout(timer);
      void poll().then(() => {
        if (!cancelled) scheduleNext();
      });
    };

    kick();

    const onVisibility = () => {
      if (document.visibilityState === "visible") kick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [poll]);

  return { lots, serverOffsetMs, biddingEnabled, reserveMetVisible, loading, error, refresh: poll };
}
