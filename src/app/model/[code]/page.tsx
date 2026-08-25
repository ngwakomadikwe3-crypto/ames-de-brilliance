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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/models/" + code)
      .then(r => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then(d => setModel(d))
      .catch(() => setError("not found"))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) return <div className="min-h-[100dvh] flex items-center justify-center text-[12px] text-muted">Loading...</div>;
  if (error || !model) return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mx-auto">
          <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#000" strokeWidth="1.5" fill="none" />
        </svg>
        <h1 className="text-[16px] font-bold">AMES DE BRILLIANTE</h1>
        <p className="text-[13px] text-muted leading-relaxed">This roster is invitation-only.</p>
      </div>
    </div>
  );

  return <ModelTabs model={model} />;
}

type Tab = "post" | "myvideos";

function ModelTabs({ model }: { model: Model }) {
  const [tab, setTab] = useState<Tab>("post");
  return (
    <div className="min-h-[100dvh] flex flex-col bg-white">
      <header className="border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4"><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#000" strokeWidth="1.5" fill="none" /></svg>
          <span className="text-[13px] font-bold tracking-tight">{model.name}</span>
          {model.instagram && <span className="text-[10px] text-muted font-mono">@{model.instagram}</span>}
        </div>
      </header>
      <div className="flex border-b border-border shrink-0">
        <button onClick={() => setTab("post")} className={`flex-1 py-2.5 text-[12px] font-medium text-center cursor-default ${tab === "post" ? "border-b-2 border-black text-black" : "text-muted"}`}>Post a video</button>
        <button onClick={() => setTab("myvideos")} className={`flex-1 py-2.5 text-[12px] font-medium text-center cursor-default ${tab === "myvideos" ? "border-b-2 border-black text-black" : "text-muted"}`}>My videos</button>
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
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/videos/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      const data = await res.json();
      setUrl(data.url);
    } catch (e: any) { setError(e.message); } finally { setUploading(false); }
  }

  async function handleSubmit() {
    if (!url.trim()) { setError("Video URL required"); return; }
    setError(null); setSubmitting(true);
    try {
      const res = await fetch("/api/models/" + model.portal_code + "/videos", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ video_url: url, caption, stone_id: linkedStone || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setSubmitted(true);
    } catch (e: any) { setError(e.message); } finally { setSubmitting(false); }
  }

  if (submitted) return (
    <div className="p-6 text-center space-y-3">
      <p className="text-[13px] font-medium">Video submitted for review.</p>
      <p className="text-[11px] text-muted">The desk will review and publish. Track status in &ldquo;My videos&rdquo;.</p>
      <button onClick={() => { setSubmitted(false); setUrl(""); setCaption(""); setLinkedStone(""); }} className="text-[12px] underline text-muted">Post another</button>
    </div>
  );

  return (
    <div className="p-4 max-w-lg mx-auto w-full flex flex-col gap-4">
      <div className="border border-border bg-surface p-3 space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-muted font-medium">House rules</div>
        <ul className="text-[11px] text-muted leading-relaxed space-y-1 list-disc list-inside">
          <li>Real pieces only &mdash; no replicas, no stock imagery</li>
          <li>Never state prices in captions &mdash; prices come from the live tag</li>
          <li>No investment claims or urgency language</li>
          <li>The house may decline any video at its discretion</li>
        </ul>
      </div>

      {error && <div className="text-[10px] text-red-600 border border-red-300 p-2 bg-red-50">{error}</div>}

      <div>
        <span className="block text-[11px] font-medium mb-1">Video</span>
        <div className="flex gap-2">
          <label className="flex-1">
            <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleFileUpload} disabled={uploading} className="w-full text-[11px] file:mr-2 file:py-1 file:px-2 file:border file:border-border file:text-[10px] file:bg-surface file:cursor-default min-h-[40px]" />
            {uploading && <span className="text-[10px] text-muted">Uploading...</span>}
          </label>
          <span className="text-[10px] text-muted self-center">or</span>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste URL" className="flex-1 field-input min-h-[40px] text-[11px]" />
        </div>
      </div>

      <div>
        <span className="block text-[11px] font-medium mb-1">Caption</span>
        <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="One line &mdash; describe the piece, not the price" className="w-full field-input min-h-[40px] text-[11px]" />
      </div>

      <div>
        <span className="block text-[11px] font-medium mb-1">Link to stone (optional)</span>
        <select value={linkedStone} onChange={e => setLinkedStone(e.target.value)} className="w-full field-input min-h-[40px] text-[11px]">
          <option value="">None</option>
          {stones.map(s => (
            <option key={s.id} value={s.id}>{s.ref} &mdash; {s.shape} {s.carat}ct {s.color}</option>
          ))}
        </select>
      </div>

      <button onClick={handleSubmit} disabled={!url.trim() || submitting} className="w-full py-2 bg-black text-white text-[13px] font-medium cursor-default disabled:opacity-50 min-h-[40px]">{submitting ? "Submitting..." : "Submit for review"}</button>
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
    } catch {/* */} finally { setLoading(false); }
  }, [model.portal_code, model.id]);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  function statusBadge(s: string) {
    switch (s) {
      case "Pending": return "bg-yellow-500 text-white";
      case "Live": return "bg-green-700 text-white";
      default: return "bg-gray-200 text-black";
    }
  }

  if (loading) return <div className="p-6 text-[12px] text-muted text-center">Loading...</div>;
  if (videos.length === 0) return <div className="p-6 text-[12px] text-muted text-center">No videos posted yet.</div>;

  return (
    <div className="p-4 space-y-3">
      {summary && (
        <div className="border border-border bg-surface p-3 mb-2">
          <div className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">This month</div>
          <div className="flex gap-4 text-[11px] font-mono">
            <span><strong>{summary.approved_this_month}</strong>/30 approved</span>
            <span>Base: <strong>${summary.base_earned.toFixed(0)}</strong></span>
            <span>Commission: <strong>${summary.commission_earned.toFixed(0)}</strong></span>
            <span>Due: <strong>${summary.total_due.toFixed(2)}</strong></span>
          </div>
        </div>
      )}
      {videos.map(v => (
        <div key={v.id} className="border border-border p-3 flex gap-3 items-start">
          <div className="w-20 h-28 bg-black overflow-hidden shrink-0">
            <video src={v.video_url} className="w-full h-full object-cover" muted preload="metadata" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 ${statusBadge(v.status)}`}>{v.status}</span>
              {v.stone_ref && <span className="text-[10px] text-muted font-mono">&rarr; {v.stone_ref}</span>}
            </div>
            <div className="text-[11px] truncate">{v.caption || "No caption"}</div>
            <div className="flex gap-3 mt-1 text-[10px] text-muted font-mono">
              <span>{v.tap_count} taps</span>
              <span>{v.reserve_count} reserves</span>
              {v.sales_count > 0 && <span>{v.sales_count} sales</span>}
              {v.commission_earned > 0 && <span>${v.commission_earned.toFixed(2)} comm</span>}
            </div>
            <div className="text-[10px] text-muted font-mono mt-0.5">{v.created_at.split("T")[0]}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
