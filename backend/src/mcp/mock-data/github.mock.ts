export interface GitHubCIRunMock {
  runId: string;
  workflowName: string;
  branch: string;
  commit: string;
  status: 'completed' | 'in_progress' | 'queued';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  failedTests: string[];
  totalTests: number;
  passedTests: number;
  isFlaky: boolean;
  errorLogs: string;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
}

export interface GitHubPRMock {
  prNumber: number;
  title: string;
  author: string;
  branch: string;
  baseBranch: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  reviewsRequired: number;
  ciStatus: 'success' | 'failure' | 'pending';
  riskLevel: 'low' | 'medium' | 'high';
  touchedModules: string[];
  description: string;
  createdAt: string;
}

export interface GitHubBuildMock {
  buildId: string;
  workflow: string;
  branch: string;
  commit: string;
  status: 'success' | 'failure';
  errorType: 'transient_infra' | 'code_error' | 'config_error' | 'dependency_error';
  errorMessage: string;
  duration: number;
  environment: string;
  triggeredBy: string;
  startedAt: string;
}

// ── CI Run mocks ──────────────────────────────────────────────────────────────
export const MOCK_CI_RUNS: Record<string, GitHubCIRunMock> = {
  'RUN-1001': {
    runId: 'RUN-1001',
    workflowName: 'unit-tests.yml',
    branch: 'feature/payment-refactor',
    commit: 'a1b2c3d',
    status: 'completed',
    conclusion: 'failure',
    failedTests: ['PaymentService.processRefund', 'PaymentService.validateCard'],
    totalTests: 142,
    passedTests: 140,
    isFlaky: false,
    errorLogs: 'AssertionError: expected 200 got 500 at PaymentService.processRefund line 84',
    triggeredBy: 'push',
    startedAt: new Date(Date.now() - 600000).toISOString(),
    completedAt: new Date(Date.now() - 300000).toISOString(),
  },
  'RUN-1002': {
    runId: 'RUN-1002',
    workflowName: 'integration-tests.yml',
    branch: 'main',
    commit: 'e4f5g6h',
    status: 'completed',
    conclusion: 'failure',
    failedTests: ['NetworkTest.connectionTimeout'],
    totalTests: 89,
    passedTests: 88,
    isFlaky: true,
    errorLogs: 'ETIMEDOUT: Connection timed out after 5000ms — likely flaky network test',
    triggeredBy: 'schedule',
    startedAt: new Date(Date.now() - 1200000).toISOString(),
    completedAt: new Date(Date.now() - 900000).toISOString(),
  },
  // ── New CI mock fixtures ───────────────────────────────────────────────────
  'RUN-1003': {
    runId: 'RUN-1003',
    workflowName: 'e2e-tests.yml',
    branch: 'feature/user-dashboard',
    commit: 'c9d8e7f',
    status: 'completed',
    conclusion: 'failure',
    failedTests: ['DashboardE2E.loadMetrics', 'DashboardE2E.filterDecisions'],
    totalTests: 56,
    passedTests: 54,
    isFlaky: false,
    errorLogs: 'TimeoutError: Expected element #metrics-chart to be visible within 10000ms',
    triggeredBy: 'pull_request',
    startedAt: new Date(Date.now() - 900000).toISOString(),
    completedAt: new Date(Date.now() - 600000).toISOString(),
  },
  'RUN-1004': {
    runId: 'RUN-1004',
    workflowName: 'security-scan.yml',
    branch: 'main',
    commit: 'f1a2b3c',
    status: 'completed',
    conclusion: 'failure',
    failedTests: ['SecurityScan.dependencyAudit'],
    totalTests: 12,
    passedTests: 11,
    isFlaky: true,
    errorLogs: 'npm audit: 1 moderate vulnerability in lodash@4.17.20 — intermittent false positive',
    triggeredBy: 'schedule',
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    completedAt: new Date(Date.now() - 3300000).toISOString(),
  },
};

export const MOCK_CI_DEFAULT: GitHubCIRunMock = {
  runId: 'RUN-9999',
  workflowName: 'ci.yml',
  branch: 'main',
  commit: 'abc1234',
  status: 'completed',
  conclusion: 'failure',
  failedTests: ['SomeTest.method'],
  totalTests: 50,
  passedTests: 49,
  isFlaky: false,
  errorLogs: 'Test failure detected in CI run',
  triggeredBy: 'push',
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
};

