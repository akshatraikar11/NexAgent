"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PipelinePageShell } from "@/components/PipelinePageShell";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Radio, ShieldAlert, Sparkles } from "lucide-react";

const PRESETS = [
  { id: "INC-8891", t: "Database Connection Timeout in Region US-East-1", d: "High severity alert: PostgreSQL connection pool exhausted. Active connections: 500/500." },
  { id: "INC-9901", t: "Payment processing service down — 100% error rate", d: "All payment API requests returning 503. Revenue impact $12k/hour." },
  { id: "INC-4401", t: "Memory Leak Detected — user-service pod", d: "K8s pod user-service-7d9f8b memory increasing from 512MB to 2.4GB. OOMKill imminent." },
  { id: "INC-7702", t: "Minor memory spike on staging worker", d: "Memory usage exceeded 80% threshold. No user impact." },
];

const TEMPLATES = [
  {
    name: "💥 Redis OOM Outage",
    id: "SENTRY-REDIS-901",
    t: "Redis Cluster Out of Memory — Command Rejected",
    d: "OOM command not allowed when used memory > 'maxmemory'. 1,420 user session write requests failing per minute.",
  },
  {
    name: "💳 Stripe Webhook 500",
    id: "SENTRY-PAY-404",
    t: "Stripe Webhook Signature Verification Crash",
    d: "TypeError: Cannot read properties of undefined (reading 'rawBody') at verifyStripeSignature. Dropping payment events.",
  },
  {
    name: "🔐 Auth Spike",
    id: "SENTRY-AUTH-112",
    t: "Authentication Gateway Latency Surge > 4000ms",
    d: "JWT verification timeouts on auth-gateway. Cascading 504 Gateway Timeouts across all mobile app clients.",
  },
  {
    name: "⚠️ Worker Staging CPU",
    id: "SENTRY-STAGE-05",
    t: "Worker CPU spike on staging cluster",
    d: "Background queue worker CPU reached 85% during test fixture import. Staging only, zero customer impact.",
  },
];

export default function IncidentsPage() {
  const [isCustom, setIsCustom] = useState(false);
  const [alertId, setAlertId] = useState(PRESETS[0].id);
  const [title, setTitle] = useState(PRESETS[0].t);
  const [description, setDescription] = useState(PRESETS[0].d);

  return (
    <AppShell>
      <PipelinePageShell
        title="Incident Response Pipeline"
        icon={<AlertTriangle size={15} />}
        description="Sentry alert → P0-P3 severity → dual-LLM Incident Commander → guardrails → CCEP → auto-summary or SRE escalation"
        buildPayload={() => ({
          pipelineType: "INCIDENT_RESPONSE",
          alertId: isCustom ? alertId : alertId,
          ticketTitle: title,
          ticketDescription: description,
          actionType: "prod_deploy",
        })}
        decisionLabel={(d) => (d === "AUTO_RESOLVE" ? "🟢 AUTO-SUMMARY POSTED" : "🚨 ESCALATE TO SRE ON-CALL")}
        controls={({ disabled }) => (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                <input
                  type="radio"
                  name="incident-mode"
                  checked={!isCustom}
                  onChange={() => {
                    setIsCustom(false);
                    setAlertId(PRESETS[0].id);
                    setTitle(PRESETS[0].t);
                    setDescription(PRESETS[0].d);
                  }}
                  disabled={disabled}
                  className="text-primary"
                />
                Demo Scenarios
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer font-medium text-amber-600 dark:text-amber-400">
                <input
                  type="radio"
                  name="incident-mode"
                  checked={isCustom}
                  onChange={() => {
                    setIsCustom(true);
                    setAlertId("SENTRY-LIVE-001");
                    setTitle(TEMPLATES[0].t);
                    setDescription(TEMPLATES[0].d);
                  }}
                  disabled={disabled}
                  className="text-primary"
                />
                <Radio size={12} className="animate-pulse" />
                Live Production Alert / Sentry Incident Input
              </label>
            </div>

            {!isCustom ? (
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    disabled={disabled}
                    onClick={() => {
                      setAlertId(p.id);
                      setTitle(p.t);
                      setDescription(p.d);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                      alertId === p.id
                        ? "bg-primary/10 border-primary/40 text-foreground font-semibold"
                        : "bg-secondary border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {p.id}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    <Sparkles size={12} />
                    <span>Quick Production Templates:</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <ShieldAlert size={12} className="text-emerald-500" />
                    <span>Live Slack #sre-oncall dispatch ready</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setAlertId(tmpl.id);
                        setTitle(tmpl.t);
                        setDescription(tmpl.d);
                      }}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-background/80 border border-amber-500/30 hover:bg-amber-500/10 text-foreground transition-colors"
                    >
                      {tmpl.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Alert / Issue ID</label>
                <Input
                  value={alertId}
                  onChange={(e) => setAlertId(e.target.value)}
                  disabled={disabled}
                  placeholder="e.g. SENTRY-1204"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Incident Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={disabled}
                  placeholder="e.g. Database Connection Timeout"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description & Error Logs</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={disabled}
                rows={2}
                placeholder="Error logs, stack trace, impact description..."
                className="w-full text-xs rounded-md border border-input bg-transparent px-3 py-2 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
        )}
      />
    </AppShell>
  );
}
