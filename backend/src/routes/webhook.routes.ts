import { Router, Request, Response } from 'express';
import { prisma } from '../db/client.js';
import { getPipelineSteps } from '../orchestrator/registry.js';
import { runPipeline } from '../orchestrator/runner.js';
import { PipelineContext } from '../orchestrator/types.js';
import { config } from '../config/index.js';
import { MERGEGATE_THRESHOLD } from '../ccep/constants.js';
import { logger } from '../utils/logger.js';

export const webhookRouter = Router();

async function triggerWebhookPipeline(
  pipelineType: 'MERGEGATE' | 'CI_TRIAGE' | 'BUILD_DEPLOY' | 'INCIDENT_RESPONSE' | 'TICKET_TRIAGE',
  params: {
    externalTicketId?: string;
    alertId?: string;
    ticketTitle: string;
    ticketDescription: string;
    actionType?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const steps = getPipelineSteps(pipelineType);
  const pipelineRun = await prisma.pipelineRun.create({
    data: {
      type: pipelineType,
      status: 'PENDING',
      context: {
        ...params,
        pipelineType,
        source: 'INBOUND_WEBHOOK',
      },
    },
  });

  const ctx: PipelineContext = {
    runId: pipelineRun.id,
    externalTicketId: params.externalTicketId,
    alertId: params.alertId,
    ticketTitle: params.ticketTitle,
    ticketDescription: params.ticketDescription,
    actionType: params.actionType || (pipelineType === 'MERGEGATE' ? 'merge_pr' : 'status_change'),
    threshold: pipelineType === 'MERGEGATE' ? MERGEGATE_THRESHOLD : config.ccepThreshold,
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
    historicalErrorRate: 0,
    actionReversibilityWeight: 0,
    ccepScore: 0,
    decision: 'PENDING',
    stepResults: {},
    metadata: { ...params.metadata, source: 'INBOUND_WEBHOOK' },
  };

  setImmediate(async () => {
    try {
      logger.info(`[WEBHOOK] Launching ${pipelineType} background runId: ${pipelineRun.id}`);
      await runPipeline(steps, ctx);
    } catch (err) {
      logger.error({ err }, `[WEBHOOK] Pipeline ${pipelineType} failed`);
    }
  });

  return pipelineRun;
}

/**
 * GET /webhooks — Info and status of inbound listeners
 */
webhookRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ACTIVE',
    message: 'NexAgent Inbound Webhook Dispatcher is ready',
    listeners: {
      github: {
        endpoint: '/webhooks/github',
        events: ['pull_request (opened, synchronize)', 'workflow_run (failure)'],
        targetPipelines: ['MERGEGATE', 'CI_TRIAGE', 'BUILD_DEPLOY'],
      },
      sentry: {
        endpoint: '/webhooks/sentry',
        events: ['issue.created', 'alert.triggered'],
        targetPipelines: ['INCIDENT_RESPONSE'],
      },
      jira: {
        endpoint: '/webhooks/jira',
        events: ['jira:issue_created'],
        targetPipelines: ['TICKET_TRIAGE'],
      },
    },
  });
});

/**
 * POST /webhooks/github — Inbound GitHub Webhook Handler
 */
webhookRouter.post('/github', async (req: Request, res: Response) => {
  const event = req.headers['x-github-event'] as string;
  const payload = req.body;

  logger.info(`[WEBHOOK-GITHUB] Received event: ${event}`);

  if (event === 'ping') {
    res.json({ status: 'ok', message: 'GitHub webhook verified by NexAgent' });
    return;
  }

  // ── Pull Request Event (Auto-trigger MergeGate) ──────────────────────────
  if (event === 'pull_request') {
    const action = payload.action;
    const pr = payload.pull_request;

    if (['opened', 'synchronize', 'reopened'].includes(action) && pr) {
      logger.info(`[WEBHOOK-GITHUB] Triggering MergeGate for PR #${pr.number}: "${pr.title}"`);
      const run = await triggerWebhookPipeline('MERGEGATE', {
        externalTicketId: String(pr.number),
        ticketTitle: pr.title,
        ticketDescription: pr.body || `Pull Request #${pr.number} from branch ${pr.head?.ref}`,
        actionType: 'merge_pr',
        metadata: {
          prNumber: pr.number,
          branch: pr.head?.ref,
          baseBranch: pr.base?.ref,
          author: pr.user?.login,
          url: pr.html_url,
        },
      });

      res.status(202).json({
        accepted: true,
        pipeline: 'MERGEGATE',
        action: 'AUTO_TRIAGE_QUEUED',
        runId: run.id,
        prNumber: pr.number,
      });
      return;
    }
  }

  // ── Workflow Run Event (Auto-trigger CI Triage or Build Deploy) ──────────
  if (event === 'workflow_run') {
    const run = payload.workflow_run;
    if (run && run.conclusion === 'failure') {
      const isDeploy = run.name?.toLowerCase().includes('deploy') || run.path?.toLowerCase().includes('deploy');
      const pipelineType = isDeploy ? 'BUILD_DEPLOY' : 'CI_TRIAGE';

      logger.info(`[WEBHOOK-GITHUB] Triggering ${pipelineType} for failed run #${run.id} (${run.name})`);
      const pipelineRun = await triggerWebhookPipeline(pipelineType, {
        externalTicketId: String(run.id),
        ticketTitle: `${run.name} Failure on ${run.head_branch}`,
        ticketDescription: `GitHub Actions run #${run.id} failed on commit ${run.head_sha?.slice(0, 7)}`,
        actionType: 'status_change',
        metadata: {
          runId: run.id,
          ciRunId: String(run.id),
          branch: run.head_branch,
          workflowName: run.name,
          event: run.event,
        },
      });

      res.status(202).json({
        accepted: true,
        pipeline: pipelineType,
        action: 'FAILURE_TRIAGE_QUEUED',
        runId: pipelineRun.id,
        workflowRunId: run.id,
      });
      return;
    }
  }

  res.status(200).json({ status: 'ignored', reason: `Unhandled event ${event}/${payload.action}` });
});

