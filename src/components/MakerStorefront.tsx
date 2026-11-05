"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { originLabel } from '@/lib/catalogue-content';
import type { PublicListing } from '@/lib/jeweller-listing';
export default function MakerStorefront({ slug }: { slug: string }) {
  const [shop, setShop] = useState<{ name: string; bio: string; location: string; specialties: string[]; logoUrl: string | null; listings: PublicListing[] } | null>(null), [error, setError] = useState('');
  useEffect(() => { const abort = new AbortController(); fetch(`/api/makers/${slug}`, { signal: abort.signal, cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('This storefront is not available.'); return r.json(); }).then(s => { if (!abort.signal.aborted) setShop(s); }).catch(e => { if (!abort.signal.aborted) setError(e.message); }); return () => abort.abort(); }, [slug]);
  if (error) return <p role="alert">{error}</p>; if (!shop) return <p role="status">Loading storefront…</p>;
  return <article className="space-y-6" data-maker-storefront>
    <header className="space-y-3">{shop.logoUrl && <img src={shop.logoUrl} alt={shop.name} className="h-24 w-24 rounded-full object-cover" />}<h2 className="text-3xl">{shop.name}</h2><p className="whitespace-pre-wrap text-sm text-[#c6dbd2]">{shop.bio}</p>{shop.location && <p className="text-xs text-[#b9cec6]">Business location: {shop.location}</p>}<p className="text-xs text-[#b9cec6]">{shop.specialties.join(' · ')}</p></header>
    <section className="space-y-4"><h3 className="text-xl">Collection</h3>{!shop.listings.length && <p className="text-sm text-[#b9cec6]">The collection is being prepared. Please check back soon.</p>}<div className="grid grid-cols-1 gap-7 sm:grid-cols-2">{shop.listings.map(l => <Link key={l.id} href={`/jewellery/${l.id}`} className="block text-center"><div className="ames-piece-image"><img src={l.posterUrl} alt={l.name} loading="lazy" /></div><p className="mt-3">{l.name}</p><p className="mt-1 text-sm text-[#c6dbd2]">{l.price ? new Intl.NumberFormat(undefined, { style: 'currency', currency: l.price.currency }).format(l.price.amount) : 'Price on request'}</p><p className="mt-1 text-xs text-[#b9cec6]">Made in: {originLabel(l.madeIn.country, l.madeIn.verified)}</p></Link>)}</div></section>
  </article>;
}
