/** Customer-facing presentation holds; source packs remain available for staff review. */
/** AMES-authored pieces shown in the physical studio (ray-traced diamonds, studio metal). */
export const AMES_STUDIO_PIECES = new Set(['ames-pear-drop-earrings', 'ames-iced-watch', 'ames-tennis-bracelet', 'ames-pear-fringe-necklace']);

/** Earrings, necklaces and watches are read face-on; bracelets from above at three-quarter. */
export function studioCameraPreset(category?: string): 'front' | 'three_quarter' {
  return category === 'earrings' || category === 'watch' || category === 'necklace' ? 'front' : 'three_quarter';
}

export function showCustomerJewelry(assetId: string, surface: 'interactive' | 'media' = 'interactive'): boolean {
  // The yellow-gold chandelier study is replaced by the AMES pear-drop earrings.
  if (assetId === 'dev-test-solitaire-mount' || assetId === 'dev-test-pendant-001' || assetId === 'dev-test-earring-001') return false;
  // The earring has a live yellow-gold study, but its archived images/videos are still white.
  if (surface === 'media' && assetId === 'dev-test-earring-001') return false;
  return true;
}

export function hasUnfinishedJewelryImages(assetId: string): boolean {
  return assetId === 'dev-test-earring-001' || !showCustomerJewelry(assetId);
}
