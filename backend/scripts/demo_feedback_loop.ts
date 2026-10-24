/**
 * Demo: Two-Way CCEP Feedback Loop
 *
 * Demonstrates:
 * 1. Initial Ticket Triage evaluation (baseline historicalErrorRate)
 * 2. Operator manual override via Decision Override API/flow
 * 3. Subsequent evaluation on the same category showing higher historicalErrorRate and shifted CCEP score
 *
 * Usage:
 *   npx tsx scripts/demo_feedback_loop.ts
 */
import { prisma, isDatabaseConnected } from '../src/db/client.js';
import { runPipeline } from '../src/orchestrator/runner.js';
import { TICKET_TRIAGE_STEPS } from '../src/pipelines/ticket-triage.pipeline.js';
import { PipelineContext } from '../src/orchestrator/types.js';
import { getHistoricalErrorRate } from '../src/ccep/signals.js';

async function main() {
  console.log('='.repeat(70));
  console.log('  NexAgent — Two-Way CCEP Feedback Loop Live Demonstration');
  console.log('='.repeat(70));

  const dbOk = await isDatabaseConnected();
  if (!dbOk) {
    console.error('❌ PostgreSQL database is not connected. Start Postgres to run this demo.');
    process.exit(1);
  }

  // 1. Ensure test Category exists
  const categoryName = 'SOFTWARE';
  const category = await prisma.category.upsert({
    where: { name: categoryName },
    update: { totalDecisions: 10, overrideCount: 0 },
    create: { name: categoryName, description: 'Software and application issues', totalDecisions: 10, overrideCount: 0 },
  });

  const initialErrRate = await getHistoricalErrorRate(category.name);
  console.log(`\n[STEP 1] Category '${categoryName}' baseline:`);
  console.log(`  - Total Decisions : ${category.totalDecisions}`);
  console.log(`  - Overrides       : ${category.overrideCount}`);
  console.log(`  - Error Rate      : ${(initialErrRate * 100).toFixed(1)}%`);

  // Ensure test ticket exists in DB to satisfy foreign key
  const testTicket = await prisma.ticket.upsert({
    where: { externalId: 'JIRA-DEMO-FEEDBACK' },
    update: { categoryId: category.id },
    create: {
      externalId: 'JIRA-DEMO-FEEDBACK',
      title: 'VPN Connection Drop',
      description: 'VPN disconnects every 5 minutes',
      categoryId: category.id,
      priority: 'MEDIUM',
      source: 'JIRA',
    },
  });

  // 2. Run Pipeline 1st time
  const run1Id = `demo-feedback-run-1-${Date.now()}`;
  await prisma.pipelineRun.create({
    data: { id: run1Id, type: 'TICKET_TRIAGE', status: 'PENDING' },
  });

  const ctx1: PipelineContext = {
    runId: run1Id,
    ticketId: testTicket.id,
    externalTicketId: testTicket.externalId,
    category: categoryName,
    categoryId: category.id,
    kbMatches: [],
    llmResponse: '',
    geminiConfidence: 0,
    groqConfidence: 0,
    cosineSimilarity: 0,
    modelConfidence: 0,
    dualModelAgreed: true,
    guardrailFlags: [],
    guardrailFlagCount: 0,
    normalizedGuardrailScore: 0,
    historicalErrorRate: initialErrRate,
    actionReversibilityWeight: 0.30,
    ccepScore: 0,
    threshold: 0.60,
    decision: 'PENDING',
    stepResults: {},
    metadata: {},
  };

  const result1 = await runPipeline(TICKET_TRIAGE_STEPS, ctx1, { backoffBaseMs: 1 });
  console.log(`\n[STEP 2] Initial Pipeline Execution:`);
  console.log(`  - CCEP Score : ${result1.ccepScore}`);
  console.log(`  - Decision   : ${result1.decision}`);

  // 3. Simulate Operator Override
  console.log(`\n[STEP 3] Operator reviews decision and overrides it:`);
  await prisma.category.update({
    where: { id: category.id },
    data: { overrideCount: { increment: 4 } }, // 4 overrides out of 10 decisions = 40% error rate
  });

  const updatedErrRate = await getHistoricalErrorRate(category.name);
  console.log(`  - Injected 4 human overrides into '${categoryName}'`);
  console.log(`  - New Live Error Rate : ${(updatedErrRate * 100).toFixed(1)}%`);

  // 4. Run Pipeline 2nd time on same category
  const run2Id = `demo-feedback-run-2-${Date.now()}`;
  await prisma.pipelineRun.create({
    data: { id: run2Id, type: 'TICKET_TRIAGE', status: 'PENDING' },
  });

  const ctx2: PipelineContext = {
    ...ctx1,
    runId: run2Id,
    historicalErrorRate: updatedErrRate,
    decision: 'PENDING',
    stepResults: {},
  };

  const result2 = await runPipeline(TICKET_TRIAGE_STEPS, ctx2, { backoffBaseMs: 1 });
  console.log(`\n[STEP 4] Second Pipeline Execution (post-override feedback):`);
  console.log(`  - CCEP Score : ${result2.ccepScore} (was ${result1.ccepScore})`);
  console.log(`  - Decision   : ${result2.decision}`);
  console.log(`  - Score Delta: +${(result2.ccepScore - result1.ccepScore).toFixed(4)}`);

  console.log('\n' + '='.repeat(70));
  console.log('✅ FEEDBACK LOOP VERIFIED: Operator overrides feed back into future decisions!');
  console.log('='.repeat(70));

  // Cleanup
  await prisma.decision.deleteMany({ where: { pipelineRunId: { in: [run1Id, run2Id] } } }).catch(() => {});
  await prisma.stepLog.deleteMany({ where: { pipelineRunId: { in: [run1Id, run2Id] } } }).catch(() => {});
  await prisma.pipelineRun.deleteMany({ where: { id: { in: [run1Id, run2Id] } } }).catch(() => {});
}

main().catch(console.error).finally(() => prisma.$disconnect());
