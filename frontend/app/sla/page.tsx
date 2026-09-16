"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type TicketSLAEntry, type SLASummary } from "@/lib/api";
import { Clock, AlertTriangle, CheckCircle, XCircle, RefreshCw } from "lucide-react";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Overdue";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function formatOverdue(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m overdue`;
  return `${m}m overdue`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "BREACHED") return <Badge variant="destructive" className="gap-1"><XCircle size={10} />BREACHED</Badge>;
  if (status === "AT_RISK")  return <Badge variant="warning" className="gap-1"><AlertTriangle size={10} />AT RISK</Badge>;
  return <Badge variant="success" className="gap-1"><CheckCircle size={10} />ON TRACK</Badge>;
}

type SLAFilter = "ALL" | "BREACHED" | "AT_RISK" | "ON_TRACK";

export default function SLAPage() {
  const [entries, setEntries] = useState<TicketSLAEntry[]>([]);
  const [summary, setSummary] = useState<SLASummary | null>(null);
  const [filter, setFilter] = useState<SLAFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.sla.all().catch(() => []),
      api.sla.summary().catch(() => null),
    ]).then(([e, s]) => {
      setEntries(e as TicketSLAEntry[]);
      setSummary(s as SLASummary | null);
    }).catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Tick every second for countdowns
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = entries.filter((e) =>
    filter === "ALL" ? true : e.status === filter
  );

  const summaryCards = [
    { label: "Total Tracked", value: summary?.total ?? 0, color: "text-foreground bg-secondary", icon: <Clock size={16} /> },
    { label: "On Track",      value: summary?.ON_TRACK ?? 0, color: "text-emerald-600 bg-emerald-50", icon: <CheckCircle size={16} /> },
    { label: "At Risk",       value: summary?.AT_RISK ?? 0, color: "text-amber-600 bg-amber-50", icon: <AlertTriangle size={16} /> },
    { label: "Breached",      value: summary?.BREACHED ?? 0, color: "text-red-600 bg-red-50", icon: <XCircle size={16} /> },
  ];

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl animate-slide-up">
        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>}

        {/* Summary strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryCards.map((s) => (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-3 pt-0">
                <div className={`p-2.5 rounded-xl ${s.color.split(" ")[1]}`}>
                  <span className={s.color.split(" ")[0]}>{s.icon}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{loading ? "…" : s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters + refresh */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            {(["ALL","BREACHED","AT_RISK","ON_TRACK"] as SLAFilter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  filter === f
                    ? "bg-primary text-white border-primary shadow-[0_2px_8px_rgba(91,78,250,0.3)]"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}>
                {f.replace("_", " ")}
                {f !== "ALL" && summary && (
                  <span className="ml-1.5 opacity-70">
                    {f === "BREACHED" ? summary.BREACHED : f === "AT_RISK" ? summary.AT_RISK : summary.ON_TRACK}
                  </span>
                )}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw size={13} className="mr-1.5" />Refresh
          </Button>
        </div>

        {/* SLA table */}
        <Card>
          <CardHeader>
            <CardTitle>SLA Status <span className="text-muted-foreground font-normal text-sm ml-2">({filtered.length} tickets)</span></CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading SLA data…</p>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Clock size={32} className="mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {filter === "ALL"
                    ? "No SLA records found. Create tickets to start tracking SLAs."
                    : `No ${filter.replace("_", " ").toLowerCase()} tickets.`}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40">
                      {["Ticket", "Priority", "SLA", "Deadline", "Time Left", "Status"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => {
                      const msLeft = new Date(e.slaBreachAt).getTime() - now;
                      return (
                        <tr key={e.id} className="border-b border-border/20 hover:bg-accent/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground text-xs">{e.ticket?.title ?? e.ticketId.slice(0, 16) + "…"}</p>
                            <p className="text-xs text-muted-foreground font-mono">{e.ticket?.externalId ?? e.ticketId.slice(0, 8)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={
                              ["CRITICAL","P0","P1"].includes(e.priority) ? "destructive" :
                              ["HIGH","P2"].includes(e.priority) ? "warning" : "default"
                            }>{e.priority}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{e.slaHours}h</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(e.slaBreachAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-mono font-semibold ${
                              e.status === "BREACHED" ? "text-red-600" :
                              e.status === "AT_RISK" ? "text-amber-600" : "text-emerald-600"
                            }`}>
                              {e.status === "BREACHED"
                                ? formatOverdue(e.overdueMs ?? Math.abs(msLeft))
                                : formatCountdown(msLeft)}
                            </span>
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SLA Policy reference */}
        <Card>
          <CardHeader><CardTitle>SLA Policy Reference</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { p: "P1 / Critical", h: "1 hour",  color: "border-red-200 bg-red-50 text-red-700" },
                { p: "P2 / High",     h: "4 hours", color: "border-amber-200 bg-amber-50 text-amber-700" },
                { p: "P3 / Medium",   h: "8 hours", color: "border-blue-200 bg-blue-50 text-blue-700" },
                { p: "P4 / Low",      h: "24 hours",color: "border-border bg-secondary text-muted-foreground" },
              ].map((row) => (
                <div key={row.p} className={`rounded-xl border p-3 ${row.color}`}>
                  <p className="text-xs font-semibold">{row.p}</p>
                  <p className="text-lg font-bold mt-0.5">{row.h}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
