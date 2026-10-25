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
  const [isCustom, setIsCustom] = useState(false);
  const [customRunId, setCustomRunId] = useState("");
  const [buildId, setBuildId] = useState(BUILDS[0].id);
  const [workflow, setWorkflow] = useState(BUILDS[0].w);

  const activeBuildId = isCustom ? (customRunId ? `BUILD-${customRunId}` : "BUILD-1") : buildId;

  return (
    <AppShell>
      <PipelinePageShell
        title="Build / Deploy Triage"
        icon={<Rocket size={15} />}
        description="Fetch build → classify error type (transient vs config vs code) → CCEP → auto-retry or escalate to DevOps"
        buildPayload={() => ({
          pipelineType: "BUILD_DEPLOY",
          ticketTitle: `Build/Deploy: ${activeBuildId}`,
          ticketDescription: `Build ${activeBuildId} failed on workflow ${workflow}`,
          actionType: "prod_deploy",
          metadata: { buildId: activeBuildId, workflow },
        })}
        decisionLabel={(d) => d === "AUTO_RESOLVE" ? "🔁 AUTO-RETRY" : "🚨 ESCALATE TO DEVOPS"}
        controls={({ disabled }) => (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                <input
                  type="radio"
                  name="build-mode"
                  checked={!isCustom}
                  onChange={() => setIsCustom(false)}
                  disabled={disabled}
                  className="text-primary"
                />
                Demo Scenarios
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer font-medium text-emerald-600 dark:text-emerald-400">
                <input
                  type="radio"
                  name="build-mode"
                  checked={isCustom}
                  onChange={() => setIsCustom(true)}
                  disabled={disabled}
                  className="text-primary"
                />
                Live GitHub Actions Run (akshatraikar11/NexAgent)
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {!isCustom ? (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Select Preset</label>
                  <select
                    className="w-full h-9 rounded-xl border border-border bg-white/80 dark:bg-slate-900 px-3 text-sm"
                    value={buildId}
                    onChange={(e) => {
                      const b = BUILDS.find((x) => x.id === e.target.value);
                      if (b) {
                        setBuildId(b.id);
                        setWorkflow(b.w);
                      }
                    }}
                    disabled={disabled}
                  >
                    {BUILDS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">GitHub Actions Run ID</label>
                  <Input
                    placeholder="e.g. 11570766522 or 1"
                    value={customRunId}
                    onChange={(e) => setCustomRunId(e.target.value)}
                    disabled={disabled}
                  />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Workflow File</label>
                <Input
                  value={workflow}
                  placeholder="e.g. ci.yml or deploy.yml"
                  onChange={(e) => setWorkflow(e.target.value)}
                  disabled={disabled}
                />
              </div>
            </div>
          </div>
        )}
      />
    </AppShell>
  );
}