/**
 * POST /webhooks/sentry — Inbound Sentry Webhook Handler
 */
webhookRouter.post('/sentry', async (req: Request, res: Response) => {
  const payload = req.body;
  const issue = payload.data?.issue || payload.issue || payload;
  const title = issue.title || payload.message || 'Sentry Production Alert';
  const alertId = String(issue.id || payload.id || `SENTRY-${Date.now()}`);
  const description = issue.culprit || issue.metadata?.value || payload.description || 'Production exception detected via Sentry Webhook';

  logger.info(`[WEBHOOK-SENTRY] Triggering Incident Response for ${alertId}: "${title}"`);
  const pipelineRun = await triggerWebhookPipeline('INCIDENT_RESPONSE', {
    alertId,
    ticketTitle: title,
    ticketDescription: description,
    actionType: 'prod_deploy',
    metadata: {
      sentryIssueId: alertId,
      sentryRaw: payload,
    },
  });

  res.status(202).json({
    accepted: true,
    pipeline: 'INCIDENT_RESPONSE',
    action: 'INCIDENT_COMMANDER_QUEUED',
    runId: pipelineRun.id,
    alertId,
  });
});

/**
 * POST /webhooks/jira — Inbound Jira Webhook Handler
 */
webhookRouter.post('/jira', async (req: Request, res: Response) => {
  const payload = req.body;
  const issue = payload.issue;

  if (issue && issue.key) {
    const summary = issue.fields?.summary || 'Jira Helpdesk Issue';
    const description = typeof issue.fields?.description === 'string'
      ? issue.fields.description
      : 'Issue reported in Jira Cloud';

    logger.info(`[WEBHOOK-JIRA] Triggering Ticket Triage for ${issue.key}: "${summary}"`);
    const pipelineRun = await triggerWebhookPipeline('TICKET_TRIAGE', {
      externalTicketId: issue.key,
      ticketTitle: summary,
      ticketDescription: description,
      actionType: 'jira_comment',
      metadata: {
        jiraKey: issue.key,
        priority: issue.fields?.priority?.name,
        issueType: issue.fields?.issuetype?.name,
      },
    });

    res.status(202).json({
      accepted: true,
      pipeline: 'TICKET_TRIAGE',
      action: 'IT_TRIAGE_QUEUED',
      runId: pipelineRun.id,
      issueKey: issue.key,
    });
    return;
  }

  res.status(200).json({ status: 'ignored', reason: 'No issue object in payload' });
});

/**
 * POST /webhooks/simulate — Testing endpoint to simulate inbound webhooks from dev console
 */
webhookRouter.post('/simulate', async (req: Request, res: Response) => {
  const { provider, event, payload } = req.body;

  if (provider === 'github') {
    const headers = { 'x-github-event': event || 'pull_request' };
    const fakeReq = { headers, body: payload } as Request;
    // Delegate to github handler
    return (webhookRouter.stack.find((s) => s.route?.path === '/github')?.route?.stack[0]?.handle as any)(fakeReq, res);
  }

  if (provider === 'sentry') {
    const fakeReq = { headers: {}, body: payload } as Request;
    return (webhookRouter.stack.find((s) => s.route?.path === '/sentry')?.route?.stack[0]?.handle as any)(fakeReq, res);
  }

  if (provider === 'jira') {
    const fakeReq = { headers: {}, body: payload } as Request;
    return (webhookRouter.stack.find((s) => s.route?.path === '/jira')?.route?.stack[0]?.handle as any)(fakeReq, res);
  }

  res.status(400).json({ error: 'INVALID_PROVIDER', message: 'Supported providers: github, sentry, jira' });
});
