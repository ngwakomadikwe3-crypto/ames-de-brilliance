"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The visitor's bidder session state, from GET /api/bidders/me.
 * Powers the homepage register/sign-in gate and the status messages for
 * pending / rejected / suspended / terms-stale bidders.
 */
export interface BidderMe {
  authenticated: boolean;
  publicBidding: boolean;
  bidder?: {
    id: string;
    name: string;
    email: string;
    entityType: string;
    status: string;
    termsCurrent: boolean;
  };
  state?: string;
  message?: string;
}

export interface UseBidderMeResult {
  /** Null while the first fetch is in flight. */
  me: BidderMe | null;
  refresh: () => Promise<void>;
}

export function useBidderMe(): UseBidderMeResult {
  const [me, setMe] = useState<BidderMe | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/bidders/me", { cache: "no-store" });
      if (!res.ok) {
        setMe(null);
        return;
      }
      setMe((await res.json()) as BidderMe);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/bidders/me", { cache: "no-store" });
        if (cancelled) return;
        setMe(res.ok ? ((await res.json()) as BidderMe) : null);
      } catch {
        if (!cancelled) setMe(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { me, refresh };
}
