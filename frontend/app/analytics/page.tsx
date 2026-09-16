"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, type AnalyticsSummary, type DecisionTrendPoint, type StepLatencyEntry } from "@/lib/api";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Cell,
} from "recharts";
import { TrendingUp, Zap, Users, BookOpen } from "lucide-react";

const PIPELINE_COLORS: Record<string, string> = {
  TICKET_TRIAGE:     "#6366f1",
  INCIDENT_RESPONSE: "#ef4444",
  CI_TRIAGE:         "#f59e0b",
  BUILD_DEPLOY:      "#8b5cf6",
  MERGEGATE:         "#10b981",
  KB_SELF_LEARNING:  "#06b6d4",
};

const PIPELINE_LABELS: Record<string, string> = {
  TICKET_TRIAGE:     "Ticket Triage",
  INCIDENT_RESPONSE: "Incident",
  CI_TRIAGE:         "CI Triage",
  BUILD_DEPLOY:      "Build/Deploy",
  MERGEGATE:         "MergeGate",
  KB_SELF_LEARNING:  "KB Learning",
};

const TOOLTIP_STYLE = {
  background: "rgba(255,255,255,0.95)",
  border: "1px solid rgba(99,102,241,0.15)",
  borderRadius: "12px",
  boxShadow: "0 4px 16px rgba(91,78,250,0.10)",
  fontSize: 12,
  backdropFilter: "blur(8px)",
};

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [trend, setTrend] = useState<DecisionTrendPoint[]>([]);
  const [latency, setLatency] = useState<StepLatencyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.analytics.summary().catch(() => null),
      api.analytics.trend().catch(() => []),
      api.analytics.stepLatency().catch(() => []),
    ]).then(([s, t, l]) => {
      setSummary(s);
      setTrend(t as DecisionTrendPoint[]);
      setLatency((l as StepLatencyEntry[]).slice(0, 10));
    }).catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const autoRateData = summary?.pipelines
    .filter((p) => p.totalRuns > 0)
    .map((p) => ({
      name: PIPELINE_LABELS[p.type] ?? p.type,
      rate: Number((p.autoResolveRate * 100).toFixed(1)),
      color: PIPELINE_COLORS[p.type] ?? "#6366f1",
      runs: p.totalRuns,
    })) ?? [];

  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 animate-fade-in">{error}</div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-in">
          {[
            { label: "Total Decisions", value: summary?.totals.decisions ?? "—", icon: <TrendingUp size={18} />, color: "text-primary", bg: "bg-primary/10" },
            { label: "Overall Auto-Resolve", value: summary ? `${(summary.totals.overallAutoResolveRate * 100).toFixed(1)}%` : "—", icon: <Zap size={18} />, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Human Overrides", value: summary?.totals.humanOverrides ?? "—", icon: <Users size={18} />, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Active KB Entries", value: summary?.totals.activeKBEntries ?? "—", icon: <BookOpen size={18} />, color: "text-violet-600", bg: "bg-violet-50" },
          ].map((m) => (
            <Card key={m.label} className="glass-card-elevated">
              <CardContent className="flex items-center gap-3 pt-0">
                <div className={`p-2.5 rounded-xl ${m.bg}`}>
                  <span className={m.color}>{m.icon}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground font-display metric-glow">{loading ? "…" : m.value}</p>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-in">
          {/* Auto-resolve rate per pipeline */}
          <Card>
            <CardHeader>
              <CardTitle>Auto-Resolve Rate by Pipeline (%)</CardTitle>
            </CardHeader>
            <CardContent>
              {autoRateData.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                    <Zap size={18} className="text-primary/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">Run some pipelines to see analytics.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={autoRateData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#8b93b3" }} unit="%" axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "#8b93b3" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, "Auto-Resolve Rate"]} cursor={{ fill: "rgba(99,102,241,0.04)" }} />
                    <Bar dataKey="rate" radius={[0, 8, 8, 0]}>
                      {autoRateData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Decision trend */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Decision Volume (14 days)</CardTitle>
            </CardHeader>
            <CardContent>
              {trend.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                    <TrendingUp size={18} className="text-primary/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">No trend data yet.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8b93b3" }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#8b93b3" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "rgba(99,102,241,0.15)", strokeWidth: 1 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="auto" stroke="#6366f1" strokeWidth={2.5} dot={false} name="Auto-Resolve" />
                    <Line type="monotone" dataKey="escalate" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="Escalated" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Step latency */}
          <Card>
            <CardHeader>
              <CardTitle>Avg Step Latency (ms)</CardTitle>
            </CardHeader>
            <CardContent>
              {latency.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center mx-auto">
                    <span className="text-violet-400">⏱</span>
                  </div>
                  <p className="text-sm text-muted-foreground">No step data yet.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={latency} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#8b93b3" }} unit="ms" axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="stepName" width={120} tick={{ fontSize: 10, fill: "#8b93b3" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}ms`, "Avg Latency"]} cursor={{ fill: "rgba(99,102,241,0.04)" }} />
                    <Bar dataKey="avgLatencyMs" fill="url(#violet-gradient)" radius={[0, 8, 8, 0]} name="Avg ms" />
                    <defs>
                      <linearGradient id="violet-gradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#a78bfa" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Per-pipeline table */}
          <Card>
            <CardHeader><CardTitle>Pipeline Breakdown</CardTitle></CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-2">
                  {[1,2,3].map((i) => <div key={i} className="h-8 rounded shimmer" />)}
                </div>
              ) : !summary || summary.pipelines.every((p) => p.totalRuns === 0) ? (
                <div className="text-center py-10 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                    <span className="text-primary/40 text-lg">◫</span>
                  </div>
                  <p className="text-sm text-muted-foreground">No pipeline runs yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40">
                        {["Pipeline", "Runs", "Auto", "Escalated", "Rate", "Avg CCEP"].map((h) => (
                          <th key={h} className="text-left px-4 py-2.5 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.pipelines.map((p) => (
                        <tr key={p.type} className="border-b border-border/20 hover:bg-accent/30 transition-colors duration-200 group">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full transition-transform duration-200 group-hover:scale-125" style={{ background: PIPELINE_COLORS[p.type] ?? "#6366f1" }} />
                              <span className="font-medium text-foreground">{PIPELINE_LABELS[p.type] ?? p.type}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{p.totalRuns}</td>
                          <td className="px-4 py-2.5 text-emerald-600 font-medium tabular-nums">{p.autoResolved}</td>
                          <td className="px-4 py-2.5 text-amber-600 font-medium tabular-nums">{p.escalated}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant={p.autoResolveRate >= 0.7 ? "success" : p.autoResolveRate >= 0.4 ? "default" : "warning"}>
                              {(p.autoResolveRate * 100).toFixed(0)}%
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground font-mono tabular-nums">{p.avgCCEPScore.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
