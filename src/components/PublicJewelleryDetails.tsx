"use client";
import { useEffect, useState } from 'react';
import PieceComments from './PieceComments';
import PurchaseActions from './PurchaseActions';
import { SavePiece, AskJeweller } from './PieceAccountActions';
import EngineJewelryViewer from './EngineJewelryViewer';
import { studioCameraPreset } from '@/lib/customer-jewelry-display';
import { publicCatalogueSchema, originLabel, type CatalogueListing } from '@/lib/catalogue-content';
export default function PublicJewelleryDetails({ id }: { id: string }) {
  const [listing, setListing] = useState<CatalogueListing | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/catalogue/${id}`, { cache: 'no-store', signal: abort.signal }).then(async r => { if (!r.ok) throw new Error('This listing is not available.'); return publicCatalogueSchema.parse(await r.json()); }).then(value => { if (!abort.signal.aborted) setListing(value); }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [id]);
  if (error) return <p role="alert">{error}</p>;
  if (!listing) return <p role="status">Loading jewellery…</p>;
  return <article className="space-y-4"><h2 className="text-2xl">{listing.name}</h2><p className="text-sm text-[#b9cec6]">By {listing.storefrontUrl ? <a href={listing.storefrontUrl} className="underline">{listing.businessName}</a> : listing.businessName}</p>
    <EngineJewelryViewer src={listing.previewUrl} poster={listing.posterUrl} alt={listing.name} autoLoad opticsProfile={listing.studio ? 'mounted-gem-studio' : 'soft-studio'} {...(listing.studio ? { cameraPreset: studioCameraPreset(listing.category) } : {})} turntableEnabled={false} style={{ height: 'clamp(280px,50dvh,500px)' }} />
    <p className="text-xl">{listing.price ? new Intl.NumberFormat(undefined, { style: 'currency', currency: listing.price.currency }).format(listing.price.amount) : 'Price on request'}</p>
    <p className="text-sm whitespace-pre-wrap">{listing.description}</p>
    <p className="text-sm">Made in: {originLabel(listing.madeIn.country, listing.madeIn.verified)}</p>
    {listing.gemstones.map((g, i) => <p key={i} className="text-sm">{g.name} origin: {originLabel(g.origin, g.verified)}</p>)}
    <p className="text-xs text-[#b9cec6]">Business location, manufacturing country and gemstone origin are separate. An evidence review is not a laboratory certificate.</p>
    {listing.price && <PurchaseActions assetId={listing.assetId} />}<SavePiece assetId={listing.assetId} /><PieceComments assetId={listing.assetId} name={listing.name} /><AskJeweller listingId={listing.id} />
    <a className="inline-block text-sm underline" href="/app">Return to Boutique / ask SAME</a>
  </article>;
}
