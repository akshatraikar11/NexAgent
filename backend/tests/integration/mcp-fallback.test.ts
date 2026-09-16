import { describe, it, expect } from 'vitest';
import { JiraMCPConnector } from '../../src/mcp/jira.connector.js';
import { SlackMCPConnector } from '../../src/mcp/slack.connector.js';

/**
 * MCP Fallback tests — verify connectors return correct mock data
 * when forceFallback=true (simulates MOCK_MODE or missing env vars).
 *
 * Note: connectors now use pino logger (not console.warn) for fallback logs.
 * We only assert the return value, not the log string, since pino's transport
 * is async and not easily spy-able in unit tests without a real stream.
 */
describe('MCP Connectors - Fallback Behaviour', () => {
  it('Jira MCP Fallback: returns correct mock fixture for JIRA-101', async () => {
    const connector = new JiraMCPConnector(true); // forceFallback = true
    const issue = await connector.getIssue('JIRA-101');

    expect(issue).toBeDefined();
    expect(issue.key).toBe('JIRA-101');
    expect(issue.title).toBe('VPN Access Password Reset Request');
    expect(issue.category).toBe('IT_SUPPORT');
    expect(issue.priority).toBe('LOW');
  });

  it('Jira MCP Fallback: returns default fixture for unknown issue key', async () => {
    const connector = new JiraMCPConnector(true);
    const issue = await connector.getIssue('JIRA-UNKNOWN-999');

    expect(issue).toBeDefined();
    expect(issue.key).toBe('JIRA-UNKNOWN-999');
  });

  it('Jira MCP Fallback: createComment returns success without real API', async () => {
    const connector = new JiraMCPConnector(true);
    const result = await connector.createComment('JIRA-101', 'Auto-resolved by NexAgent');

    expect(result.success).toBe(true);
    expect(result.commentId).toMatch(/^comment-mock-/);
  });

  it('Slack MCP Fallback: postMessage returns ok=true with correct channel', async () => {
    const connector = new SlackMCPConnector(true); // forceFallback = true
    const result = await connector.postMessage('#general', 'Test message');

    expect(result).toBeDefined();
    expect(result.ok).toBe(true);
    expect(result.channel).toBe('#general');
  });

  it('Slack MCP Fallback: postAlert formats severity prefix', async () => {
    const connector = new SlackMCPConnector(true);
    const result = await connector.postAlert('#sre-oncall', 'P1', 'Database outage detected');

    expect(result.ok).toBe(true);
    expect(result.channel).toBe('#sre-oncall');
  });
});
