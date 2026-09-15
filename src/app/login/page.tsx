"use client";

import { useEffect, useState, type FormEvent } from "react";
import { customerRequest } from "@/components/CustomerState";

export default function LoginPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    customerRequest('session', 'GET', undefined, controller.signal)
      .then(data => setSignedIn(!!data.user))
      .catch(() => setSignedIn(false))
      .finally(() => setSessionReady(true));
    const status = new URLSearchParams(window.location.search).get('oauth');
    if (status) {
      setError(status === 'expired' ? 'This sign-in attempt expired. Please try again.' : 'Social sign-in was not completed. Try again or sign in with email. To connect a provider to an existing account, sign in with your password first, then return here.');
      window.history.replaceState(null, '', '/login');
    }
    return () => controller.abort();
  }, []);

  async function social(provider: 'google' | 'microsoft') {
    setLoading(true); setError('');
    try {
      const result = await customerRequest('oauth/' + provider, 'POST', {});
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Social sign-in is unavailable.');
      setLoading(false);
    }
  }

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

  return <main className="ames-account"><div className="ames-account-panel ames-auth-panel"><header><a href="/app">AMES</a><a href="/account">Account</a></header><p className="profile-label">{mode === "register" ? "Create account" : "Sign in"}</p><h1>{mode === "register" ? "Create your AMES account" : "Welcome back"}</h1><p>{mode === "register" ? "Keep your preferences and saved pieces close." : "Continue with your AMES preferences and saved pieces."}</p>{error && <p role="alert" className="auth-error">{error}</p>}<div className="ames-social-signin" aria-label="Social sign-in">{signedIn && <p>Continuing connects this provider to your signed-in AMES account.</p>}<button type="button" disabled={loading || !sessionReady} onClick={() => void social('google')}>Continue with Google</button><button type="button" disabled={loading || !sessionReady} onClick={() => void social('microsoft')}>Continue with Microsoft</button></div><p className="ames-auth-divider">or continue with email</p><form onSubmit={submit}>{mode === "register" && <label>Name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><div className="ames-password-control"><label htmlFor="ames-password">Password</label><div className="ames-password-field"><input id="ames-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={8} required /><button type="button" className="ames-password-toggle" aria-controls="ames-password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide password" : "Show password"}</button></div></div><button type="submit" disabled={loading}>{loading ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}</button></form><p className="auth-switch">{mode === "register" ? "Already have an account?" : "New to AMES?"} <button type="button" onClick={() => { setMode(mode === "register" ? "signin" : "register"); setError(""); setShowPassword(false); setPassword(""); }}>{mode === "register" ? "Sign in" : "Create account"}</button></p></div></main>;
}
