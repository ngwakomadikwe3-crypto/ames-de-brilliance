"use client";

import { useEffect, useRef, useState } from 'react';
import ModelViewer from './ModelViewer';
import PieceComments from './PieceComments';
import PurchaseActions from './PurchaseActions';
import { SavePiece } from './PieceAccountActions';
import { loadPublishedBoutiqueContent, originLabel, stockLabel } from '@/lib/catalogue-content';
import EngineJewelryViewer from './EngineJewelryViewer';
import { showCustomerJewelry, hasUnfinishedJewelryImages, AMES_STUDIO_PIECES, studioCameraPreset } from '../lib/customer-jewelry-display';
/** AMES pieces and converter-made jeweller listings use the studio diamond viewer. */
const studioPiece = (piece: { assetId: string; listing?: { studio?: boolean } }) => AMES_STUDIO_PIECES.has(piece.assetId) || !!piece.listing?.studio;
import { boutiqueCategories, boutiqueByCategory, boutiqueGroups, boutiquePrice, loadBoutiqueContent, type BoutiqueCategory, type BoutiquePiece } from '../lib/ames-boutique-content';

function PieceTile({ piece, single, onOpen }: { piece: BoutiquePiece; single: boolean; onOpen: () => void }) {
  const price = boutiquePrice(piece.price);
  const review = piece.publicationStatus !== 'published' || piece.visualApproval !== 'approved';
  return (
    <button type="button" onClick={onOpen} data-boutique-tile={piece.assetId} aria-label={`Open ${piece.name}`}
      className="ames-piece-tile text-center flex flex-col min-h-0" style={{ width: '100%', maxWidth: single ? 480 : undefined, justifySelf: single ? 'center' : undefined, alignSelf: 'start', gridColumn: single ? '1 / -1' : undefined, gridRow: single ? '1 / -1' : undefined }}>
      <div className="ames-piece-image w-full flex items-center justify-center overflow-hidden">
        {piece.assetId === 'dev-test-earring-001' ? <ModelViewer src={piece.interactiveGlb} alt={piece.name}
          autoRotate={false} cameraControls={false} ar={false} jewelryPresentation metalPreview="yellow-gold" cameraOrbit="35deg 75deg 110%"
          style={{ width: '100%', height: '100%', pointerEvents: 'none' }} /> :
          <img src={piece.heroImage} alt={piece.name} className="w-full h-full object-contain" loading="lazy" />}
      </div>
      <div className="pt-3 px-0.5 flex flex-col items-center gap-1">
        <div className="min-w-0">
          <p className="ames-piece-name" style={{ fontSize: 13, color: '#eef5f2' }}>{piece.name}</p>
          {review && <p style={{ fontSize: 10, color: '#9eb8ae' }}>Preview · approval pending</p>}
          {piece.assetId === 'dev-test-earring-001' && <p className="text-[10px] text-[#b8d0c8]">Yellow-gold material preview</p>}
        </div>
        {piece.listing && <span className="text-[10px] text-[#b8d0c8]">Made in: {originLabel(piece.listing.madeIn.country, piece.listing.madeIn.verified)}</span>}
        {price && <span className="shrink-0" style={{ fontSize: 11, color: '#b8d0c8' }}>{price}</span>}
        {!price && piece.inquiryState && <span className="shrink-0" style={{ fontSize: 11, color: '#b8d0c8' }}>{piece.inquiryState}</span>}
      </div>
    </button>
  );
}

