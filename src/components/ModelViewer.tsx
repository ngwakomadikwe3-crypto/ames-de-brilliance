"use client";

import { createElement, useEffect, useRef, useState } from "react";

type ModelViewerProps = {
  src: string;
  poster?: string;
  pieceName: string;
  className?: string;
};

export default function ModelViewer({ src, poster, pieceName, className = "" }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "160px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || failed) return;
    let cancelled = false;
    import("@google/model-viewer").catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => { cancelled = true; };
  }, [visible, failed]);

  return (
    <div ref={containerRef} className={`relative aspect-square w-full overflow-hidden ${className}`}>
      {visible && !failed ? (
        createElement("model-viewer", {
          src,
          poster,
          alt: pieceName,
          "auto-rotate": "",
          "camera-controls": "",
          "shadow-intensity": "1",
          ar: "",
          "ar-modes": "webxr scene-viewer quick-look",
          loading: "lazy",
          reveal: "auto",
          onError: () => setFailed(true),
          style: { width: "100%", height: "100%", background: "transparent" },
        })
      ) : (
        <Fallback pieceName={pieceName} poster={poster} />
      )}
    </div>
  );
}

function Fallback({ pieceName, poster }: { pieceName: string; poster?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#FCFCFB] px-6 text-center">
      {poster && <img src={poster} alt="" className="mb-4 h-28 w-28 object-contain opacity-80" />}
      <p className="text-[11px] uppercase tracking-[0.14em] text-[#6E6C69]">{pieceName}</p>
      <p className="mt-2 text-[12px] text-[#6E6C69]">Photography coming soon</p>
    </div>
  );
}

export { ModelViewer };

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        src?: string;
        poster?: string;
        alt?: string;
        "auto-rotate"?: string;
        "camera-controls"?: string;
        "shadow-intensity"?: string;
        ar?: string;
        "ar-modes"?: string;
        loading?: string;
        reveal?: string;
      }, HTMLElement>;
    }
  }
}
