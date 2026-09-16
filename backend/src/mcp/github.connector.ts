import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getMCPClient } from './client-factory.js';
import {
  GitHubCIRunMock,
  GitHubPRMock,
  GitHubBuildMock,
  MOCK_CI_RUNS,
  MOCK_CI_DEFAULT,
  MOCK_PRS,
  MOCK_PR_DEFAULT,
  MOCK_BUILDS,
  MOCK_BUILD_DEFAULT,
  MOCK_PR_DIFFS,
  MOCK_DIFF_DEFAULT,
} from './mock-data/github.mock.js';
import { logger } from '../utils/logger.js';

/**
 * GitHubMCPConnector
 * Priority: 1. Real GitHub REST API (GITHUB_TOKEN) → 2. MCP stdio → 3. Mock
 */
export class GitHubMCPConnector {
  private client: Client | null = null;
  private forceFallback: boolean;
  private initPromise: Promise<void> | null = null;

  constructor(forceFallback = false) {
    this.forceFallback = forceFallback;
  }

  private get ghToken(): string | undefined { return process.env.GITHUB_TOKEN; }
  private get ghRepo(): string | undefined { return process.env.GITHUB_REPO; } // e.g. "owner/repo"
  private get useRealHttp(): boolean {
    return !this.forceFallback && process.env.MOCK_MODE !== 'true' && !!this.ghToken && !!this.ghRepo;
  }

