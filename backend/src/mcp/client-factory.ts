import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger } from '../utils/logger.js';

export type MCPServiceName = 'jira' | 'slack' | 'github' | 'sentry';

const connectedClients = new Map<MCPServiceName, Client>();

/**
 * Attempts MCP stdio connection when MCP_<SERVICE>_CMD env is set.
 * Example: MCP_JIRA_CMD="npx @modelcontextprotocol/server-jira"
 */
export async function getMCPClient(service: MCPServiceName): Promise<Client | null> {
  if (connectedClients.has(service)) {
    return connectedClients.get(service)!;
  }

  const envKey = `MCP_${service.toUpperCase()}_CMD`;
  const cmdLine = process.env[envKey];
  if (!cmdLine || process.env.MOCK_MODE === 'true') {
    return null;
  }

  try {
    const parts = cmdLine.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    const transport = new StdioClientTransport({ command, args });
    const client = new Client({ name: `nexagent-${service}`, version: '1.0.0' });
    await client.connect(transport);
    connectedClients.set(service, client);
    logger.info(`[MCP-${service.toUpperCase()}] Connected via stdio: ${cmdLine}`);
    return client;
  } catch (err) {
    logger.warn({ err }, `[MCP-${service.toUpperCase()}] Failed to connect — will use mock fallback`);
    return null;
  }
}

export async function ensureMCPClients(): Promise<void> {
  await Promise.all([
    getMCPClient('jira'),
    getMCPClient('slack'),
    getMCPClient('github'),
    getMCPClient('sentry'),
  ]);
}
