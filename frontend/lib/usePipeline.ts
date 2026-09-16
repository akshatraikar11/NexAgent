"use client";
/**
 * usePipeline — shared hook for all 6 pipeline pages
 *
 * SSE-correct flow:
 *   1. POST /pipelines/run  → backend returns { runId } immediately (202)
 *   2. Connect EventSource to /sse/pipeline/:runId  (SSE is now live)
 *   3. Background: backend executes steps, emitting SSE events as each starts/completes
 *   4. On SSE close → GET /pipelines/:runId for final decision + ccepScore
 *
 * This fixes the timing bug where SSE connected AFTER all steps had finished.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { api, type RunPipelinePayload, type SSEEvent } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const POLL_INTERVAL_MS = 800;
const MAX_POLL_ATTEMPTS = 60; // 48 s max wait

export interface StepState {
  stepName: string;
  status: SSEEvent["status"];
  timestamp: string;
  latencyMs?: number;
  data?: unknown;
}

export interface PipelineResult {
  runId: string;
  decision: string;
  ccepScore: number;
  status: string;
}

export function usePipeline() {
  const [streaming, setStreaming] = useState(false);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [rawLog, setRawLog] = useState<string[]>([]);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState("");

  const esRef = useRef<EventSource | null>(null);
  const stepTimers = useRef<Record<string, number>>({});
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      esRef.current?.close();
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const stop = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    if (pollRef.current) clearTimeout(pollRef.current);
    setStreaming(false);
  }, []);

  // Poll GET /pipelines/:runId until status is COMPLETED or FAILED
  const pollForResult = useCallback((runId: string, attempt = 0) => {
    if (attempt >= MAX_POLL_ATTEMPTS) {
      setError("Pipeline timed out waiting for result.");
      setStreaming(false);
      return;
    }
    pollRef.current = setTimeout(async () => {
      try {
        const run = await api.pipelines.get(runId);
        if (run.status === "COMPLETED" || run.status === "FAILED") {
          setResult({
            runId,
            decision: (run as unknown as { decision: string }).decision ?? "PENDING",
            ccepScore: (run as unknown as { ccepScore: number }).ccepScore ?? 0,
            status: run.status,
          });
          setStreaming(false);
        } else {
          pollForResult(runId, attempt + 1);
        }
      } catch {
        pollForResult(runId, attempt + 1);
      }
    }, POLL_INTERVAL_MS);
  }, []);

  const run = useCallback(async (payload: RunPipelinePayload) => {
    setError("");
    setSteps([]);
    setRawLog([]);
    setResult(null);
    setStreaming(true);
    stepTimers.current = {};

    try {
      // Step 1: POST — backend returns { runId } immediately (202 Accepted)
      const runRes = await api.pipelines.run(payload);
      const runId = runRes.runId;

      // Step 2: Get a short-lived SSE token (browser EventSource can't set headers)
      let sseUrl = `${API_BASE}/sse/pipeline/${runId}`;
      try {
        const tokenRes = await api.sse.token();
        sseUrl = `${API_BASE}/sse/pipeline/${runId}?token=${encodeURIComponent(tokenRes.sseToken)}`;
      } catch {
        // fallback — will get 401 if auth required, handled in onerror
      }

      // Step 3: Connect SSE NOW — before steps start executing
      const es = new EventSource(sseUrl);
      esRef.current = es;

      es.addEventListener("pipeline-update", (e: MessageEvent) => {
        const evt: SSEEvent = JSON.parse(e.data as string);
        const ts = new Date(evt.timestamp).toLocaleTimeString();
        setRawLog((prev) => [...prev, `[${ts}] ${evt.stepName} → ${evt.status}`]);

        if (evt.status === "STARTED") {
          stepTimers.current[evt.stepName] = Date.now();
          setSteps((prev) => {
            if (prev.find((s) => s.stepName === evt.stepName)) {
              return prev.map((s) =>
                s.stepName === evt.stepName ? { ...s, status: evt.status, timestamp: evt.timestamp } : s
              );
            }
            return [...prev, { stepName: evt.stepName, status: evt.status, timestamp: evt.timestamp }];
          });
        } else {
          const latencyMs = stepTimers.current[evt.stepName]
            ? Date.now() - stepTimers.current[evt.stepName]
            : undefined;
          setSteps((prev) =>
            prev.map((s) =>
              s.stepName === evt.stepName ? { ...s, status: evt.status, latencyMs, data: evt.data } : s
            )
          );
        }
      });

      // Step 3: When SSE closes → poll for final result
      es.onerror = () => {
        setRawLog((prev) => [...prev, "[SSE] Stream closed — polling for result…"]);
        es.close();
        esRef.current = null;
        pollForResult(runId);
      };

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setStreaming(false);
    }
  }, [pollForResult]);

  return { run, stop, streaming, steps, rawLog, result, error };
}
