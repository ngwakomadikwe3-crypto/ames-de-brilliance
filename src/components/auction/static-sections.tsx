"use client";

import { DiamondGlyph } from "./diamond-glyph";

/* ─── Static homepage sections (unchanged visual design) ─── */

export function HowItWorksSection() {
  return (
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
  );
}

export function ComplianceSection() {
  return (
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
  );
}

export function HouseServicesSection() {
  return (
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
  );
}

export function ReportsCtaSection({ onRequestReport }: { onRequestReport: () => void }) {
  return (
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
          onClick={onRequestReport}
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
  );
}

export function FooterCtaSection() {
  return (
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
  );
}
