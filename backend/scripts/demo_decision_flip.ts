/**
 * demo_decision_flip.ts — Borderline ticket decision-flip demonstration
 *
 * Shows a ticket that sits below the threshold (0.3145 < 0.32), then flips
 * to ESCALATE (0.3425 >= 0.32) after human operators override the category three times.
 *
 * Mathematical Reconciliation (Prior vs Posterior):
 *   - The Bayesian Beta-Binomial prior is Beta(alpha=1, beta=9).
 *     Prior mean for unobserved categories (0 decisions): alpha/(alpha+beta) = 1/10 = 0.100 (10.0%).
 *   - The demo baseline category is seeded with 10 decisions and 0 overrides.
 *     Posterior error rate: (0 + alpha) / (10 + alpha + beta) = 1 / 20 = 0.050 (5.0%).
 *   - CCEP score before overrides (conf=0.50, err=0.050, flags=0, rev=0.50):
 *     CCEP = 0.2562*(1-0.50) + 0.2260*0.050 + 0 + 0.3502*0.50
 *          = 0.1281 + 0.0113 + 0 + 0.1751 = 0.3145
 *     theta = 0.32  ->  0.3145 < 0.32  ->  AUTO_RESOLVE  (margin = 0.0055 below)
 *
 *   - After 3 human overrides on 3 decisions (13 decisions, 3 overrides):
 *     Posterior error rate rises to: (3 + 1) / (13 + 1 + 9) = 4 / 23 = 0.1739 (17.4%).
 *     CCEP = 0.2562*(1-0.50) + 0.2260*0.1739 + 0 + 0.3502*0.50
 *          = 0.1281 + 0.0393 + 0 + 0.1751 = 0.3425
 *     0.3425 >= 0.32  ->  ESCALATE  (decision flipped)
 *
 * Usage (requires Postgres):
 *   npx tsx scripts/demo_decision_flip.ts
 */

import { prisma, isDatabaseConnected } from '../src/db/client.js';
import { computeCCEPScore } from '../src/ccep/scorer.js';
import { loadCCEPWeights } from '../src/ccep/weights.js';
import { getHistoricalErrorRate } from '../src/ccep/signals.js';
import { DEFAULT_CCEP_THRESHOLD } from '../src/ccep/constants.js';

