import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app.js';
import { config } from '../../src/config/index.js';
import { prisma } from '../../src/db/client.js';

describe('HTTP Route Integration: Stretch Pipelines via POST /pipelines/run', () => {
  const testUserId = `test-http-user-${Date.now()}`;
  const authToken = jwt.sign(
    { userId: testUserId, email: 'operator@nexagent.test', role: 'ADMIN' },
    config.jwtSecret,
    { expiresIn: '1h' }
  );

  const createdRunIds: string[] = [];

  afterAll(async () => {
    try {
      if (createdRunIds.length > 0) {
        await prisma.decision.deleteMany({ where: { pipelineRunId: { in: createdRunIds } } });
        await prisma.stepLog.deleteMany({ where: { pipelineRunId: { in: createdRunIds } } });
        await prisma.pipelineRun.deleteMany({ where: { id: { in: createdRunIds } } });
      }
    } catch (_) {}
  });

  it('Rejects unauthenticated POST /pipelines/run with 401', async () => {
    const res = await request(app)
      .post('/pipelines/run')
      .send({ pipelineType: 'CI_TRIAGE' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('Executes CI_TRIAGE via HTTP POST /pipelines/run and returns 202 with runId', async () => {
    const res = await request(app)
      .post('/pipelines/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        pipelineType: 'CI_TRIAGE',
        metadata: { ciRunId: 'RUN-1002' },
        actionType: 'status_change',
        threshold: 0.60,
      });

    expect(res.status).toBe(202);
    expect(res.body.runId).toBeDefined();
    expect(res.body.status).toBe('RUNNING');
    expect(res.body.pipelineType).toBe('CI_TRIAGE');
    createdRunIds.push(res.body.runId);

    // Verify polling GET /pipelines/:runId
    const getRes = await request(app)
      .get(`/pipelines/${res.body.runId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(res.body.runId);
    expect(getRes.body.type).toBe('CI_TRIAGE');
  });

  it('Executes BUILD_DEPLOY via HTTP POST /pipelines/run and returns 202 with runId', async () => {
    const res = await request(app)
      .post('/pipelines/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        pipelineType: 'BUILD_DEPLOY',
        metadata: { buildId: 'BUILD-501' },
        actionType: 'prod_deploy',
        threshold: 0.60,
      });

    expect(res.status).toBe(202);
    expect(res.body.runId).toBeDefined();
    expect(res.body.status).toBe('RUNNING');
    expect(res.body.pipelineType).toBe('BUILD_DEPLOY');
    createdRunIds.push(res.body.runId);

    const getRes = await request(app)
      .get(`/pipelines/${res.body.runId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.type).toBe('BUILD_DEPLOY');
  });

  it('Executes MERGEGATE via HTTP POST /pipelines/run and returns 202 with runId', async () => {
    const res = await request(app)
      .post('/pipelines/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        pipelineType: 'MERGEGATE',
        metadata: { prNumber: 101 },
        actionType: 'auto_merge_pr',
        threshold: 0.60,
      });

    expect(res.status).toBe(202);
    expect(res.body.runId).toBeDefined();
    expect(res.body.status).toBe('RUNNING');
    expect(res.body.pipelineType).toBe('MERGEGATE');
    createdRunIds.push(res.body.runId);

    const getRes = await request(app)
      .get(`/pipelines/${res.body.runId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.type).toBe('MERGEGATE');
  });
});
