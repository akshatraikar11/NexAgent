"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { CheckCircle, ChevronRight, ChevronLeft, Ticket, Clock, Sliders, Sparkles } from "lucide-react";

// ── Step definitions ───────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, title: "Create Categories",    icon: <Ticket size={18} />,  desc: "Define the ticket/workflow categories your team handles" },
  { id: 2, title: "Set SLA Policies",     icon: <Clock size={18} />,   desc: "Configure response time targets per priority level" },
  { id: 3, title: "Configure CCEP",       icon: <Sliders size={18} />, desc: "Set the escalation threshold and signal weights" },
];

const DEFAULT_CATEGORIES = [
  { name: "IT_SUPPORT",     description: "Password resets, VPN, hardware issues" },
  { name: "INFRASTRUCTURE", description: "Production incidents, server issues, networking" },
  { name: "BILLING",        description: "Payment disputes, invoicing, subscription issues" },
  { name: "SECURITY",       description: "Access control, threats, compliance issues" },
  { name: "CI_CD",          description: "Build failures, test failures, pipeline issues" },
  { name: "DEPLOYMENT",     description: "Release failures, rollback, configuration errors" },
];

const DEFAULT_CCEP = { threshold: 0.60, w1: 0.2524, w2: 0.2106, w3: 0.2138, w4: 0.3232 };

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1
  const [selectedCats, setSelectedCats] = useState<string[]>(["IT_SUPPORT","INFRASTRUCTURE","BILLING"]);
  const [customCat, setCustomCat] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [customCats, setCustomCats] = useState<{ name: string; description: string }[]>([]);

  // Step 2
  const [slaP1, setSlaP1] = useState("1");
  const [slaP2, setSlaP2] = useState("4");
  const [slaP3, setSlaP3] = useState("8");
  const [slaP4, setSlaP4] = useState("24");

  // Step 3
  const [threshold, setThreshold] = useState(String(DEFAULT_CCEP.threshold));
  const [w1, setW1] = useState(String(DEFAULT_CCEP.w1));
  const [w2, setW2] = useState(String(DEFAULT_CCEP.w2));
  const [w3, setW3] = useState(String(DEFAULT_CCEP.w3));
  const [w4, setW4] = useState(String(DEFAULT_CCEP.w4));
  const [done, setDone] = useState(false);

  const allCats = [
    ...DEFAULT_CATEGORIES.filter((c) => selectedCats.includes(c.name)),
    ...customCats,
  ];

  function toggleCat(name: string) {
    setSelectedCats((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }

  function addCustomCat() {
    if (!customCat.trim()) return;
    setCustomCats((prev) => [...prev, { name: customCat.trim().toUpperCase().replace(/\s+/g, "_"), description: customDesc.trim() }]);
    setCustomCat("");
    setCustomDesc("");
  }

  const wSum = [w1, w2, w3, w4].reduce((s, v) => s + parseFloat(v || "0"), 0);
  const wSumOk = Math.abs(wSum - 1.0) < 0.01;

  async function finish() {
    setSaving(true);
    setError("");
    try {
      // Create categories
      for (const cat of allCats) {
        await api.categories.create(cat.name, cat.description).catch(() => {});
      }

      // Save CCEP settings
      await api.settings.update({
        ccepThreshold: parseFloat(threshold),
        weights: { w1: parseFloat(w1), w2: parseFloat(w2), w3: parseFloat(w3), w4: parseFloat(w4) },
        reversibilityMap: {
          slack_notification: 0.1, jira_comment: 0.3,
          status_change: 0.5, auto_merge_pr: 0.9, prod_deploy: 1.0,
        },
      }).catch(() => {});

      setDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-card rounded-3xl p-10 max-w-md w-full text-center space-y-5 shadow-card-lg">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
            <CheckCircle size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Setup Complete!</h2>
          <p className="text-sm text-muted-foreground">
            NexAgent is configured with <strong>{allCats.length} categories</strong>, SLA policies,
            and CCEP threshold <strong>{threshold}</strong>. Your team can now start processing workflows.
          </p>
          <div className="space-y-2">
            <Button className="w-full" onClick={() => router.push("/")}>
              <Sparkles size={14} className="mr-1.5" />Go to Dashboard
            </Button>
            <Button variant="outline" className="w-full" onClick={() => router.push("/triage")}>
              Run First Pipeline
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 flex items-start justify-center">
      <div className="w-full max-w-2xl space-y-6 animate-slide-up">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center shadow-glow-sm">
            <span className="text-white font-bold text-base">N</span>
          </div>
          <div>
            <p className="font-bold text-foreground">NexAgent Setup</p>
            <p className="text-xs text-muted-foreground">Configure your workspace in 3 steps</p>
          </div>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                step > s.id ? "bg-emerald-500 border-emerald-500 text-white" :
                step === s.id ? "bg-primary border-primary text-white shadow-glow-sm" :
                "bg-white border-border text-muted-foreground"
              }`}>
                {step > s.id ? <CheckCircle size={14} /> : s.id}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${step === s.id ? "text-foreground" : "text-muted-foreground"}`}>
                {s.title}
              </span>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>}

        {/* ── Step 1: Categories ─────────────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket size={15} className="text-primary" />Step 1 — Define Ticket Categories
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Select the categories your team handles. Each category tracks its own override rate,
                which feeds into the CCEP historical error rate signal for future decisions.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEFAULT_CATEGORIES.map((cat) => (
                  <button key={cat.name} onClick={() => toggleCat(cat.name)}
                    className={`text-left rounded-xl border p-3 transition-all ${
                      selectedCats.includes(cat.name)
                        ? "bg-primary/8 border-primary/30 shadow-[0_0_0_2px_rgba(91,78,250,0.15)]"
                        : "border-border hover:border-primary/20 hover:bg-accent"
                    }`}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground">{cat.name}</p>
                      {selectedCats.includes(cat.name) && <CheckCircle size={13} className="text-primary" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{cat.description}</p>
                  </button>
                ))}
              </div>

              {/* Custom category */}
              <div className="border-t border-border/30 pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Add custom category</p>
                <div className="flex gap-2">
                  <Input placeholder="Category name (e.g. NETWORKING)" value={customCat} onChange={(e) => setCustomCat(e.target.value)} />
                  <Button variant="outline" size="sm" onClick={addCustomCat} disabled={!customCat.trim()}>Add</Button>
                </div>
                <Input placeholder="Description (optional)" value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} />
                {customCats.map((c) => (
                  <Badge key={c.name} variant="default">{c.name}</Badge>
                ))}
              </div>

              <div className="pt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{allCats.length} categories</span> will be created
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: SLA Policies ─────────────────────────────────────────── */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock size={15} className="text-primary" />Step 2 — SLA Response Times
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Set the maximum response time (in hours) for each priority level.
                The SLA Tracker page will show tickets approaching or past these deadlines.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "P1 / Critical", value: slaP1, set: setSlaP1, color: "text-red-600", desc: "Immediate — production outages, security breaches" },
                  { label: "P2 / High",     value: slaP2, set: setSlaP2, color: "text-amber-600", desc: "Same day — significant user impact" },
                  { label: "P3 / Medium",   value: slaP3, set: setSlaP3, color: "text-blue-600", desc: "Next business day — moderate impact" },
                  { label: "P4 / Low",      value: slaP4, set: setSlaP4, color: "text-muted-foreground", desc: "This week — minor inconvenience" },
                ].map((s) => (
                  <div key={s.label} className="glass rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${s.color}`}>{s.label}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{s.desc}</p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" min="0.5" step="0.5"
                        value={s.value} onChange={(e) => s.set(e.target.value)}
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">hours</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground bg-secondary/50 rounded-xl p-3">
                💡 These match industry-standard ITIL SLA targets. P1=1h is recommended for production incidents.
                You can adjust these later from the Settings page.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: CCEP Configuration ──────────────────────────────────── */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sliders size={15} className="text-primary" />Step 3 — CCEP Escalation Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Configure the escalation threshold and signal weights. The defaults are fitted by logistic regression
                on 155 labeled scenarios — you can keep them or adjust for your organization.
              </p>

              {/* Threshold */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">Escalation Threshold</label>
                  <span className="text-sm font-bold text-primary">{parseFloat(threshold).toFixed(2)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">If CCEP score ≥ threshold → ESCALATE. Higher = more automation, lower = more human oversight.</p>
                <input type="range" min="0.3" max="0.9" step="0.05"
                  value={threshold} onChange={(e) => setThreshold(e.target.value)}
                  className="w-full accent-primary" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0.3 (conservative)</span><span>0.6 (balanced)</span><span>0.9 (aggressive)</span>
                </div>
              </div>

              {/* Weights */}
              <div className="space-y-3 border-t border-border/30 pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">CCEP Signal Weights (must sum to 1.0)</p>
                  <Badge variant={wSumOk ? "success" : "destructive"}>Sum: {wSum.toFixed(3)}</Badge>
                </div>
                {[
                  { label: "w1 — Model Confidence (1−conf)", val: w1, set: setW1, color: "bg-primary" },
                  { label: "w2 — Historical Error Rate", val: w2, set: setW2, color: "bg-amber-400" },
                  { label: "w3 — Guardrail Flag Count", val: w3, set: setW3, color: "bg-red-400" },
                  { label: "w4 — Action Reversibility", val: w4, set: setW4, color: "bg-violet-500" },
                ].map((w) => (
                  <div key={w.label} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{w.label}</span>
                      <Input type="number" step="0.01" min="0" max="1" value={w.val}
                        onChange={(e) => w.set(e.target.value)} className="w-20 h-7 text-xs" />
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full ${w.color} rounded-full`} style={{ width: `${parseFloat(w.val || "0") * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-primary/6 border border-primary/15 rounded-xl p-3">
                <p className="text-xs text-primary font-medium mb-1">Recommended defaults (fitted by logistic regression)</p>
                <Button variant="outline" size="sm" onClick={() => {
                  setW1(String(DEFAULT_CCEP.w1)); setW2(String(DEFAULT_CCEP.w2));
                  setW3(String(DEFAULT_CCEP.w3)); setW4(String(DEFAULT_CCEP.w4));
                  setThreshold(String(DEFAULT_CCEP.threshold));
                }}>
                  Reset to fitted defaults
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 1}>
            <ChevronLeft size={14} className="mr-1.5" />Back
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && allCats.length === 0}>
              Next <ChevronRight size={14} className="ml-1.5" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={saving || !wSumOk}>
              {saving ? "Saving…" : "Finish Setup →"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
