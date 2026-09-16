import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'nexagent_super_secret_jwt_key_2026_ccep_eval',
  ccepThreshold: parseFloat(process.env.CCEP_THRESHOLD || '0.60'),
  mockMode:
    process.env.MOCK_MODE === 'true' ||
    !process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY === 'mock_gemini_key',
  fitWeightsSecret: process.env.FIT_WEIGHTS_SECRET || 'nexagent_fit_weights_internal',
  mcpJiraCmd: process.env.MCP_JIRA_CMD || '',
  mcpSlackCmd: process.env.MCP_SLACK_CMD || '',
  mcpGithubCmd: process.env.MCP_GITHUB_CMD || '',
  mcpSentryCmd: process.env.MCP_SENTRY_CMD || '',
  chromaDbUrl: process.env.CHROMADB_URL || 'http://localhost:8000',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  langfuse: {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
    secretKey: process.env.LANGFUSE_SECRET_KEY || '',
    baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
  },
  bootstrapWeightsPath: path.resolve(process.cwd(), 'weights.json'),
};
