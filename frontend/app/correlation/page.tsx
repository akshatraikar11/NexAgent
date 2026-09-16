"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type AlertGroup } from "@/lib/api";
import { Link2, AlertTriangle, CheckCircle, GitBranch, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

const SEV_VARIANT: Record<string, "destructive" | "warning" | "default" | "secondary"> = {
  P0: "destructive", P1: "destructive",
  P2: "warning",
  P3: "default", P4: "secondary",
};

export default function CorrelationPage() {
  const [groups, setGroups] = useState<AlertGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  // Correlate form
  const [alertId, setAlertId] = useState("INC-TEST-001");
  const [alertTitle, setAlertTitle] = useState("Database connection pool exhausted");
  const [alertDesc, setAlertDesc] = useState("PostgreSQL connection pool at max capacity in us-east-1");
  const [severity, setSeverity] = useState("P1");
  const [correlating, setCorrelating] = useState(false);
  const [correlateResult, setCorrelateResult] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.correlation.groups()
      .then(setGroups)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function correlate() {
    setCorrelating(true);
    setCorrelateResult(null);
    try {
      const result = await api.correlation.correlate({
        alertId, alertTitle, alertDescription: alertDesc, severity, source: "SENTRY",
      });
      setCorrelateResult(
        result.action === "ADDED_TO_GROUP"
          ? `✓ Added to existing group (similarity: ${(result.similarityScore * 100).toFixed(0)}%)`
          : `✓ Created new group: ${result.group.title}`
      );
      load();
    } catch (e) {
      setCorrelateResult(`Error: ${String(e)}`);
    } finally {
      setCorrelating(false);
    }
  }

  async function resolve(id: string) {
    setResolving(id);
    try {
      await api.correlation.resolve(id);
      setGroups((prev) => prev.map((g) => g.id === id ? { ...g, status: "RESOLVED" } : g));
    } catch (e) { setError(String(e)); }
    finally { setResolving(null); }
  }

  const openGroups = groups.filter((g) => g.status === "OPEN");
  const resolvedGroups = groups.filter((g) => g.status === "RESOLVED");

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl animate-slide-up">
        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="flex items-center gap-3 pt-0">
            <div className="p-2.5 rounded-xl bg-primary/10"><Link2 size={16} className="text-primary" /></div>
            <div><p className="text-2xl font-bold">{groups.length}</p><p className="text-xs text-muted-foreground">Total Groups</p></div>
          </CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 pt-0">
            <div className="p-2.5 rounded-xl bg-amber-50"><AlertTriangle size={16} className="text-amber-600" /></div>
            <div><p className="text-2xl font-bold text-amber-600">{openGroups.length}</p><p className="text-xs text-muted-foreground">Open</p></div>
          </CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 pt-0">
            <div className="p-2.5 rounded-xl bg-emerald-50"><CheckCircle size={16} className="text-emerald-600" /></div>
            <div><p className="text-2xl font-bold text-emerald-600">{resolvedGroups.length}</p><p className="text-xs text-muted-foreground">Resolved</p></div>
          </CardContent></Card>
        </div>

        {/* Correlate new alert */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch size={15} className="text-primary" />Correlate New Alert
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Submit an alert to find related open groups (≥20% keyword overlap) or create a new group. Mirrors PagerDuty&apos;s alert grouping.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Alert ID</label>
                <Input value={alertId} onChange={(e) => setAlertId(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Severity</label>
                <select
                  className="w-full h-9 rounded-xl border border-border bg-white/80 px-3 text-sm focus:ring-2 focus:ring-ring"
                  value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  {["P0","P1","P2","P3","CRITICAL","HIGH","MEDIUM","LOW"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Alert Title</label>
                <Input value={alertTitle} onChange={(e) => setAlertTitle(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Description</label>
                <Input value={alertDesc} onChange={(e) => setAlertDesc(e.target.value)} />
              </div>
            </div>
            {correlateResult && (
              <div className={`text-xs px-3 py-2 rounded-lg ${correlateResult.startsWith("Error") ? "bg-red-50 text-red-600 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                {correlateResult}
              </div>
            )}
            <Button onClick={correlate} disabled={correlating} size="sm">
              <Link2 size={13} className="mr-1.5" />{correlating ? "Correlating…" : "Correlate Alert"}
            </Button>
          </CardContent>
        </Card>

        {/* Open groups */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Open Alert Groups ({openGroups.length})</h2>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw size={12} className="mr-1.5" />Refresh</Button>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : openGroups.length === 0 ? (
            <Card><CardContent className="py-12 text-center">
              <Link2 size={28} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No open alert groups. Correlate alerts above to create groups.</p>
            </CardContent></Card>
          ) : openGroups.map((g) => (
            <div key={g.id} className="glass-card rounded-2xl overflow-hidden">
              <button
                className="w-full flex items-start justify-between p-4 text-left hover:bg-accent/30 transition-colors"
                onClick={() => setExpanded(expanded === g.id ? null : g.id)}
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={SEV_VARIANT[g.severity] ?? "default"}>{g.severity}</Badge>
                    <span className="text-sm font-semibold text-foreground">{g.title}</span>
                    <Badge variant="warning">{g.memberCount} alert{g.memberCount !== 1 ? "s" : ""}</Badge>
                  </div>
                  {g.rootCause && (
                    <p className="text-xs text-muted-foreground">{g.rootCause}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {g.keywords.slice(0, 8).map((k) => (
                      <span key={k} className="text-[10px] bg-primary/8 text-primary border border-primary/15 rounded-full px-2 py-0.5">{k}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className="text-xs text-muted-foreground">{new Date(g.createdAt).toLocaleTimeString()}</span>
                  {expanded === g.id ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                </div>
              </button>

              {expanded === g.id && (
                <div className="border-t border-border/30 p-4 space-y-3 bg-accent/10">
                  {g.members && g.members.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Members</p>
                      {g.members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                          <div>
                            <p className="text-xs font-medium text-foreground">{m.alertTitle}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{m.alertId}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{m.source}</Badge>
                            <span className="text-[10px] text-muted-foreground">{new Date(m.joinedAt).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="outline" size="sm"
                    onClick={() => resolve(g.id)}
                    disabled={resolving === g.id}
                    className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  >
                    <CheckCircle size={12} className="mr-1.5" />
                    {resolving === g.id ? "Resolving…" : "Mark Group Resolved"}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Resolved groups (collapsed) */}
        {resolvedGroups.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-muted-foreground font-normal text-sm">
                Resolved Groups ({resolvedGroups.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {resolvedGroups.map((g) => (
                  <div key={g.id} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0 opacity-60">
                    <span className="text-xs text-foreground">{g.title}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="success">Resolved</Badge>
                      <span className="text-[10px] text-muted-foreground">{g.memberCount} alerts</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
