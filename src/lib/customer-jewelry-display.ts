/** Customer-facing presentation holds; source packs remain available for staff review. */
export function showCustomerJewelry(assetId: string, surface: 'interactive' | 'media' = 'interactive'): boolean {
  if (assetId === 'dev-test-solitaire-mount' || assetId === 'dev-test-pendant-001') return false;
  // The earring has a live yellow-gold study, but its archived images/videos are still white.
  if (surface === 'media' && assetId === 'dev-test-earring-001') return false;
  return true;
}

export function hasUnfinishedJewelryImages(assetId: string): boolean {
  return assetId === 'dev-test-earring-001' || !showCustomerJewelry(assetId);
}
