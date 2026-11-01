"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The visitor's buyer session state, from GET /api/buyers/me.
 * Powers the /buyer account page and the status messages for
 * pending / rejected / suspended / terms-stale / licence-expired buyers.
 */
export interface BuyerMe {
  authenticated: boolean;
  cataloguePublicAccess: boolean;
  buyer?: {
    id: string;
    name: string;
    email: string;
    entityType: string;
    status: string;
    termsCurrent: boolean;
    licenceExpiry: string;
    mayOffer: boolean;
  };
  state?: string;
  message?: string;
}

export interface UseBuyerMeResult {
  /** Null while the first fetch is in flight. */
  me: BuyerMe | null;
  refresh: () => Promise<void>;
}

export function useBuyerMe(): UseBuyerMeResult {
  const [me, setMe] = useState<BuyerMe | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/buyers/me", { cache: "no-store" });
      if (!res.ok) {
        setMe(null);
        return;
      }
      setMe((await res.json()) as BuyerMe);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/buyers/me", { cache: "no-store" });
        if (cancelled) return;
        setMe(res.ok ? ((await res.json()) as BuyerMe) : null);
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
