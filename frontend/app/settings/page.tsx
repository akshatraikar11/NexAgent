"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, type Settings } from "@/lib/api";
import { Save, RotateCcw } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [threshold, setThreshold] = useState("0.60");
  const [w1, setW1] = useState("0.35");
  const [w2, setW2] = useState("0.25");
  const [w3, setW3] = useState("0.20");
  const [w4, setW4] = useState("0.20");
  const [revMap, setRevMap] = useState("{}");

  useEffect(() => {
    api.settings.get()
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

      const wSum = parseFloat(w1) + parseFloat(w2) + parseFloat(w3) + parseFloat(w4);
      if (Math.abs(wSum - 1.0) > 0.01) {
        throw new Error(`Weights must sum to 1.0 (current sum: ${wSum.toFixed(4)})`);
      }

      const updated = await api.settings.update({
        ccepThreshold: parseFloat(threshold),
        weights: { w1: parseFloat(w1), w2: parseFloat(w2), w3: parseFloat(w3), w4: parseFloat(w4) },
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

  const wSum = [w1, w2, w3, w4].reduce((s, v) => s + parseFloat(v || "0"), 0);
  const wSumOk = Math.abs(wSum - 1.0) < 0.01;

  return (
    <AppShell>
      <div className="space-y-6 max-w-2xl">
        {error && <p className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{error}</p>}
        {saved && <p className="text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">Settings saved successfully.</p>}

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading settings…</p>
        ) : (
          <>
            {/* CCEP Threshold */}
            <Card>
              <CardHeader><CardTitle>CCEP Escalation Threshold</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  If CCEP score ≥ threshold, the decision is ESCALATE. Range: 0.0 – 1.0.
                </p>
                <div className="flex items-center gap-3">
                  <Input
                    type="number" step="0.01" min="0" max="1"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="w-32"
                  />
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${parseFloat(threshold) * 100}%` }} />
                  </div>
                  <span className="text-sm font-semibold w-12 text-right">{parseFloat(threshold).toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            {/* CCEP Weights */}
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
                      <Input type="number" step="0.01" min="0" max="1" value={value}
                        onChange={(e) => set(e.target.value)} className="w-24 h-7 text-xs" />
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
                  className="w-full h-40 bg-secondary/50 border border-border rounded-md p-3 text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                  value={revMap}
                  onChange={(e) => setRevMap(e.target.value)}
                />
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button onClick={save} disabled={saving || !wSumOk}>
                <Save size={14} className="mr-1.5" />{saving ? "Saving…" : "Save Settings"}
              </Button>
              <Button variant="outline" onClick={reset}>
                <RotateCcw size={14} className="mr-1.5" />Reset
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
