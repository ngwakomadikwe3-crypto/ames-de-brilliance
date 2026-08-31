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
