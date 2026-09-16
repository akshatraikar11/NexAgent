"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PipelinePageShell } from "@/components/PipelinePageShell";
import { Input } from "@/components/ui/input";
import { GitMerge } from "lucide-react";

const PRS = [
  { n: 42,  b: "docs/update-readme",  label: "PR #42 — README update (low risk, safe to auto-merge)" },
  { n: 87,  b: "fix/user-profile-null",label: "PR #87 — Null pointer hotfix (low risk)" },
  { n: 99,  b: "feature/pci-refactor", label: "PR #99 — PCI refactor payments/ (high risk)" },
  { n: 112, b: "feature/oauth2-pkce",  label: "PR #112 — OAuth2 PKCE auth/ (high risk, CI failing)" },
];

export default function MergeGatePage() {
  const [pr, setPr] = useState(PRS[0]);

  return (
    <AppShell>
      <PipelinePageShell
        title="MergeGate PR Review"
        icon={<GitMerge size={15} />}
        description="Fetch PR → assess risk (touched modules, diff size, CI) → CCEP → auto-merge safe PRs, route risky ones to senior dev"
        buildPayload={() => ({
          pipelineType: "MERGEGATE",
          ticketTitle: `MergeGate PR #${pr.n}`,
          ticketDescription: `Review PR #${pr.n} on branch ${pr.b}`,
          actionType: "auto_merge_pr",
          metadata: { prNumber: pr.n, branch: pr.b },
        })}
        decisionLabel={(d) => d === "AUTO_RESOLVE" ? "✓ AUTO-MERGED" : "⚠ SENIOR REVIEW REQUIRED"}
        controls={({ disabled }) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Pull Request</label>
              <select className="w-full h-9 rounded-xl border border-border bg-white/80 px-3 text-sm" value={pr.n}
                onChange={(e) => { const p = PRS.find(x => x.n === Number(e.target.value)); if (p) setPr(p); }} disabled={disabled}>
                {PRS.map((p) => <option key={p.n} value={p.n}>{p.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Branch</label>
              <Input value={pr.b} onChange={(e) => setPr({ ...pr, b: e.target.value })} disabled={disabled} />
            </div>
          </div>
        )}
      />
    </AppShell>
  );
}
