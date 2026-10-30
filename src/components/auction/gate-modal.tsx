"use client";

import { DiamondGlyph } from "./diamond-glyph";

/* ─── Gate Modal (visitor) ───
   Shown instead of the bid modal whenever the API reports this session may
   not bid (no BidderResolver-accepted identity). Public bidding is Phase 3. */
export function GateModal({ onClose }: { onClose: () => void }) {
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
