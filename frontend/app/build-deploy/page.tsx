"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PipelinePageShell } from "@/components/PipelinePageShell";
import { Input } from "@/components/ui/input";
import { Rocket } from "lucide-react";

const BUILDS = [
  { id: "BUILD-501", w: "deploy-staging.yml",    label: "BUILD-501 — Docker registry timeout (transient)" },
  { id: "BUILD-502", w: "deploy-production.yml", label: "BUILD-502 — Missing ENV key (config error)" },
  { id: "BUILD-503", w: "deploy-production.yml", label: "BUILD-503 — DNS resolution failure (transient)" },
  { id: "BUILD-504", w: "build-docker.yml",      label: "BUILD-504 — TypeScript compile error (code)" },
];

export default function BuildDeployPage() {
  const [buildId, setBuildId] = useState(BUILDS[0].id);
  const [workflow, setWorkflow] = useState(BUILDS[0].w);

  return (
    <AppShell>
      <PipelinePageShell
        title="Build / Deploy Triage"
        icon={<Rocket size={15} />}
        description="Fetch build → classify error type (transient vs config vs code) → CCEP → auto-retry or escalate to DevOps"
        buildPayload={() => ({
          pipelineType: "BUILD_DEPLOY",
          ticketTitle: `Build/Deploy: ${buildId}`,
          ticketDescription: `Build ${buildId} failed on workflow ${workflow}`,
          actionType: "prod_deploy",
          metadata: { buildId, workflow },
        })}
        decisionLabel={(d) => d === "AUTO_RESOLVE" ? "🔁 AUTO-RETRY" : "🚨 ESCALATE TO DEVOPS"}
        controls={({ disabled }) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Build ID</label>
              <select className="w-full h-9 rounded-xl border border-border bg-white/80 px-3 text-sm" value={buildId}
                onChange={(e) => { const b = BUILDS.find(x => x.id === e.target.value); if (b) { setBuildId(b.id); setWorkflow(b.w); } }} disabled={disabled}>
                {BUILDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Workflow</label>
              <Input value={workflow} onChange={(e) => setWorkflow(e.target.value)} disabled={disabled} />
            </div>
          </div>
        )}
      />
    </AppShell>
  );
}
