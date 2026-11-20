"use client";

import {FollowJeweller} from './JewellerFavourites';
import { useEffect, useRef, useState } from 'react';
import {useCollectionStyles} from './CollectionStyles';
import ConfigurationPrice from './ConfigurationPrice';
import SampleQuote from './SampleQuote';
import {DiamondControls,useDiamondDesign} from './DiamondDesign';
import {useAtelierLanguage} from './AtelierLanguage';
import {houseScript} from '../lib/script-font';
import SizeGuide from './SizeGuide';
import ModelViewer from './ModelViewer';

import housePieces from '../lib/boutique-house-pieces.json';
import PieceComments from './PieceComments';
import PurchaseActions from './PurchaseActions';
import { SavePiece } from './PieceAccountActions';
import { loadPublishedBoutiqueContent, originLabel, stockLabel } from '@/lib/catalogue-content';
import WatchMovement from './WatchMovement';
import EngineJewelryViewer from './EngineJewelryViewer';

import { showCustomerJewelry, hasUnfinishedJewelryImages, AMES_STUDIO_PIECES, studioCameraPreset } from '../lib/customer-jewelry-display';
/** AMES pieces and converter-made jeweller listings use the studio diamond viewer. */
const studioPiece = (piece: { assetId: string; listing?: { studio?: boolean } }) => AMES_STUDIO_PIECES.has(piece.assetId) || !!piece.listing?.studio;
import { boutiqueCategories, boutiqueByCategory, boutiqueGroups, boutiquePrice, type BoutiqueCategory, type BoutiquePiece } from '../lib/ames-boutique-content';

function PieceTile({ piece, single, onOpen }: { piece: BoutiquePiece; single: boolean; onOpen: () => void }) {
  const {t}=useAtelierLanguage();
  const price = boutiquePrice(piece.price);
  const review = piece.publicationStatus !== 'published' || piece.visualApproval !== 'approved';
  return (
    <button type="button" onClick={onOpen} data-boutique-tile={piece.assetId} aria-label={`Open ${piece.name}`}
      className="ames-piece-tile text-center flex flex-col min-h-0" style={{ width: '100%', maxWidth: single ? 480 : undefined, justifySelf: single ? 'center' : undefined, alignSelf: 'start', gridColumn: single ? '1 / -1' : undefined, gridRow: single ? '1 / -1' : undefined }}>
      <div className="ames-piece-image w-full flex items-center justify-center overflow-hidden">
        <ModelViewer src={piece.interactiveGlb} alt={piece.name} autoRotate={false} cameraControls={false} ar={false}
          jewelryPresentation shadowIntensity="0" metalPreview={piece.assetId==='dev-test-earring-001'?'yellow-gold':undefined}
          cameraOrbit={piece.category==='ring'?'32deg 64deg 106%':piece.category==='watch'?'26deg 64deg 110%':'10deg 84deg 108%'}
          style={{width:'100%',height:'100%',pointerEvents:'none',background:'transparent'}} />
        <style>{`.ames-piece-tile .ames-piece-image,.ames-piece-tile .ames-object-display{background:transparent!important;box-shadow:none!important;border:none!important}.ames-piece-tile .ames-piece-image::before,.ames-piece-tile .ames-piece-image::after,.ames-piece-tile .ames-object-display::before,.ames-piece-tile .ames-object-display::after{content:none!important}`}</style>
      </div>
      <div className="pt-1 px-0.5 flex flex-col items-center gap-1">
        <div className="min-w-0">
          <p className="ames-piece-name" style={{ fontFamily: 'var(--font-satoshi)', fontSize: 22, color: '#ffffff' }}>{t(piece.name)}</p>
        {review && <p style={{ fontSize: 10, color: '#ffffff' }}>Preview · approval pending</p>}
          {piece.assetId === 'dev-test-earring-001' && <p className="text-[10px] text-white">Yellow-gold material preview</p>}
        </div>
        {piece.listing && <span className="text-[10px] text-white">Made in: {originLabel(piece.listing.madeIn.country, piece.listing.madeIn.verified)}</span>}
        {price && <span className="shrink-0" style={{ fontSize: 11, color: '#ffffff' }}>{price}</span>}
        {!price && piece.inquiryState && <span className="shrink-0" style={{ fontSize: 11, color: '#ffffff' }}>{piece.inquiryState}</span>}
      </div>
    </button>
  );
}

