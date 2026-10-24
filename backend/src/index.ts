import { z } from 'zod';
import { app } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { ensureMCPClients } from './mcp/client-factory.js';
import { flushLangfuse } from './observability/langfuse.js';

// ── Startup environment validation ───────────────────────────────────────────
// Refuses to start if critical env vars are missing or left as insecure defaults.
const EnvSchema = z.object({
  PORT: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  JWT_SECRET: z.string().min(20, 'JWT_SECRET must be at least 20 characters'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CCEP_THRESHOLD: z.string().optional(),
}).passthrough();

const insecureDefaultJwt = 'nexagent_super_secret_jwt_key_2026_ccep_eval';

// Block startup if JWT_SECRET is missing or is the known insecure default in ANY env.
// A missing/default secret means tokens are trivially forgeable by anyone who reads the repo.
if (!config.jwtSecret) {
  logger.error('[STARTUP] FATAL: JWT_SECRET environment variable is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}
if (config.jwtSecret === insecureDefaultJwt) {
  logger.error('[STARTUP] FATAL: JWT_SECRET is the publicly-known default value from the repo. Set a strong random secret.');
  process.exit(1);
}

const envResult = EnvSchema.safeParse(process.env);
if (!envResult.success) {
  logger.error({ errors: envResult.error.format() }, '[STARTUP] FATAL: Missing or invalid environment variables');
  process.exit(1);
}

logger.info(`[STARTUP] Environment validated. NODE_ENV=${config.nodeEnv}, mockMode=${config.mockMode}, port=${config.port}`);

// ── MCP clients ───────────────────────────────────────────────────────────────
ensureMCPClients().catch((err) => {
  logger.warn({ err }, 'MCP client initialization skipped');
});

// ── Start server ──────────────────────────────────────────────────────────────
const server = app.listen(config.port, () => {
  logger.info(`NexAgent Backend running on port ${config.port} [${config.nodeEnv}] mockMode=${config.mockMode}`);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received. Closing HTTP server...');
  await flushLangfuse();
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
});
