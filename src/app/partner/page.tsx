"use client";

import { useState, useRef } from "react";

export default function PartnerPage() {
  const [form, setForm] = useState({
    name: "",
    company: "",
    country: "",
    whatsapp: "",
    email: "",
    licence: "",
  });
  const [licencePhoto, setLicencePhoto] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLicencePhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (!form.name || !form.whatsapp) {
      setError("Name and WhatsApp are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/partner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, licence_photo: licencePhoto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-[10px] tracking-[0.3em] uppercase text-muted">
            AMES DE BRILLIANTE
          </div>
          <h1 className="text-2xl font-light tracking-tight">
            Application received
          </h1>
          <p className="text-[12px] text-muted leading-relaxed">
            Thank you, {form.name}. Your application has been submitted and is
            now pending review. Our team will be in touch via WhatsApp to
            complete onboarding and provide your portal access.
          </p>
          <div className="border border-border p-4 mt-4">
            <p className="text-[11px] text-muted">
              Reference: Trader application — {form.company || form.name}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="text-[10px] tracking-[0.3em] uppercase text-muted">
            AMES DE BRILLIANTE
          </div>
          <h1 className="text-2xl font-light tracking-tight">
            Sell through AMES DE BRILLIANTE
          </h1>
          <p className="text-[12px] text-muted leading-relaxed max-w-sm mx-auto">
            Submit your details below to apply as a partner trader. Once
            approved, you&apos;ll receive portal access to list and manage your
            items on our platform.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="text-[11px] text-red-500 border border-red-500/30 p-3 bg-red-500/5">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted mb-1.5">
                Full name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-transparent border border-border px-3 py-2 text-[12px] text-foreground placeholder:text-muted/50 focus:outline-none focus:border-white/40"
                placeholder="e.g. Thabo Molefe"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted mb-1.5">
                  Company
                </label>
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="w-full bg-transparent border border-border px-3 py-2 text-[12px] text-foreground placeholder:text-muted/50 focus:outline-none focus:border-white/40"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted mb-1.5">
                  Country
                </label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="w-full bg-transparent border border-border px-3 py-2 text-[12px] text-foreground placeholder:text-muted/50 focus:outline-none focus:border-white/40"
                  placeholder="e.g. Botswana"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted mb-1.5">
                  WhatsApp number *
                </label>
                <input
                  type="tel"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  className="w-full bg-transparent border border-border px-3 py-2 text-[12px] text-foreground placeholder:text-muted/50 focus:outline-none focus:border-white/40"
                  placeholder="+267 71 234 567"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-transparent border border-border px-3 py-2 text-[12px] text-foreground placeholder:text-muted/50 focus:outline-none focus:border-white/40"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted mb-1.5">
                Licence number
              </label>
              <input
                type="text"
                value={form.licence}
                onChange={(e) => setForm({ ...form, licence: e.target.value })}
                className="w-full bg-transparent border border-border px-3 py-2 text-[12px] text-foreground placeholder:text-muted/50 focus:outline-none focus:border-white/40"
                placeholder="e.g. BDMR-123"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted mb-1.5">
                Licence photo
              </label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handlePhoto}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border border-border border-dashed px-3 py-4 text-[11px] text-muted hover:border-white/40 transition-colors cursor-default"
              >
                {licencePhoto ? "Photo attached ✓" : "Tap to upload licence photo"}
              </button>
              {licencePhoto && (
                <div className="mt-2">
                  <img
                    src={licencePhoto}
                    alt="Licence"
                    className="w-20 h-20 object-cover border border-border"
                  />
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-[#FCFCFB] text-[#171717] text-[12px] font-medium tracking-wide hover:bg-[#FCFCFB]/90 disabled:opacity-50 cursor-default"
          >
            {submitting ? "Submitting..." : "Submit application"}
          </button>

          <p className="text-[10px] text-muted text-center leading-relaxed">
            By submitting, you agree to our{" "}
            <a href="/terms" className="underline">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline">
              Privacy Policy
            </a>
            .
          </p>
        </form>
      </div>
    </div>
  );
}
