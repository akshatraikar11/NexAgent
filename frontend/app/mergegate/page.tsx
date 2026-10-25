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
  const [isCustom, setIsCustom] = useState(false);
  const [customPrNumber, setCustomPrNumber] = useState("1");
  const [pr, setPr] = useState(PRS[0]);

  const activePrNumber = isCustom ? (parseInt(customPrNumber, 10) || 1) : pr.n;
  const activeBranch = pr.b;

  return (
    <AppShell>
      <PipelinePageShell
        title="MergeGate PR Review"
        icon={<GitMerge size={15} />}
        description="Fetch PR → assess risk (touched modules, diff size, CI) → CCEP → auto-merge safe PRs, route risky ones to senior dev"
        buildPayload={() => ({
          pipelineType: "MERGEGATE",
          ticketTitle: `MergeGate PR #${activePrNumber}`,
          ticketDescription: `Review PR #${activePrNumber} on branch ${activeBranch}`,
          actionType: "auto_merge_pr",
          metadata: { prNumber: activePrNumber, branch: activeBranch },
        })}
        decisionLabel={(d) => d === "AUTO_RESOLVE" ? "✓ AUTO-MERGED" : "⚠ SENIOR REVIEW REQUIRED"}
        controls={({ disabled }) => (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                <input
                  type="radio"
                  name="pr-mode"
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
                  name="pr-mode"
                  checked={isCustom}
                  onChange={() => setIsCustom(true)}
                  disabled={disabled}
                  className="text-primary"
                />
                Live GitHub PR (akshatraikar11/NexAgent)
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {!isCustom ? (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Select Preset</label>
                  <select
                    className="w-full h-9 rounded-xl border border-border bg-white/80 dark:bg-slate-900 px-3 text-sm"
                    value={pr.n}
                    onChange={(e) => {
                      const p = PRS.find((x) => x.n === Number(e.target.value));
                      if (p) setPr(p);
                    }}
                    disabled={disabled}
                  >
                    {PRS.map((p) => (
                      <option key={p.n} value={p.n}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Real GitHub PR Number</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 1"
                    value={customPrNumber}
                    onChange={(e) => setCustomPrNumber(e.target.value)}
                    disabled={disabled}
                  />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Target Branch</label>
                <Input
                  value={pr.b}
                  placeholder="e.g. main or feature/demo"
                  onChange={(e) => setPr({ ...pr, b: e.target.value })}
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
