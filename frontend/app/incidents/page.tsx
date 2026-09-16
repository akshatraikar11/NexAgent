"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PipelinePageShell } from "@/components/PipelinePageShell";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";

const PRESETS = [
  { id: "INC-8891", t: "Database Connection Timeout in Region US-East-1", d: "High severity alert: PostgreSQL connection pool exhausted. Active connections: 500/500." },
  { id: "INC-9901", t: "Payment processing service down — 100% error rate", d: "All payment API requests returning 503. Revenue impact $12k/hour." },
  { id: "INC-4401", t: "Memory Leak Detected — user-service pod", d: "K8s pod user-service-7d9f8b memory increasing from 512MB to 2.4GB. OOMKill imminent." },
  { id: "INC-7702", t: "Minor memory spike on staging worker", d: "Memory usage exceeded 80% threshold. No user impact." },
];

export default function IncidentsPage() {
  const [alertId, setAlertId] = useState("INC-8891");
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
          alertId,
          ticketTitle: title,
          ticketDescription: description,
          actionType: "prod_deploy",
        })}
        controls={({ disabled }) => (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p.id} disabled={disabled}
                  onClick={() => { setAlertId(p.id); setTitle(p.t); setDescription(p.d); }}
                  className="text-xs px-2.5 py-1 rounded-full bg-secondary border border-border text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors disabled:opacity-50">
                  {p.id}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Alert ID</label>
                <Input value={alertId} onChange={(e) => setAlertId(e.target.value)} disabled={disabled} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={disabled} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={disabled} />
            </div>
          </div>
        )}
      />
    </AppShell>
  );
}
