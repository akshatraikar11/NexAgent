"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type KBEntry } from "@/lib/api";
import { Search, ToggleLeft, ToggleRight, Plus, X, BookOpen, Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const TOOLTIP_STYLE = {
  background: "rgba(255,255,255,0.95)",
  border: "1px solid rgba(99,102,241,0.15)",
  borderRadius: "12px",
  fontSize: 12,
};

export default function KnowledgeBasePage() {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Manual entry form state
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [manualCategory, setManualCategory] = useState("GENERAL");
  const [manualConfidence, setManualConfidence] = useState("0.85");
  const [adding, setAdding] = useState(false);
  const [addSuccess, setAddSuccess] = useState("");

  function load() {
    setLoading(true);
    api.kb.list()
      .then(setEntries)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function toggleOverride(id: string) {
    try {
      const updated = await api.kb.toggleOverride(id);
      setEntries((prev) => prev.map((e) => e.id === id ? updated : e));
    } catch (e) { setError(String(e)); }
  }

  async function addManualEntry() {
    if (!manualTitle.trim() || !manualContent.trim()) return;
    setAdding(true);
    setAddSuccess("");
    try {
      await api.kb.createManual({
        title: manualTitle.trim(),
        content: manualContent.trim(),
        category: manualCategory,
        confidenceAtIngestion: parseFloat(manualConfidence),
      });
      setManualTitle("");
      setManualContent("");
      setManualCategory("GENERAL");
      setManualConfidence("0.85");
      setAddSuccess("KB entry added successfully.");
      setShowAddForm(false);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setAdding(false);
    }
  }

  const filtered = entries.filter((e) =>
    e.content.toLowerCase().includes(search.toLowerCase()) ||
    (e.sourceTicket?.title ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const autoEntries = entries.filter((e) => !e.embeddingId?.startsWith("kb-manual-"));
  const manualEntries = entries.filter((e) => e.embeddingId?.startsWith("kb-manual-"));

  const buckets: Record<string, number> = { "0–50%": 0, "50–70%": 0, "70–85%": 0, "85–95%": 0, "95–100%": 0 };
  entries.forEach((e) => {
    const c = e.confidenceAtIngestion;
    if (c < 0.5) buckets["0–50%"]++;
    else if (c < 0.7) buckets["50–70%"]++;
    else if (c < 0.85) buckets["70–85%"]++;
    else if (c < 0.95) buckets["85–95%"]++;
    else buckets["95–100%"]++;
  });
  const distData = Object.entries(buckets).map(([range, count]) => ({ range, count }));

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl animate-slide-up">
        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>}
        {addSuccess && <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">{addSuccess}</div>}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Total Entries", value: entries.length, color: "text-primary" },
            { label: "Auto-Learned", value: autoEntries.length, color: "text-violet-600" },
            { label: "Manually Added", value: manualEntries.length, color: "text-sky-600" },
            { label: "Active", value: entries.filter(e => !e.isOverridden).length, color: "text-emerald-600" },
            { label: "Total Reuses", value: entries.reduce((s, e) => s + e.timesReused, 0), color: "text-amber-600" },
          ].map((m) => (
            <Card key={m.label}>
              <CardContent className="pt-2">
                <p className={`text-2xl font-bold ${m.color}`}>{loading ? "…" : m.value}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* SECI model note */}
        <Card className="border-primary/20 bg-primary/4">
          <CardContent className="pt-4 flex items-start gap-3">
            <Sparkles size={18} className="text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">SECI Knowledge Model</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-primary">Auto-learned entries</span> come from the KB Self-Learning pipeline (Combination phase) —
                successful resolutions that passed the quality gate. &nbsp;
                <span className="font-medium text-sky-600">Manual entries</span> are explicit knowledge added directly by operators (Externalization phase) —
                documented solutions and known workarounds.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Manual Entry Form */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Plus size={15} className="text-primary" />Add Explicit Knowledge Entry
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(!showAddForm)}>
                {showAddForm ? <><X size={13} className="mr-1.5" />Cancel</> : <><Plus size={13} className="mr-1.5" />Add Entry</>}
              </Button>
            </div>
          </CardHeader>
          {showAddForm && (
            <CardContent className="space-y-4 border-t border-border/30 pt-4">
              <p className="text-xs text-muted-foreground">
                Document a known solution directly — no pipeline run needed. This implements the
                <span className="font-medium text-primary"> Externalization</span> phase of the SECI model,
                converting your tacit expertise into explicit, searchable knowledge.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Title / Problem Summary</label>
                  <Input
                    placeholder="e.g. VPN password reset procedure"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <select
                    className="w-full h-9 rounded-xl border border-border bg-white/80 px-3 text-sm"
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value)}
                  >
                    {["GENERAL","IT_SUPPORT","INFRASTRUCTURE","BILLING","SECURITY","CI_CD","DEPLOYMENT"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Solution / Resolution Steps</label>
                <textarea
                  className="w-full h-28 bg-white/80 border border-border rounded-xl p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Describe the resolution steps clearly. This will be used for semantic search when similar tickets arrive…"
                  value={manualContent}
                  onChange={(e) => setManualContent(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="space-y-1 w-40">
                  <label className="text-xs font-medium text-muted-foreground">Confidence (0–1)</label>
                  <Input
                    type="number" step="0.05" min="0" max="1"
                    value={manualConfidence}
                    onChange={(e) => setManualConfidence(e.target.value)}
                  />
                </div>
                <div className="flex-1" />
                <Button
                  onClick={addManualEntry}
                  disabled={adding || !manualTitle.trim() || !manualContent.trim()}
                >
                  <BookOpen size={14} className="mr-1.5" />
                  {adding ? "Adding…" : "Add to Knowledge Base"}
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Confidence distribution */}
        <Card>
          <CardHeader><CardTitle>Confidence Distribution at Ingestion</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={distData}>
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#8b93b3" }} />
                <YAxis tick={{ fontSize: 11, fill: "#8b93b3" }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Search + entries list */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle>KB Solutions ({filtered.length})</CardTitle>
              <div className="relative w-64">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search solutions…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-secondary rounded-xl animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <BookOpen size={32} className="mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No KB entries yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Run a KB Self-Learning pipeline or add an entry manually above.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((entry) => {
                  const isManual = entry.embeddingId?.startsWith("kb-manual-");
                  return (
                    <div key={entry.id} className={`glass rounded-xl p-4 space-y-2 transition-opacity ${entry.isOverridden ? "opacity-40" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm leading-relaxed flex-1 text-foreground">{entry.content}</p>
                        <Button variant="ghost" size="icon" onClick={() => toggleOverride(entry.id)}
                          title={entry.isOverridden ? "Re-enable" : "Override"}>
                          {entry.isOverridden
                            ? <ToggleLeft size={18} className="text-muted-foreground" />
                            : <ToggleRight size={18} className="text-emerald-500" />}
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Badge variant={isManual ? "default" : "secondary"} className="text-xs">
                          {isManual ? "📝 Manual" : "🤖 Auto-Learned"}
                        </Badge>
                        {entry.sourceTicket && (
                          <Badge variant="outline" className="text-xs">{entry.sourceTicket.title}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          Confidence: <span className="font-medium text-foreground">{(entry.confidenceAtIngestion * 100).toFixed(0)}%</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Reused: <span className="font-medium text-foreground">{entry.timesReused}×</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{new Date(entry.ingestedAt).toLocaleDateString()}</span>
                        {entry.isOverridden && <Badge variant="destructive">Overridden</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
