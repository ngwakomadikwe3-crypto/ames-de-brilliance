"use client";

import { useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { BuyerAuthModal } from "@/components/buyer/buyer-auth-modal";
import { useBuyerMe } from "@/components/buyer/use-buyer-me";

const CORMORANT = "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif";

/**
 * Buyer account page — register, sign in, see standing, upload KYC documents.
 * The full buyer catalogue screens (lot browsing, offer placement) are STEP 5;
 * this page is the account gate that work builds on.
 */
export default function BuyerPage() {
  const { me, refresh } = useBuyerMe();
  const [showAuth, setShowAuth] = useState(true);

  const buyer = me?.authenticated ? me.buyer : null;

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "#0E1013", color: "#F5F5F2" }}
    >
      <div className="mb-10">
        <BrandMark height={44} dark />
      </div>

      {buyer ? (
        <div
          className="w-full max-w-md"
          style={{ background: "#14171A", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 32 }}
        >
          <h1 className="text-[22px] mb-1" style={{ fontFamily: CORMORANT, fontWeight: 600 }}>
            {buyer.name}
          </h1>
          <p className="text-[12px] mb-1" style={{ color: "#6E6C69" }}>
            {buyer.email} · {buyer.entityType === "company" ? "Company" : "Individual"}
          </p>
          <p className="text-[12px] mb-4" style={{ color: "#A6A6AB" }}>
            Account: {me?.state ?? buyer.status}
            {buyer.licenceExpiry ? ` · Licence expires ${buyer.licenceExpiry}` : ""}
          </p>
          {me?.message && (
            <p className="text-[12px] mb-6" style={{ color: "#6E6C69", lineHeight: 1.6 }}>
              {me.message}
            </p>
          )}
          <button
            onClick={() => setShowAuth(true)}
            style={{
              width: "100%",
              padding: "11px 0",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              background: "#F5F5F2",
              color: "#0E1013",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
            }}
          >
            Manage account &amp; documents
          </button>
        </div>
      ) : (
        <div className="text-center">
          <h1 className="text-[26px] mb-3" style={{ fontFamily: CORMORANT, fontWeight: 600 }}>
            Rough Diamond Catalogue
          </h1>
          <p className="text-[13px] mb-8 max-w-md" style={{ color: "#6E6C69", lineHeight: 1.7 }}>
            Access is reserved for licensed buyers. Register your account, complete
            verification, and sign in to view lots and make offers.
          </p>
          <button
            onClick={() => setShowAuth(true)}
            style={{
              padding: "12px 32px",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.06em",
              background: "#F5F5F2",
              color: "#0E1013",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
            }}
          >
            Register / Sign in
          </button>
        </div>
      )}

      {showAuth && (
        <BuyerAuthModal
          me={me}
          onClose={() => setShowAuth(false)}
          onAuthChange={() => void refresh()}
        />
      )}
    </main>
  );
}
