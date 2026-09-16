import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/orchestrator/runner.js';
import { TICKET_TRIAGE_STEPS } from '../../src/pipelines/ticket-triage.pipeline.js';
import { PipelineContext } from '../../src/orchestrator/types.js';
import { sseManager, SSEEventData } from '../../src/sse/manager.js';

describe('SSE Streaming Engine - Concurrent Load Test (≥5 Runs)', () => {
  it('Executes 5 concurrent pipeline runs with 0 dropped events and strict per-ticket ordering', async () => {
    const runCount = 5;
    const receivedEventsByRun: Map<string, SSEEventData[]> = new Map();

    // Create 5 concurrent initial contexts
    const runs = Array.from({ length: runCount }).map((_, index) => {
      const runId = `sse-load-run-${index + 1}`;
      receivedEventsByRun.set(runId, []);

      const context: PipelineContext = {
        runId,
        ticketId: `JIRA-10${index + 1}`,
        externalTicketId: `JIRA-10${(index % 3) + 1}`,
        kbMatches: [],
        llmResponse: '',
        geminiConfidence: 0,
        groqConfidence: 0,
        cosineSimilarity: 0,
        modelConfidence: 0.9,
        dualModelAgreed: true,
        guardrailFlags: [],
        guardrailFlagCount: 0,
        normalizedGuardrailScore: 0,
        historicalErrorRate: 0.1,
        actionReversibilityWeight: 0.3,
        ccepScore: 0,
        threshold: 0.6,
        decision: 'PENDING',
        stepResults: {},
        metadata: {},
      };

      return { runId, context };
    });

    // Intercept SSE emissions for each run
    const originalEmitEvent = sseManager.emitEvent.bind(sseManager);
    sseManager.emitEvent = (runId: string, event: SSEEventData) => {
      const list = receivedEventsByRun.get(runId);
      if (list) {
        list.push(event);
      }
      originalEmitEvent(runId, event);
    };

    // Execute all 5 pipelines concurrently
    const results = await Promise.all(
      runs.map((r) => runPipeline(TICKET_TRIAGE_STEPS, r.context, { backoffBaseMs: 1 }))
    );

    expect(results).toHaveLength(5);

    // Verify per-run event ordering and zero dropped events
    const expectedStepOrder = [
      'fetch_ticket',
      'classify_itil',
      'search_kb',
      'generate_response',
      'run_guardrails',
      'ccep_evaluate',
      'execute_or_escalate',
    ];

    for (const r of runs) {
      const events = receivedEventsByRun.get(r.runId);
      expect(events).toBeDefined();
      
      // Each step emits at least STARTED and COMPLETED events -> at least 14 events per run
      expect(events!.length).toBeGreaterThanOrEqual(14);

      // Verify that step completion order matches expected sequence
      const completedSteps = events!
        .filter((e) => e.status === 'COMPLETED')
        .map((e) => e.stepName);

      expect(completedSteps).toEqual(expectedStepOrder);
    }

    // Restore emitEvent
    sseManager.emitEvent = originalEmitEvent;
  });
});
