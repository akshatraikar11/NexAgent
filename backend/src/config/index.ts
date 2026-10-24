import dotenv from 'dotenv';
import path from 'path';
import { DEFAULT_CCEP_THRESHOLD } from '../ccep/constants.js';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  ccepThreshold: parseFloat(process.env.CCEP_THRESHOLD || String(DEFAULT_CCEP_THRESHOLD)),
  mockMode:
    process.env.MOCK_MODE === 'true' ||
    !process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY === 'mock_gemini_key',
  fitWeightsSecret: process.env.FIT_WEIGHTS_SECRET || '',
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