// ── PR mocks ──────────────────────────────────────────────────────────────────
export const MOCK_PRS: Record<string, GitHubPRMock> = {
  'PR-42': {
    prNumber: 42,
    title: 'Update README and add contributing guidelines',
    author: 'jsmith',
    branch: 'docs/update-readme',
    baseBranch: 'main',
    filesChanged: 2,
    additions: 45,
    deletions: 12,
    reviewsRequired: 1,
    ciStatus: 'success',
    riskLevel: 'low',
    touchedModules: ['README.md', 'CONTRIBUTING.md'],
    description: 'Documentation-only update with no code changes.',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  'PR-99': {
    prNumber: 99,
    title: 'Refactor payment processing module — PCI compliance update',
    author: 'senior-dev',
    branch: 'feature/pci-refactor',
    baseBranch: 'main',
    filesChanged: 28,
    additions: 1240,
    deletions: 890,
    reviewsRequired: 2,
    ciStatus: 'success',
    riskLevel: 'high',
    touchedModules: ['payments/', 'billing/', 'auth/', 'api/checkout'],
    description: 'Major refactor of payment module for PCI DSS v4.0 compliance.',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  'PR-87': {
    prNumber: 87,
    title: 'Fix null pointer in user profile update',
    author: 'jane',
    branch: 'fix/user-profile-null',
    baseBranch: 'main',
    filesChanged: 3,
    additions: 18,
    deletions: 4,
    reviewsRequired: 1,
    ciStatus: 'success',
    riskLevel: 'low',
    touchedModules: ['src/users/profile.ts', 'src/users/validation.ts'],
    description: 'Hotfix for null pointer exception when updating user profile without an avatar.',
    createdAt: new Date(Date.now() - 1800000).toISOString(),
  },
  'PR-112': {
    prNumber: 112,
    title: 'Add OAuth2 PKCE flow — security hardening',
    author: 'security-team',
    branch: 'feature/oauth2-pkce',
    baseBranch: 'main',
    filesChanged: 14,
    additions: 580,
    deletions: 210,
    reviewsRequired: 3,
    ciStatus: 'failure',
    riskLevel: 'high',
    touchedModules: ['auth/', 'security/', 'api/checkout'],
    description: 'Implementing PKCE extension for OAuth2 authorization code flow. Required for SOC2 Type II.',
    createdAt: new Date(Date.now() - 5400000).toISOString(),
  },
};

export const MOCK_PR_DEFAULT: GitHubPRMock = {
  prNumber: 0,
  title: 'General feature branch PR',
  author: 'developer',
  branch: 'feature/new-feature',
  baseBranch: 'main',
  filesChanged: 5,
  additions: 120,
  deletions: 30,
  reviewsRequired: 1,
  ciStatus: 'success',
  riskLevel: 'medium',
  touchedModules: ['src/'],
  description: 'General feature implementation.',
  createdAt: new Date().toISOString(),
};

// ── Build mocks ───────────────────────────────────────────────────────────────
export const MOCK_BUILDS: Record<string, GitHubBuildMock> = {
  'BUILD-501': {
    buildId: 'BUILD-501',
    workflow: 'deploy-staging.yml',
    branch: 'main',
    commit: 'x7y8z9a',
    status: 'failure',
    errorType: 'transient_infra',
    errorMessage: 'Docker registry timeout: failed to pull image nexagent:latest after 3 retries',
    duration: 145,
    environment: 'staging',
    triggeredBy: 'push',
    startedAt: new Date(Date.now() - 900000).toISOString(),
  },
  'BUILD-502': {
    buildId: 'BUILD-502',
    workflow: 'deploy-production.yml',
    branch: 'release/v2.1.0',
    commit: 'b2c3d4e',
    status: 'failure',
    errorType: 'config_error',
    errorMessage: 'Missing required ENV variable: STRIPE_WEBHOOK_SECRET not set in production environment',
    duration: 23,
    environment: 'production',
    triggeredBy: 'tag',
    startedAt: new Date(Date.now() - 1800000).toISOString(),
  },
  // ── New build mock fixtures ────────────────────────────────────────────────
  'BUILD-503': {
    buildId: 'BUILD-503',
    workflow: 'deploy-production.yml',
    branch: 'release/v2.2.0',
    commit: 'd3e4f5g',
    status: 'failure',
    errorType: 'dependency_error',
    errorMessage: 'npm install failed: ENOTFOUND registry.npmjs.org — DNS resolution failure',
    duration: 38,
    environment: 'production',
    triggeredBy: 'tag',
    startedAt: new Date(Date.now() - 2400000).toISOString(),
  },
  'BUILD-504': {
    buildId: 'BUILD-504',
    workflow: 'build-docker.yml',
    branch: 'feature/auth-refactor',
    commit: 'h6i7j8k',
    status: 'failure',
    errorType: 'code_error',
    errorMessage: 'TypeScript compilation error: Type error in src/auth/jwt.ts line 42 — Property "exp" does not exist on type "JwtPayload"',
    duration: 67,
    environment: 'staging',
    triggeredBy: 'pull_request',
    startedAt: new Date(Date.now() - 3600000).toISOString(),
  },
};

// ── PR diff mocks ─────────────────────────────────────────────────────────────
// Keyed by "PR-{prNumber}". At least one contains a hardcoded secret pattern
// and one is clean, so the guardrail scanner has something real to flag.
export const MOCK_PR_DIFFS: Record<string, string> = {
  // Clean diff — documentation only, no secrets
  'PR-42': `diff --git a/README.md b/README.md
index 1a2b3c4..5d6e7f8 100644
@@ -1,5 +1,8 @@
 # NexAgent
 
-AI-powered IT operations platform.
+AI-powered IT operations automation platform.
+
+## Contributing
+
+See CONTRIBUTING.md for guidelines.
diff --git a/CONTRIBUTING.md b/CONTRIBUTING.md
new file mode 100644
index 0000000..a1b2c3d
@@ -0,0 +1,10 @@
+# Contributing
+
+1. Fork the repository
+2. Create a feature branch
+3. Open a pull request
+4. Ensure all tests pass before requesting review
`,

  // Diff containing a hardcoded API key — should trigger PII api_key guardrail
  'PR-99': `diff --git a/src/payments/processor.ts b/src/payments/processor.ts
index a1b2c3d..e4f5g6h 100644
--- a/src/payments/processor.ts
+++ b/src/payments/processor.ts
@@ -12,6 +12,9 @@ import { stripe } from './client';
 
 export class PaymentProcessor {
+  // TODO: remove before merge
+  private apiKey = 'DUMMY_MOCK_API_KEY_0000000000000000';
+
   async processRefund(orderId: string, amount: number) {
     const charge = await stripe.charges.retrieve(orderId);
     return stripe.refunds.create({ charge: charge.id, amount });
@@ -28,6 +31,12 @@ export class PaymentProcessor {
   async validateCard(token: string): Promise<boolean> {
-    return stripe.tokens.retrieve(token).then(t => !!t.id);
+    const secret_key = 'DUMMY_MOCK_SECRET_KEY_0000000000000000';
+    const result = await stripe.tokens.retrieve(token);
+    return !!result.id;
   }
 }
diff --git a/src/billing/invoice.ts b/src/billing/invoice.ts
index b2c3d4e..c3d4e5f 100644
--- a/src/billing/invoice.ts
+++ b/src/billing/invoice.ts
@@ -5,3 +5,7 @@ export function generateInvoice(userId: string) {
   const invoice = buildInvoicePayload(userId);
+  // password: DUMMY_MOCK_PASSWORD_0000000000000000
   return invoice;
 }
`,

  // High-risk OAuth2 diff — large, touches auth/, no hardcoded secrets
  'PR-112': `diff --git a/auth/oauth2.ts b/auth/oauth2.ts
index c3d4e5f..d4e5f6g 100644
@@ -1,8 +1,42 @@
+import { randomBytes, createHash } from 'crypto';
+
+/** PKCE code verifier — 43-128 char URL-safe string */
+export function generateCodeVerifier(): string {
+  return randomBytes(32).toString('base64url');
+}
+
+/** SHA-256 code challenge from verifier */
+export function generateCodeChallenge(verifier: string): string {
+  return createHash('sha256').update(verifier).digest('base64url');
+}
+
+export function buildAuthorizationUrl(
+  clientId: string,
+  redirectUri: string,
+  codeChallenge: string,
+  state: string
+): string {
+  const params = new URLSearchParams({
+    response_type: 'code',
+    client_id: clientId,
+    redirect_uri: redirectUri,
+    code_challenge: codeChallenge,
+    code_challenge_method: 'S256',
+    state,
+  });
+  return \`https://auth.example.com/authorize?\${params}\`;
+}
diff --git a/security/token-validator.ts b/security/token-validator.ts
index e5f6g7h..f6g7h8i 100644
@@ -10,6 +10,14 @@ export async function validateAccessToken(token: string) {
+  if (!token || token.length < 20) {
+    throw new Error('Invalid token format');
+  }
   const payload = jwt.verify(token, process.env.JWT_SECRET!);
   return payload;
 }
`,

  // Low-risk hotfix diff — clean, small
  'PR-87': `diff --git a/src/users/profile.ts b/src/users/profile.ts
index f6g7h8i..g7h8i9j 100644
@@ -14,7 +14,7 @@ export async function updateProfile(userId: string, data: ProfileUpdate) {
-  const avatarUrl = data.avatar.url;
+  const avatarUrl = data.avatar?.url ?? null;
   await db.users.update({ where: { id: userId }, data: { avatarUrl } });
 }
diff --git a/src/users/validation.ts b/src/users/validation.ts
index h8i9j0k..i9j0k1l 100644
@@ -8,6 +8,9 @@ export function validateProfileUpdate(data: unknown): ProfileUpdate {
+  if (!data || typeof data !== 'object') {
+    throw new Error('Profile update payload must be an object');
+  }
   return profileSchema.parse(data);
 }
`,
};

export const MOCK_DIFF_DEFAULT =
  `diff --git a/src/feature.ts b/src/feature.ts\n` +
  `index abcdef1..abcdef2 100644\n` +
  `@@ -1,3 +1,5 @@\n` +
  ` // existing code\n` +
  `+// new feature line\n`;

export const MOCK_BUILD_DEFAULT: GitHubBuildMock = {
  buildId: 'BUILD-9999',
  workflow: 'ci.yml',
  branch: 'main',
  commit: 'abc1234',
  status: 'failure',
  errorType: 'transient_infra',
  errorMessage: 'Build failed due to infrastructure error',
  duration: 60,
  environment: 'staging',
  triggeredBy: 'push',
  startedAt: new Date().toISOString(),
};
