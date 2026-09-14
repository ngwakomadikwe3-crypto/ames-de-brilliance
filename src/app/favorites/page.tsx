"use client";
import { CustomerProvider, customerRequest, useCustomer } from "@/components/CustomerState";
function Content() {
  const c = useCustomer();
  const byId = new Map(c.catalog.assets.map((asset) => [asset.id, asset as unknown as Record<string, unknown>]));
  const items = [...c.state.favorites, ...c.state.saved.filter((saved) => !c.state.favorites.some((favorite) => favorite.assetId === saved.assetId))];
  if (!c.ready) return <main className="ames-account"><div className="ames-account-panel"><p>Loading favorites…</p></div></main>;
  return <main className="ames-account"><div className="ames-account-panel"><header><a href="/app">AMES</a><a href="/app">Return</a></header><p className="kicker">Your collection</p><h1>Favorites</h1>{!c.user && !c.guest ? <><p>Sign in to save and revisit pieces.</p><p><a href="/login">Sign in</a></p></> : !items.length ? <><p>Nothing saved yet. Ask SAME to find a piece worth keeping.</p><p><a href="/app">Ask SAME</a></p></> : <div>{items.map((item) => { const asset = byId.get(item.assetId); const preview = typeof asset?.previewPath === "string" ? asset.previewPath : ""; return <article key={item.assetId}>{preview && <img src={preview} alt="" loading="lazy" />}<h2>{String(asset?.name || item.assetId)}</h2><p>{String(asset?.price || "Price on request")} · {String(asset?.availability || "Availability confirmed by the desk")}</p><div><button onClick={async () => { await customerRequest("favorites", "DELETE", { assetId: item.assetId }); await c.reloadState(); }}>Remove</button><button onClick={() => window.location.assign("/app?ask=" + encodeURIComponent(`Tell me more about ${String(asset?.name || "this piece")}`))}>Ask SAME</button><button onClick={() => window.location.assign("/app?ask=" + encodeURIComponent("Reserve this"))}>Reserve</button></div></article>; })}</div>}</div></main>;
}
export default function FavoritesPage() { return <CustomerProvider><Content /></CustomerProvider>; }
