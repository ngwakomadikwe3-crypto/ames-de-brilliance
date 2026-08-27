"use client";

import { useState } from "react";

export default function SignInPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = "/dashboard";
      } else {
        setError("Wrong password.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 md:px-6 py-16 max-w-sm mx-auto w-full">
      <div className="border border-border p-6">
        <h2 className="text-[13px] font-bold mb-1">Dealer Sign In</h2>
        <p className="text-[11px] text-muted mb-6">Enter the dealer password to access the dashboard.</p>

        {error && (
          <div className="border border-[#991B1B] bg-[#FEE2E2] p-3 mb-4 text-[11px] text-[#991B1B]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-medium mb-1">Password</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-input"
              placeholder="Enter password"
              autoFocus
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 min-h-[44px] bg-[#A6A6AB] text-[#EAE8E4] text-[13px] font-medium cursor-default disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
