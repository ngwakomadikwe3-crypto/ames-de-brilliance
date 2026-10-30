"use client";

import { useEffect, useState } from "react";
import { serverNowMs } from "@/lib/auction/clock";
import { BidModal } from "@/components/auction/bid-modal";
import { CatalogueSection } from "@/components/auction/catalogue-section";
import { GateModal } from "@/components/auction/gate-modal";
import { HeroSection } from "@/components/auction/hero-section";
import { ResultsSection } from "@/components/auction/results-section";
import { Toast } from "@/components/auction/toast";
import { useLots } from "@/components/auction/use-lots";
import {
  ComplianceSection,
  FooterCtaSection,
  HouseServicesSection,
  HowItWorksSection,
  ReportsCtaSection,
} from "@/components/auction/static-sections";

/* ═══════════════════════════════════════════
   MAIN PAGE — wired to the real auction engine.
   All lot data comes from GET /api/lots (short polling); all bids go to
   POST /api/lots/[id]/bids. There is no demo data and no client-side hammer:
   outcomes are decided server-side only.
   ═══════════════════════════════════════════ */
export default function Home() {
  const { lots, serverOffsetMs, biddingEnabled, reserveMetVisible, loading, error, refresh } = useLots();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [bidLotId, setBidLotId] = useState<string | null>(null);
  const [showGate, setShowGate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Tick once a second to re-render countdowns from the server-corrected
  // clock. The tick NEVER decides an outcome — it only moves the display.
  useEffect(() => {
    const iv = setInterval(() => setNowMs(serverNowMs(serverOffsetMs)), 1000);
    return () => clearInterval(iv);
  }, [serverOffsetMs]);

  // Derive the modal lot from the latest poll so it tracks live state.
  const bidLot = bidLotId ? (lots.find((lot) => lot.id === bidLotId) ?? null) : null;

  return (
    <div style={{ background: "#0E1013", minHeight: "100vh", color: "#F5F5F2" }}>
      <HeroSection lots={lots} nowMs={nowMs} />

      <CatalogueSection
        lots={lots}
        nowMs={nowMs}
        loading={loading}
        error={error}
        reserveMetVisible={reserveMetVisible}
        onBidClick={(lot) => {
          // Bidding is enabled only for sessions the BidderResolver accepts
          // (staff for now); everyone else gets the register-to-bid gate.
          if (biddingEnabled) {
            setBidLotId(lot.id);
          } else {
            setShowGate(true);
          }
        }}
      />

      <HowItWorksSection />
      <ResultsSection lots={lots} />
      <ComplianceSection />
      <HouseServicesSection />
      <ReportsCtaSection onRequestReport={() => setShowReportModal(true)} />
      <FooterCtaSection />

      {/* Modals */}
      <BidModal
        lot={bidLot}
        onClose={() => setBidLotId(null)}
        onPlaced={(message) => {
          setBidLotId(null);
          setToast(message);
          void refresh();
        }}
        onUnauthorized={() => {
          setBidLotId(null);
          setShowGate(true);
        }}
      />
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
