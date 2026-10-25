"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PipelinePageShell } from "@/components/PipelinePageShell";
import { Input } from "@/components/ui/input";
import { GitBranch } from "lucide-react";

const RUNS = [
  { id: "RUN-1001", b: "feature/payment-refactor", label: "RUN-1001 — Payment tests failing (regression)" },
  { id: "RUN-1002", b: "main",                     label: "RUN-1002 — Network timeout (flaky)" },
  { id: "RUN-1003", b: "feature/user-dashboard",   label: "RUN-1003 — E2E dashboard timeout (regression)" },
  { id: "RUN-1004", b: "main",                     label: "RUN-1004 — Security scan false positive (flaky)" },
];

export default function CITriagePage() {
  const [isCustom, setIsCustom] = useState(false);
  const [customRunId, setCustomRunId] = useState("");
  const [runId, setRunId] = useState(RUNS[0].id);
  const [branch, setBranch] = useState(RUNS[0].b);

  const activeRunId = isCustom ? (customRunId ? `RUN-${customRunId}` : "RUN-1") : runId;

  return (
    <AppShell>
      <PipelinePageShell
        title="CI Test Triage Pipeline"
        icon={<GitBranch size={15} />}
        description="Fetch CI run → analyze failure (flaky vs regression) → CCEP → auto-retry or block PR + alert team"
        buildPayload={() => ({
          pipelineType: "CI_TRIAGE",
          ticketTitle: `CI Triage: ${activeRunId} on ${branch}`,
          ticketDescription: `CI run ${activeRunId} failed on branch ${branch}`,
          actionType: "status_change",
          metadata: { ciRunId: activeRunId, branch },
        })}
        decisionLabel={(d) => d === "AUTO_RESOLVE" ? "🔁 FLAKY — AUTO RETRY" : "🚨 REGRESSION — ESCALATE"}
        controls={({ disabled }) => (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                <input
                  type="radio"
                  name="ci-mode"
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
                  name="ci-mode"
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
                    value={runId}
                    onChange={(e) => {
                      const r = RUNS.find((x) => x.id === e.target.value);
                      if (r) {
                        setRunId(r.id);
                        setBranch(r.b);
                      }
                    }}
                    disabled={disabled}
                  >
                    {RUNS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">GitHub Actions Run ID</label>
                  <Input
                    placeholder="e.g. 40212839530"
                    value={customRunId}
                    onChange={(e) => setCustomRunId(e.target.value)}
                    disabled={disabled}
                  />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Branch</label>
                <Input
                  value={branch}
                  placeholder="e.g. main or feature/branch"
                  onChange={(e) => setBranch(e.target.value)}
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
