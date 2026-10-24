import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process so host remediation verification fails
vi.mock('child_process', () => ({
  exec: vi.fn((cmd: any, cb: any) => {
    const s = String(cmd);
    if (s.includes('Clear-DnsClientCache')) {
      // Simulate DNS cache flush failure
      cb(new Error('Permission denied: cannot clear DNS cache'), { stdout: '', stderr: 'Permission denied' });
    } else {
      cb(null, { stdout: 'True\n', stderr: '' });
    }
  }),
}));

// Mock MCP connectors to avoid external network calls during unit/integration tests
vi.mock('../../src/mcp/jira.connector.js', () => ({
  JiraMCPConnector: vi.fn().mockImplementation(() => ({
    getIssue: vi.fn().mockResolvedValue({
      key: 'JIRA-NET-505',
      title: 'VPN DNS lookup failure',
      description: 'Host unable to resolve corporate internal VPN addresses',
      category: 'NETWORK',
      priority: 'HIGH',
    }),
    createComment: vi.fn().mockResolvedValue({ commentId: 'c-123' }),
    updateStatus: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

vi.mock('../../src/mcp/slack.connector.js', () => ({
  SlackMCPConnector: vi.fn().mockImplementation(() => ({
    postAlert: vi.fn().mockResolvedValue({ ts: '123.456', channel: '#it-escalations' }),
    postMessage: vi.fn().mockResolvedValue({ ts: '123.456', channel: '#it-support' }),
  })),
}));

import { TICKET_TRIAGE_STEPS } from '../../src/pipelines/ticket-triage.pipeline.js';
import { runPipeline } from '../../src/orchestrator/runner.js';
import { prisma, isDatabaseConnected } from '../../src/db/client.js';
import { makeTestCtx } from '../helpers/pipeline-context.js';

describe('Verification Failure Interception — AUTO_RESOLVE_FAILED_VERIFICATION Outcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('intercepts failed host verification, sets AUTO_RESOLVE_FAILED_VERIFICATION and escalates', async () => {
    const runId = `test-verif-failure-${Date.now()}`;
    const dbConnected = await isDatabaseConnected();
    if (dbConnected) {
      await prisma.pipelineRun.create({
        data: { id: runId, type: 'TICKET_TRIAGE', status: 'PENDING', context: {} },
      });
    }

    const initialContext = makeTestCtx({
      runId,
      pipelineType: 'TICKET_TRIAGE',
      externalTicketId: 'JIRA-NET-505',
      ticketTitle: 'VPN DNS lookup failure',
      ticketDescription: 'Host unable to resolve corporate internal VPN addresses',
      category: 'NETWORK',
      threshold: 0.34,
    });

    const finalContext = await runPipeline(TICKET_TRIAGE_STEPS, initialContext, { backoffBaseMs: 1 });

    if (dbConnected) {
      await prisma.decision.deleteMany({ where: { pipelineRunId: runId } });
      await prisma.stepLog.deleteMany({ where: { pipelineRunId: runId } });
      await prisma.pipelineRun.deleteMany({ where: { id: runId } });
    }

    // CCEP initially scored AUTO_RESOLVE due to low uncertainty and high reversibility
    expect(finalContext.ccepScore).toBeLessThan(0.34);

    // Because host remediation verification failed (DNS flush failed),
    // the pipeline MUST NOT claim AUTO_RESOLVE. It must record the distinct failure outcome!
    expect(finalContext.decision).toBe('AUTO_RESOLVE_FAILED_VERIFICATION');
    expect(finalContext.metadata['verificationFailed']).toBe(true);
    expect(Array.isArray(finalContext.metadata['verificationErrors'])).toBe(true);
    expect((finalContext.metadata['verificationErrors'] as string[]).some(e => e.includes('DNS flush failed'))).toBe(true);

    // The execution step result must indicate failure & escalation
    const execResult = finalContext.stepResults['execute_or_escalate'] as any;
    expect(execResult.action).toBe('AUTO_RESOLVE_FAILED_VERIFICATION');
    expect(execResult.liveHostTelemetry.verificationPassed).toBe(false);
  });
});

