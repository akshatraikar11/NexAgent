import express, { Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/requestLogger.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { authenticateJWT, AuthenticatedRequest } from './middleware/auth.js';
import { authRouter } from './routes/auth.routes.js';
import { ticketRouter } from './routes/ticket.routes.js';
import { decisionRouter } from './routes/decision.routes.js';
import { pipelineRouter } from './routes/pipeline.routes.js';
import { sseRouter } from './routes/sse.routes.js';
import { categoryRouter } from './routes/category.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { auditRouter } from './routes/audit.routes.js';
import { kbRouter } from './routes/kb.routes.js';
import { slaRouter } from './routes/sla.routes.js';
import { correlationRouter } from './routes/correlation.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { analyticsRouter } from './routes/analytics.routes.js';
import { initLangfuseTracing } from './observability/langfuse.js';
import { config } from './config/index.js';
import { isDatabaseConnected } from './db/client.js';

// Initialize observability
initLangfuseTracing();

export const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS — Fix #3 High: restricted to known origins, not wildcard ─────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Fit-Weights-Secret'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// ── Health — Fix #10 Medium: public endpoint returns MINIMAL info only ────────
// Full service status requires authentication (prevents stack fingerprinting)
app.get('/health', (_req, res) => {
  res.json({
    status: 'UP',
    system: 'NexAgent Platform',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Authenticated detailed health (DB + ChromaDB + LLM status)
app.get('/health/detail', authenticateJWT, async (_req: AuthenticatedRequest, res: Response) => {
  const dbOk = await isDatabaseConnected();
  let chromaOk = false;
  try {
    const r = await fetch(`${config.chromaDbUrl}/api/v1/heartbeat`, { signal: AbortSignal.timeout(3000) });
    chromaOk = r.ok;
  } catch { chromaOk = false; }

  res.json({
    status: dbOk ? 'UP' : 'DEGRADED',
    mockMode: config.mockMode,
    timestamp: new Date().toISOString(),
    services: {
      database: dbOk ? 'UP' : 'DOWN',
      chromadb: chromaOk ? 'UP' : 'DOWN',
      llm: config.mockMode ? 'mock' : 'live',
    },
  });
});

// ── Route mounts ──────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/tickets', ticketRouter);
app.use('/decisions', decisionRouter);
app.use('/pipelines', pipelineRouter);
app.use('/sse', sseRouter);
app.use('/categories', categoryRouter);
app.use('/settings', settingsRouter);
app.use('/audit-logs', auditRouter);
app.use('/kb', kbRouter);
app.use('/sla', slaRouter);
app.use('/correlation', correlationRouter);
app.use('/notifications', notificationsRouter);
app.use('/analytics', analyticsRouter);

// ── Global error handler ──────────────────────────────────────────────────────
app.use(globalErrorHandler);
