"use client";

import { useState } from "react";
import { DiamondGlyph } from "./diamond-glyph";
import type { BuyerMe } from "./use-buyer-me";

/* ─── Buyer Auth Modal ───
   Register/sign-in flow for the rough-diamond catalogue, preserving the
   gate's visual design (panel, palette, Cormorant heading, DiamondGlyph).
   Views: choice -> register | login-email -> login-code; authenticated
   buyers see their standing (pending / verified / rejected / suspended /
   terms-stale / licence-expired) with the matching actions. */

type View = "choice" | "register" | "registered" | "login-email" | "login-code" | "status";

interface Props {
  me: BuyerMe | null;
  onClose: () => void;
  /** Called after any auth-state change (register/login/logout/terms/upload). */
  onAuthChange: () => void;
}

const CORMORANT = "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0E1013",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  color: "#F5F5F2",
  outline: "none",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
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
};

const ghostBtn: React.CSSProperties = {
  ...primaryBtn,
  background: "transparent",
  color: "#A6A6AB",
  border: "1px solid rgba(255,255,255,0.12)",
};

export function BuyerAuthModal({ me, onClose, onAuthChange }: Props) {
  const [view, setView] = useState<View>(me?.authenticated ? "status" : "choice");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Register form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [entityType, setEntityType] = useState<"individual" | "company">("individual");
  const [licenceNumber, setLicenceNumber] = useState("");
  const [licenceType, setLicenceType] = useState("");
  const [licenceExpiry, setLicenceExpiry] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [code, setCode] = useState("");

  // Status-view state
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: { error?: string } }> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  async function handleRegister() {
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/buyers/register", {
      name, email, phone, country, entityType,
      licenceNumber, licenceType, licenceExpiry,
      acceptTerms: true,
    });
    setBusy(false);
    if (!ok) {
      setError(data.error === "rate_limited"
        ? "Too many attempts — please try again later."
        : "Please check the form — some details look invalid.");
      return;
    }
    setLoginEmail(email);
    setView("registered");
    onAuthChange();
  }

  async function handleRequestCode() {
    setBusy(true);
    setError(null);
    const { ok } = await post("/api/buyers/login/request-code", { email: loginEmail });
    setBusy(false);
    if (!ok) {
      setError("Could not send the code — check the email address.");
      return;
    }
    setView("login-code");
  }

  async function handleVerifyCode() {
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/buyers/login/verify", { email: loginEmail, code });
    setBusy(false);
    if (!ok) {
      setError(data.error === "invalid_code" ? "That code is not valid — check it and try again." : "Sign-in failed — please try again.");
      return;
    }
    setView("status");
    onAuthChange();
  }

  async function handleLogout() {
    await post("/api/buyers/logout", {});
    onAuthChange();
    setView("choice");
  }

  async function handleAcceptTerms() {
    setBusy(true);
    const { ok } = await post("/api/buyers/terms/accept", {});
    setBusy(false);
    if (ok) onAuthChange();
  }

  async function handleUpload(file: File) {
    setBusy(true);
    setUploadMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/buyers/documents", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      setUploadMsg(res.ok
        ? "Document received — thank you. The house will review it with your application."
        : data.error === "unsupported_file_type"
          ? "That file type is not accepted — PDF, JPG, PNG or WebP only."
          : data.error === "file_too_large"
            ? "The file is too large — 20 MB maximum."
            : "Upload failed — please try again.");
    } catch {
      setUploadMsg("Upload failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const status = me?.authenticated ? me : null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm"
        style={{ background: "#14171A", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <DiamondGlyph size={32} />
        </div>

        {/* ── Choice ── */}
        {view === "choice" && (
          <div style={{ textAlign: "center" }}>
            <h3 className="text-[18px] mb-2" style={{ fontFamily: CORMORANT, fontWeight: 600, color: "#F5F5F2" }}>
              Licensed Buyer Access
            </h3>
            <p className="text-[12px] mb-6" style={{ color: "#6E6C69", lineHeight: 1.6 }}>
              The rough catalogue is reserved for licensed buyers under Botswana diamond trading law. Register and complete verification to view lots and make offers.
            </p>
            <div className="flex flex-col gap-2">
              <button style={primaryBtn} onClick={() => setView("register")}>Register as a buyer</button>
              <button style={ghostBtn} onClick={() => setView("login-email")}>Sign in with email code</button>
            </div>
          </div>
        )}

        {/* ── Register ── */}
        {view === "register" && (
          <div>
            <h3 className="text-[18px] mb-4 text-center" style={{ fontFamily: CORMORANT, fontWeight: 600, color: "#F5F5F2" }}>
              Buyer Registration
            </h3>
            <div className="flex flex-col gap-2.5">
              <input style={inputStyle} placeholder="Full name / company contact" value={name} onChange={(e) => setName(e.target.value)} />
              <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input style={inputStyle} placeholder="Phone (with country code)" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input style={inputStyle} placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
              <div className="flex gap-2">
                {(["individual", "company"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setEntityType(t)}
                    className="flex-1 py-2 text-[12px]"
                    style={{
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: entityType === t ? "#F5F5F2" : "transparent",
                      color: entityType === t ? "#0E1013" : "#A6A6AB",
                      cursor: "pointer",
                    }}
                  >
                    {t === "individual" ? "Individual" : "Company"}
                  </button>
                ))}
              </div>
              <input style={inputStyle} placeholder="Diamond trading licence number" value={licenceNumber} onChange={(e) => setLicenceNumber(e.target.value)} />
              <input style={inputStyle} placeholder="Licence type (e.g. dealer, cutter, exporter)" value={licenceType} onChange={(e) => setLicenceType(e.target.value)} />
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: "#A6A6AB", lineHeight: 1.5 }}>
                Licence expiry date
                <input style={inputStyle} type="date" value={licenceExpiry} onChange={(e) => setLicenceExpiry(e.target.value)} />
              </label>
              <label className="flex items-start gap-2 text-[11px]" style={{ color: "#A6A6AB", lineHeight: 1.5 }}>
                <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} style={{ marginTop: 2 }} />
                <span>
                  I accept the <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#F5F5F2" }}>buyer terms</a> and understand the house reviews every application before catalogue access and offers are enabled.
                </span>
              </label>
              {error && <p className="text-[11px]" style={{ color: "#D08C7A" }}>{error}</p>}
              <button
                style={{ ...primaryBtn, opacity: !acceptTerms || !name || !email || !phone || !country || !licenceNumber || !licenceType || !licenceExpiry || busy ? 0.4 : 1 }}
                disabled={!acceptTerms || !name || !email || !phone || !country || !licenceNumber || !licenceType || !licenceExpiry || busy}
                onClick={handleRegister}
              >
                {busy ? "Submitting…" : "Submit application"}
              </button>
              <button style={ghostBtn} onClick={() => { setError(null); setView("choice"); }}>Back</button>
            </div>
          </div>
        )}

        {/* ── Registered ── */}
        {view === "registered" && (
          <div style={{ textAlign: "center" }}>
            <h3 className="text-[18px] mb-2" style={{ fontFamily: CORMORANT, fontWeight: 600, color: "#F5F5F2" }}>
              Application received
            </h3>
            <p className="text-[12px] mb-6" style={{ color: "#6E6C69", lineHeight: 1.6 }}>
              Your application is under review by the house. Sign in with an email code to check your status and upload your KYC documents.
            </p>
            <div className="flex flex-col gap-2">
              <button style={primaryBtn} onClick={() => setView("login-email")}>Sign in to upload documents</button>
              <button style={ghostBtn} onClick={onClose}>Close</button>
            </div>
          </div>
        )}

        {/* ── Login: email ── */}
        {view === "login-email" && (
          <div>
            <h3 className="text-[18px] mb-4 text-center" style={{ fontFamily: CORMORANT, fontWeight: 600, color: "#F5F5F2" }}>
              Buyer Sign-in
            </h3>
            <div className="flex flex-col gap-2.5">
              <input style={inputStyle} type="email" placeholder="Registered email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
              <p className="text-[11px]" style={{ color: "#6E6C69", lineHeight: 1.5 }}>
                We email you a one-time sign-in code — no password to remember.
              </p>
              {error && <p className="text-[11px]" style={{ color: "#D08C7A" }}>{error}</p>}
              <button style={{ ...primaryBtn, opacity: !loginEmail || busy ? 0.4 : 1 }} disabled={!loginEmail || busy} onClick={handleRequestCode}>
                {busy ? "Sending…" : "Email me a code"}
              </button>
              <button style={ghostBtn} onClick={() => { setError(null); setView("choice"); }}>Back</button>
            </div>
          </div>
        )}

        {/* ── Login: code ── */}
        {view === "login-code" && (
          <div>
            <h3 className="text-[18px] mb-4 text-center" style={{ fontFamily: CORMORANT, fontWeight: 600, color: "#F5F5F2" }}>
              Enter your code
            </h3>
            <div className="flex flex-col gap-2.5">
              <input
                style={{ ...inputStyle, textAlign: "center", letterSpacing: "0.35em", fontSize: 18 }}
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <p className="text-[11px]" style={{ color: "#6E6C69", lineHeight: 1.5 }}>
                If {loginEmail} is registered, a 6-digit code is on its way. It expires in 10 minutes.
              </p>
              {error && <p className="text-[11px]" style={{ color: "#D08C7A" }}>{error}</p>}
              <button style={{ ...primaryBtn, opacity: code.length !== 6 || busy ? 0.4 : 1 }} disabled={code.length !== 6 || busy} onClick={handleVerifyCode}>
                {busy ? "Checking…" : "Sign in"}
              </button>
              <button style={ghostBtn} onClick={() => { setError(null); setCode(""); setView("login-email"); }}>Use a different email</button>
            </div>
          </div>
        )}

        {/* ── Status (authenticated) ── */}
        {view === "status" && status?.buyer && (
          <div style={{ textAlign: "center" }}>
            <h3 className="text-[18px] mb-1" style={{ fontFamily: CORMORANT, fontWeight: 600, color: "#F5F5F2" }}>
              {status.buyer.name}
            </h3>
            <p className="text-[11px] mb-4" style={{ color: "#6E6C69" }}>{status.buyer.email}</p>

            {status.state && status.state !== "verified" && (
              <p className="text-[12px] mb-4" style={{ color: status.state === "pending" ? "#A6A6AB" : "#D08C7A", lineHeight: 1.6 }}>
                {status.message}
              </p>
            )}
            {status.state === "verified" && (
              <p className="text-[12px] mb-4" style={{ color: "#8FB996", lineHeight: 1.6 }}>
                Your account is verified — you may view the catalogue and make offers.
              </p>
            )}

            <div className="flex flex-col gap-2">
              {status.state === "terms_stale" && (
                <button style={primaryBtn} disabled={busy} onClick={handleAcceptTerms}>
                  {busy ? "Saving…" : "Accept the current buyer terms"}
                </button>
              )}
              {(status.state === "pending" || status.state === "verified" || status.state === "terms_stale") && (
                <label style={{ ...ghostBtn, display: "block", textAlign: "center" }}>
                  {busy ? "Uploading…" : "Upload a KYC document"}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUpload(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              {uploadMsg && <p className="text-[11px]" style={{ color: "#A6A6AB", lineHeight: 1.5 }}>{uploadMsg}</p>}
              <button style={ghostBtn} onClick={handleLogout}>Sign out</button>
              <button style={ghostBtn} onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
