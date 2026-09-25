"use client";

import { useState, useEffect } from "react";

export default function SettingsPage() {
  const [name, setName] = useState("");
  const [haptics, setHaptics] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      setName(localStorage.getItem("ames_display_name") || "");
      setHaptics(localStorage.getItem("ames_haptics") !== "off");
    } catch {}
  }, []);

  function handleSave() {
    try {
      localStorage.setItem("ames_display_name", name);
      localStorage.setItem("ames_haptics", haptics ? "on" : "off");
    } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-full" style={{ background: "#EAE8E4" }}>
      <style>{`
        .settings-back { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #6E6C69; background: none; border: none; cursor: pointer; padding: 0; margin-bottom: 16px; }
        .settings-back svg { width: 16px; height: 16px; }
        .settings-label { font-size: 10px; letter-spacing: 0.1em; color: #6E6C69; text-transform: uppercase; display: block; margin-bottom: 6px; font-weight: 400; }
        .settings-input { width: 100%; padding: 10px 12px; font-size: 14px; border: 1px solid rgba(23,23,23,0.08); background: #FCFCFB; color: #171717; border-radius: 10px; outline: none; }
        .settings-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid rgba(23,23,23,0.08); }
        .settings-row:last-child { border-bottom: none; }
        .settings-hint { font-size: 12px; color: #6E6C69; margin-top: 4px; }
        .settings-save { width: 100%; padding: 12px; font-size: 13px; font-weight: 500; border: none; border-radius: 12px; cursor: pointer; transition: all 0.15s; margin-top: 20px; }
      `}</style>

      <div className="px-5 pt-14 pb-8 max-w-lg mx-auto w-full">
        <button onClick={() => window.history.back()} className="settings-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15 18l-6-6 6-6" /></svg>
          Back
        </button>

        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#171717", letterSpacing: "-0.01em", marginBottom: 24 }}>Settings</h1>

        <div style={{ background: "#FCFCFB", borderRadius: 14, border: "1px solid rgba(23,23,23,0.08)", padding: "0 16px" }}>
          <div className="settings-row">
            <div>
              <label className="settings-label">Display Name</label>
              <input
                className="settings-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
              <p className="settings-hint">This is shown to the AMES desk when you chat.</p>
            </div>
          </div>

          <div className="settings-row">
            <div>
              <span style={{ fontSize: 13, color: "#171717" }}>Haptic Feedback</span>
              <p className="settings-hint">Subtle vibration on button taps.</p>
            </div>
            <button
              onClick={() => setHaptics(!haptics)}
              style={{
                width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
                background: haptics ? "#171717" : "#D9D7D3",
                transition: "background 0.2s", position: "relative", flexShrink: 0,
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: "50%", background: "#FCFCFB",
                position: "absolute", top: 2, left: haptics ? 20 : 2, transition: "left 0.2s",
              }} />
            </button>
          </div>

          <div className="settings-row">
            <a href="/" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#171717", textDecoration: "none", fontWeight: 400 }}>
              Visit the Website
            </a>
            <svg viewBox="0 0 24 24" fill="none" stroke="#A6A6AB" strokeWidth="1.5" style={{ width: 14, height: 14 }}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
          </div>
        </div>

        <button onClick={handleSave} className="settings-save" style={{ background: "#171717", color: "#FCFCFB" }}>
          {saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}
