"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, type KBAnalytics } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";
import { Brain, BookOpen, Users, RefreshCw, ArrowRight } from "lucide-react";

const TOOLTIP_STYLE = {
  background: "rgba(255,255,255,0.95)",
  border: "1px solid rgba(99,102,241,0.15)",
  borderRadius: "12px",
  fontSize: 12,
};

const SECI_PHASES = [
  {
    phase: "Socialization",
    direction: "Tacit → Tacit",
    description: "Operator observes pipeline decision with full CCEP signal breakdown",
    icon: <Users size={18} />,
    color: "bg-violet-50 text-violet-600 border-violet-200",
    metric: "pipeline_runs",
  },
  {
    phase: "Externalization",
    direction: "Tacit → Explicit",
    description: "Human override recorded → overrideCount++ → historical_error_rate updated",
    icon: <Brain size={18} />,
    color: "bg-amber-50 text-amber-600 border-amber-200",
    metric: "overrides",
  },
  {
    phase: "Combination",
    direction: "Explicit → Explicit",
    description: "KB self-learning merges past resolutions into ChromaDB vector store",
    icon: <BookOpen size={18} />,
    color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    metric: "kb_entries",
  },
  {
    phase: "Internalization",
    direction: "Explicit → Tacit",
    description: "CCEP weights retrained on override data → system adapts behavior",
    icon: <RefreshCw size={18} />,
    color: "bg-primary/8 text-primary border-primary/20",
    metric: "conversion_rate",
  },
];

export default function KnowledgeAnalyticsPage() {
  const [data, setData] = useState<KBAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.kb.analytics()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const conversionPct = data ? Math.round(data.overrideConversionRate * 100) : 0;

  const seciMetrics = [
    data?.totalDecisions ?? 0,
    data?.totalOverrides ?? 0,
    data?.autoEntries ?? 0,
    conversionPct,
  ];

  const radialData = [{ name: "Conversion", value: conversionPct, fill: "#6366f1" }];

  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl animate-slide-up">
        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>}

        {/* Header explanation */}
        <Card className="border-primary/20">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Brain size={20} className="text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Knowledge Management Analytics (SECI Model)</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  NexAgent implements Nonaka & Takeuchi&apos;s SECI knowledge conversion cycle computationally.
                  This page visualizes how tacit expertise (human override decisions) is being converted into
                  explicit, reusable knowledge (KB entries and CCEP weight updates).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECI cycle visualization */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {SECI_PHASES.map((phase, i) => (
            <div key={phase.phase} className="relative">
              <Card className={`border ${phase.color.split(" ")[2] ?? "border-border"}`}>
                <CardContent className="pt-4 space-y-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${phase.color}`}>
                    {phase.icon}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground uppercase tracking-wide">{phase.phase}</p>
                    <p className="text-[10px] text-muted-foreground">{phase.direction}</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">{phase.description}</p>
                  <div className="pt-1">
                    <p className="text-2xl font-bold text-foreground">
                      {loading ? "…" : (
                        i === 3 ? `${seciMetrics[i]}%` : seciMetrics[i].toLocaleString()
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {["Pipeline runs","Human overrides","Auto-KB entries","Override→KB rate"][i]}
                    </p>
                  </div>
                </CardContent>
              </Card>
              {i < 3 && (
                <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                  <ArrowRight size={16} className="text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tacit-to-Explicit conversion gauge */}
          <Card>
            <CardHeader>
              <CardTitle>Tacit→Explicit Conversion Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                Percentage of human overrides that resulted in a new KB entry (quality-gated).
                Higher = more organizational tacit knowledge being externalized.
              </p>
              {loading ? (
                <div className="h-40 bg-secondary rounded-xl animate-pulse" />
              ) : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={160} height={160}>
                    <RadialBarChart
                      cx="50%" cy="50%" innerRadius="60%" outerRadius="90%"
                      data={radialData} startAngle={90} endAngle={-270}
                    >
                      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                      <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "#f1f5f9" }} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    <p className="text-4xl font-bold text-primary">{conversionPct}%</p>
                    <p className="text-sm text-muted-foreground">of overrides became KB entries</p>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>Total overrides: <span className="font-medium text-foreground">{data?.totalOverrides ?? 0}</span></p>
                      <p>Auto-learned entries: <span className="font-medium text-foreground">{data?.autoEntries ?? 0}</span></p>
                      <p>Manual entries: <span className="font-medium text-foreground">{data?.manualEntries ?? 0}</span></p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Most reused KB entries */}
          <Card>
            <CardHeader><CardTitle>Most Reused Knowledge (Top 5)</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                High reuse = high organizational value. These entries are reducing repetitive work.
              </p>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-secondary rounded-xl animate-pulse" />)}
                </div>
              ) : !data || data.topEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No KB entries yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.topEntries.map((entry, i) => (
                    <div key={entry.id} className="flex items-center gap-3 py-1.5 border-b border-border/20 last:border-0">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <p className="text-xs text-foreground flex-1 truncate">{entry.content}</p>
                      <Badge variant="secondary" className="shrink-0">{entry.timesReused}×</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category tacit knowledge signals */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Tacit Knowledge Signals by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                Categories with high override rates contain the most unexternalized tacit knowledge.
                These are areas where the system most needs human judgment — and where future KB entries
                will have the most impact. Signal strength: HIGH = 5+ overrides, MEDIUM = 3–5, LOW = 0–2.
              </p>
              {loading ? (
                <div className="h-52 bg-secondary rounded-xl animate-pulse" />
              ) : !data || data.categories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No category data yet.</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.categories} layout="vertical">
                      <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10, fill: "#8b93b3" }} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: "#8b93b3" }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`, "Override Rate"]} />
                      <Bar dataKey="overrideRate" fill="#f59e0b" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {data.categories.map((cat) => (
                      <div key={cat.id} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{cat.name}</p>
                          <p className="text-[10px] text-muted-foreground">{cat.overrideCount} overrides / {cat.totalDecisions} decisions</p>
                        </div>
                        <Badge variant={
                          cat.tacitSignalStrength === "HIGH" ? "warning" :
                          cat.tacitSignalStrength === "MEDIUM" ? "default" : "secondary"
                        } className="shrink-0 ml-2">
                          {cat.tacitSignalStrength}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SECI theory reference */}
        <Card className="bg-secondary/30">
          <CardContent className="pt-4">
            <p className="text-xs font-semibold text-foreground mb-2">Theoretical Foundation — Nonaka & Takeuchi (1995)</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The SECI model describes organizational knowledge creation through four conversion modes.
              NexAgent implements this computationally: operator overrides <span className="font-medium">(Socialization → Externalization)</span> feed
              into the historical_error_rate signal. Quality-gated KB ingestion implements <span className="font-medium">Combination</span>.
              CCEP weight retraining on accumulated data implements <span className="font-medium">Internalization</span>.
              The result is a system that continuously converts tacit engineering expertise into an improving, auditable escalation policy.
            </p>
            <p className="text-[10px] text-muted-foreground mt-2">
              Reference: Nonaka, I., & Takeuchi, H. (1995). <em>The Knowledge-Creating Company</em>. Oxford University Press.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
