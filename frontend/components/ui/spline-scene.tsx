"use client";

import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Declare custom element for TypeScript
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "spline-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          url?: string;
          "loading-anim-type"?: string;
        },
        HTMLElement
      >;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

interface SplineSceneProps {
  scene?: string;
  className?: string;
}

export function SplineScene({
  scene = "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode",
  className,
}: SplineSceneProps) {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Check if spline-viewer script is already loaded
    const scriptSrc = "https://unpkg.com/@splinetool/viewer@1.9.72/build/spline-viewer.js";
    const existing = document.querySelector(`script[src="${scriptSrc}"]`);

    if (existing) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src = scriptSrc;
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => setHasError(true);
    document.head.appendChild(script);
  }, []);

  return (
    <div className={cn("relative w-full h-full overflow-hidden select-none", className)}>
      {/* Loading State */}
      {!scriptLoaded && !hasError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300">
          <div className="relative flex items-center justify-center">
            <div className="w-14 h-14 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
            <Sparkles className="w-5 h-5 text-cyan-400 absolute animate-pulse" />
          </div>
          <p className="text-[11px] font-mono text-cyan-400 tracking-wider">
            INITIALIZING 3D ENGINE...
          </p>
        </div>
      )}

      {/* Error Fallback */}
      {hasError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center rounded-2xl bg-slate-900/80 border border-slate-800">
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-200">Interactive 3D Sentinel</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-xs font-mono">
            WebGL acceleration ready. Connect your custom .splinecode scene anytime.
          </p>
        </div>
      )}

      {/* Official Spline Web Component */}
      {scriptLoaded && (
        <spline-viewer
          url={scene}
          className="w-full h-full block cursor-grab active:cursor-grabbing"
        />
      )}
    </div>
  );
}
