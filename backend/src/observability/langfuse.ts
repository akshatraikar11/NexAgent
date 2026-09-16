import { trace, SpanStatusCode } from '@opentelemetry/api';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let tracerProvider: NodeTracerProvider | null = null;
let isInitialized = false;

const tracer = () => trace.getTracer('nexagent-orchestrator', '1.0.0');

export function initLangfuseTracing(): void {
  if (isInitialized) return;

  try {
    if (config.langfuse.publicKey && config.langfuse.secretKey) {
      const processor = new LangfuseSpanProcessor({
        publicKey: config.langfuse.publicKey,
        secretKey: config.langfuse.secretKey,
        baseUrl: config.langfuse.baseUrl,
      });

      tracerProvider = new NodeTracerProvider({
        spanProcessors: [processor],
      });

      tracerProvider.register();
      logger.info('[LANGFUSE] Tracing initialized with OpenTelemetry SDK.');
    } else {
      logger.info('[LANGFUSE] Keys missing — tracing runs in no-op mode (spans still created locally).');
    }
  } catch (error) {
    logger.warn({ err: error }, '[LANGFUSE] Failed to initialize tracing processor.');
  } finally {
    isInitialized = true;
  }
}

export async function flushLangfuse(): Promise<void> {
  if (tracerProvider) {
    try {
      await tracerProvider.forceFlush();
    } catch (_) {}
  }
}

export interface StepTraceMetadata {
  runId: string;
  stepName: string;
  tool: string;
  action: string;
  status: 'STARTED' | 'COMPLETED' | 'FAILED' | 'RETRYING';
  attempt?: number;
  latencyMs?: number;
  error?: string;
  output?: unknown;
}

export interface CCEPTraceMetadata {
  runId: string;
  ccepScore: number;
  threshold: number;
  decision: string;
  modelConfidence: number;
  dualModelAgreed: boolean;
  cosineSimilarity: number;
  historicalErrorRate: number;
  guardrailFlagCount: number;
  actionReversibilityWeight: number;
  signalBreakdown?: Record<string, number>;
}

export function tracePipelineStep(meta: StepTraceMetadata): void {
  const span = tracer().startSpan(`pipeline.${meta.stepName}`, {
    attributes: {
      'nexagent.run_id': meta.runId,
      'nexagent.step': meta.stepName,
      'nexagent.tool': meta.tool,
      'nexagent.action': meta.action,
      'nexagent.status': meta.status,
      ...(meta.attempt !== undefined && { 'nexagent.attempt': meta.attempt }),
      ...(meta.latencyMs !== undefined && { 'nexagent.latency_ms': meta.latencyMs }),
    },
  });

  if (meta.status === 'FAILED') {
    span.setStatus({ code: SpanStatusCode.ERROR, message: meta.error });
    if (meta.error) span.setAttribute('nexagent.error', meta.error);
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }

  span.end();
}

export function traceCCEPDecision(meta: CCEPTraceMetadata): void {
  const span = tracer().startSpan('ccep.evaluate', {
    attributes: {
      'nexagent.run_id': meta.runId,
      'ccep.score': meta.ccepScore,
      'ccep.threshold': meta.threshold,
      'ccep.decision': meta.decision,
      'ccep.model_confidence': meta.modelConfidence,
      'ccep.dual_model_agreed': meta.dualModelAgreed,
      'ccep.cosine_similarity': meta.cosineSimilarity,
      'ccep.historical_error_rate': meta.historicalErrorRate,
      'ccep.guardrail_flag_count': meta.guardrailFlagCount,
      'ccep.action_reversibility': meta.actionReversibilityWeight,
      ...(meta.signalBreakdown && {
        'ccep.contrib_confidence': meta.signalBreakdown.modelConfidenceContribution ?? 0,
        'ccep.contrib_error_rate': meta.signalBreakdown.historicalErrorRateContribution ?? 0,
        'ccep.contrib_guardrails': meta.signalBreakdown.guardrailFlagsContribution ?? 0,
        'ccep.contrib_reversibility': meta.signalBreakdown.actionReversibilityContribution ?? 0,
      }),
    },
  });
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

export async function withStepSpan<T>(
  meta: Omit<StepTraceMetadata, 'status' | 'latencyMs'>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  tracePipelineStep({ ...meta, status: 'STARTED' });
  try {
    const result = await fn();
    tracePipelineStep({ ...meta, status: 'COMPLETED', latencyMs: Date.now() - start });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    tracePipelineStep({ ...meta, status: 'FAILED', latencyMs: Date.now() - start, error });
    throw err;
  }
}
