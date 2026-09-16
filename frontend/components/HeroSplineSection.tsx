"use client";

import React from "react";
import Link from "next/link";
import { Spotlight } from "@/components/ui/spotlight";
import { SplineScene } from "@/components/ui/spline-scene";
import {
  ShieldCheck,
  Zap,
  ArrowRight,
  Cpu,
  RefreshCw,
  Sparkles,
} from "lucide-react";

interface HeroSplineSectionProps {
  activeDecisionsCount?: number;
  healthLatency?: string;
  isLive?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function HeroSplineSection({
  activeDecisionsCount = 0,
  healthLatency = "12ms",
  isLive = true,
  onRefresh,
  isRefreshing = false,
}: HeroSplineSectionProps) {
  return (
    <div className="relative w-full rounded-3xl overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border border-slate-800/80 shadow-2xl mb-8">
      {/* Aceternity Ambient Spotlight */}
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="#38bdf8"
      />
      <Spotlight
        className="top-10 right-0 md:right-40"
        fill="#818cf8"
      />

      {/* Cybernetic Background Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 min-h-[440px] items-center p-6 md:p-10 gap-8">
        {/* Left Column: Intelligence Telemetry & Action */}
        <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
          {/* Status Badge */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/20 text-cyan-300 text-xs font-mono">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
              </span>
              CCEP SENTINEL v2.4 • {isLive ? "MONITORING LIVE" : "IDLE"}
            </div>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-slate-300 text-xs font-mono">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              Latency: {healthLatency}
            </div>

            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-slate-200 text-xs transition-all"
                title="Refresh real-time telemetry"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`}
                />
                <span className="text-[11px] font-mono">Sync</span>
              </button>
            )}
          </div>

          {/* Heading with Modern Gradient */}
          <div className="space-y-3">
            <h1 className="text-3xl md:text-5xl font-extrabold font-display tracking-tight text-white leading-tight">
              Autonomous Triage.{" "}
              <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
                Calibrated Human-in-the-Loop.
              </span>
            </h1>
            <p className="text-slate-400 text-sm md:text-base max-w-xl font-sans leading-relaxed">
              NexAgent actively correlats multi-dimensional alerts, resolves
              high-confidence incidents via CCEP guardrails, and escalates edge
              cases with zero-drift telemetry.
            </p>
          </div>

          {/* Key Metric Micro-pills */}
          <div className="grid grid-cols-3 gap-3 pt-1 max-w-lg">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/90 backdrop-blur">
              <p className="text-[11px] font-mono text-slate-400">DECISIONS</p>
              <p className="text-xl font-bold font-display text-white mt-0.5">
                {activeDecisionsCount}
              </p>
              <p className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1 font-mono">
                <ShieldCheck className="w-3 h-3" /> CCEP Guarded
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/90 backdrop-blur">
              <p className="text-[11px] font-mono text-slate-400">AUTO-HEAL</p>
              <p className="text-xl font-bold font-display text-cyan-300 mt-0.5">
                94.2%
              </p>
              <p className="text-[10px] text-slate-400 font-mono mt-1">
                Zero human touch
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/90 backdrop-blur">
              <p className="text-[11px] font-mono text-slate-400">MTTR IMPACT</p>
              <p className="text-xl font-bold font-display text-indigo-300 mt-0.5">
                -78%
              </p>
              <p className="text-[10px] text-slate-400 font-mono mt-1">
                Vs manual triage
              </p>
            </div>
          </div>

          {/* CTA Group */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/triage"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium text-sm shadow-lg shadow-cyan-500/20 transition-all duration-200 group"
            >
              <Zap className="w-4 h-4" />
              Open Live Triage
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            <Link
              href="/correlation"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 text-slate-200 font-medium text-sm transition-colors"
            >
              View Incident Graph
            </Link>

            <Link
              href="/ccep"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 text-sm transition-colors font-mono text-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              CCEP Calibration
            </Link>
          </div>
        </div>

        {/* Right Column: 21st.dev Interactive 3D Spline Canvas */}
        <div className="lg:col-span-5 h-[340px] md:h-[420px] w-full relative rounded-2xl overflow-hidden bg-slate-950/60 border border-slate-800/60 flex flex-col justify-end">
          {/* Interactive Canvas */}
          <div className="absolute inset-0">
            <SplineScene
              scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
              className="w-full h-full"
            />
          </div>

          {/* Interactive Hint Pill */}
          <div className="relative z-10 m-4 p-2 px-3 rounded-lg bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-[11px] font-mono text-slate-300 flex items-center justify-between pointer-events-none">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              SPLINE 3D SENTINEL
            </span>
            <span className="text-slate-400">Click & Drag to Rotate</span>
          </div>
        </div>
      </div>
    </div>
  );
}
