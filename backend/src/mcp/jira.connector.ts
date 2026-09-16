/**
 * Jira Connector — real HTTP + MCP stdio fallback
 *
 * Priority order:
 *   1. Real Jira Cloud REST API (if JIRA_BASE_URL + JIRA_API_TOKEN set)
 *   2. MCP stdio server  (if MCP_JIRA_CMD set and MOCK_MODE=false)
 *   3. Mock fixtures
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getMCPClient } from './client-factory.js';
import { MOCK_JIRA_ISSUES, MOCK_JIRA_DEFAULT_ISSUE, JiraIssueMock } from './mock-data/jira.mock.js';
import { logger } from '../utils/logger.js';

export class JiraMCPConnector {
  private client: Client | null = null;
  private initPromise: Promise<void> | null = null;
  private forceFallback: boolean;

  constructor(forceFallback = false) {
    this.forceFallback = forceFallback;
  }

  private get baseUrl(): string | undefined { return process.env.JIRA_BASE_URL; }
  private get authHeader(): string | undefined {
    const email = process.env.JIRA_EMAIL;
    const token = process.env.JIRA_API_TOKEN;
    if (!email || !token) return undefined;
    return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  }
  private get useRealHttp(): boolean {
    return !this.forceFallback && process.env.MOCK_MODE !== 'true' && !!this.baseUrl && !!this.authHeader;
  }

  private async ensureConnected(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      if (!this.forceFallback && process.env.MOCK_MODE !== 'true' && !this.useRealHttp) {
        this.client = await getMCPClient('jira');
      }
    })();
    return this.initPromise;
  }

  public async getIssue(issueKey: string): Promise<JiraIssueMock> {
    // ── Real HTTP ──────────────────────────────────────────────────────────
    if (this.useRealHttp) {
      try {
        const res = await fetch(`${this.baseUrl}/rest/api/3/issue/${issueKey}`, {
          headers: { Authorization: this.authHeader!, Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`Jira HTTP ${res.status}`);
        const data = await res.json() as {
          key: string;
          fields: { summary: string; description: { content?: { content?: { text?: string }[] }[] } | null; status: { name: string }; priority: { name: string }; issuetype: { name: string } };
        };
        const description = data.fields.description?.content?.[0]?.content?.[0]?.text ?? 'No description';
        logger.info(`[MCP-JIRA] Real HTTP: fetched ${issueKey}`);
        return {
          id: data.key,
          key: data.key,
          title: data.fields.summary,
          description,
          status: data.fields.status.name,
          priority: data.fields.priority.name,
          category: data.fields.issuetype.name.toUpperCase(),
          reporter: '',
          created: new Date().toISOString(),
        };
      } catch (err) {
        logger.warn({ err }, `[MCP-JIRA] Real HTTP failed for ${issueKey}, falling back`);
      }
    }

    // ── MCP stdio ──────────────────────────────────────────────────────────
    await this.ensureConnected();
    if (this.client) {
      try {
        const response = await this.client.callTool({ name: 'get_issue', arguments: { issueKey } });
        if (response?.content && Array.isArray(response.content) && response.content[0]) {
          return JSON.parse((response.content[0] as { text: string }).text);
        }
      } catch (err) {
        logger.warn({ err }, '[MCP-JIRA] MCP stdio failed, using mock');
      }
    }

    // ── Mock ───────────────────────────────────────────────────────────────
    return MOCK_JIRA_ISSUES[issueKey] || { ...MOCK_JIRA_DEFAULT_ISSUE, key: issueKey };
  }

  public async createComment(issueKey: string, commentBody: string): Promise<{ success: boolean; commentId: string }> {
    // ── Real HTTP ──────────────────────────────────────────────────────────
    if (this.useRealHttp) {
      try {
        const res = await fetch(`${this.baseUrl}/rest/api/3/issue/${issueKey}/comment`, {
          method: 'POST',
          headers: { Authorization: this.authHeader!, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: commentBody }] }] } }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`Jira comment HTTP ${res.status}`);
        const data = await res.json() as { id: string };
        logger.info(`[MCP-JIRA] Real HTTP: posted comment ${data.id} on ${issueKey}`);
        return { success: true, commentId: data.id };
      } catch (err) {
        logger.warn({ err }, '[MCP-JIRA] Real HTTP comment failed, falling back');
      }
    }

    // ── MCP stdio ──────────────────────────────────────────────────────────
    await this.ensureConnected();
    if (this.client) {
      try {
        await this.client.callTool({ name: 'create_comment', arguments: { issueKey, commentBody } });
        return { success: true, commentId: `comment-mcp-${Date.now()}` };
      } catch (err) {
        logger.warn({ err }, '[MCP-JIRA] MCP comment failed, using mock');
      }
    }

    return { success: true, commentId: `comment-mock-${Date.now()}` };
  }
}
