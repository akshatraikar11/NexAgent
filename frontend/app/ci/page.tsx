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
  const [runId, setRunId] = useState(RUNS[0].id);
  const [branch, setBranch] = useState(RUNS[0].b);

  return (
    <AppShell>
      <PipelinePageShell
        title="CI Test Triage Pipeline"
        icon={<GitBranch size={15} />}
        description="Fetch CI run → analyze failure (flaky vs regression) → CCEP → auto-retry or block PR + alert team"
        buildPayload={() => ({
          pipelineType: "CI_TRIAGE",
          ticketTitle: `CI Triage: ${runId} on ${branch}`,
          ticketDescription: `CI run ${runId} failed on branch ${branch}`,
          actionType: "status_change",
          metadata: { ciRunId: runId, branch },
        })}
        decisionLabel={(d) => d === "AUTO_RESOLVE" ? "🔁 FLAKY — AUTO RETRY" : "🚨 REGRESSION — ESCALATE"}
        controls={({ disabled }) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">CI Run</label>
              <select className="w-full h-9 rounded-xl border border-border bg-white/80 px-3 text-sm" value={runId}
                onChange={(e) => { const r = RUNS.find(x => x.id === e.target.value); if (r) { setRunId(r.id); setBranch(r.b); } }} disabled={disabled}>
                {RUNS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Branch</label>
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} disabled={disabled} />
            </div>
          </div>
        )}
      />
    </AppShell>
  );
}
