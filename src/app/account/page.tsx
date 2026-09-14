"use client";
import { useEffect, useState } from "react";
import { CustomerProvider, customerRequest, useCustomer } from "@/components/CustomerState";
const requestKinds = ["SOURCING_REQUEST", "RESERVE_REQUEST", "ENQUIRY_REQUEST", "DESK_HANDOFF"];
function AccountContent() {
  const c = useCustomer();
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  useEffect(() => { if (c.user || c.guest) customerRequest("events").then((data) => setEvents(data.events || [])).catch(() => {}); }, [c.user, c.guest]);
  const memory = (c.state.profile?.preferences?.memory || {}) as Record<string, unknown>;
  const requests = events.filter((event) => requestKinds.includes(String(event.kind)));
  if (!c.ready) return <main className="ames-account"><div className="ames-account-panel ames-account-loading"><p>Loading your AMES profile…</p><p className="ames-account-loading-note">Please wait a moment.</p></div></main>;
  if (!c.user && !c.guest) return <main className="ames-account"><div className="ames-account-panel"><h1>AMES account</h1><p>Sign in to keep your preferences and saved pieces across devices.</p><p className="account-actions"><a href="/login">Sign in</a><a href="/login">Create account</a></p></div></main>;
  return <main className="ames-account"><div className="ames-account-panel"><header><a href="/app">AMES</a><a href="/app">Return</a></header><p className="profile-label">Profile</p><h1>{c.user?.name || "Your AMES profile"}</h1>{c.user && <p>{c.user.email}</p>}{c.guest && <><p>Keep your AMES memory across devices.</p><p className="account-actions"><a href="/login">Sign in</a><a href="/login">Create account</a></p></>}<section><h2>Preferences</h2><p>Language: {String(memory.language || "English")}</p><p>Categories: {Array.isArray(memory.categories) ? memory.categories.join(" · ") : "Not set"}</p><p>Shapes: {Array.isArray(memory.shapes) ? memory.shapes.join(" · ") : "Not set"}</p><p>Metals: {Array.isArray(memory.metals) ? memory.metals.join(" · ") : "Not set"}</p><p>Budget: {String(memory.budgetRange || "Not set")}</p><p>Recent interests: {Array.isArray(memory.recentInterests) ? memory.recentInterests.join(" · ") : "Not set"}</p><p><a href="/app">Tell SAME to update a preference</a></p></section><section><h2>Requests &amp; enquiries</h2>{requests.map((event, index) => <p key={index}>{String(event.kind)} · {String(event.time || "")}</p>)}{!requests.length && <p>No active requests yet.</p>}</section>{c.user && <button onClick={async () => { await customerRequest("logout", "POST", {}); window.location.assign("/app"); }}>Sign out</button>}<p><a href="/favorites">Favorites &amp; saved pieces</a></p></div></main>;
}
export default function AccountPage() { return <CustomerProvider><AccountContent /></CustomerProvider>; }
