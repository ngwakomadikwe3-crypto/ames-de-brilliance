import { BrandMark } from "@/components/BrandMark";
"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";

interface Model {
  id: number; name: string; whatsapp: string; instagram: string;
  portal_code: string; status: string; created_at: string;
}

interface ModelVideo {
  id: number; video_url: string; caption: string; stone_id: string | null;
  published: number; model_id: number; status: string; tap_count: number;
  reserve_count: number; sales_count: number; sales_value: number; commission_earned: number;
  created_at: string; stone_ref: string | null; stone_status: string | null;
}

export default function ModelPortal() {
  const params = useParams();
  const code = params.code as string;
  const [model, setModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [phone, setPhone] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLogging(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/models/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, phone }),
      });
      if (!res.ok) {
        const data = await res.json();
        setLoginError(data.error || "Invalid credentials");
        return;
      }
      const data = await res.json();
      setModel(data);
      setAuthenticated(true);
    } catch {
      setLoginError("Connection failed. Please try again.");
    } finally {
      setLogging(false);
    }
  }

  useEffect(() => {
    // Try loading without login first (legacy portal codes)
    fetch("/api/models/" + code)
      .then(r => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then(d => { setModel(d); setAuthenticated(true); })
      .catch(() => setLoading(false));
  }, [code]);

  if (loading && !authenticated) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: "#0B0C0D" }}>
        <div className="text-[12px]" style={{ color: "#9A938A" }}>Loading...</div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!authenticated && !model) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6" style={{ background: "#0B0C0D" }}>
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mx-auto mb-3">
              <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.5" fill="none" />
            </svg>
            <h1 className="text-[16px] font-light tracking-[0.18em]" style={{ color: "#FAF8F4" }}>AMES</h1>
            <p className="text-[11px] mt-2" style={{ color: "#9A938A" }}>Model Portal</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+267 XX XXX XXX"
                className="w-full px-4 py-2.5 text-[13px] font-light rounded-lg outline-none"
                style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }}
                required
              />
            </div>

            {loginError && (
              <div className="text-[11px] p-3 rounded-lg" style={{ color: "#B91C1C", background: "#FEE2E2", border: "1px solid #FECACA" }}>
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={logging || !phone.trim()}
              className="w-full py-2.5 text-white text-[13px] font-medium rounded-lg disabled:opacity-50 transition-opacity"
              style={{ background: "#1A1A1A" }}>
{logging ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-[10px] mt-6" style={{ color: "#9A938A" }}>
            This roster is invitation-only
          </p>
        </div>
      </div>
    );
  }

  // Inactive model
  if (model && model.status !== "Active") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6" style={{ background: "#0B0C0D" }}>
        <div className="max-w-sm text-center space-y-4">
          <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mx-auto">
            <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.5" fill="none" />
          </svg>
          <h1 className="text-[16px] font-light tracking-[0.18em]" style={{ color: "#FAF8F4" }}>AMES</h1>
          <p className="text-[13px] font-light leading-relaxed" style={{ color: "#9A938A" }}>
            This roster is invitation-only.
          </p>
        </div>
      </div>
    );
  }

  return <ModelTabs model={model!} />;
}

type Tab = "post" | "myvideos";

