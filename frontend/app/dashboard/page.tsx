"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, type Decision, type Category } from "@/lib/api";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from "recharts";

const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444"];

const TOOLTIP_STYLE = {
  background: "rgba(255,255,255,0.95)",
  border: "1px solid rgba(99,102,241,0.15)",
  borderRadius: "12px",
  boxShadow: "0 4px 16px rgba(91,78,250,0.10)",
  fontSize: 12,
  backdropFilter: "blur(8px)",
};

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function DashboardPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.decisions.list().catch(() => []),
      api.categories.list().catch(() => []),
    ]).then(([d, c]) => {
      setDecisions(d as Decision[]);
      setCategories(c as Category[]);
    }).catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Decision outcome breakdown
  const autoResolved = decisions.filter((d) => d.decision === "AUTO_RESOLVE").length;
  const escalated = decisions.filter((d) => d.decision === "ESCALATE").length;
  const pending = decisions.filter((d) => d.decision === "PENDING").length;

  const pieData = [
    { name: "Auto Resolved", value: autoResolved },
    { name: "Escalated", value: escalated },
    { name: "Pending", value: pending },
  ].filter((d) => d.value > 0);

  // Category override rates
  const catBarData = categories.map((c) => ({
    name: c.name.length > 14 ? c.name.slice(0, 14) + "…" : c.name,
    overrideRate: c.totalDecisions > 0
      ? Number(((c.overrideCount / c.totalDecisions) * 100).toFixed(1))
      : 0,
    total: c.totalDecisions,
  }));

  // CCEP score distribution buckets
  const buckets: Record<string, number> = { "0.0–0.2": 0, "0.2–0.4": 0, "0.4–0.6": 0, "0.6–0.8": 0, "0.8–1.0": 0 };
  decisions.forEach((d) => {
    if (d.ccepScore < 0.2) buckets["0.0–0.2"]++;
    else if (d.ccepScore < 0.4) buckets["0.2–0.4"]++;
    else if (d.ccepScore < 0.6) buckets["0.4–0.6"]++;
    else if (d.ccepScore < 0.8) buckets["0.6–0.8"]++;
    else buckets["0.8–1.0"]++;
  });
  const scoreDistData = Object.entries(buckets).map(([range, count]) => ({ range, count }));

  // Recent 10 decisions for activity stream
  const recent = [...decisions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 10);

  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl">
        {error && <p className="text-destructive text-sm animate-fade-in">{error}</p>}

        {/* Metric strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-in">
          {[
            { label: "Total Decisions", value: decisions.length, color: "text-primary" },
            { label: "Auto Resolved", value: autoResolved, color: "text-emerald-600" },
            { label: "Escalated", value: escalated, color: "text-amber-600" },
            { label: "Categories", value: categories.length, color: "text-violet-600" },
          ].map((m) => (
            <Card key={m.label} className="glass-card-elevated">
              <CardContent className="pt-2">
                <p className={`text-3xl font-bold font-display ${m.color} metric-glow`}>{loading ? "…" : m.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-in">
          {/* Decision outcome pie */}
          <Card>
            <CardHeader><CardTitle>Decision Outcomes</CardTitle></CardHeader>
            <CardContent>
              {pieData.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                    <span className="text-primary/50 text-lg">◐</span>
                  </div>
                  <p className="text-sm text-muted-foreground">No decisions yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} innerRadius={35}
                      dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) =>
                        `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      stroke="rgba(255,255,255,0.6)" strokeWidth={2}>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* CCEP score distribution */}
          <Card>
            <CardHeader><CardTitle>CCEP Score Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={scoreDistData}>
                  <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#8b93b3" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#8b93b3" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(99,102,241,0.04)" }} />
                  <Bar dataKey="count" fill="url(#indigo-gradient)" radius={[6, 6, 0, 0]} />
                  <defs>
                    <linearGradient id="indigo-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Category override rates */}
          <Card>
            <CardHeader><CardTitle>Category Override Rates (%)</CardTitle></CardHeader>
            <CardContent>
              {catBarData.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mx-auto">
                    <span className="text-amber-400 text-lg">◫</span>
                  </div>
                  <p className="text-sm text-muted-foreground">No categories yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={catBarData} layout="vertical">
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#8b93b3" }} unit="%" axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: "#8b93b3" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(99,102,241,0.04)" }} />
                    <Bar dataKey="overrideRate" fill="url(#amber-gradient)" radius={[0, 6, 6, 0]} />
                    <defs>
                      <linearGradient id="amber-gradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#fbbf24" />
                        <stop offset="100%" stopColor="#f59e0b" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Live pipeline activity stream */}
          <Card>
            <CardHeader><CardTitle>Recent Pipeline Activity</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[1,2,3].map((i) => <div key={i} className="h-10 rounded-lg shimmer" />)}
                </div>
              ) : recent.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                    <span className="text-primary/50 text-lg">⚡</span>
                  </div>
                  <p className="text-sm text-muted-foreground">No activity yet</p>
                </div>
              ) : (
                <div className="space-y-0 max-h-56 overflow-y-auto pr-1">
                  {recent.map((d) => (
                    <div key={d.id} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0 timeline-dot hover:bg-accent/20 rounded-lg transition-colors duration-200 px-1">
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-foreground font-medium truncate">{d.id.slice(0, 16)}…</p>
                        <p className="text-[11px] text-muted-foreground">{timeAgo(d.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs text-muted-foreground tabular-nums">{d.ccepScore.toFixed(3)}</span>
                        <Badge variant={d.decision === "AUTO_RESOLVE" ? "success" : d.decision === "ESCALATE" ? "warning" : "outline"}>
                          {d.decision}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