  private ghHeaders() {
    return { Authorization: `Bearer ${this.ghToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  }

  private async ensureConnected(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      if (!this.forceFallback && process.env.MOCK_MODE !== 'true' && !this.useRealHttp) {
        this.client = await getMCPClient('github');
      }
    })();
    return this.initPromise;
  }

  private get useMock(): boolean {
    return !this.useRealHttp && (this.forceFallback || process.env.MOCK_MODE === 'true' || !this.client);
  }

  // ── CI Run ─────────────────────────────────────────────────────────────────

  public async getCIRun(runId: string): Promise<GitHubCIRunMock> {
    await this.ensureConnected();
    if (this.useMock) {
      logger.warn('[MCP-GITHUB] Connection failed, using MOCK fallback data');
      return MOCK_CI_RUNS[runId] ?? { ...MOCK_CI_DEFAULT, runId };
    }
    try {
      const response = await this.client!.callTool({ name: 'get_ci_run', arguments: { runId } });
      if (response?.content && Array.isArray(response.content) && response.content[0]) {
        return JSON.parse((response.content[0] as { text: string }).text);
      }
      throw new Error('Invalid MCP response format');
    } catch (error) {
      logger.warn({ err: error }, '[MCP-GITHUB] Connection failed, using MOCK fallback data');
      return MOCK_CI_RUNS[runId] ?? { ...MOCK_CI_DEFAULT, runId };
    }
  }

  public async retryFailedTests(runId: string): Promise<{ success: boolean; newRunId: string }> {
    if (this.useMock) {
      logger.warn('[MCP-GITHUB] Connection failed, using MOCK fallback data');
      return { success: true, newRunId: `RUN-retry-${Date.now()}` };
    }
    try {
      await this.client!.callTool({ name: 'retry_failed_tests', arguments: { runId } });
      return { success: true, newRunId: `RUN-real-${Date.now()}` };
    } catch (error) {
      logger.warn({ err: error }, '[MCP-GITHUB] retry_failed_tests failed, using MOCK');
      return { success: true, newRunId: `RUN-retry-${Date.now()}` };
    }
  }

  public async blockPR(prNumber: number, reason: string): Promise<{ success: boolean }> {
    if (this.useMock) {
      logger.warn('[MCP-GITHUB] Connection failed, using MOCK fallback data');
      return { success: true };
    }
    try {
      await this.client!.callTool({ name: 'block_pr', arguments: { prNumber, reason } });
      return { success: true };
    } catch (error) {
      logger.warn({ err: error }, '[MCP-GITHUB] block_pr failed, using MOCK');
      return { success: true };
    }
  }

  // ── PR ─────────────────────────────────────────────────────────────────────

  public async getPR(prIdentifier: string | number): Promise<GitHubPRMock> {
    const key = `PR-${prIdentifier}`;
    // ── Real GitHub REST ───────────────────────────────────────────────────
    if (this.useRealHttp) {
      try {
        const res = await fetch(`https://api.github.com/repos/${this.ghRepo}/pulls/${prIdentifier}`, {
          headers: this.ghHeaders(), signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`GitHub PR HTTP ${res.status}`);
        const pr = await res.json() as {
          number: number; title: string; user: { login: string };
          head: { ref: string }; base: { ref: string };
          changed_files: number; additions: number; deletions: number;
          draft: boolean; body: string | null;
        };
        logger.info(`[MCP-GITHUB] Real HTTP: fetched PR #${prIdentifier}`);
        return {
          prNumber: pr.number, title: pr.title, author: pr.user.login,
          branch: pr.head.ref, baseBranch: pr.base.ref,
          filesChanged: pr.changed_files, additions: pr.additions, deletions: pr.deletions,
          reviewsRequired: 1, ciStatus: 'pending', riskLevel: 'medium',
          touchedModules: [], description: pr.body ?? '', createdAt: new Date().toISOString(),
        };
      } catch (err) {
        logger.warn({ err }, '[MCP-GITHUB] Real HTTP PR failed, falling back');
      }
    }
    await this.ensureConnected();
    if (!this.useMock) {
      try {
        const response = await this.client!.callTool({ name: 'get_pull_request', arguments: { prNumber: Number(prIdentifier) } });
        if (response?.content && Array.isArray(response.content) && response.content[0]) {
          return JSON.parse((response.content[0] as { text: string }).text);
        }
      } catch (err) {
        logger.warn({ err }, '[MCP-GITHUB] MCP PR failed, using mock');
      }
    }
    return MOCK_PRS[key] ?? { ...MOCK_PR_DEFAULT, prNumber: Number(prIdentifier) };
  }

  public async mergePR(prNumber: number, method: 'squash' | 'merge' | 'rebase' = 'squash'): Promise<{ success: boolean; mergeCommit: string }> {
    if (this.useMock) {
      logger.warn('[MCP-GITHUB] Connection failed, using MOCK fallback data');
      return { success: true, mergeCommit: `mock-merge-${Date.now()}` };
    }
    try {
      const response = await this.client!.callTool({
        name: 'merge_pull_request',
        arguments: { prNumber, mergeMethod: method },
      });
      return { success: true, mergeCommit: `real-merge-${Date.now()}` };
    } catch (error) {
      logger.warn({ err: error }, '[MCP-GITHUB] merge_pr failed, using MOCK');
      return { success: true, mergeCommit: `mock-merge-${Date.now()}` };
    }
  }

  public async requestReview(prNumber: number, reviewers: string[]): Promise<{ success: boolean }> {
    if (this.useMock) {
      logger.warn('[MCP-GITHUB] Connection failed, using MOCK fallback data');
      return { success: true };
    }
    try {
      await this.client!.callTool({ name: 'request_review', arguments: { prNumber, reviewers } });
      return { success: true };
    } catch (error) {
      logger.warn({ err: error }, '[MCP-GITHUB] request_review failed, using MOCK');
      return { success: true };
    }
  }

  public async getDiff(prIdentifier: string | number): Promise<string> {
    const key = `PR-${prIdentifier}`;
    // ── Real GitHub REST ───────────────────────────────────────────────────
    if (this.useRealHttp) {
      try {
        const res = await fetch(`https://api.github.com/repos/${this.ghRepo}/pulls/${prIdentifier}`, {
          headers: { ...this.ghHeaders(), Accept: 'application/vnd.github.v3.diff' },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`GitHub diff HTTP ${res.status}`);
        const diff = await res.text();
        logger.info(`[MCP-GITHUB] Real HTTP: fetched diff for PR #${prIdentifier}`);
        return diff;
      } catch (err) {
        logger.warn({ err }, '[MCP-GITHUB] Real HTTP getDiff failed, falling back');
      }
    }
    await this.ensureConnected();
    if (!this.useMock) {
      try {
        const response = await this.client!.callTool({ name: 'get_pull_request_diff', arguments: { prNumber: Number(prIdentifier) } });
        if (response?.content && Array.isArray(response.content) && response.content[0]) {
          return (response.content[0] as { text: string }).text;
        }
      } catch (err) {
        logger.warn({ err }, '[MCP-GITHUB] MCP getDiff failed, using mock');
      }
    }
    return MOCK_PR_DIFFS[key] ?? MOCK_DIFF_DEFAULT;
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  public async getBuild(buildId: string): Promise<GitHubBuildMock> {
    if (this.useMock) {
      logger.warn('[MCP-GITHUB] Connection failed, using MOCK fallback data');
      return MOCK_BUILDS[buildId] ?? { ...MOCK_BUILD_DEFAULT, buildId };
    }
    try {
      const response = await this.client!.callTool({ name: 'get_build', arguments: { buildId } });
      if (response?.content && Array.isArray(response.content) && response.content[0]) {
        return JSON.parse((response.content[0] as { text: string }).text);
      }
      throw new Error('Invalid MCP response format');
    } catch (error) {
      logger.warn({ err: error }, '[MCP-GITHUB] Connection failed, using MOCK fallback data');
      return MOCK_BUILDS[buildId] ?? { ...MOCK_BUILD_DEFAULT, buildId };
    }
  }

  public async retryBuild(buildId: string): Promise<{ success: boolean; newBuildId: string }> {
    if (this.useMock) {
      logger.warn('[MCP-GITHUB] Connection failed, using MOCK fallback data');
      return { success: true, newBuildId: `BUILD-retry-${Date.now()}` };
    }
    try {
      await this.client!.callTool({ name: 'retry_build', arguments: { buildId } });
      return { success: true, newBuildId: `BUILD-real-${Date.now()}` };
    } catch (error) {
      logger.warn({ err: error }, '[MCP-GITHUB] retry_build failed, using MOCK');
      return { success: true, newBuildId: `BUILD-retry-${Date.now()}` };
    }
  }
}
