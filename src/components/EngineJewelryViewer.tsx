"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const JewelryViewer = dynamic(
  () => import("ames-engine").then(module => module.JewelryViewer),
  { ssr: false },
);

export default function EngineJewelryViewer({
  src,
  poster,
  alt,
  style,
}: {
  src: string;
  poster?: string;
  alt?: string;
  style?: React.CSSProperties;
}) {
  const [ready, setReady] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", ...style }}>
      {poster && !ready && <img src={poster} alt={alt ?? "Jewelry preview"} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", zIndex: 1, pointerEvents: "none" }} />}
      <JewelryViewer
        modelUrl={src}
        controlsEnabled
        onModelReady={() => setReady(true)}
        style={{ width: "100%", height: "100%", borderRadius: 14, overflow: "hidden" }}
      />
    </div>
  );
}
