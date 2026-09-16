import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getMCPClient } from './client-factory.js';
import { MOCK_SENTRY_ALERTS, MOCK_SENTRY_DEFAULT, SentryAlertMock } from './mock-data/sentry.mock.js';
import { logger } from '../utils/logger.js';

export class SentryMCPConnector {
  private client: Client | null = null;
  private forceFallback: boolean;
  private initPromise: Promise<void> | null = null;

  constructor(forceFallback = false) {
    this.forceFallback = forceFallback;
  }

  private async ensureConnected(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      if (!this.forceFallback && process.env.MOCK_MODE !== 'true') {
        this.client = await getMCPClient('sentry');
      }
    })();
    return this.initPromise;
  }

  private get useMock(): boolean {
    return this.forceFallback || process.env.MOCK_MODE === 'true' || !this.client;
  }

  public async parseAlert(alertId: string): Promise<SentryAlertMock> {
    await this.ensureConnected();

    if (this.useMock) {
      logger.warn('[MCP-SENTRY] Using MOCK fallback data');
      return MOCK_SENTRY_ALERTS[alertId] ?? { ...MOCK_SENTRY_DEFAULT, alertId };
    }

    try {
      const response = await this.client!.callTool({
        name: 'get_issue',
        arguments: { issueId: alertId },
      });
      if (response?.content && Array.isArray(response.content) && response.content[0]) {
        return JSON.parse((response.content[0] as { text: string }).text);
      }
      throw new Error('Invalid MCP response format');
    } catch (error) {
      logger.warn({ err: error }, '[MCP-SENTRY] Connection failed, using MOCK fallback');
      return MOCK_SENTRY_ALERTS[alertId] ?? { ...MOCK_SENTRY_DEFAULT, alertId };
    }
  }

  public async listRecentAlerts(limit = 5): Promise<SentryAlertMock[]> {
    await this.ensureConnected();
    if (this.useMock) {
      return Object.values(MOCK_SENTRY_ALERTS).slice(0, limit);
    }
    try {
      const response = await this.client!.callTool({ name: 'list_issues', arguments: { limit } });
      if (response?.content && Array.isArray(response.content) && response.content[0]) {
        return JSON.parse((response.content[0] as { text: string }).text);
      }
      return Object.values(MOCK_SENTRY_ALERTS).slice(0, limit);
    } catch {
      return Object.values(MOCK_SENTRY_ALERTS).slice(0, limit);
    }
  }
}