function ModelTabs({ model }: { model: Model }) {
  const [tab, setTab] = useState<Tab>("post");
  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "#0B0C0D" }}>
      {/* Header */}
      <div className="shrink-0 px-4 py-3" style={{ borderBottom: "1px solid #EAE4DA", background: "rgba(250,248,244,0.95)" }}>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
            <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.5" fill="none" />
          </svg>
          <span className="text-[13px] font-light tracking-[0.1em]" style={{ color: "#FAF8F4" }}>{model.name}</span>
          {model.instagram && (
            <span className="text-[10px] font-light font-mono" style={{ color: "#9A938A" }}>@{model.instagram}</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0" style={{ borderBottom: "1px solid #EAE4DA" }}>
        {(["post", "myvideos"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2.5 text-[12px] font-light text-center transition-colors"
            style={{
              color: tab === t ? "#1A1A1A" : "#9A938A",
              borderBottom: tab === t ? "2px solid #C9A227" : "2px solid transparent"
            }}
          >
            {t === "post" ? "Post a video" : "My videos"}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "post" ? <PostVideoTab model={model} /> : <MyVideosTab model={model} />}
      </div>
    </div>
  );
}

function PostVideoTab({ model }: { model: Model }) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [linkedStone, setLinkedStone] = useState<string>("");
  const [stones, setStones] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/stones")
      .then(r => r.ok ? r.json() : [])
      .then((all: any[]) => setStones(all.filter(s => s.status === "Available")))
      .catch(() => {});
  }, []);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/videos/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      const data = await res.json();
      setUrl(data.url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!url.trim()) { setError("Video URL required"); return; }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/models/" + model.portal_code + "/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: url, caption, stone_id: linkedStone || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) return (
    <div className="p-6 text-center space-y-3">
      <p className="text-[13px] font-light" style={{ color: "#FAF8F4" }}>Video submitted for review.</p>
      <p className="text-[11px] font-light" style={{ color: "#9A938A" }}>
        The desk will review and publish. Track status in "My videos".
      </p>
      <button
        onClick={() => { setSubmitted(false); setUrl(""); setCaption(""); setLinkedStone(""); }}
        className="text-[12px] font-light"
        style={{ color: "#C9A227" }}
      >
        Post another
      </button>
    </div>
  );

  return (
    <div className="p-4 max-w-lg mx-auto w-full flex flex-col gap-4">
      {/* House rules */}
      <div className="p-3 space-y-1.5" style={{ background: "#16181A", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="text-[10px] uppercase tracking-wider font-light" style={{ color: "#9A938A" }}>House Rules</div>
        <ul className="text-[11px] font-light leading-relaxed space-y-1" style={{ color: "#9A938A" }}>
          <li>• Real pieces only — no replicas, no stock imagery</li>
          <li>• Never state prices in captions — prices come from the live tag</li>
          <li>• No investment claims or urgency language</li>
          <li>• The house may decline any video at its discretion</li>
        </ul>
      </div>

      {error && (
        <div className="text-[10px] p-3 rounded-lg" style={{ color: "#B91C1C", background: "#FEE2E2", border: "1px solid #FECACA" }}>
          {error}
        </div>
      )}

      <div>
        <span className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Video</span>
        <div className="flex gap-2">
          <label className="flex-1">
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={handleFileUpload}
              disabled={uploading}
              className="w-full text-[11px] file:mr-2 file:py-1 file:px-3 file:rounded file:border file:text-[10px] file:cursor-default min-h-[40px]"
              style={{ color: "#9A938A" }}
            />
            {uploading && <span className="text-[10px]" style={{ color: "#9A938A" }}>Uploading...</span>}
          </label>
          <span className="text-[10px] self-center" style={{ color: "#9A938A" }}>or</span>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Paste URL"
            className="flex-1 px-4 py-2.5 text-[13px] font-light rounded-lg outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }}
          />
        </div>
      </div>

      <div>
        <span className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Caption</span>
        <input
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="One line — describe the piece, not the price"
          className="w-full px-4 py-2.5 text-[13px] font-light rounded-lg outline-none"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }}
        />
      </div>

      <div>
        <span className="block text-[11px] font-light mb-1.5" style={{ color: "#FAF8F4" }}>Link to stone (optional)</span>
        <select
          value={linkedStone}
          onChange={e => setLinkedStone(e.target.value)}
          className="w-full px-4 py-2.5 text-[13px] font-light rounded-lg outline-none"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A", color: "#FAF8F4" }}
        >
          <option value="">None</option>
          {stones.map(s => (
            <option key={s.id} value={s.id}>{s.ref} — {s.shape} {s.carat}ct {s.color}</option>
          ))}
        </select>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!url.trim() || submitting}
        className="w-full py-2.5 text-white text-[13px] font-medium rounded-lg disabled:opacity-50 transition-opacity"
        style={{ background: "#1A1A1A" }}>
{submitting ? "Submitting..." : "Submit for Review"}
      </button>
    </div>
  );
}

