export type JewelryViewerProps = {
  modelUrl: string;
  poster?: string;
  image?: string;
  caption?: string;
  className?: string;
  autoRotate?: boolean;
};

export type JewelryViewerConfig = {
  maxPixelRatio: number;
  cameraFov: number;
  minDistance: number;
  maxDistance: number;
};

export interface JewelryConfiguratorSelection {
  metal?: string;
  cut?: string;
  carat?: number;
  clarity?: string;
  color?: string;
  setting?: string;
  price?: number;
}

export interface JewelryConfiguratorOptions {
  metals?: string[];
  cuts?: string[];
  carats?: number[];
  clarities?: string[];
  colors?: string[];
  settings?: string[];
}

export interface ConfigurableJewelryProduct {
  id: string;
  name: string;
  category: string;
  kind: "glb";
  modelUrl: string;
  thumbnailUrl?: string;
  defaultMetal?: string;
  supportedMetals?: string[];
  defaultDiamond?: string;
  supportedDiamonds?: string[];
  configurator?: JewelryConfiguratorOptions;
}