function PieceDetail({ piece, onClose, onAskSame }: { piece: BoutiquePiece; onClose: () => void; onAskSame: () => void }) {
  const price = boutiquePrice(piece.price);
  const knownSpecs = Object.entries(piece.essentialSpecs).filter(([key, value]) => !['physicalScaleConfirmed', 'unitMeaning', 'manufacturingReady'].includes(key) && value !== null && value !== undefined && value !== 'unknown');
  const review = piece.publicationStatus !== 'published' || piece.visualApproval !== 'approved';
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto overscroll-contain pt-20" data-boutique-detail={piece.assetId}>
      <div className="ames-jewelry-stage relative shrink-0 mx-auto w-full" style={{ maxWidth: 720, height: 'clamp(260px, 52dvh, 560px)' }}>
        <button type="button" onClick={onClose} aria-label="Back to Boutique" className="ames-pill absolute top-3 left-5 z-10 flex items-center justify-center w-11 h-11 rounded-full">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        {piece.listing || piece.assetId === 'demo-pave-solitaire' || piece.assetId === 'dev-test-candidate-ring' || AMES_STUDIO_PIECES.has(piece.assetId) ? <EngineJewelryViewer key={piece.interactiveGlb} src={piece.interactiveGlb} poster={piece.poster} alt={piece.name} cameraPreset={studioPiece(piece) ? studioCameraPreset(piece.category) : 'three_quarter'} zoom={piece.assetId === 'demo-pave-solitaire' || studioPiece(piece) ? 1 : 0.78} autoLoad={piece.assetId === 'demo-pave-solitaire' || studioPiece(piece)} opticsProfile={piece.assetId === 'demo-pave-solitaire' || studioPiece(piece) ? 'mounted-gem-studio' : 'soft-studio'} turntableEnabled={false} style={{ width: '100%', height: '100%' }} /> :
          <ModelViewer key={piece.interactiveGlb} src={piece.interactiveGlb} poster={hasUnfinishedJewelryImages(piece.assetId) ? undefined : piece.poster} alt={piece.name}
            autoRotate={false} cameraControls ar={false} jewelryPresentation metalPreview={piece.assetId === 'dev-test-earring-001' ? 'yellow-gold' : undefined} cameraOrbit={piece.category === 'ring' ? '35deg 40deg 105%' : '35deg 75deg 105%'}
            fallbackTitle={piece.name} fallbackSubtitle="3D preview unavailable" style={{ width: '100%', height: '100%' }} />}
      </div>
      <div className="shrink-0 px-6 pb-7 pt-3 mx-auto w-full" style={{ maxWidth: 620 }}>
        <h2 style={{ fontSize: 27, color: '#eef5f2', lineHeight: 1.1 }}>{piece.name}</h2>
        {piece.assetId === 'dev-test-earring-001' && <p className="mt-2 text-xs text-[#b8d0c8]">Yellow-gold material preview · finish unverified</p>}
        {review && <p style={{ fontSize: 10, color: '#9eb8ae', marginTop: 5 }}>Preview · visual approval pending</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3" style={{ fontSize: 11, color: '#b8d0c8' }}>
          {knownSpecs.map(([key, value]) => <span key={key}>{key.replace(/([A-Z])/g, ' $1')}: {String(value)}</span>)}
          {piece.essentialSpecs.physicalScaleConfirmed === false && <span>Physical scale unverified</span>}
        </div>
        {piece.listing && <div className="mt-3 space-y-2 text-xs text-[#b8d0c8]"><p>By {piece.listing.storefrontUrl ? <a href={piece.listing.storefrontUrl} className="underline">{piece.listing.businessName}</a> : piece.listing.businessName}</p><p>{piece.listing.description}</p><p>Made in: {originLabel(piece.listing.madeIn.country, piece.listing.madeIn.verified)}</p>{piece.listing.gemstones.map((g, i) => <p key={i}>{g.name} origin: {originLabel(g.origin, g.verified)}</p>)}<a href={`/jewellery/${piece.listing.id}`} className="underline">Full listing</a></div>}
        {price && <p style={{ marginTop: 12, fontSize: 14, color: '#eef5f2' }}>{price}</p>}
        {!price && piece.inquiryState && <p style={{ marginTop: 12, fontSize: 12, color: '#b8d0c8' }}>{piece.inquiryState}</p>}
        {piece.listing && stockLabel(piece.listing.stock) && <p data-stock style={{ marginTop: 4, fontSize: 12, color: piece.listing.stock === 0 ? '#f3c9c0' : '#bfe8d4' }}>{stockLabel(piece.listing.stock)}</p>}
        {piece.availabilityState && <p style={{ marginTop: 4, fontSize: 11, color: '#b8d0c8' }}>{piece.availabilityState}</p>}
        <div className="mt-4 space-y-3">{piece.listing?.price && piece.listing.stock !== 0 && <PurchaseActions assetId={piece.assetId} />}<SavePiece assetId={piece.assetId} /><PieceComments assetId={piece.assetId} name={piece.name} /></div>
        <button type="button" onClick={onAskSame} className="ames-pill mt-5 inline-flex items-center min-h-11 rounded-full px-5 text-[12px]">Ask SAME</button>
      </div>
    </div>
  );
}

