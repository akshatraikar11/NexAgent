"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, type Settings } from "@/lib/api";
import { Save, RotateCcw, Radio, CheckCircle2, Copy, Shield, Activity } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form state
  const [threshold, setThreshold] = useState("0.32");
  const [w1, setW1] = useState("0.2562");
  const [w2, setW2] = useState("0.2260");
  const [w3, setW3] = useState("0.1677");
  const [w4, setW4] = useState("0.3502");
  const [revMap, setRevMap] = useState("{}");

  useEffect(() => {
    api.settings
      .get()
      .then((s) => {
        setSettings(s);
        setThreshold(String(s.ccepThreshold));
        setW1(String(s.weights.w1));
        setW2(String(s.weights.w2));
        setW3(String(s.weights.w3));
        setW4(String(s.weights.w4));
        setRevMap(JSON.stringify(s.reversibilityMap, null, 2));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function reset() {
    if (!settings) return;
    setThreshold(String(settings.ccepThreshold));
    setW1(String(settings.weights.w1));
    setW2(String(settings.weights.w2));
    setW3(String(settings.weights.w3));
    setW4(String(settings.weights.w4));
    setRevMap(JSON.stringify(settings.reversibilityMap, null, 2));
  }

  async function save() {
    setError("");
    setSaving(true);
    try {
      let revMapParsed: Record<string, number>;
      try {
        revMapParsed = JSON.parse(revMap);
      } catch {
        throw new Error("Invalid JSON in Reversibility Map");
      }
      const updated = await api.settings.update({
        ccepThreshold: parseFloat(threshold),
        weights: {
          w1: parseFloat(w1),
          w2: parseFloat(w2),
          w3: parseFloat(w3),
          w4: parseFloat(w4),
        },
        reversibilityMap: revMapParsed,
      });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const copyUrl = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const wSum = parseFloat(w1 || "0") + parseFloat(w2 || "0") + parseFloat(w3 || "0") + parseFloat(w4 || "0");
  const wSumOk = Math.abs(wSum - 1.0) < 0.005;

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl">
        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>}
        {saved && <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">Settings saved successfully.</div>}

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-40 rounded-xl shimmer" />
            ))}
          </div>
        ) : (
          <>
            {/* Inbound Webhooks Hub */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Radio size={16} className="text-primary animate-pulse" />
                    Inbound Webhook Listeners (Zero-Click Triggering)
                  </CardTitle>
                  <Badge variant="success">Dispatcher Active</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Connect these webhooks to trigger automated pipelines in real time without opening the browser.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  {/* GitHub */}
                  <div className="p-3 bg-secondary/40 border border-border/50 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">GitHub Webhook</span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-mono">
                        Active
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Auto-triggers MergeGate on PRs & CI Triage on test failures.</p>
                    <div className="flex items-center gap-1.5 pt-1">
                      <code className="text-[10px] bg-background/80 px-2 py-1 rounded border border-border flex-1 font-mono truncate">
                        http://localhost:3001/webhooks/github
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => copyUrl("http://localhost:3001/webhooks/github", "gh")}
                      >
                        {copiedKey === "gh" ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </Button>
                    </div>
                  </div>

                  {/* Sentry */}
                  <div className="p-3 bg-secondary/40 border border-border/50 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Sentry Alert Webhook</span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-mono">
                        Active
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Auto-triggers Incident Response on production exceptions.</p>
                    <div className="flex items-center gap-1.5 pt-1">
                      <code className="text-[10px] bg-background/80 px-2 py-1 rounded border border-border flex-1 font-mono truncate">
                        http://localhost:3001/webhooks/sentry
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => copyUrl("http://localhost:3001/webhooks/sentry", "sentry")}
                      >
                        {copiedKey === "sentry" ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </Button>
                    </div>
                  </div>

                  {/* Jira */}
                  <div className="p-3 bg-secondary/40 border border-border/50 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Jira Cloud Webhook</span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-mono">
                        Active
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Auto-triggers Ticket Triage & Host auto-remediation on new issues.</p>
                    <div className="flex items-center gap-1.5 pt-1">
                      <code className="text-[10px] bg-background/80 px-2 py-1 rounded border border-border flex-1 font-mono truncate">
                        http://localhost:3001/webhooks/jira
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => copyUrl("http://localhost:3001/webhooks/jira", "jira")}
                      >
                        {copiedKey === "jira" ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Threshold & Guardrails */}
            <Card>
              <CardHeader><CardTitle>CCEP Global Escalation Threshold</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Actions with CCEP score below this threshold are executed automatically. Higher scores escalate to human operators.
                </p>
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="w-32"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0.00 (Strict Human Sign-off)</span>
                      <span>Current: {parseFloat(threshold || "0").toFixed(2)}</span>
                      <span>1.00 (Fully Autonomous)</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${parseFloat(threshold || "0") * 100}%` }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Weights */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>CCEP Weights (w1–w4)</CardTitle>
                  <Badge variant={wSumOk ? "success" : "destructive"}>Sum: {wSum.toFixed(4)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Formula: score = w1×(1−conf) + w2×err + w3×min(flags,3)/3 + w4×rev. Weights must sum to 1.0.
                </p>
                {[
                  { label: "w1 — Model Confidence (1−conf)", value: w1, set: setW1 },
                  { label: "w2 — Historical Error Rate", value: w2, set: setW2 },
                  { label: "w3 — Guardrail Flag Count", value: w3, set: setW3 },
                  { label: "w4 — Action Reversibility", value: w4, set: setW4 },
                ].map(({ label, value, set }) => (
                  <div key={label} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">{label}</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className="w-24 h-7 text-xs"
                      />
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${parseFloat(value || "0") * 100}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Reversibility Map */}
            <Card>
              <CardHeader><CardTitle>Action Reversibility Map</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">JSON map of action_type → reversibility weight (0.0–1.0).</p>
                <textarea
                  className="w-full h-36 bg-secondary/50 border border-border rounded-md p-3 text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                  value={revMap}
                  onChange={(e) => setRevMap(e.target.value)}
                />
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button onClick={save} disabled={saving || !wSumOk}>
                <Save size={14} className="mr-1.5" />
                {saving ? "Saving…" : "Save Settings"}
              </Button>
              <Button variant="outline" onClick={reset}>
                <RotateCcw size={14} className="mr-1.5" />
                Reset
              </Button>
            </div>
            {settings && (
              <p className="text-xs text-muted-foreground">Last updated: {new Date(settings.updatedAt).toLocaleString()}</p>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
