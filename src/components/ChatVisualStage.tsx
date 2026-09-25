"use client";

import { useCallback, useEffect, useState } from 'react';
import ModelViewer from './ModelViewer';
import { loadChatStageContent, supportedViewerAction, type ChatStageContent, type ViewerAction } from '../lib/ames-chat-content';

type Command = { id: number; value: unknown } | null;
const actionLabels: Partial<Record<ViewerAction, string>> = {
  rotate: 'Rotate', stop_rotation: 'Stop', zoom: 'Zoom', reset: 'Reset',
  hero_view: 'Hero', macro_view: 'Macro', side_view: 'Side', inspect_setting: 'Setting',
};

export default function ChatVisualStage({ command, assetId, compact = false }: { command: Command; assetId?: string | null; compact?: boolean }) {
  const [content, setContent] = useState<ChatStageContent | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [rotation, setRotation] = useState(false);
  const [view, setView] = useState('three_quarter');
  const [zoomed, setZoomed] = useState(false);
  const [resetToken, setResetToken] = useState(0);

  useEffect(() => {
    let active = true;
    loadChatStageContent(assetId ?? undefined).then(result => {
      if (!active) return;
      setContent(result);
      setRotation(result.contract.rotationEnabled);
      setView(result.contract.defaultView);
      setLoadError(false);
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [assetId]);

  const applyAction = useCallback((raw: unknown) => {
    const action = supportedViewerAction(raw, content?.contract ?? null);
    if (!action) return false;
    switch (action) {
      case 'rotate': if (content?.contract.rotationEnabled) setRotation(true); break;
      case 'stop_rotation': setRotation(false); break;
      case 'zoom': setZoomed(true); break;
      case 'reset': setView(content?.contract.defaultView ?? 'three_quarter'); setZoomed(false); setRotation(!!content?.contract.rotationEnabled); setResetToken(value => value + 1); break;
      case 'hero_view': setView('hero'); break;
      case 'macro_view': setView('macro'); break;
      case 'side_view': setView('side'); break;
      case 'inspect_setting': setView('setting'); break;
    }
    return true;
  }, [content]);

  useEffect(() => { if (command) queueMicrotask(() => applyAction(command.value)); }, [command, applyAction]);

  const isJewelry = content?.contract.type === 'jewelry';
  const image = view === 'hero' ? content?.heroUrl : view === 'macro' ? content?.macroUrl : null;
  const ringView = content?.category === 'ring';
  const angle = view === 'side' ? '90deg 75deg' : view === 'setting' ? (ringView ? '35deg 35deg' : '35deg 65deg') : view === 'three_quarter' ? (ringView ? '35deg 40deg' : '35deg 75deg') : '0deg 75deg';
  const orbit = ringView ? `${angle} ${zoomed ? '2.2m' : '3.3m'}` : `${angle} auto`;
  const stageHeight = compact ? 180 : 220;
  return (
    <div className="shrink-0 mx-auto w-full" style={{ maxWidth: compact ? 420 : 460, padding: compact ? '4px 16px 8px' : '0 16px 12px', textAlign: 'center' }}>
      <div style={{ height: stageHeight, position: 'relative' }}>
        {content ? (image ? <img src={image} alt={view === 'hero' ? 'Jewelry hero view' : 'Gemstone macro view'} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 14 }} /> :
          <ModelViewer key={content.stageUrl} src={content.stageUrl} poster={content.posterUrl} alt={content.name}
            autoRotate={false} controlledTurntable turntableEnabled={rotation} turntableResetToken={resetToken} cameraControls cameraOrbit={orbit} fieldOfView={content.category === 'ring' ? undefined : zoomed ? '25deg' : undefined} ar={false}
            fallbackTitle={isJewelry ? 'Jewelry preview' : 'Gemstone preview'} fallbackSubtitle="3D preview unavailable"
            style={{ width: '100%', height: '100%', borderRadius: 14 }} />) :
          <ModelViewer src="/diamond.glb/scene.gltf" poster="/diamond-poster.jpg" alt="Loose gemstone" autoRotate fallbackTitle="Gemstone preview" fallbackSubtitle={loadError ? 'Engine stage unavailable' : 'Loading jewelry'} style={{ width: '100%', height: '100%', borderRadius: 14 }} />}
      </div>
      {content && (
        <>
          <div className="flex justify-center gap-1.5 flex-wrap" aria-label="Jewelry viewer actions">
            {content.contract.supportedViewerActions.filter(action => action !== 'rotate' || content.contract.rotationEnabled).map(action =>
              <button key={action} type="button" onClick={() => applyAction(action)} className="px-2 py-1 rounded-full text-[10px]" style={{ background: '#FCFCFB', color: '#6E6C69', border: '1px solid rgba(23,23,23,0.08)' }}>{actionLabels[action]}</button>)}
          </div>
          {!content.commerciallyApproved && <p style={{ fontSize: 10, color: '#8A6A42', marginTop: 5 }}>Visual review pending · Not approved for publication</p>}
          {content.contract.essentialSpecs.physicalScaleConfirmed === false && <p style={{ fontSize: 10, color: '#6E6C69' }}>Physical scale unverified; dimensions and carat are not claimed.</p>}
          {content.limitations.length > 0 && <details style={{ fontSize: 10, color: '#6E6C69', marginTop: 3 }}><summary style={{ cursor: 'pointer' }}>Current limitations</summary><ul style={{ textAlign: 'left', paddingLeft: 16 }}>{content.limitations.map(item => <li key={item}>{item}</li>)}</ul></details>}
        </>
      )}
      {loadError && <p style={{ fontSize: 10, color: '#6E6C69' }}>Engine jewelry is unavailable. Showing the loose gemstone preview.</p>}
    </div>
  );
}
