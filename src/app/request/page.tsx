"use client";

import { useState } from "react";

export default function RequestPage() {
  const [stoneType, setStoneType] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(form: HTMLFormElement): boolean {
    const errs: Record<string, string> = {};
    const d = (n: string) => (form.elements.namedItem(n) as HTMLInputElement)?.value || "";

    if (!d("name").trim()) errs.name = "Required";
    if (!d("company").trim()) errs.company = "Required";
    if (!d("country")) errs.country = "Required";
    if (!d("contact").trim()) errs.contact = "Required";
    if (!d("type")) errs.type = "Required";
    if (!d("shape") && stoneType !== "rough") errs.shape = "Required";
    if (!d("caratMin")) errs.caratMin = "Required";
    if (!d("caratMax")) errs.caratMax = "Required";
    if (d("caratMin") && d("caratMax") && parseFloat(d("caratMin")) > parseFloat(d("caratMax"))) errs.caratMax = "Max must be >= Min";
    if (!d("color")) errs.color = "Required";
    if (!d("clarity") && stoneType !== "rough") errs.clarity = "Required";
    if (!d("certification") && stoneType !== "rough") errs.certification = "Required";

    if (stoneType === "rough") {
      if (!d("kpLicence").trim()) errs.kpLicence = "KP licence number required for rough";
      if (!d("kpCountry").trim()) errs.kpCountry = "Issuing country required";
    }

    if (!(form.elements.namedItem("consent") as HTMLInputElement)?.checked) errs.consent = "You must agree to the Terms and Privacy Policy";
    if (stoneType === "rough" && !(form.elements.namedItem("declaration") as HTMLInputElement)?.checked) errs.declaration = "You must confirm the declaration";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!validate(form)) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/sourcing", { method: "POST", body: new FormData(form) });
      if (res.ok) {
        window.location.href = "/success";
      }
    } catch {
      /* stay on page */
    } finally {
      setSubmitting(false);
    }
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="px-4 md:px-6 py-8 max-w-lg mx-auto w-full">
      {hasErrors && (
        <div className="border border-red-300 bg-red-50 p-3 mb-4 text-[11px] text-red-700">
          <p className="font-bold mb-1">Please fix the following:</p>
          <ul className="list-disc ml-4">
            {Object.entries(errors).map(([k, v]) => <li key={k}>{v}</li>)}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Name" error={errors.name}><input name="name" className="field-input" /></Field>
        <Field label="Company" error={errors.company}><input name="company" className="field-input" /></Field>
        <Field label="Country" error={errors.country}>
          <select name="country" className="field-input" defaultValue="">
            <option value="" disabled>Select...</option>
            <option>Botswana</option><option>South Africa</option><option>India</option><option>Israel</option>
            <option>UAE</option><option>Belgium</option><option>USA</option><option>UK</option>
            <option>China</option><option>Hong Kong</option><option>Japan</option><option>Singapore</option>
            <option>Australia</option><option>Canada</option><option>Germany</option><option>France</option>
            <option>Italy</option><option>Switzerland</option><option>Other</option>
          </select>
        </Field>
        <Field label="WhatsApp or Email" error={errors.contact}><input name="contact" className="field-input" placeholder="+267 or email@address" /></Field>
        <Field label="Type" error={errors.type}>
          <select name="type" className="field-input" defaultValue="" onChange={(e) => setStoneType(e.target.value)}>
            <option value="" disabled>Select...</option>
            <option value="Rough">Rough</option><option value="Polished">Polished</option>
          </select>
        </Field>

        {stoneType === "rough" ? (
          <>
            <Field label="Carat Range">
              <div className="flex items-center gap-2">
                <input name="caratMin" type="number" step="0.01" min="0.01" placeholder="Min" className="field-input w-full" />
                <span className="text-[11px] text-muted">to</span>
                <input name="caratMax" type="number" step="0.01" min="0.01" placeholder="Max" className="field-input w-full" />
                <span className="text-[10px] text-muted">ct</span>
              </div>
            </Field>
            <Field label="Color" error={errors.color}>
              <input name="color" className="field-input" placeholder="e.g. Near colourless, D, Warm tone" />
            </Field>
            <Field label="Notes"><textarea name="notes" rows={3} className="field-input resize-none" placeholder="Category preference, crystal form, clarity notes, quantity..." /></Field>

            <div className="border border-border p-3 bg-surface">
              <p className="text-[11px] font-bold mb-2">Kimberley Process — Required for Rough Diamonds</p>
              <div className="space-y-3">
                <Field label="KP Import Licence Number" error={errors.kpLicence}>
                  <input name="kpLicence" className="field-input" placeholder="e.g. KP-BW-2026-0042" />
                </Field>
                <Field label="KP Licence Issuing Country" error={errors.kpCountry}>
                  <input name="kpCountry" className="field-input" placeholder="e.g. Belgium" />
                </Field>
              </div>
            </div>
          </>
        ) : stoneType === "polished" ? (
          <>
            <Field label="Shape" error={errors.shape}>
              <select name="shape" className="field-input" defaultValue="">
                <option value="" disabled>Select...</option>
                <option>Round Brilliant</option><option>Princess</option><option>Oval</option><option>Emerald</option>
                <option>Cushion</option><option>Marquise</option><option>Pear</option><option>Heart</option>
              </select>
            </Field>
            <Field label="Carat Range">
              <div className="flex items-center gap-2">
                <input name="caratMin" type="number" step="0.01" min="0.01" placeholder="Min" className="field-input w-full" />
                <span className="text-[11px] text-muted">to</span>
                <input name="caratMax" type="number" step="0.01" min="0.01" placeholder="Max" className="field-input w-full" />
                <span className="text-[10px] text-muted">ct</span>
              </div>
            </Field>
            <Field label="Color" error={errors.color}>
              <select name="color" className="field-input" defaultValue="">
                <option value="" disabled>Select...</option>
                {["D","E","F","G","H","I","J","K","L","M"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Clarity" error={errors.clarity}>
              <select name="clarity" className="field-input" defaultValue="">
                <option value="" disabled>Select...</option>
                <option>FL</option><option>IF</option><option>VVS1</option><option>VVS2</option><option>VS1</option><option>VS2</option>
                <option>SI1</option><option>SI2</option><option>I1</option><option>I2</option><option>I3</option>
              </select>
            </Field>
            <Field label="Certification" error={errors.certification}>
              <select name="certification" className="field-input" defaultValue="">
                <option value="" disabled>Select...</option>
                <option>GIA</option><option>IGI</option><option>Other</option><option>None</option>
              </select>
            </Field>
            <Field label="Notes"><textarea name="notes" rows={3} className="field-input resize-none" placeholder="Any specific requirements..." /></Field>
          </>
        ) : (
          <p className="text-[11px] text-muted italic">Select a stone type above to see relevant fields.</p>
        )}

        <div className="border-t border-border pt-3">
          <label className="flex items-start gap-2 cursor-default">
            <input type="checkbox" name="consent" className="mt-0.5" />
            <span className="text-[10px] leading-relaxed">
              I have read and agree to the <a href="/terms" target="_blank" className="underline">Terms of Use</a> and <a href="/privacy" target="_blank" className="underline">Privacy Policy</a> of AMES DE BRILLIANTE (Pty) Ltd. I understand that my data will be processed in accordance with the Botswana Data Protection Act 2018.
            </span>
          </label>
          {errors.consent && <p className="text-[10px] text-red-600 mt-1">{errors.consent}</p>}
        </div>

        {stoneType === "rough" && (
          <div>
            <label className="flex items-start gap-2 cursor-default">
              <input type="checkbox" name="declaration" className="mt-0.5" />
              <span className="text-[10px] leading-relaxed">
                I declare that the information provided in this request is true, complete, and accurate to the best of my knowledge. I hold a valid Kimberley Process import licence and understand that rough diamonds will only be sold against a valid KP certificate.
              </span>
            </label>
            {errors.declaration && <p className="text-[10px] text-red-600 mt-1">{errors.declaration}</p>}
          </div>
        )}

        <button type="submit" disabled={submitting} className="w-full py-2 min-h-[44px] bg-[#A6A6AB] text-[#EAE8E4] text-[13px] font-medium cursor-default mt-1 disabled:opacity-50">
          {submitting ? "Submitting..." : "Submit"}
        </button>

        <p className="text-[9px] text-muted text-center">
          No payment is collected through this website. All transactions are governed by a separate written sales contract.
        </p>
      </form>
    </div>
  );
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-medium mb-1">{label}</label>
      {children}
      {error && <p className="text-[10px] text-red-600 mt-0.5">{error}</p>}
    </div>
  );
}