interface MonthlySummary {
  approved_this_month: number;
  base_earned: number;
  commission_earned: number;
  total_due: number;
}

function MyVideosTab({ model }: { model: Model }) {
  const [videos, setVideos] = useState<ModelVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      const [vRes, sRes] = await Promise.all([
        fetch("/api/models/" + model.portal_code + "/videos"),
        fetch("/api/models?report=" + model.id),
      ]);
      if (vRes.ok) setVideos(await vRes.json());
      if (sRes.ok) {
        const data = await sRes.json();
        setSummary({
          approved_this_month: data.videos.length,
          base_earned: data.base_earned,
          commission_earned: data.commission_total,
          total_due: data.total_due,
        });
      }
    } catch {} finally { setLoading(false); }
  }, [model.portal_code, model.id]);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  function statusBadge(s: string) {
    switch (s) {
      case "Pending": return { bg: "#FEF3C7", text: "#92400E" };
      case "Live": return { bg: "#D1FAE5", text: "#065F46" };
      default: return { bg: "#F3F4F6", text: "#374151" };
    }
  }

  if (loading) return (
    <div className="p-6 text-[12px] text-center" style={{ color: "#9A938A" }}>Loading...</div>
  );

  if (videos.length === 0) return (
    <div className="p-6 text-[12px] text-center" style={{ color: "#9A938A" }}>No videos posted yet.</div>
  );

  return (
    <div className="p-4 space-y-3">
      {/* Monthly Summary */}
      {summary && (
        <div className="p-3 mb-2" style={{ background: "#16181A", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="text-[10px] uppercase tracking-wider font-light mb-1" style={{ color: "#9A938A" }}>This Month</div>
          <div className="flex gap-4 text-[11px] font-light" style={{ fontFamily: "monospace" }}>
            <span><strong>{summary.approved_this_month}</strong>/30 approved</span>
            <span>Base: <strong>${summary.base_earned.toFixed(0)}</strong></span>
            <span>Commission: <strong>${summary.commission_earned.toFixed(0)}</strong></span>
            <span>Due: <strong>${summary.total_due.toFixed(2)}</strong></span>
          </div>
        </div>
      )}

      {/* Videos */}
      {videos.map(v => {
        const badge = statusBadge(v.status);
        return (
          <div key={v.id} className="flex gap-3 items-start p-3" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16181A" }}>
            <div className="w-20 h-28 overflow-hidden shrink-0" style={{ background: "#1A1A1A" }}>
              <video src={v.video_url} className="w-full h-full object-cover" muted preload="metadata" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-medium uppercase px-1.5 py-0.5 rounded" style={{ background: badge.bg, color: badge.text }}>
                  {v.status}
                </span>
                {v.stone_ref && (
                  <span className="text-[10px] font-mono" style={{ color: "#9A938A" }}>→ {v.stone_ref}</span>
                )}
              </div>
              <div className="text-[11px] truncate" style={{ color: "#FAF8F4" }}>{v.caption || "No caption"}</div>
              <div className="flex gap-3 mt-1 text-[10px] font-mono" style={{ color: "#9A938A" }}>
                <span>{v.tap_count} taps</span>
                <span>{v.reserve_count} reserves</span>
                {v.sales_count > 0 && <span>{v.sales_count} sales</span>}
                {v.commission_earned > 0 && <span>${v.commission_earned.toFixed(2)} comm</span>}
              </div>
              <div className="text-[10px] font-mono mt-0.5" style={{ color: "#9A938A" }}>
                {v.created_at.split("T")[0]}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
