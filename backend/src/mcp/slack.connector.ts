/**
 * Slack Connector — real HTTP Web API + MCP stdio fallback
 *
 * Priority order:
 *   1. Slack Web API (if SLACK_BOT_TOKEN set)
 *   2. MCP stdio server (if MCP_SLACK_CMD set)
 *   3. Mock fixtures
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getMCPClient } from './client-factory.js';
import { createMockSlackResult, SlackMessageMockResult } from './mock-data/slack.mock.js';
import { logger } from '../utils/logger.js';

export class SlackMCPConnector {
  private client: Client | null = null;
  private initPromise: Promise<void> | null = null;
  private forceFallback: boolean;

  constructor(forceFallback = false) {
    this.forceFallback = forceFallback;
  }

  private get token(): string | undefined { return process.env.SLACK_BOT_TOKEN; }
  private get useRealHttp(): boolean {
    return !this.forceFallback && process.env.MOCK_MODE !== 'true' && !!this.token;
  }

  private async ensureConnected(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      if (!this.forceFallback && process.env.MOCK_MODE !== 'true' && !this.useRealHttp) {
        this.client = await getMCPClient('slack');
      }
    })();
    return this.initPromise;
  }

  public async postMessage(channel: string, text: string): Promise<SlackMessageMockResult> {
    // ── Real Slack Web API ─────────────────────────────────────────────────
    if (this.useRealHttp) {
      try {
        const res = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, text }),
          signal: AbortSignal.timeout(8000),
        });
        const data = await res.json() as { ok: boolean; ts?: string; error?: string };
        if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
        logger.info(`[MCP-SLACK] Real HTTP: posted to ${channel} (ts=${data.ts})`);
        return createMockSlackResult(channel, text);
      } catch (err) {
        logger.warn({ err }, '[MCP-SLACK] Real HTTP failed, falling back');
      }
    }

    // ── MCP stdio ──────────────────────────────────────────────────────────
    await this.ensureConnected();
    if (this.client) {
      try {
        await this.client.callTool({ name: 'post_message', arguments: { channel, message: text } });
        return createMockSlackResult(channel, text);
      } catch (err) {
        logger.warn({ err }, '[MCP-SLACK] MCP stdio failed, using mock');
      }
    }

    return createMockSlackResult(channel, text);
  }

  public async postAlert(channel: string, severity: string, summary: string): Promise<SlackMessageMockResult> {
    const text = `🚨 *[${severity.toUpperCase()} ALERT]* ${summary}`;
    return this.postMessage(channel, text);
  }
}
