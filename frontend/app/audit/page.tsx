"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api, type AuditLog } from "@/lib/api";
import { Search, ChevronDown, ChevronRight } from "lucide-react";

const ENTITY_TYPES = ["All", "Decision", "Ticket", "Settings", "KBEntry"];

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("All");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.audit.list()
      .then(setLogs)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter((l) => {
    const matchEntity = entityFilter === "All" || l.entityType === entityFilter;
    const matchSearch = !search ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.entityType.toLowerCase().includes(search.toLowerCase()) ||
      l.entityId.toLowerCase().includes(search.toLowerCase()) ||
      (l.actor?.email ?? "").toLowerCase().includes(search.toLowerCase());
    return matchEntity && matchSearch;
  });

  const actionColor: Record<string, string> = {
    HUMAN_OVERRIDE: "warning",
    PIPELINE_RUN: "default",
    SETTINGS_UPDATE: "secondary",
    KB_INGEST: "success",
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl">
        {error && <p className="text-destructive text-sm">{error}</p>}

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search by action, entity, actor…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {ENTITY_TYPES.map((t) => (
                <button key={t} onClick={() => setEntityFilter(t)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${entityFilter === t ? "bg-primary/20 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-border/80"}`}>
                  {t}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Audit Log <span className="text-muted-foreground font-normal text-sm">({filtered.length} entries)</span></CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">No audit logs found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium w-6"></th>
                      <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Timestamp</th>
                      <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Action</th>
                      <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Entity</th>
                      <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((log) => (
                      <>
                        <tr key={log.id}
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                          className="border-b border-border/30 hover:bg-accent/30 cursor-pointer transition-colors">
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {expanded === log.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant={(actionColor[log.action] ?? "outline") as "warning" | "default" | "secondary" | "success" | "outline" | "destructive"}>
                              {log.action}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs">{log.entityType}</span>
                            <span className="text-xs text-muted-foreground ml-1.5 font-mono">{log.entityId.slice(0, 10)}…</span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {log.actor?.email ?? "System"}
                          </td>
                        </tr>
                        {expanded === log.id && (
                          <tr key={`${log.id}-expanded`} className="bg-accent/10">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1.5">BEFORE</p>
                                  <pre className="text-xs bg-black/20 rounded p-2 overflow-x-auto max-h-32 text-amber-300/80">
                                    {log.before ? JSON.stringify(log.before, null, 2) : "null"}
                                  </pre>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1.5">AFTER</p>
                                  <pre className="text-xs bg-black/20 rounded p-2 overflow-x-auto max-h-32 text-emerald-300/80">
                                    {log.after ? JSON.stringify(log.after, null, 2) : "null"}
                                  </pre>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
