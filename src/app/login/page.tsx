"use client";

import { useState, type FormEvent } from "react";
import { customerRequest } from "@/components/CustomerState";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      await customerRequest(mode === "register" ? "register" : "login", "POST", { email, password, ...(mode === "register" ? { name } : {}) });
      window.location.assign("/app");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not complete that request.");
    } finally { setLoading(false); }
  }

  return <main className="ames-account"><div className="ames-account-panel ames-auth-panel"><header><a href="/app">AMES</a><a href="/account">Account</a></header><p className="profile-label">{mode === "register" ? "Create account" : "Sign in"}</p><h1>{mode === "register" ? "Create your AMES account" : "Welcome back"}</h1><p>{mode === "register" ? "Keep your preferences and saved pieces close." : "Continue with your AMES preferences and saved pieces."}</p>{error && <p role="alert" className="auth-error">{error}</p>}<form onSubmit={submit}>{mode === "register" && <label>Name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><div className="ames-password-control"><label htmlFor="ames-password">Password</label><div className="ames-password-field"><input id="ames-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={8} required /><button type="button" className="ames-password-toggle" aria-controls="ames-password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide password" : "Show password"}</button></div></div><button type="submit" disabled={loading}>{loading ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}</button></form><p className="auth-switch">{mode === "register" ? "Already have an account?" : "New to AMES?"} <button type="button" onClick={() => { setMode(mode === "register" ? "signin" : "register"); setError(""); setShowPassword(false); setPassword(""); }}>{mode === "register" ? "Sign in" : "Create account"}</button></p></div></main>;
}