function PieceDetail({ piece, onClose, onAskSame }: { piece: BoutiquePiece; onClose: () => void; onAskSame: () => void }) {
  const collection=useCollectionStyles(piece.assetId);
  const ring = piece.assetId === 'demo-pave-solitaire';
  const customizable = ring || ['ames-iced-watch','ames-pear-drop-earrings','ames-pear-fringe-necklace','ames-tennis-bracelet'].includes(piece.assetId);
  const design = useDiamondDesign(piece.interactiveGlb, ring, piece.assetId === "ames-pear-fringe-necklace");
  const {t}=useAtelierLanguage();
  const price = boutiquePrice(piece.price);
  const options=collection.active?collection.configuration:[design.metal,design.colour||'Original stones',(ring||piece.category==='necklace')&&design.cut,piece.category==='watch'&&design.shape,piece.category==='watch'&&design.strap,piece.category==='watch'&&design.strap==='leather'&&design.leather].filter(Boolean).join(' · ');
  const hasOptions=!piece.listing&&(customizable||collection.active);
  const knownSpecs = Object.entries(piece.essentialSpecs).filter(([key, value]) => !['physicalScaleConfirmed', 'unitMeaning', 'manufacturingReady'].includes(key) && value !== null && value !== undefined && value !== 'unknown');
  const review = piece.publicationStatus !== 'published' || piece.visualApproval !== 'approved';
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto overscroll-contain pt-20" data-boutique-detail={piece.assetId}>
      <div className="ames-jewelry-stage relative shrink-0 mx-auto w-full" style={{ maxWidth: 720, height: 'clamp(225px, 43dvh, 450px)' }}>
        <button type="button" onClick={onClose} aria-label="Back to Boutique" className="ames-pill absolute top-3 left-5 z-10 flex items-center justify-center w-11 h-11 rounded-full">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        {collection.active ? (collection.src ? <EngineJewelryViewer src={collection.src} alt={collection.style} autoLoad turntableEnabled opticsProfile="mounted-gem-studio" cameraPreset={piece.category==="ring"?"three_quarter":"front"}/> : <p role="status">{collection.error?"Style preview unavailable":"Preparing your style…"}</p>) : customizable && !design.src ? <p role="status" className="p-8 text-center">{design.error ? "Colour preview unavailable. Choose Original to restore the design." : "Preparing your design…"}</p> : piece.listing || piece.assetId === 'demo-pave-solitaire' || piece.assetId === 'dev-test-candidate-ring' || AMES_STUDIO_PIECES.has(piece.assetId) ? <EngineJewelryViewer key={design.src} src={design.src} poster={piece.assetId === "ames-iced-watch" || design.metal !== "silver" || design.colour || design.cut !== "Original" ? undefined : piece.poster} alt={piece.name} cameraPreset={studioPiece(piece) ? studioCameraPreset(piece.category) : 'three_quarter'} zoom={piece.assetId === 'demo-pave-solitaire' || studioPiece(piece) ? 1 : 0.78} autoLoad opticsProfile={piece.assetId === 'demo-pave-solitaire' || studioPiece(piece) ? 'mounted-gem-studio' : 'soft-studio'} turntableEnabled style={{ width: '100%', height: '100%' }} /> :
          <ModelViewer key={piece.interactiveGlb} src={piece.interactiveGlb} poster={hasUnfinishedJewelryImages(piece.assetId) ? undefined : piece.poster} alt={piece.name}
            autoRotate cameraControls ar={false} jewelryPresentation metalPreview={piece.assetId === 'dev-test-earring-001' ? 'yellow-gold' : undefined} cameraOrbit={piece.category === 'ring' ? '35deg 40deg 105%' : '35deg 75deg 105%'}
            fallbackTitle={piece.name} fallbackSubtitle="3D preview unavailable" style={{ width: '100%', height: '100%' }} />}
      </div>
      <div className="shrink-0 px-6 pb-7 pt-3 mx-auto w-full" style={{ maxWidth: 620 }}>
        <h2  style={{ fontFamily: 'var(--font-satoshi)', fontSize: 27, color: '#ffffff', lineHeight: 1.1 }}>{t(piece.name)}</h2>
        {piece.category==='watch' && <WatchMovement/>}
        {!piece.listing && <p className="mt-2 text-xs">{t('Part of the HOUSEofAMES collection. Our manufacturing partners make each commissioned piece for HOUSEofAMES.')}</p>}
        {["ring","bracelet","watch"].includes(piece.category) && <SizeGuide category={piece.category} model={collection.active?collection.src:design.src} wrist={piece.category !== "ring"}/>}
        {collection.controls}
        {customizable && !collection.active && <DiamondControls design={design} necklace={piece.assetId === "ames-pear-fringe-necklace"} ring={ring} watch={piece.assetId === "ames-iced-watch"}/>}
        {piece.assetId === 'dev-test-earring-001' && <p className="mt-2 text-xs text-white">Yellow-gold material preview · finish unverified</p>}
          {hasOptions && <><ConfigurationPrice key={piece.assetId+options} piece={piece.assetId} setting={piece.category} options={options}/><SampleQuote key={options} configuration={options} stone={piece.name} setting={piece.category} cut={collection.active?'':design.cut} metal={collection.active?collection.metal:design.metal}/></>}
        {review && <p style={{ fontSize: 10, color: '#ffffff', marginTop: 5 }}>Preview · visual approval pending</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3" style={{ fontSize: 11, color: '#ffffff' }}>
          {knownSpecs.map(([key, value]) => <span key={key}>{key.replace(/([A-Z])/g, ' $1')}: {String(value)}</span>)}
          {piece.essentialSpecs.physicalScaleConfirmed === false && <span>Physical scale unverified</span>}
        </div>
        {piece.listing && <div className="mt-3 space-y-2 text-xs text-white"><p>By {piece.listing.storefrontUrl ? <a href={piece.listing.storefrontUrl} className="underline">{piece.listing.businessName}</a> : piece.listing.businessName}</p><p>{piece.listing.description}</p><p>Made in: {originLabel(piece.listing.madeIn.country, piece.listing.madeIn.verified)}</p>{piece.listing.gemstones.map((g, i) => <p key={i}>{g.name} origin: {originLabel(g.origin, g.verified)}</p>)}<a href={`/jewellery/${piece.listing.id}`} className="underline">Full listing</a></div>}
        {!hasOptions && price && <p style={{ marginTop: 12, fontSize: 14, color: '#ffffff' }}>{price}</p>}
        {!price && piece.inquiryState && <p style={{ marginTop: 12, fontSize: 12, color: '#ffffff' }}>{piece.inquiryState}</p>}
        {piece.listing && stockLabel(piece.listing.stock) && <p data-stock style={{ marginTop: 4, fontSize: 12, color: piece.listing.stock === 0 ? '#f3c9c0' : '#ffffff' }}>{stockLabel(piece.listing.stock)}</p>}
        {piece.availabilityState && <p style={{ marginTop: 4, fontSize: 11, color: '#ffffff' }}>{piece.availabilityState}</p>}
        <div className="mt-4 space-y-3">{piece.listing?.price && piece.listing.stock !== 0 && <PurchaseActions assetId={piece.assetId} />}{piece.listing&&<FollowJeweller target={'listing:'+piece.listing.id}/>}<SavePiece assetId={piece.assetId} /><PieceComments assetId={piece.assetId} name={piece.name} /></div>
        <button type="button" onClick={onAskSame} className="ames-pill mt-5 inline-flex items-center min-h-11 rounded-full px-5 text-[12px]">Ask SAME</button>
      </div>
    </div>
  );
}

