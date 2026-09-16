"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, type Decision, type Settings } from "@/lib/api";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from "recharts";
import { AlertCircle, CheckCircle2, Search } from "lucide-react";

export default function CCEPPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selected, setSelected] = useState<Decision | null>(null);
  const [assertionError, setAssertionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.decisions.list().catch(() => []), api.settings.get().catch(() => null)])
      .then(([d, s]) => {
        setDecisions(d as Decision[]);
        setSettings(s);
      })
      .finally(() => setLoading(false));
  }, []);

  function selectDecision(dec: Decision) {
    setSelected(dec);

    // Dev-mode assertion: sum(contributions) == ccepScore (spec §10)
    const sb = dec.signalBreakdown;
    const sum = Number(
      (sb.modelConfidenceContribution + sb.historicalErrorRateContribution +
       sb.guardrailFlagsContribution + sb.actionReversibilityContribution).toFixed(4)
    );
    const diff = Math.abs(sum - dec.ccepScore);
    if (diff > 0.001) {
      setAssertionError(`⚠ Dev assertion FAIL: sum(contributions)=${sum} ≠ ccepScore=${dec.ccepScore} (diff=${diff.toFixed(6)})`);
    } else {
      setAssertionError(null);
    }
  }

  const sb = selected?.signalBreakdown;
  const radarData = sb ? [
    { signal: "1−Confidence", value: Number((sb.modelConfidenceContribution).toFixed(4)), weight: settings?.weights.w1 ?? 0 },
    { signal: "Hist. Error", value: Number((sb.historicalErrorRateContribution).toFixed(4)), weight: settings?.weights.w2 ?? 0 },
    { signal: "Guardrails", value: Number((sb.guardrailFlagsContribution).toFixed(4)), weight: settings?.weights.w3 ?? 0 },
    { signal: "Reversibility", value: Number((sb.actionReversibilityContribution).toFixed(4)), weight: settings?.weights.w4 ?? 0 },
  ] : [];

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Decision selector */}
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle className="flex items-center gap-2"><Search size={14} className="text-primary" />Select Decision</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[1,2,3,4,5].map((i) => <div key={i} className="h-12 rounded-lg shimmer" />)}
                </div>
              ) : decisions.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                    <Search size={18} className="text-primary/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">No decisions. Run a pipeline first.</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                  {decisions.slice(0, 50).map((d) => (
                    <button key={d.id} onClick={() => selectDecision(d)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 text-xs transition-all duration-200 ease-spring ${
                        selected?.id === d.id
                          ? "bg-primary/15 border border-primary/30 shadow-[0_0_12px_rgba(91,78,250,0.1)]"
                          : "hover:bg-accent/60 border border-transparent"
                      }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-muted-foreground">{d.id.slice(0, 12)}…</span>
                        <Badge variant={d.decision === "AUTO_RESOLVE" ? "success" : "warning"} className="text-xs">
                          {d.ccepScore.toFixed(3)}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground mt-0.5">{new Date(d.createdAt).toLocaleDateString()}</div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Explainability panel */}
          <div className="lg:col-span-2 space-y-4">
            {!selected ? (
              <Card>
                <CardContent className="py-16 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                    <span className="text-primary/40 text-xl">◈</span>
                  </div>
                  <p className="text-muted-foreground text-sm">Select a decision from the list to see its CCEP breakdown.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Dev assertion result */}
                {assertionError ? (
                  <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 animate-fade-in">
                    <AlertCircle size={14} />{assertionError}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 animate-fade-in">
                    <CheckCircle2 size={14} />Dev assertion PASS: sum(contributions) == ccepScore ({selected.ccepScore.toFixed(4)})
                  </div>
                )}

                {/* Score header */}
                <Card className="glass-card-elevated">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-primary font-display metric-glow">{selected.ccepScore.toFixed(4)}</p>
                        <p className="text-xs text-muted-foreground mt-1">CCEP Score</p>
                      </div>
                      <div className="text-center">
                        <p className="text-3xl font-bold font-display">{selected.threshold.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground mt-1">Threshold</p>
                      </div>
                      <div className="text-center">
                        <Badge variant={selected.decision === "AUTO_RESOLVE" ? "success" : "warning"} className="text-sm px-3 py-1">
                          {selected.decision}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1.5">Decision</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Signal breakdown bars */}
                <Card>
                  <CardHeader><CardTitle>Signal Contributions (w1–w4)</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {sb && [
                      { label: "w1 × (1−modelConfidence)", key: "modelConfidenceContribution", weight: settings?.weights.w1, color: "bg-primary", gradient: "from-indigo-400 to-primary" },
                      { label: "w2 × historicalErrorRate", key: "historicalErrorRateContribution", weight: settings?.weights.w2, color: "bg-amber-400", gradient: "from-amber-300 to-amber-500" },
                      { label: "w3 × min(flags,3)/3", key: "guardrailFlagsContribution", weight: settings?.weights.w3, color: "bg-red-400", gradient: "from-red-300 to-red-500" },
                      { label: "w4 × actionReversibility", key: "actionReversibilityContribution", weight: settings?.weights.w4, color: "bg-violet-400", gradient: "from-violet-300 to-violet-500" },
                    ].map(({ label, key, weight, gradient }) => {
                      const val = (sb as Record<string, number>)[key] ?? 0;
                      const maxPossible = weight ?? 0.25;
                      const pct = maxPossible > 0 ? Math.min((val / maxPossible) * 100, 100) : 0;
                      return (
                        <div key={key} className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-semibold tabular-nums">{val.toFixed(4)}</span>
                          </div>
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div className={`h-full bg-gradient-to-r ${gradient} rounded-full score-bar-fill`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex justify-between text-xs border-t border-border/50 pt-2 font-semibold">
                      <span>Total CCEP Score</span>
                      <span className="text-primary font-display">{selected.ccepScore.toFixed(4)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Radar chart */}
                <Card>
                  <CardHeader><CardTitle>Signal Radar</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="rgba(99,102,241,0.10)" />
                        <PolarAngleAxis dataKey="signal" tick={{ fontSize: 11, fill: "#8b93b3" }} />
                        <Radar name="Contribution" dataKey="value" stroke="#6366f1" fill="url(#radar-gradient)" fillOpacity={0.2} strokeWidth={2} />
                        <Tooltip contentStyle={{ background: "rgba(255,255,255,0.95)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: "12px", fontSize: 12, backdropFilter: "blur(8px)" }} />
                        <defs>
                          <linearGradient id="radar-gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#818cf8" />
                            <stop offset="100%" stopColor="#6366f1" />
                          </linearGradient>
                        </defs>
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Raw signals */}
                <Card>
                  <CardHeader><CardTitle>Raw Signal Values</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 text-xs">
                    {[
                      { label: "Model Confidence", value: selected.modelConfidence.toFixed(4) },
                      { label: "Dual Model Agreed", value: selected.dualModelAgreed ? "Yes" : "No" },
                      { label: "Historical Error Rate", value: selected.historicalErrorRate.toFixed(4) },
                      { label: "Guardrail Flags Count", value: String(selected.guardrailFlagsCount) },
                      { label: "Normalized Guardrail", value: selected.normalizedGuardrailScore.toFixed(4) },
                      { label: "Action Reversibility", value: selected.actionReversibilityWeight.toFixed(4) },
                    ].map(({ label, value }) => (
                      <div key={label} className="glass-card-interactive rounded-xl p-3">
                        <p className="text-muted-foreground">{label}</p>
                        <p className="font-semibold mt-1 tabular-nums font-display">{value}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
