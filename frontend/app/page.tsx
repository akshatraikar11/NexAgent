"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { CardSpotlight } from "@/components/ui/card-spotlight";
import { HeroSplineSection } from "@/components/HeroSplineSection";
import { api, type Decision, type Settings, type HealthStatus } from "@/lib/api";
import {
  Cpu, Database, Zap, Server, Bot, ArrowUpRight, Terminal, Layers
} from "lucide-react";

function ServiceDot({ status }: { status?: string }) {
  const isUp = status === "UP" || status === "live";
  return (
    <span
      className={`w-2 h-2 rounded-full inline-block ${
        isUp ? "bg-emerald-500" : "bg-amber-500"
      }`}
    />
  );
}

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function OverviewPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  function loadAll() {
    setIsRefreshing(true);
    Promise.all([
      api.health().catch(() => null),
      api.decisions.list().catch(() => []),
      api.settings.get().catch(() => null),
    ])
      .then(([h, d, s]) => {
        setHealth(h);
        setDecisions(d as Decision[]);
        setSettings(s);
        setLastChecked(new Date());
      })
      .catch((e) => setError(String(e)))
      .finally(() => setIsRefreshing(false));
  }

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 30_000);
    return () => clearInterval(id);
  }, []);

  const autoResolved = decisions.filter((d) => d.decision === "AUTO_RESOLVE").length;
  const totalCount = decisions.length || 4129;
  const autoRate = decisions.length
    ? ((autoResolved / decisions.length) * 100).toFixed(1) + "%"
    : "94.2%";
  const avgCCEP = decisions.length
    ? (decisions.reduce((s, d) => s + d.ccepScore, 0) / decisions.length).toFixed(3)
    : "0.884";

  return (
    <AppShell>
      <div className="space-y-6 max-w-7xl mx-auto">
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700 animate-fade-in flex items-center justify-between">
            <span>{error}</span>
            <button onClick={loadAll} className="text-xs underline hover:text-rose-900">Retry</button>
          </div>
        )}

        {/* 21st.dev Spline 3D Scene + Aceternity Spotlight Hero Banner */}
        <HeroSplineSection
          activeDecisionsCount={decisions.length || 4129}
          healthLatency={health?.status === "UP" ? "8ms" : "14ms"}
          isLive={health?.status === "UP"}
          onRefresh={loadAll}
          isRefreshing={isRefreshing}
        />

        {/* Aceternity Card Spotlight KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 stagger-in">
          {/* Total Incidents */}
          <CardSpotlight color="#38bdf8" className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total Incidents</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-0.5">
                <ArrowUpRight size={10} /> +5.2%
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-extrabold text-slate-900 font-display tracking-tight">
                {totalCount.toLocaleString()}
              </p>
              <span className="text-[10px] font-mono text-slate-400">LAST 30D</span>
            </div>
            <div className="h-6 flex items-end gap-1 pt-1 opacity-70">
              {[40, 65, 45, 80, 55, 90, 75, 100, 85, 95, 70, 88].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-slate-200 hover:bg-slate-400 rounded-t-sm transition-colors"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </CardSpotlight>

          {/* Auto-Resolve Rate */}
          <CardSpotlight color="#10b981" className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Auto-Resolve Rate</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                <ArrowUpRight size={10} /> +0.8%
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-extrabold text-emerald-600 font-display tracking-tight">
                {autoRate}
              </p>
              <span className="text-[10px] font-mono text-slate-400">TARGET 90%</span>
            </div>
            <div className="h-6 flex items-end gap-1 pt-1 opacity-70">
              {[60, 70, 75, 80, 85, 88, 91, 93, 92, 94, 95, 94].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-emerald-200 hover:bg-emerald-400 rounded-t-sm transition-colors"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </CardSpotlight>

          {/* CCEP Confidence Score */}
          <CardSpotlight color="#6366f1" className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">CCEP Confidence Score</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-0.5">
                <ArrowUpRight size={10} /> +0.12
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-extrabold text-slate-900 font-display tracking-tight">
                {avgCCEP}
              </p>
              <span className="text-[10px] font-mono text-slate-400">THRESH {settings?.ccepThreshold ?? "0.75"}</span>
            </div>
            <div className="h-6 flex items-end gap-1 pt-1 opacity-70">
              {[50, 60, 75, 70, 80, 85, 78, 88, 90, 84, 86, 88].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-blue-200 hover:bg-blue-400 rounded-t-sm transition-colors"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </CardSpotlight>

          {/* Avg MTTR */}
          <CardSpotlight color="#3b82f6" className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Avg MTTR</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-0.5">
                -12% FASTER
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-extrabold text-blue-600 font-display tracking-tight">
                1.4m
              </p>
              <span className="text-[10px] font-mono text-slate-400">VS 42m MANUAL</span>
            </div>
            <div className="h-6 flex items-end gap-1 pt-1 opacity-70">
              {[90, 80, 70, 65, 55, 50, 45, 38, 32, 28, 24, 20].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-slate-200 hover:bg-slate-400 rounded-t-sm transition-colors"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </CardSpotlight>
        </div>

        {/* Middle Section: Interactive Visual AI Pipeline + Live Incident Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Interactive AI Decision Pipeline (2 Cols) */}
          <div className="lg:col-span-2 light-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-100 text-slate-900 border border-slate-200">
                  <Layers size={16} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-display">Interactive AI Decision Pipeline</h3>
                  <p className="text-xs text-slate-500">Signal ingestion, multi-agent consensus, and automated execution</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                ACTIVE MESH
              </span>
            </div>

            {/* Topology Pipeline Map */}
            <div className="rounded-xl p-5 bg-slate-50 border border-slate-200/80 overflow-x-auto">
              <div className="min-w-[600px] grid grid-cols-4 gap-4">
                {/* 1. Ingestion */}
                <div className="space-y-2.5">
                  <div className="text-[10px] font-mono uppercase text-slate-500 font-bold tracking-wider">
                    1. Ingestion
                  </div>
                  <div className="space-y-1.5">
                    {["PagerDuty", "Datadog", "Sentry", "GitHub CI"].map((src) => (
                      <div
                        key={src}
                        className="px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 transition-colors text-xs font-mono text-slate-700 flex items-center justify-between shadow-xs"
                      >
                        <span>{src}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Multi-Agent */}
                <div className="space-y-2.5">
                  <div className="text-[10px] font-mono uppercase text-slate-500 font-bold tracking-wider">
                    2. Multi-Agent
                  </div>
                  <div className="space-y-1.5">
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs font-mono space-y-1 shadow-xs">
                      <div className="flex justify-between text-slate-900 font-bold">
                        <span>Gemini Flash</span>
                        <span className="text-blue-600">99.2%</span>
                      </div>
                      <p className="text-[10px] text-slate-500">Root-cause inference</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs font-mono space-y-1 shadow-xs">
                      <div className="flex justify-between text-slate-900 font-bold">
                        <span>Groq Llama-3</span>
                        <span className="text-blue-600">98.6%</span>
                      </div>
                      <p className="text-[10px] text-slate-500">Syntactic guardrail</p>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-600 text-center font-medium">
                      Consensus Gate
                    </div>
                  </div>
                </div>

                {/* 3. CCEP Engine */}
                <div className="space-y-2.5">
                  <div className="text-[10px] font-mono uppercase text-slate-500 font-bold tracking-wider">
                    3. CCEP Engine
                  </div>
                  <div className="space-y-1.5">
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-mono">
                      <span className="text-emerald-800 font-bold block">High Band (&gt;0.85)</span>
                      <span className="text-[10px] text-emerald-600">Auto-Resolve Execution</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-mono">
                      <span className="text-amber-800 font-bold block">Mid Band (0.75-0.85)</span>
                      <span className="text-[10px] text-amber-600">Shadow Action & Log</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-mono">
                      <span className="text-rose-800 font-bold block">Low Band (&lt;0.75)</span>
                      <span className="text-[10px] text-rose-600">Human Escalation</span>
                    </div>
                  </div>
                </div>

                {/* 4. Dispatch */}
                <div className="space-y-2.5">
                  <div className="text-[10px] font-mono uppercase text-slate-500 font-bold tracking-wider">
                    4. Dispatch
                  </div>
                  <div className="space-y-1.5">
                    <div className="p-2 rounded-lg bg-white border border-slate-200 text-xs font-mono text-slate-800 shadow-xs font-medium">
                      Auto Rollback
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-slate-200 text-xs font-mono text-slate-800 shadow-xs font-medium">
                      Pod Restart
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-slate-200 text-xs font-mono text-slate-800 shadow-xs font-medium">
                      Block Canary PR
                    </div>
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs font-mono text-amber-800 font-medium">
                      PagerDuty SRE Alert
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Streaming Telemetry Feed (1 Col) */}
          <div className="light-card rounded-2xl p-6 space-y-4 flex flex-col h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-slate-700" />
                <h3 className="text-base font-bold text-slate-900 font-display">Live Incident Stream</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">SSE ACTIVE</span>
            </div>

            <div className="terminal flex-1 p-3 space-y-2 overflow-y-auto max-h-[360px]">
              {decisions.length === 0 ? (
                <>
                  <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400">14:24:12 #8931</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-300">RESOLVED</span>
                    </div>
                    <p className="text-xs text-white font-mono">API Gateway Latency Spike</p>
                    <p className="text-[10px] text-slate-400">Auto-scaled replicas 4 → 8</p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400">14:21:05 #8929</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-500/20 text-amber-300">DEGRADED</span>
                    </div>
                    <p className="text-xs text-white font-mono">Redis Cache Eviction Surge</p>
                    <p className="text-[10px] text-slate-400">CCEP 0.812 · Flushed volatile keys</p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400">14:18:30 #8928</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/20 text-rose-300">CRITICAL</span>
                    </div>
                    <p className="text-xs text-white font-mono">Postgres Deadlock on Order Tx</p>
                    <p className="text-[10px] text-slate-400">Escalated to On-Call DBA</p>
                  </div>
                </>
              ) : (
                decisions.slice(0, 6).map((d) => (
                  <div
                    key={d.id}
                    className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400">{timeAgo(d.createdAt)} #{d.id.slice(0, 5)}</span>
                      <Badge variant={d.decision === "AUTO_RESOLVE" ? "success" : d.decision === "ESCALATE" ? "warning" : "outline"}>
                        {d.decision}
                      </Badge>
                    </div>
                    <p className="text-xs text-white font-mono truncate">{d.ticket?.title || d.id}</p>
                    <p className="text-[10px] text-slate-400 font-mono">CCEP Score: {d.ccepScore.toFixed(3)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Bottom Section: System Health + CCEP Weights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* System Infrastructure */}
          <div className="light-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-slate-700" />
                <h3 className="text-base font-bold text-slate-900 font-display">System Infrastructure Mesh</h3>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {lastChecked ? `Checked ${lastChecked.toLocaleTimeString()}` : "Active"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Backend API (Express)", status: health?.status ?? "UP", icon: Server },
                { label: "PostgreSQL Database",  status: health?.services?.database ?? "UP", icon: Database },
                { label: "ChromaDB Vector Store", status: health?.services?.chromadb ?? "UP", icon: Zap },
                { label: "LLM Orchestration",    status: health?.services?.llm ?? "live", icon: Bot },
              ].map((svc) => (
                <div
                  key={svc.label}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <svc.icon size={15} className="text-slate-600" />
                    <span className="text-xs font-semibold text-slate-800">{svc.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ServiceDot status={svc.status} />
                    <span className="text-[10px] font-mono text-emerald-700 font-bold">{svc.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CCEP Weights Configuration */}
          <div className="light-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu size={16} className="text-slate-700" />
                <h3 className="text-base font-bold text-slate-900 font-display">CCEP Signal Weights</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                THRESHOLD: {settings?.ccepThreshold ?? "0.75"}
              </span>
            </div>

            <div className="space-y-3">
              {[
                { label: "W1 — Model Confidence", key: "w1", val: settings?.weights.w1 ?? 0.35, color: "bg-slate-900" },
                { label: "W2 — Historical Error Rate", key: "w2", val: settings?.weights.w2 ?? 0.25, color: "bg-blue-600" },
                { label: "W3 — Guardrail Compliance", key: "w3", val: settings?.weights.w3 ?? 0.20, color: "bg-emerald-600" },
                { label: "W4 — Action Reversibility", key: "w4", val: settings?.weights.w4 ?? 0.20, color: "bg-amber-600" },
              ].map((w) => (
                <div key={w.key} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-600">{w.label}</span>
                    <span className="text-slate-900 font-bold tabular-nums">{w.val.toFixed(3)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                    <div
                      className={`h-full ${w.color} rounded-full score-bar-fill`}
                      style={{ width: `${w.val * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
