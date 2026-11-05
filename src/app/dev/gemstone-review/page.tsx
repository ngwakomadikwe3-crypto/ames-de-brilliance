import moonstoneContract from '../../../../public/ames-engine/stone-moonstone/app/chat.json';
import { notFound } from 'next/navigation';
import ModelViewer from '@/components/ModelViewer';
import EngineJewelryViewer from '@/components/EngineJewelryViewer';
export default async function Review({ searchParams }: { searchParams: Promise<{ stone?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { stone = 'ruby' } = await searchParams;
  if (!['ring','earring','ruby','emerald','sapphire','diamond','ametrine','opal','pearl','turquoise','alexandrite','amber','amethyst','aquamarine','citrine','fancy-color-diamond','garnet','iolite','jade','kunzite','lapis-lazuli','moonstone','morganite','peridot','rose-quartz','spinel','sunstone','tanzanite','topaz','tourmaline','zircon'].includes(stone)) notFound();
  const jewelry = stone === 'ring' || stone === 'earring';
  const asset = stone === 'ring' ? 'dev-test-candidate-ring' : `stone-${stone}`;
  const stageAsset = stone === 'moonstone' ? moonstoneContract.stageAsset : 'web/jewelry.glb';
  return <div className="ames-app-shell" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
    <div style={{ width: '100%', maxWidth: 640, height: 320 }}><>{stone === 'earring' ? <ModelViewer src="/ames-engine/dev-test-earring-001/web/jewelry.glb" jewelryPresentation metalPreview="yellow-gold" autoRotate={false} cameraControls ar={false} style={{ height: '100%' }} /> : <EngineJewelryViewer src={`/ames-engine/${asset}/${stageAsset}`} poster={`/ames-engine/${asset}/web/poster.webp`} opticsProfile={jewelry ? "soft-studio" : "gemstone-studio"} cameraPreset={jewelry ? "three_quarter" : "gemstone"} zoom={jewelry ? 0.78 : 1} turntableEnabled={false} autoLoad />}</></div>
  </div>;
}