export default function EngineBoutiquePanel({ highlightAssetId, onAskSame }: { highlightAssetId: string | null; onAskSame: (piece: BoutiquePiece) => void }) {
  const {t}=useAtelierLanguage();
  const [pieces, setPieces] = useState<BoutiquePiece[]>(() => (housePieces as BoutiquePiece[]).filter(piece => showCustomerJewelry(piece.assetId)));
  const [category, setCategory] = useState<BoutiqueCategory>('ring');
  const [selected, setSelected] = useState<BoutiquePiece | null>(null);
  const [catalogueError, setCatalogueError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    loadPublishedBoutiqueContent().then(listings => {
      if (active) setPieces([...(housePieces as BoutiquePiece[]), ...listings].filter(piece => showCustomerJewelry(piece.assetId)));
    }).catch(e => { if (active) setCatalogueError(e.message); });
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
      {catalogueError && !pieces.length && <p role="status" className="px-5 pt-20 text-xs text-white">{catalogueError}</p>}
      {selected && showCustomerJewelry(selected.assetId) ? <PieceDetail key={selected.assetId} piece={selected} onClose={() => setSelected(null)} onAskSame={() => onAskSame(selected)} /> : <>
        <div ref={scrollRef} className="flex-initial min-h-0 overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'none' }} data-featured-piece={groups.length === 1 && groups[0].length === 1 || undefined} data-boutique-scroll>
          {groups.length === 0 && <div className="h-full flex items-center justify-center px-8 text-center" style={{ color: '#ffffff', fontSize: 13 }}>No pieces in this category yet.</div>}
          {groups.map((group, index) => <section key={`${category}-${index}`} data-boutique-group={index}
            className="ames-compact-collection px-4 sm:px-8 mx-auto"
            style={{ maxWidth: 760 }}>
            <h2 className="ames-collection-heading text-center" style={{ fontFamily:houseScript.style.fontFamily }}>{t(boutiqueCategories(pieces).find(item => item.key === category)?.label??'')}</h2>
            <div className="grid grid-cols-2 items-start gap-x-4 gap-y-3 sm:gap-x-8">
            {group.map(piece => <PieceTile key={piece.assetId} piece={piece} single={group.length === 1} onOpen={() => setSelected(piece)} />)}
            </div>
          </section>)}
        </div>
      </>}
      {/* The categories stay at hand while a piece is open: tapping one goes straight there, no back button needed. */}
      <nav className="shrink-0 flex items-center justify-start sm:justify-center gap-4 sm:gap-7 px-3 overflow-x-auto" style={{ minHeight: 52, borderTop: '1px solid rgba(238,247,244,0.12)', scrollbarWidth: 'none' }} aria-label="Boutique categories">
        {boutiqueCategories(pieces).map(item => <button key={item.key} type="button" onClick={() => changeCategory(item.key)} aria-current={category === item.key ? 'page' : undefined}
          className="shrink-0" style={{ fontFamily: "var(--font-satoshi)", lineHeight: 1.4, borderBottom: category === item.key ? '1px solid rgba(238,247,244,0.7)' : '1px solid transparent', paddingBottom: 1 }}>{t(item.label)}</button>)}
      </nav>
    </div>
  );
}
