"use client";

import { useCallback, useEffect, useState } from 'react';
import EngineJewelryViewer from './EngineJewelryViewer';
import ModelViewer from './ModelViewer';
import { DEFAULT_CHAT_ASSET_ID, CONCEPT_DIAMOND_ASSET_ID } from '../lib/chat-asset-selection';
import { showCustomerJewelry, hasUnfinishedJewelryImages } from '../lib/customer-jewelry-display';
import { loadChatStageContent, supportedViewerAction, type ChatStageContent, type ViewerAction } from '../lib/ames-chat-content';

type Command = { id: number; value: unknown } | null;
const actionLabels: Partial<Record<ViewerAction, string>> = {
  rotate: 'Rotate', stop_rotation: 'Stop', zoom: 'Zoom', reset: 'Reset',
  hero_view: 'Hero', macro_view: 'Macro', side_view: 'Side', inspect_setting: 'Setting',
};

export default function ChatVisualStage({ command, assetId, compact = false, active = true }: { command: Command; assetId?: string | null; compact?: boolean; active?: boolean }) {
  // Remount asset-local loading and command state before rendering a new selection.
  return <SelectedChatVisualStage key={assetId ?? 'default'} command={command} assetId={assetId} compact={compact} active={active} />;
}

function SelectedChatVisualStage({ command, assetId, compact, active }: { command: Command; assetId?: string | null; compact: boolean; active: boolean }) {
  const [content, setContent] = useState<ChatStageContent | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rotation, setRotation] = useState(false);
  const [view, setView] = useState('three_quarter');
  const [zoomed, setZoomed] = useState(false);
  const [resetToken, setResetToken] = useState(0);

  useEffect(() => {
    let active = true;
    loadChatStageContent(assetId ?? undefined).then(result => {
      if (!active) return;
      if (!showCustomerJewelry(result.contract.assetId)) throw new Error('This unfinished preview is not displayed.');
      setContent(result);
      setRotation(result.contract.rotationEnabled);
      setView(result.contract.defaultView);
    }).catch(() => { if (active) { setContent(null); setLoadFailed(true); } });
    return () => { active = false; };
  }, [assetId]);

  const applyAction = useCallback((raw: unknown) => {
    const action = supportedViewerAction(raw, content?.contract ?? null);
    if (!action) return false;
    switch (action) {
      case 'rotate': setRotation(true); break;
      case 'stop_rotation': setRotation(false); break;
      case 'zoom': setZoomed(true); break;
      case 'reset': setView(content?.contract.defaultView ?? 'three_quarter'); setZoomed(false); setRotation(!!content?.contract.rotationEnabled); setResetToken(value => value + 1); break;
      case 'hero_view': setView('hero'); break;
      case 'macro_view':
        // The ring's archived macro predates its current center geometry.
        if (content?.contract.type === 'gemstone') { setView('three_quarter'); setZoomed(true); }
        else if (content?.contract.assetId === 'dev-test-candidate-ring') { setView('setting'); setZoomed(true); }
        else setView('macro');
        break;
      case 'side_view': setView('side'); break;
      case 'inspect_setting': setView('setting'); break;
    }
    return true;
  }, [content]);

  useEffect(() => { if (command) queueMicrotask(() => applyAction(command.value)); }, [command, applyAction]);

  const image = content && !hasUnfinishedJewelryImages(content.contract.assetId) && (view === 'hero' ? content.heroUrl : view === 'macro' ? content.macroUrl : null);
  const ringView = content?.category === 'ring';
  const angle = view === 'side' ? '90deg 75deg' : view === 'setting' ? (ringView ? '35deg 35deg' : '35deg 65deg') : view === 'three_quarter' ? (ringView ? '35deg 40deg' : '35deg 75deg') : '0deg 75deg';
  const orbit = `${angle} ${zoomed ? '78%' : '105%'}`;
  const revision = content?.contract.type === 'gemstone' ? encodeURIComponent(content.contract.revisionId) : null;
  const stageSrc = content?.stageUrl && revision ? `${content.stageUrl}?revision=${revision}` : content?.stageUrl;
  const stagePoster = content?.posterUrl && revision ? `${content.posterUrl}?revision=${revision}` : content?.posterUrl;
  const stageHeight = compact ? 'clamp(230px, 32dvh, 300px)' : 'clamp(240px, 44dvh, 440px)';
  return (
    <div className="shrink-0 mx-auto w-full" style={{ maxWidth: compact ? 420 : 640, padding: compact ? '4px 16px 8px' : '0 16px 12px', textAlign: 'center' }}>
      <div className="ames-jewelry-stage" data-chat-asset-id={content?.contract.assetId} data-chat-revision={content?.contract.revisionId} style={{ height: stageHeight, position: 'relative' }}>
        {content ? (content.contract.presentation === 'reference-image' ? <img data-reference-ring src={content.posterUrl} alt={content.name + ' — image reference'} style={{ width: '100%', height: '100%', objectFit: 'contain', background: 'transparent', border: 'none', borderRadius: 0, boxShadow: 'none', transform: zoomed ? 'scale(1.12)' : undefined }} /> : image ? <img src={image} alt={view === 'hero' ? 'Jewelry hero view' : 'Gemstone macro view'} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 14 }} /> :
          content.contract.type === 'gemstone' || content.contract.assetId.startsWith('listing-') || content.contract.assetId === DEFAULT_CHAT_ASSET_ID || content.contract.assetId === 'dev-test-candidate-ring' ? <EngineJewelryViewer key={stageSrc} src={stageSrc!} poster={stagePoster} alt={content.name}
            cameraPreset={view === 'side' ? 'side' : view === 'setting' ? 'setting' : view === 'three_quarter' ? (content.contract.type === 'gemstone' ? 'gemstone' : 'three_quarter') : 'front'}
            zoom={(zoomed ? 1.1 : 1) * (content.contract.assetId === 'dev-test-candidate-ring' ? (compact ? 0.58 : 0.78) : (compact ? 1.12 : 1.04))} turntableEnabled={rotation} resetToken={resetToken} paused={!active}
            autoLoad
            opticsProfile={content.contract.assetId === DEFAULT_CHAT_ASSET_ID ? 'mounted-gem-studio' : content.contract.type === 'gemstone' ? 'gemstone-studio' : 'soft-studio'}
            style={{ width: '100%', height: '100%', borderRadius: 14 }} /> :
          <ModelViewer key={stageSrc} src={stageSrc!} poster={hasUnfinishedJewelryImages(content.contract.assetId) ? undefined : content.posterUrl} alt={content.name} jewelryPresentation metalPreview={content.contract.assetId === 'dev-test-earring-001' ? 'yellow-gold' : undefined}
            autoRotate={false} controlledTurntable turntableEnabled={rotation && active} turntableResetToken={resetToken} cameraControls cameraOrbit={orbit} fieldOfView={content.category === 'ring' ? undefined : zoomed ? '25deg' : undefined} ar={false}
            fallbackTitle={content.name} fallbackSubtitle="3D preview unavailable" style={{ width: '100%', height: '100%', borderRadius: 14 }} />) :
          <div role="status" data-chat-stage-placeholder style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#9eb8ae' }}>
            {loadFailed ? 'Preview unavailable' : 'Loading selected piece…'}
          </div>}
      </div>
      {content?.contract.assetId === DEFAULT_CHAT_ASSET_ID && <p data-demonstration-label className="mt-1 text-[10px] tracking-wide text-[#b8d0c8]">Pavé solitaire · Interactive concept · Not for sale</p>}
      {content?.contract.assetId === CONCEPT_DIAMOND_ASSET_ID && <p data-demonstration-label className="mt-1 text-[10px] tracking-wide text-[#b8d0c8]">AMES Éclat · Concept diamond · Not for sale</p>}
      {content?.contract.assetId === 'dev-test-earring-001' && <p className="mt-1 text-[10px] text-[#b8d0c8]">Yellow-gold material preview · finish unverified</p>}
      {content && (
        <details style={{ marginTop: 3, fontSize: 10, color: '#9eb8ae', display: compact ? undefined : 'none' }}>
          <summary style={{ cursor: 'pointer', listStyle: 'none', opacity: 0.78 }}>Viewer details</summary>
          <div className="flex justify-center gap-1.5 flex-wrap mt-2" aria-label="Jewelry viewer actions">
            {content.contract.supportedViewerActions.map(action =>
              <button key={action} type="button" onClick={() => applyAction(action)} className="ames-pill px-3 min-h-8 rounded-full text-[11px]">{actionLabels[action]}</button>)}
          </div>
          {!content.commerciallyApproved && <p style={{ fontSize: 10, color: '#b8cdbf', marginTop: 5 }}>Visual review pending · Not approved for publication</p>}
          {content.contract.essentialSpecs.physicalScaleConfirmed === false && <p style={{ fontSize: 10, color: '#9eb8ae' }}>Physical scale unverified; dimensions and carat are not claimed.</p>}
          {content.limitations.length > 0 && <div style={{ marginTop: 3 }}>Current limitations<ul style={{ textAlign: 'left', paddingLeft: 16 }}>{content.limitations.map(item => <li key={item}>{item}</li>)}</ul></div>}
        </details>
      )}
    </div>
  );
}
