"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type Decision } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { CheckCircle, AlertTriangle, BarChart2, Lock } from "lucide-react";

export default function ApprovalsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overriding, setOverriding] = useState<string | null>(null);
  const [selected, setSelected] = useState<Decision | null>(null);

  useEffect(() => { load(); }, []);

  function load() {
    setLoading(true);
    api.decisions.list()
      .then((d) => {
        setDecisions(d.filter((dec) => dec.decision === "ESCALATE" && (!dec.humanOverrides || dec.humanOverrides.length === 0)));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  async function override(id: string, action: "AUTO_RESOLVE" | "ESCALATE") {
    if (!isAdmin) return;
    setOverriding(id);
    try {
      await api.decisions.override(id, action, `Operator override: ${action}`);
      load();
      if (selected?.id === id) setSelected(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setOverriding(null);
    }
  }

  const breakdown = selected?.signalBreakdown;

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl">
        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>}

        {/* Role notice for non-admins */}
        {!isAdmin && (
          <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Lock size={15} className="text-amber-600 shrink-0" />
            <p className="text-sm text-amber-700">
              You are viewing as <strong>{user?.role}</strong>. Override actions require <strong>ADMIN</strong> role.
              Contact your administrator to approve escalated tickets.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Escalated Tickets Awaiting Review</h2>
            <p className="text-sm text-muted-foreground">{decisions.length} pending decision{decisions.length !== 1 ? "s" : ""}</p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Queue list */}
          <div className="lg:col-span-2 space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-secondary rounded-2xl animate-pulse" />)}
              </div>
            ) : decisions.length === 0 ? (
              <Card><CardContent className="py-12 text-center">
                <CheckCircle size={32} className="text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No pending approvals. Queue is clear.</p>
              </CardContent></Card>
            ) : decisions.map((dec) => (
              <div key={dec.id}
                onClick={() => setSelected(selected?.id === dec.id ? null : dec)}
                className={`glass-card rounded-2xl p-4 cursor-pointer transition-all ${selected?.id === dec.id ? "border-primary/40" : "hover:border-border/60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                      <p className="text-sm font-medium text-foreground truncate">
                        {dec.ticket?.title ?? `Decision ${dec.id.slice(0, 12)}…`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs text-muted-foreground">CCEP: <span className="text-foreground font-semibold">{dec.ccepScore.toFixed(4)}</span></span>
                      <span className="text-xs text-muted-foreground">Threshold: {dec.threshold}</span>
                      <span className="text-xs text-muted-foreground">{new Date(dec.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Override buttons — only for ADMIN */}
                  {isAdmin ? (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline"
                        className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                        disabled={overriding === dec.id}
                        onClick={(e) => { e.stopPropagation(); override(dec.id, "AUTO_RESOLVE"); }}>
                        <CheckCircle size={13} className="mr-1" />Resolve
                      </Button>
                      <Button size="sm" variant="outline"
                        className="text-amber-600 border-amber-200 hover:bg-amber-50"
                        disabled={overriding === dec.id}
                        onClick={(e) => { e.stopPropagation(); override(dec.id, "ESCALATE"); }}>
                        <AlertTriangle size={13} className="mr-1" />Keep
                      </Button>
                    </div>
                  ) : (
                    <div className="shrink-0">
                      <Badge variant="secondary" className="gap-1">
                        <Lock size={10} />Admin only
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* CCEP signal breakdown panel */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BarChart2 size={14} />CCEP Signal Breakdown</CardTitle></CardHeader>
            <CardContent>
              {!selected ? (
                <p className="text-sm text-muted-foreground">Click a decision to see signal breakdown.</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">CCEP Score</span>
                    <span className="text-lg font-bold text-primary">{selected.ccepScore.toFixed(4)}</span>
                  </div>
                  <div className="h-px bg-border/50" />
                  {breakdown && [
                    { label: "Model Confidence", key: "modelConfidenceContribution", color: "bg-primary" },
                    { label: "Historical Error Rate", key: "historicalErrorRateContribution", color: "bg-amber-400" },
                    { label: "Guardrail Flags", key: "guardrailFlagsContribution", color: "bg-red-400" },
                    { label: "Action Reversibility", key: "actionReversibilityContribution", color: "bg-violet-500" },
                  ].map(({ label, key, color }) => {
                    const val = (breakdown as Record<string, number>)[key] ?? 0;
                    const pct = selected.ccepScore > 0 ? (val / selected.ccepScore) * 100 : 0;
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span>{val.toFixed(4)}</span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="h-px bg-border/50" />
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Model Confidence</span><span>{selected.modelConfidence.toFixed(3)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Dual Model Agreed</span><Badge variant={selected.dualModelAgreed ? "success" : "warning"}>{selected.dualModelAgreed ? "Yes" : "No"}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Guardrail Flags</span><span>{selected.guardrailFlagsCount}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Hist. Error Rate</span><span>{selected.historicalErrorRate.toFixed(3)}</span></div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
