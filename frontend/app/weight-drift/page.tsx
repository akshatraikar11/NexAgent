"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, type WeightHistoryEntry, type Settings } from "@/lib/api";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

const WEIGHT_COLORS = { w1: "#6366f1", w2: "#f59e0b", w3: "#ef4444", w4: "#10b981" };

const WEIGHT_LABELS: Record<string, string> = {
  w1: "w1 (Model Confidence)",
  w2: "w2 (Hist. Error Rate)",
  w3: "w3 (Guardrail Flags)",
  w4: "w4 (Action Reversibility)",
};

export default function WeightDriftPage() {
  const [history, setHistory] = useState<WeightHistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.settings.weightHistory().catch(() => []),
      api.settings.get().catch(() => null),
    ]).then(([h, s]) => {
      setHistory(h as WeightHistoryEntry[]);
      setSettings(s);
    }).catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Build chart data — each point is a history entry
  const chartData = history.map((h, i) => ({
    label: `#${i + 1} ${new Date(h.createdAt).toLocaleDateString()}`,
    w1: h.w1,
    w2: h.w2,
    w3: h.w3,
    w4: h.w4,
    source: h.source,
    timestamp: h.createdAt,
  }));

  // Latest vs fitted comparison
  const latest = history[history.length - 1];
  const current = settings?.weights;

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl">
        {error && <p className="text-destructive text-sm">{error}</p>}

        {/* Current weights */}
        {current && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(["w1", "w2", "w3", "w4"] as const).map((k) => (
              <Card key={k}>
                <CardContent className="pt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{k.toUpperCase()}</span>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: WEIGHT_COLORS[k] }} />
                  </div>
                  <p className="text-2xl font-bold tabular-nums">{current[k].toFixed(4)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{WEIGHT_LABELS[k].split(" ")[1]}</p>
                  {latest && (
                    <div className="mt-1">
                      {(() => {
                        const diff = current[k] - latest[k];
                        return diff !== 0 ? (
                          <span className={`text-xs ${diff > 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {diff > 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(4)}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">No change</span>;
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Weight drift line chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Weight Drift Over Time</CardTitle>
              <span className="text-xs text-muted-foreground">{history.length} entries from /settings/weight-history</span>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading weight history…</p>
            ) : chartData.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No weight history recorded yet.</p>
                <p className="text-xs text-muted-foreground">Update weights via Settings page to record history entries.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8b93b3" }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: "#8b93b3" }} tickFormatter={(v) => v.toFixed(2)} />
                  <Tooltip
                    contentStyle={{ background: "rgba(255,255,255,0.95)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: "12px", fontSize: 12 }}
                    formatter={(value: unknown, name: unknown) => [(Number(value)).toFixed(4), WEIGHT_LABELS[String(name)] ?? String(name)]}
                    labelFormatter={(label) => `Update: ${label}`}
                  />
                  <Legend formatter={(v) => WEIGHT_LABELS[v] ?? v} wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0.25} stroke="#475569" strokeDasharray="3 3" label={{ value: "0.25", fill: "#64748b", fontSize: 10 }} />
                  {(["w1", "w2", "w3", "w4"] as const).map((k) => (
                    <Line key={k} type="monotone" dataKey={k} stroke={WEIGHT_COLORS[k]}
                      strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* History table */}
        <Card>
          <CardHeader><CardTitle>Weight Change History</CardTitle></CardHeader>
          <CardContent className="p-0">
            {history.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">No history entries yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      {["#", "Timestamp", "w1", "w2", "w3", "w4", "Sum", "Source"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-muted-foreground font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((h, i) => {
                      const sum = h.w1 + h.w2 + h.w3 + h.w4;
                      const sumOk = Math.abs(sum - 1.0) < 0.01;
                      return (
                        <tr key={h.id} className="border-b border-border/30 hover:bg-accent/20">
                          <td className="px-4 py-2 text-muted-foreground">{history.length - i}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</td>
                          <td className="px-4 py-2 tabular-nums" style={{ color: WEIGHT_COLORS.w1 }}>{h.w1.toFixed(4)}</td>
                          <td className="px-4 py-2 tabular-nums" style={{ color: WEIGHT_COLORS.w2 }}>{h.w2.toFixed(4)}</td>
                          <td className="px-4 py-2 tabular-nums" style={{ color: WEIGHT_COLORS.w3 }}>{h.w3.toFixed(4)}</td>
                          <td className="px-4 py-2 tabular-nums" style={{ color: WEIGHT_COLORS.w4 }}>{h.w4.toFixed(4)}</td>
                          <td className="px-4 py-2">
                            <Badge variant={sumOk ? "success" : "destructive"}>{sum.toFixed(4)}</Badge>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{h.source}</td>
                        </tr>
                      );
                    })}
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
