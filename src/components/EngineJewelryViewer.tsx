"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

const JewelryViewer = dynamic(
  () => import("ames-engine").then(module => module.JewelryViewer),
  { ssr: false },
);

export default function EngineJewelryViewer({
  src,
  poster,
  alt,
  style,
  cameraPreset, zoom, turntableEnabled, resetToken,
}: {
  cameraPreset?: "front" | "three_quarter" | "side" | "setting";
  zoom?: number;
  turntableEnabled?: boolean;
  resetToken?: number;
  src: string;
  poster?: string;
  alt?: string;
  style?: React.CSSProperties;
}) {
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const handleReady = useCallback(() => setReadySrc(src), [src]);
  const ready = readySrc === src;
  return (
    <div data-ames-engine-host style={{ position: "relative", width: "100%", height: "100%", ...style }}>
      {poster && !ready && <img src={poster} alt={alt ?? "Jewelry preview"} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", zIndex: 1, pointerEvents: "none" }} />}
      <JewelryViewer
        key={src}
        modelUrl={src}
        cameraPreset={cameraPreset} zoom={zoom} turntableEnabled={turntableEnabled} resetToken={resetToken}
        controlsEnabled
        transparentBackground
        onModelReady={handleReady}
        style={{ width: "100%", height: "100%", borderRadius: 14, overflow: "hidden" }}
      />
    </div>
  );
}
