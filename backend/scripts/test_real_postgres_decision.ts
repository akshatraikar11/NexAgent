/**
 * test_real_postgres_decision.ts
 *
 * Verifies live PostgreSQL integration:
 * 1. Executes a full Ticket Triage pipeline run against real PostgreSQL.
 * 2. Saves a real Decision record in PostgreSQL with AUTO_RESOLVE.
 * 3. Simulates host-remediation verification failure to exercise AUTO_RESOLVE_FAILED_VERIFICATION.
 * 4. Queries and prints both saved Decision records directly from PostgreSQL.
 */

import { prisma } from '../src/db/client.js';
import { runPipeline } from '../src/orchestrator/runner.js';
import { TICKET_TRIAGE_STEPS } from '../src/pipelines/ticket-triage.pipeline.js';
import { PipelineContext } from '../src/orchestrator/types.js';

async function main() {
  console.log('=== REAL POSTGRESQL DECISION PIPELINE TEST ===\n');

  // 1. Ensure category exists in PostgreSQL
  const category = await prisma.category.upsert({
    where: { name: 'HARDWARE' },
    update: {},
    create: {
      name: 'HARDWARE',
      description: 'Hardware and peripheral support',
      totalDecisions: 10,
      overrideCount: 1,
    },
  });
  console.log(`[DB] Category verified in Postgres: ${category.name} (${category.id})`);

  // 2. Create a test ticket in PostgreSQL
  const ticket = await prisma.ticket.upsert({
    where: { externalId: 'TEST-PG-101' },
    update: {},
    create: {
      externalId: 'TEST-PG-101',
      title: 'Monitor flickering on workstation',
      description: 'DisplayPort cable was loose; reseated cable and confirmed image is stable.',
      categoryId: category.id,
      priority: 'LOW',
      source: 'JIRA',
    },
  });
  console.log(`[DB] Ticket created in Postgres: ${ticket.externalId} (${ticket.id})`);

  // 3. Create a real PipelineRun row in PostgreSQL
  const pipelineRun1 = await prisma.pipelineRun.create({
    data: {
      type: 'TICKET_TRIAGE',
      status: 'RUNNING',
      context: {
        ticketId: ticket.id,
        externalTicketId: ticket.externalId,
        ticketTitle: ticket.title,
        ticketDescription: ticket.description,
        category: category.name,
      },
    },
  });
  console.log(`[DB] PipelineRun #1 created: ${pipelineRun1.id}`);

  // 4. Execute the pipeline steps against real Postgres
  const initialCtx1: PipelineContext = {
    runId: pipelineRun1.id,
    pipelineType: 'TICKET_TRIAGE',
    ticketId: ticket.id,
    externalTicketId: ticket.externalId,
    ticketTitle: ticket.title,
    ticketDescription: ticket.description,
    category: category.name,
    stepResults: {},
    metadata: {},
  };

  const finalCtx1 = await runPipeline(TICKET_TRIAGE_STEPS, initialCtx1, { backoffBaseMs: 50 });
  console.log(`[PIPELINE] Execution 1 complete. Decision: ${finalCtx1.decision}, CCEP Score: ${finalCtx1.ccepScore}`);

  // Query persisted Decision from Postgres
  const savedDecision1 = await prisma.decision.findFirst({
    where: { pipelineRunId: pipelineRun1.id },
  });
  console.log('\n--- PERSISTED DECISION RECORD #1 (Standard AUTO_RESOLVE / ESCALATE) ---');
  console.log(JSON.stringify(savedDecision1, null, 2));

  // 5. Test AUTO_RESOLVE_FAILED_VERIFICATION outcome persistence in real Postgres
  console.log('\n=== TESTING AUTO_RESOLVE_FAILED_VERIFICATION OUTCOME ===');
  const pipelineRun2 = await prisma.pipelineRun.create({
    data: {
      type: 'TICKET_TRIAGE',
      status: 'RUNNING',
      context: {
        ticketId: ticket.id,
        externalTicketId: 'TEST-PG-VERIF-FAIL',
        ticketTitle: 'VPN connection dropped abruptly',
        ticketDescription: 'Gateway unreachable after adapter reset',
        category: 'NETWORK',
      },
    },
  });

  // Persist a decision with the new enum value AUTO_RESOLVE_FAILED_VERIFICATION
  const savedDecision2 = await prisma.decision.create({
    data: {
      ticketId: ticket.id,
      pipelineRunId: pipelineRun2.id,
      ccepScore: 0.182,
      threshold: 0.34,
      decision: 'AUTO_RESOLVE_FAILED_VERIFICATION',
      modelConfidence: 0.92,
      dualModelAgreed: true,
      historicalErrorRate: 0.08,
      guardrailFlagsCount: 0,
      normalizedGuardrailScore: 0,
      actionReversibilityWeight: 0.1,
      signalBreakdown: {
        modelConfidenceContribution: 0.0205,
        historicalErrorRateContribution: 0.0181,
        guardrailFlagsContribution: 0,
        actionReversibilityContribution: 0.035,
        normalizedGuardrailScore: 0,
        verificationStatus: 'FAILED',
        failureReason: 'Host ping to gateway timed out after Clear-DnsClientCache',
      },
    },
  });

  console.log('\n--- PERSISTED DECISION RECORD #2 (AUTO_RESOLVE_FAILED_VERIFICATION) ---');
  console.log(JSON.stringify(savedDecision2, null, 2));

  // Verify querying the new enum from Postgres works without issue
  const countWithNewEnum = await prisma.decision.count({
    where: { decision: 'AUTO_RESOLVE_FAILED_VERIFICATION' },
  });
  console.log(`\n[DB VERIFICATION] Total decisions with AUTO_RESOLVE_FAILED_VERIFICATION in Postgres: ${countWithNewEnum}`);

  await prisma.$disconnect();
  console.log('\n✅ Real PostgreSQL verification completed successfully.');
}

main().catch(async (e) => {
  console.error('Test failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
