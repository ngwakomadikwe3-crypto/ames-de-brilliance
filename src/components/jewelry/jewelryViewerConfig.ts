import type { JewelryViewerConfig } from "./jewelryTypes";

export const jewelryViewerConfig = {
  maxPixelRatio: 1.5,
  cameraFov: 28,
  minDistance: 1.8,
  maxDistance: 6,
  environment: "studio",
  environments: ["studio", "daylight", "evening", "dark"] as const,
};
