"use client";

export default function BillingPage() {
  return (
    <div className="min-h-full" style={{ background: "#EAE8E4" }}>
      <style>{`
        .billing-back { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #6E6C69; background: none; border: none; cursor: pointer; padding: 0; margin-bottom: 16px; }
        .billing-back svg { width: 16px; height: 16px; }
      `}</style>

      <div className="px-5 pt-14 pb-8 max-w-lg mx-auto w-full">
        <button onClick={() => window.history.back()} className="billing-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15 18l-6-6 6-6" /></svg>
          Back
        </button>

        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#171717", letterSpacing: "-0.01em", marginBottom: 24 }}>Billing</h1>

        {/* Empty state */}
        <div style={{ background: "#FCFCFB", borderRadius: 14, border: "1px solid rgba(23,23,23,0.08)", padding: "40px 24px", textAlign: "center" }}>
          <svg viewBox="0 0 24 24" fill="none" style={{ width: 32, height: 32, margin: "0 auto 12px" }}>
            <defs>
              <linearGradient id="bill-g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#E8E6E1" />
                <stop offset="100%" stopColor="#A6A6AB" />
              </linearGradient>
            </defs>
            <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="url(#bill-g)" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
          </svg>
          <p style={{ fontSize: 14, fontWeight: 500, color: "#171717", marginBottom: 4 }}>No invoices yet</p>
          <p style={{ fontSize: 12, color: "#6E6C69", lineHeight: 1.5 }}>When you reserve a piece, an invoice will appear here.</p>
        </div>

        {/* Payment method slot */}
        <div style={{ marginTop: 20, background: "#FCFCFB", borderRadius: 14, border: "1px solid rgba(23,23,23,0.08)", padding: "16px" }}>
          <span style={{ fontSize: 10, letterSpacing: "0.1em", color: "#6E6C69", textTransform: "uppercase", display: "block", marginBottom: 12, fontWeight: 400 }}>Payment Method</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", border: "1px dashed rgba(23,23,23,0.12)", borderRadius: 10, cursor: "pointer" }}>
            <div style={{ width: 36, height: 24, borderRadius: 4, background: "#F5F4F2", border: "1px solid rgba(23,23,23,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#A6A6AB" strokeWidth="1.5" style={{ width: 14, height: 14 }}><rect x="1" y="4" width="22" height="16" rx="2" /><path d="M1 10h22" /></svg>
            </div>
            <span style={{ fontSize: 13, color: "#6E6C69" }}>Bank transfer on invoice</span>
          </div>
          <p style={{ fontSize: 11, color: "#6E6C69", marginTop: 8, lineHeight: 1.4 }}>AMES accepts payment by bank invoice and direct transfer. Your invoice will include bank details.</p>
        </div>
      </div>
    </div>
  );
}
