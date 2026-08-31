export type AMESMetal = "18k-yellow-gold" | "18k-rose-gold" | "18k-white-gold" | "platinum" | "silver";
export type AMESEnvironment = "studio" | "daylight" | "evening" | "dark";
export type AMESJewelryProduct = { id: string; name: string; tagline: string; category: "ring" | "necklace" | "earring" | "bracelet"; kind: "glb"; model3d: string; forSale: false; thumbnailUrl?: string };
export type AMESViewerProps = { modelUrl: string; image?: string; caption?: string; className?: string; autoRotate?: boolean; onAsk?: () => void };
export type AMESMaterialVariant = { id: AMESMetal; label: string; materialNames: string[] };
export const AMES_ENVIRONMENTS: readonly AMESEnvironment[] = ["studio", "daylight", "evening", "dark"];
