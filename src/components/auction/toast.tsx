"use client";

import { useEffect } from "react";

/* ─── Toast ─── */
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
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