export default function EngineBoutiquePanel({ highlightAssetId, onAskSame }: { highlightAssetId: string | null; onAskSame: (piece: BoutiquePiece) => void }) {
  const [pieces, setPieces] = useState<BoutiquePiece[]>([]);
  const [category, setCategory] = useState<BoutiqueCategory>('ring');
  const [selected, setSelected] = useState<BoutiquePiece | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [catalogueError, setCatalogueError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([loadBoutiqueContent(), loadPublishedBoutiqueContent().catch(e => { if (active) setCatalogueError(e.message); return []; })]).then(parts => parts.flat()).then(value => { if (active) { setPieces(value.filter(piece => showCustomerJewelry(piece.assetId))); setError(false); setLoading(false); } })
      .catch(() => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const match = pieces.find(piece => piece.assetId === highlightAssetId);
    if (match) queueMicrotask(() => { setSelected(match); if (match.category) setCategory(match.category); });
  }, [highlightAssetId, pieces]);

  const filtered = boutiqueByCategory(pieces, category);
  const groups = boutiqueGroups(filtered);
  function changeCategory(next: BoutiqueCategory) {
    setCategory(next);
    setSelected(null);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }

  return (
    <div data-boutique-panel className="flex-1 min-h-0 flex flex-col" style={{ background: 'transparent' }}>
      {catalogueError && <p role="status" className="px-5 pt-20 text-xs text-[#b9cec6]">{catalogueError}</p>}
      {selected && showCustomerJewelry(selected.assetId) ? <PieceDetail piece={selected} onClose={() => setSelected(null)} onAskSame={() => onAskSame(selected)} /> : <>
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }} data-boutique-scroll>
          {loading && <div className="h-full flex items-center justify-center" style={{ color: '#9eb8ae', fontSize: 12 }}>Loading pieces…</div>}
          {!loading && (error || groups.length === 0) && <div className="h-full flex items-center justify-center px-8 text-center" style={{ color: '#9eb8ae', fontSize: 13 }}>{error ? 'Boutique pieces are unavailable.' : 'No pieces in this category yet.'}</div>}
          {groups.map((group, index) => <section key={`${category}-${index}`} data-boutique-group={index}
            className="min-h-full px-4 sm:px-8 pb-8 pt-20 mx-auto"
            style={{ maxWidth: 880, scrollSnapAlign: 'start' }}>
            <h2 className="ames-collection-heading">{boutiqueCategories(pieces).find(item => item.key === category)?.label}</h2>
            <div className="grid grid-cols-2 items-start gap-x-4 gap-y-7 sm:gap-x-8">
            {group.map(piece => <PieceTile key={piece.assetId} piece={piece} single={group.length === 1} onOpen={() => setSelected(piece)} />)}
            </div>
          </section>)}
        </div>
      </>}
      {/* The categories stay at hand while a piece is open: tapping one goes straight there, no back button needed. */}
      <nav className="shrink-0 flex items-center justify-start sm:justify-center gap-4 sm:gap-7 px-3 overflow-x-auto" style={{ minHeight: 58, borderTop: '1px solid rgba(238,247,244,0.12)', scrollbarWidth: 'none' }} aria-label="Boutique categories">
        {boutiqueCategories(pieces).map(item => <button key={item.key} type="button" onClick={() => changeCategory(item.key)} aria-current={category === item.key ? 'page' : undefined}
          className="shrink-0" style={{ fontSize: 11, color: category === item.key ? '#eef5f2' : '#9eb8ae', fontWeight: category === item.key ? 600 : 400, borderBottom: category === item.key ? '1px solid rgba(238,247,244,0.7)' : '1px solid transparent', paddingBottom: 3 }}>{item.label}</button>)}
      </nav>
    </div>
  );
}
