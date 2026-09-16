"use client";
/**
 * PipelinePageShell — shared layout for all 6 pipeline execution pages.
 * Eliminates the code repetition that was identified as a quality gap.
 *
 * Usage:
 *   <PipelinePageShell
 *     title="Ticket Triage"
 *     icon={<Zap />}
 *     description="ITIL-classified ticket automation"
 *     controls={<>…form fields…</>}
 *     decisionLabel={(d) => d}      // optional custom label
 *   />
 */

import { useRef, useEffect, ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Square, Clock, Terminal } from "lucide-react";
import { usePipeline, type StepState } from "@/lib/usePipeline";
import type { RunPipelinePayload } from "@/lib/api";

const STATUS_CONFIG: Record<string, { color: string; dotColor: string; terminalClass: string }> = {
  STARTED:   { color: "text-blue-500",    dotColor: "bg-blue-500",    terminalClass: "terminal-line-started" },
  COMPLETED: { color: "text-emerald-600", dotColor: "bg-emerald-500", terminalClass: "terminal-line-completed" },
  RETRYING:  { color: "text-amber-600",   dotColor: "bg-amber-400",   terminalClass: "terminal-line-retrying" },
  FAILED:    { color: "text-red-600",     dotColor: "bg-red-500",     terminalClass: "terminal-line-failed" },
};

interface Props {
  title: string;
  icon: ReactNode;
  description: string;
  /** Render the form fields — receive { disabled } */
  controls: (args: { disabled: boolean }) => ReactNode;
  /** Build the payload to send when Run is clicked */
  buildPayload: () => RunPipelinePayload;
  /** Optional custom decision label, e.g. "AUTO-MERGED" for MergeGate */
  decisionLabel?: (decision: string) => string;
}

export function PipelinePageShell({ title, icon, description, controls, buildPayload, decisionLabel }: Props) {
  const { run, stop, streaming, steps, rawLog, result, error } = usePipeline();
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rawLog]);

  const labelFor = (d: string) => decisionLabel ? decisionLabel(d) : d;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Controls card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-primary">{icon}</span>{title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{description}</p>
          {controls({ disabled: streaming })}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 animate-fade-in">{error}</div>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={streaming} loading={streaming} onClick={() => run(buildPayload())}>
              <Play size={13} className="mr-1.5" />Run Pipeline
            </Button>
            {streaming && (
              <Button size="sm" variant="outline" onClick={stop}>
                <Square size={13} className="mr-1.5" />Stop
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live steps */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock size={14} className="text-primary" />Live Step Execution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {steps.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Clock size={16} className="text-primary/40" />
                </div>
                <p className="text-sm text-muted-foreground">Steps will appear here as the pipeline executes…</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {steps.map((s: StepState) => {
                  const cfg = STATUS_CONFIG[s.status] ?? { color: "text-foreground", dotColor: "bg-slate-400" };
                  return (
                    <div key={s.stepName} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0 step-connector hover:bg-accent/20 rounded-lg transition-colors duration-200 px-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2 h-2 rounded-full ${cfg.dotColor} ${s.status === "STARTED" ? "glow-pulse" : ""}`} style={{ color: s.status === "STARTED" ? "#3b82f6" : undefined }} />
                        <div>
                          <p className="text-sm font-mono font-medium text-foreground">{s.stepName}</p>
                          <p className="text-[11px] text-muted-foreground">{new Date(s.timestamp).toLocaleTimeString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.latencyMs !== undefined && (
                          <span className="text-xs text-muted-foreground tabular-nums">{s.latencyMs}ms</span>
                        )}
                        <span className={`text-xs font-semibold ${cfg.color}`}>
                          {s.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Result */}
        <Card>
          <CardHeader><CardTitle>Result</CardTitle></CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-3 animate-fade-in">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Decision</span>
                  <Badge variant={result.decision === "AUTO_RESOLVE" ? "success" : "warning"}>
                    {labelFor(result.decision)}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">CCEP Score</span>
                  <span className="font-bold tabular-nums text-foreground font-display text-lg metric-glow">{result.ccepScore.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={result.status === "COMPLETED" ? "success" : "destructive"}>{result.status}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Run ID</span>
                  <span className="text-xs font-mono text-muted-foreground">{result.runId.slice(0, 18)}…</span>
                </div>
                {/* Visual score bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>CCEP Score</span><span>Threshold 0.60</span>
                  </div>
                  <div className="h-2.5 bg-secondary rounded-full overflow-hidden relative">
                    <div
                      className={`h-full rounded-full score-bar-fill ${result.decision === "ESCALATE" ? "bg-gradient-to-r from-amber-400 to-amber-500" : "bg-gradient-to-r from-emerald-400 to-emerald-500"}`}
                      style={{ width: `${Math.min(result.ccepScore * 100, 100)}%` }}
                    />
                    <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/30" style={{ left: "60%" }} />
                  </div>
                </div>
              </div>
            ) : streaming ? (
              <div className="space-y-2.5">
                {[80, 60, 70].map((w, i) => (
                  <div key={i} className="h-5 rounded-full shimmer" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 space-y-2">
                <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center mx-auto">
                  <span className="text-violet-400 text-sm">◈</span>
                </div>
                <p className="text-sm text-muted-foreground">No result yet…</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SSE log — dark terminal */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal size={14} className="text-primary" />Live SSE Event Stream
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="terminal mx-4 mb-4">
            <div className="terminal-header">
              <div className="terminal-dot bg-red-400/80" />
              <div className="terminal-dot bg-amber-400/80" />
              <div className="terminal-dot bg-emerald-400/80" />
              <span className="text-[10px] text-violet-300/50 ml-2 font-mono">nexagent-sse</span>
            </div>
            <div className="terminal-body h-36 overflow-y-auto space-y-0.5">
              {rawLog.length === 0 ? (
                <p className="text-violet-400/50">$ awaiting pipeline execution…</p>
              ) : (
                rawLog.map((line, i) => {
                  const cls = line.includes("COMPLETED") ? "terminal-line-completed"
                    : line.includes("FAILED") ? "terminal-line-failed"
                    : line.includes("STARTED") ? "terminal-line-started"
                    : line.includes("RETRY") ? "terminal-line-retrying"
                    : "";
                  return <div key={i} className={cls || "text-violet-300/70"}>
                    <span className="text-violet-400/30 mr-2 select-none">{String(i + 1).padStart(2, "0")}</span>
                    {line}
                  </div>;
                })
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
