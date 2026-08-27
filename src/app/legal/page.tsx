"use client";

import Footer from "@/components/footer";

export default function LegalPage() {
  return (
    <div className="min-h-screen" style={{ background: "#EAE8E4" }}>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 style={{ fontSize: 22, fontWeight: 500, color: "#171717", letterSpacing: "-0.01em", marginBottom: 8 }}>
          Legal &amp; Compliance
        </h1>
        <p style={{ fontSize: 12, color: "#6E6C69", marginBottom: 32 }}>
          AMES DE BRILLIANTE (Pty) Ltd — Licensed Diamond Dealer, Republic of Botswana
        </p>

        <div className="space-y-8">
          <section>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#171717", marginBottom: 8 }}>Kimberley Process</h2>
            <p style={{ fontSize: 13, color: "#6E6C69", lineHeight: 1.6 }}>
              All rough diamond exports are conducted under the Kimberley Process Certification Scheme (KPCS).
              AMES DE BRILLIANTE operates in full compliance with Botswana&apos;s diamond trading regulations
              and international best practices for responsible sourcing.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#171717", marginBottom: 8 }}>Terms of Use</h2>
            <p style={{ fontSize: 13, color: "#6E6C69", lineHeight: 1.6 }}>
              Prices displayed are indicative and subject to confirmation by the desk.
              Reservations are confirmed only after written acknowledgement.
              All transactions are governed by the laws of the Republic of Botswana.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#171717", marginBottom: 8 }}>Privacy</h2>
            <p style={{ fontSize: 13, color: "#6E6C69", lineHeight: 1.6 }}>
              We collect only the information necessary to fulfil your enquiry.
              We do not sell or share personal data with third parties.
              Contact details are used solely for communication regarding your transaction.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#171717", marginBottom: 8 }}>Contact</h2>
            <div style={{ fontSize: 13, color: "#6E6C69", lineHeight: 1.6 }}>
              <p><strong style={{ color: "#171717" }}>AMES DE BRILLIANTE</strong> (Pty) Ltd</p>
              <p>Licensed Diamond Dealer, Republic of Botswana</p>
              <p>WhatsApp: +267 72 839 152</p>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