async function main() {
  console.log('\n' + '='.repeat(68));
  console.log('  NexAgent — Borderline Ticket Decision-Flip Demonstration');
  console.log('  Shows how human overrides move a ticket across the threshold');
  console.log('='.repeat(68));

  const dbOk = await isDatabaseConnected();
  if (!dbOk) {
    console.error('Postgres not connected. Start with: docker run -d --name nexagent-pg ...');
    process.exit(1);
  }

  const weights = loadCCEPWeights();
  const theta = DEFAULT_CCEP_THRESHOLD;
  console.log(`\nWeights: w1=${weights.w1} w2=${weights.w2} w3=${weights.w3} w4=${weights.w4}`);
  console.log(`Threshold: theta=${theta}`);

  // --- Setup category with known baseline ---
  const catName = 'HELPDESK_FLIP_DEMO';
  const cat = await prisma.category.upsert({
    where: { name: catName },
    update: { totalDecisions: 10, overrideCount: 0 },
    create: { name: catName, description: 'Demo category for flip test', totalDecisions: 10, overrideCount: 0 },
  });

  // --- BEFORE: baseline evaluation ---
  const errBefore = await getHistoricalErrorRate(cat.name);
  const signalsBefore = {
    modelConfidence: 0.50,      // moderate confidence
    historicalErrorRate: errBefore,
    guardrailFlagCount: 0,
    actionReversibilityWeight: 0.5,  // status_change
  };
  const resultBefore = computeCCEPScore(signalsBefore, weights, theta);

  console.log('\n--- BEFORE OVERRIDES ---');
  console.log(`  Category '${catName}': totalDecisions=${cat.totalDecisions}, overrides=${cat.overrideCount}`);
  console.log(`  Bayesian err rate: ${(errBefore * 100).toFixed(1)}%`);
  console.log(`  Signals: conf=${signalsBefore.modelConfidence} err=${errBefore.toFixed(3)} flags=0 rev=0.5`);
  console.log(`  CCEP score: ${resultBefore.ccepScore}  (threshold: ${theta})`);
  console.log(`  Decision: ${resultBefore.decision}  (margin from threshold: ${(resultBefore.ccepScore - theta).toFixed(4)})`);
  console.log(`  Signal breakdown:`);
  console.log(`    w1*(1-conf): ${resultBefore.signalBreakdown!.modelConfidenceContribution}`);
  console.log(`    w2*err:      ${resultBefore.signalBreakdown!.historicalErrorRateContribution}`);
  console.log(`    w3*flags:    ${resultBefore.signalBreakdown!.guardrailFlagsContribution}`);
  console.log(`    w4*rev:      ${resultBefore.signalBreakdown!.actionReversibilityContribution}`);

  if (resultBefore.decision !== 'AUTO_RESOLVE') {
    console.error(`\nUnexpected: expected AUTO_RESOLVE before overrides, got ${resultBefore.decision}`);
    console.error('Weights or prior may have changed. Check weights.json and Bayesian prior.');
    process.exit(1);
  }

  // --- Inject 3 human overrides ---
  const OVERRIDES_TO_INJECT = 3;
  console.log(`\n--- INJECTING ${OVERRIDES_TO_INJECT} HUMAN OVERRIDES ---`);
  console.log('  (Simulates operators correcting the system on this category)');
  await prisma.category.update({
    where: { id: cat.id },
    data: {
      overrideCount: { increment: OVERRIDES_TO_INJECT },
      totalDecisions: { increment: OVERRIDES_TO_INJECT },
    },
  });
  const catAfter = await prisma.category.findUnique({ where: { id: cat.id } });
  console.log(`  Category updated: totalDecisions=${catAfter!.totalDecisions}, overrides=${catAfter!.overrideCount}`);

  // --- AFTER: re-evaluate same ticket ---
  const errAfter = await getHistoricalErrorRate(cat.name);
  const signalsAfter = {
    modelConfidence: 0.50,
    historicalErrorRate: errAfter,
    guardrailFlagCount: 0,
    actionReversibilityWeight: 0.5,
  };
  const resultAfter = computeCCEPScore(signalsAfter, weights, theta);

  console.log('\n--- AFTER OVERRIDES ---');
  console.log(`  Bayesian err rate: ${(errAfter * 100).toFixed(1)}%  (was ${(errBefore * 100).toFixed(1)}%)`);
  console.log(`  Signals: conf=${signalsAfter.modelConfidence} err=${errAfter.toFixed(3)} flags=0 rev=0.5`);
  console.log(`  CCEP score: ${resultAfter.ccepScore}  (threshold: ${theta})`);
  console.log(`  Decision: ${resultAfter.decision}  (margin from threshold: ${(resultAfter.ccepScore - theta).toFixed(4)})`);
  console.log(`  Signal breakdown:`);
  console.log(`    w1*(1-conf): ${resultAfter.signalBreakdown!.modelConfidenceContribution}`);
  console.log(`    w2*err:      ${resultAfter.signalBreakdown!.historicalErrorRateContribution}  <- this rose`);
  console.log(`    w3*flags:    ${resultAfter.signalBreakdown!.guardrailFlagsContribution}`);
  console.log(`    w4*rev:      ${resultAfter.signalBreakdown!.actionReversibilityContribution}`);

  // --- Score delta ---
  const delta = resultAfter.ccepScore - resultBefore.ccepScore;
  const errDelta = errAfter - errBefore;
  console.log(`\n--- SUMMARY ---`);
  console.log(`  Error rate:  ${(errBefore*100).toFixed(1)}% -> ${(errAfter*100).toFixed(1)}%  (+${(errDelta*100).toFixed(1)}pp)`);
  console.log(`  CCEP score:  ${resultBefore.ccepScore} -> ${resultAfter.ccepScore}  (+${delta.toFixed(4)})`);
  console.log(`  Decision:    ${resultBefore.decision} -> ${resultAfter.decision}`);

  if (resultBefore.decision === 'AUTO_RESOLVE' && resultAfter.decision === 'ESCALATE') {
    console.log('\n  FLIP VERIFIED: ticket crossed threshold after operator overrides.');
    console.log(`  The w2*err contribution alone rose by ${(weights.w2 * errDelta).toFixed(4)}`);
    console.log('\n  PRIOR RECONCILIATION:');
    console.log('  The Beta(alpha=1, beta=9) prior mean is alpha/(alpha+beta) = 1/10 = 10.0%.');
    console.log('  For this demo category (10 observed decisions, 0 overrides), Bayesian smoothing');
    console.log('  computes the baseline posterior error rate as:');
    console.log('    (0 + 1) / (10 + 1 + 9) = 1 / 20 = 5.0% (0.0500).');
    console.log('  Injecting 3 overrides (13 total decisions, 3 overrides) yields a posterior of:');
    console.log('    (3 + 1) / (13 + 1 + 9) = 4 / 23 = 17.39% (0.1739), lifting CCEP score from 0.3145 to 0.3425.');
    console.log('  At theta = 0.32, this flips the decision from AUTO_RESOLVE to ESCALATE.');
  } else {
    console.log(`\n  WARNING: Expected AUTO_RESOLVE -> ESCALATE flip, got ${resultBefore.decision} -> ${resultAfter.decision}`);
    console.log('  Check weights.json and Bayesian smoothing constants.');
  }

  // Cleanup
  await prisma.category.update({
    where: { id: cat.id },
    data: { totalDecisions: 10, overrideCount: 0 },
  });
  console.log('\n  (Category reset to baseline for repeatability)');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
