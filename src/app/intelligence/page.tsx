"use client";

import React, { useEffect, useState, useCallback } from "react";
import { BrandMark } from "@/components/BrandMark";

interface ReportIssue {
  id: string;
  report_type: string;
  tier: string;
  issue_label: string;
  tier_label: string;
  pdf_url: string;
  created_at: string;
}

interface Product {
  id: string;
  slug: string;
  name: string;
  tier: string;
  tier_label: string;
  price: number;
  price_label: string;
  description: string;
}

const TIERS = [
  { key: "briefing", label: "Tier I \u2014 Briefing", desc: "Compiled PDF report. Delivered within 48 hours." },
  { key: "intelligence", label: "Tier II \u2014 Intelligence", desc: "PDF plus raw data tables and up to three written follow-up questions answered by our desk." },
  { key: "commissioned", label: "Tier III \u2014 Commissioned", desc: "Bespoke research scoped after a call. Includes a live briefing. Optional 12-month exclusivity add-on available." },
];

export default function IntelligencePage() {
  const [issues, setIssues] = useState<ReportIssue[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("");
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ company: "", contact: "", email: "", country: "", questions: "" });

  const fetchData = useCallback(async () => {
    try {
      const [iRes, pRes] = await Promise.all([
        fetch("/api/intelligence/issues"),
        fetch("/api/intelligence/products"),
      ]);
      if (iRes.ok) setIssues(await iRes.json());
      if (pRes.ok) setProducts(await pRes.json());
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const latestByType = new Map<string, ReportIssue>();
  for (const issue of issues) {
    if (!latestByType.has(issue.report_type)) {
      latestByType.set(issue.report_type, issue);
    }
  }

  const selectedProduct = products.find((p) => p.slug === selected);
  const isCustom = selected === "custom-research";

  function handleRequest(slug: string) {
    setSelected(slug);
    setFormOpen(true);
    setSubmitted(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct) return;
    setSubmitting(true);
    try {
      await fetch("/api/intelligence/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_slug: selectedProduct.slug,
          product_name: selectedProduct.name,
          tier: selectedProduct.tier,
          tier_label: selectedProduct.tier_label,
          charge: selectedProduct.price,
          buyer_name: form.contact,
          buyer_email: form.email,
          company: form.company,
          notes: form.questions,
          country: form.country,
        }),
      });
      setSubmitted(true);
    } catch { /* */ } finally { setSubmitting(false); }
  }

  return (
    <div className="min-h-screen bg-[#EAE8E4]">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-[22px] font-medium tracking-wide text-[#171717] mb-1">
            AMES Intelligence
          </h1>
          <p className="text-[12px] text-[#6E6C69] mb-0">Botswana Diamond Sector Reports</p>
        </div>

        {/* Latest Issues */}
        {loading ? (
          <div className="text-center text-[12px] text-[#6E6C69] py-12">Loading...</div>
        ) : (
          <>
            {latestByType.size > 0 && (
              <div className="space-y-4 mb-16">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-[#6E6C69] font-medium">
                  Latest Issues
                </h2>
                {Array.from(latestByType.values()).map((issue) => (
                  <div key={issue.id}
                       className="bg-[#FCFCFB] border border-[rgba(23,23,23,0.08)] p-5 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[12px] font-medium text-[#171717] mb-0.5">
                        {issue.issue_label}
                      </div>
                      <div className="text-[10px] text-[#6E6C69]">
                        {issue.tier ? issue.tier_label + " \u00b7 " : ""}{new Date(issue.created_at).toLocaleDateString("en-US", {
                          month: "long", day: "numeric", year: "numeric"
                        })}
                      </div>
                    </div>
                    <a href={issue.pdf_url}
                       target="_blank"
                       className="px-3 py-1.5 border border-[#171717] text-[10px] font-light tracking-wide text-[#171717] hover:bg-[#171717] hover:text-white transition-colors shrink-0 cursor-default whitespace-nowrap">
                      View
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Tiered Products */}
            {TIERS.map((tier) => {
              const tierProducts = products.filter((p) => p.tier === tier.key);
              if (tierProducts.length === 0) return null;
              return (
                <div key={tier.key} className="mb-12">
                  <div className="mb-4">
                    <h2 className="text-[13px] font-medium tracking-wide text-[#171717] mb-1">
                      {tier.label}
                    </h2>
                    <p className="text-[11px] text-[#6E6C69] leading-relaxed">{tier.desc}</p>
                  </div>
                  <div className="space-y-3">
                    {tierProducts.map((p) => (
                      <div key={p.id}
                           className="bg-[#FCFCFB] border border-[rgba(23,23,23,0.08)] p-5">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div>
                            <div className="text-[12px] font-medium text-[#171717]">{p.name}</div>
                            <div className="text-[11px] text-[#6E6C69] mt-0.5">{p.description}</div>
                          </div>
                          <div className="text-[12px] font-light text-[#A6A6AB] whitespace-nowrap shrink-0">
                            {p.price_label}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <div className="text-[10px] text-[#6E6C69] font-mono">{p.tier_label}</div>
                          <button onClick={() => handleRequest(p.slug)}
                                  className="px-4 py-1.5 bg-[#171717] text-white text-[10px] font-light tracking-wide cursor-default hover:bg-[#2a2a2a] transition-colors">
                            {isCustom ? "Request a call" : "Request"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {products.length === 0 && latestByType.size === 0 && (
              <div className="text-center text-[12px] text-[#6E6C69] py-12">
                No reports available yet. Check back soon.
              </div>
            )}
          </>
        )}

        {/* Request Form Modal */}
        {formOpen && selectedProduct && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
               onClick={(e) => { if (e.target === e.currentTarget) setFormOpen(false); }}>
            <div className="bg-[#FCFCFB] border border-[rgba(23,23,23,0.08)] p-6 w-full max-w-md text-[12px]">
              {submitted ? (
                <div className="text-center py-6">
                  <div className="text-[14px] font-light text-[#171717] mb-2">Request received</div>
                  <p className="text-[11px] text-[#6E6C69] mb-4">
                    Our desk will be in touch within one business day to confirm your {selectedProduct.tier_label} order.
                  </p>
                  <button onClick={() => setFormOpen(false)}
                          className="px-4 py-2 bg-[#171717] text-white text-[11px] cursor-default">
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <div className="text-[13px] font-medium text-[#171717] mb-0.5">{selectedProduct.name}</div>
                    <div className="text-[10px] text-[#6E6C69]">{selectedProduct.tier_label}</div>
                  </div>
                  {/* Price line */}
                  <div className="bg-[#EAE8E4] border border-[rgba(23,23,23,0.08)] p-3 mb-4 flex items-center justify-between">
                    <span className="text-[11px] text-[#6E6C69]">Charge</span>
                    <span className="text-[13px] font-medium text-[#171717]">{selectedProduct.price_label}</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[#6E6C69] mb-1">Company *</label>
                      <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}
                             required className="w-full border border-[rgba(23,23,23,0.08)] px-3 py-2 text-[12px] bg-[#FCFCFB] outline-none focus:border-[#171717]" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[#6E6C69] mb-1">Contact Person *</label>
                      <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}
                             required className="w-full border border-[rgba(23,23,23,0.08)] px-3 py-2 text-[12px] bg-[#FCFCFB] outline-none focus:border-[#171717]" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-[#6E6C69] mb-1">Work Email *</label>
                        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                               required className="w-full border border-[rgba(23,23,23,0.08)] px-3 py-2 text-[12px] bg-[#FCFCFB] outline-none focus:border-[#171717]" />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-[#6E6C69] mb-1">Country</label>
                        <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}
                               className="w-full border border-[rgba(23,23,23,0.08)] px-3 py-2 text-[12px] bg-[#FCFCFB] outline-none focus:border-[#171717]" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[#6E6C69] mb-1">Custom Questions (optional)</label>
                      <textarea value={form.questions} onChange={(e) => setForm({ ...form, questions: e.target.value })}
                                rows={3}
                                className="w-full border border-[rgba(23,23,23,0.08)] px-3 py-2 text-[12px] bg-[#FCFCFB] outline-none focus:border-[#171717] resize-none"
                                placeholder="Any specific questions you'd like addressed in the report" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end mt-4">
                    <button type="button" onClick={() => setFormOpen(false)}
                            className="px-4 py-2 border border-[rgba(23,23,23,0.08)] text-[11px] cursor-default text-[#6E6C69]">
                      Cancel
                    </button>
                    <button type="submit" disabled={submitting || !form.contact || !form.company || !form.email}
                            className="px-4 py-2 bg-[#A6A6AB] text-white text-[11px] cursor-default disabled:opacity-50">
                      {submitting ? "Sending..." : "Submit request"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Sample */}
        <div className="border-t border-[rgba(23,23,23,0.08)] pt-8 mb-16">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-[#6E6C69] font-medium mb-4">
            Free Sample
          </h2>
          <div className="bg-[#FCFCFB] border border-[rgba(23,23,23,0.08)] p-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-[12px] font-medium text-[#171717] mb-0.5">
                Sample Ground Report
              </div>
              <div className="text-[11px] text-[#6E6C69]">
                A free preview of the AMES Intelligence format
              </div>
            </div>
            <a href="/api/intelligence/sample"
               target="_blank"
               className="px-4 py-2 bg-[#A6A6AB] text-[11px] font-light tracking-wide text-white hover:bg-[#B8921F] transition-colors shrink-0 cursor-default whitespace-nowrap">
              Download Free
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-8 border-t border-[rgba(23,23,23,0.08)]">
          <p className="text-[10px] text-[#6E6C69] font-light">
            Compiled from licensed dealer data. Not investment advice.
          </p>
          <p className="text-[10px] text-[#6E6C69] font-light mt-1">
            &copy; {new Date().getFullYear()} AMES DE BRILLIANTE &middot; Gaborone, Botswana
          </p>
        </div>
      </div>
    </div>
  );
}
