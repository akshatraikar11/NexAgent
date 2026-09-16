export interface SentryAlertMock {
  alertId: string;
  title: string;
  description: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  service: string;
  environment: string;
  errorCount: number;
  firstSeen: string;
  tags: Record<string, string>;
}

export const MOCK_SENTRY_ALERTS: Record<string, SentryAlertMock> = {
  'INC-8891': {
    alertId: 'INC-8891',
    title: 'Database High Latency & Drop Warning',
    description: 'High severity alert: PostgreSQL connection pool exhausted. Active connections: 500/500.',
    severity: 'P1',
    service: 'postgres-primary',
    environment: 'production',
    errorCount: 1247,
    firstSeen: new Date(Date.now() - 15 * 60_000).toISOString(),
    tags: { region: 'us-east-1', team: 'sre' },
  },
  'INC-7702': {
    alertId: 'INC-7702',
    title: 'Minor memory spike on staging worker',
    description: 'Memory usage exceeded 80% threshold on staging worker pool. No user impact.',
    severity: 'P3',
    service: 'worker-staging',
    environment: 'staging',
    errorCount: 12,
    firstSeen: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    tags: { region: 'us-west-2', team: 'platform' },
  },
  'INC-9901': {
    alertId: 'INC-9901',
    title: 'Payment processing service down — 100% error rate',
    description: 'All payment API requests returning 503. Revenue impact estimated $12k/hour.',
    severity: 'P0',
    service: 'payment-api',
    environment: 'production',
    errorCount: 8934,
    firstSeen: new Date(Date.now() - 5 * 60_000).toISOString(),
    tags: { region: 'global', team: 'payments' },
  },
  // ── New mock fixtures ──────────────────────────────────────────────────────
  'INC-4401': {
    alertId: 'INC-4401',
    title: 'Memory Leak Detected — user-service pod',
    description: 'K8s pod user-service-7d9f8b experiencing gradual memory increase from 512MB to 2.4GB over 6 hours. OOMKill imminent.',
    severity: 'P1',
    service: 'user-service',
    environment: 'production',
    errorCount: 0,
    firstSeen: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
    tags: { region: 'us-east-1', team: 'platform', pod: 'user-service-7d9f8b' },
  },
  'INC-5512': {
    alertId: 'INC-5512',
    title: 'Kubernetes Pod CrashLoopBackOff — worker-queue',
    description: 'Pod worker-queue-consumer-3 in namespace production entering CrashLoopBackOff. 14 restarts in last 30 minutes. Redis connection refused.',
    severity: 'P1',
    service: 'worker-queue',
    environment: 'production',
    errorCount: 14,
    firstSeen: new Date(Date.now() - 35 * 60_000).toISOString(),
    tags: { region: 'us-east-1', team: 'platform', namespace: 'production' },
  },
  'INC-6623': {
    alertId: 'INC-6623',
    title: 'CDN Cache Miss Rate > 90% — assets.company.com',
    description: 'CloudFront cache miss rate spiked to 93% after deployment. Origin server load increased 8x. User page load times > 8s.',
    severity: 'P2',
    service: 'cdn-assets',
    environment: 'production',
    errorCount: 0,
    firstSeen: new Date(Date.now() - 20 * 60_000).toISOString(),
    tags: { region: 'global', team: 'frontend' },
  },
};

export const MOCK_SENTRY_DEFAULT: SentryAlertMock = {
  alertId: 'INC-0000',
  title: 'Unknown alert',
  description: 'Unclassified Sentry alert.',
  severity: 'P2',
  service: 'unknown',
  environment: 'production',
  errorCount: 1,
  firstSeen: new Date().toISOString(),
  tags: {},
};
