export interface JiraIssueMock {
  id: string;
  key: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  reporter: string;
  created: string;
}

export const MOCK_JIRA_ISSUES: Record<string, JiraIssueMock> = {
  'JIRA-101': {
    id: '10001',
    key: 'JIRA-101',
    title: 'VPN Access Password Reset Request',
    description: 'User locked out of corporate VPN after multiple failed password attempts. Standard password reset required.',
    status: 'OPEN',
    priority: 'LOW',
    category: 'IT_SUPPORT',
    reporter: 'alice@company.com',
    created: '2026-08-13T10:00:00Z',
  },
  'JIRA-102': {
    id: '10002',
    key: 'JIRA-102',
    title: 'Double Charged Billing Dispute',
    description: 'Customer claims they were billed twice for monthly subscription invoice #INV-9921. Urgent refund requested.',
    status: 'OPEN',
    priority: 'HIGH',
    category: 'BILLING',
    reporter: 'bob@enterprise.org',
    created: '2026-08-13T10:30:00Z',
  },
  'JIRA-103': {
    id: '10003',
    key: 'JIRA-103',
    title: 'Database High Latency & Drop Warning',
    description: 'Production database latency spiked above 500ms. Connection pool exhausted in region us-east-1.',
    status: 'OPEN',
    priority: 'CRITICAL',
    category: 'INFRASTRUCTURE',
    reporter: 'sre-monitoring@company.com',
    created: '2026-08-13T11:00:00Z',
  },
  // ── New mock fixtures ──────────────────────────────────────────────────────
  'JIRA-104': {
    id: '10004',
    key: 'JIRA-104',
    title: 'Password Reset — Standard User Account',
    description: 'Employee forgot Windows AD password. Requires standard IT password reset via service desk.',
    status: 'OPEN',
    priority: 'LOW',
    category: 'IT_SUPPORT',
    reporter: 'carol@company.com',
    created: new Date(Date.now() - 30 * 60_000).toISOString(),
  },
  'JIRA-105': {
    id: '10005',
    key: 'JIRA-105',
    title: 'Firewall Rule Request — External API Access',
    description: 'Engineering team needs outbound firewall rule opened for new third-party payment gateway at 52.14.88.0/24:443.',
    status: 'OPEN',
    priority: 'MEDIUM',
    category: 'SECURITY',
    reporter: 'devops@company.com',
    created: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
  },
  'JIRA-106': {
    id: '10006',
    key: 'JIRA-106',
    title: 'SSL Certificate Expiry — api.company.com',
    description: 'SSL certificate for api.company.com expires in 3 days. Auto-renewal failed. Manual renewal required to prevent outage.',
    status: 'OPEN',
    priority: 'HIGH',
    category: 'INFRASTRUCTURE',
    reporter: 'monitoring-bot@company.com',
    created: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
  },
  'JIRA-107': {
    id: '10007',
    key: 'JIRA-107',
    title: 'Database Backup Failure — nightly-backup-prod',
    description: 'Nightly PostgreSQL backup job failed at 02:00 UTC. S3 upload timed out. Last successful backup was 48 hours ago.',
    status: 'OPEN',
    priority: 'HIGH',
    category: 'INFRASTRUCTURE',
    reporter: 'backup-service@company.com',
    created: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
  },
  'JIRA-108': {
    id: '10008',
    key: 'JIRA-108',
    title: 'CORS Error in Production — checkout.company.com',
    description: 'Frontend reporting CORS policy violation on POST /api/v2/checkout from checkout.company.com. Affecting 12% of checkout completions.',
    status: 'OPEN',
    priority: 'HIGH',
    category: 'INFRASTRUCTURE',
    reporter: 'frontend-alerts@company.com',
    created: new Date(Date.now() - 45 * 60_000).toISOString(),
  },

  // ── FinFlow Payments — real-world scenario fixtures ──────────────────────
  // Company: FinFlow Payments — B2B payments platform, 3000+ merchants, PCI DSS Level 1
  // Service Desk: IT Helpdesk + SRE On-Call + Engineering (150-person eng org)

  'FF-1001': {
    id: '20001',
    key: 'FF-1001',
    title: 'Merchant Portal Login Broken — SSO Redirect Loop',
    description: 'Multiple merchants reporting infinite redirect loop on login at merchant.finflow.io. Auth0 SSO redirect_uri mismatch after yesterday\'s NGINX config change. Estimated 400+ merchants unable to log in.',
    status: 'OPEN',
    priority: 'HIGH',
    category: 'INFRASTRUCTURE',
    reporter: 'helpdesk@finflow.io',
    created: new Date(Date.now() - 22 * 60_000).toISOString(),
  },
  'FF-1002': {
    id: '20002',
    key: 'FF-1002',
    title: 'New Employee Laptop Setup — onboarding-john.doe@finflow.io',
    description: 'New hire John Doe joining the data engineering team on Monday. Requires: MacBook Pro provisioned, GitHub org invite, Okta enrollment, Jira/Confluence access, and VPN client installation. Standard onboarding checklist.',
    status: 'OPEN',
    priority: 'LOW',
    category: 'IT_SUPPORT',
    reporter: 'hr@finflow.io',
    created: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
  },
  'FF-1003': {
    id: '20003',
    key: 'FF-1003',
    title: 'Duplicate Transaction Charge — Merchant TXN-FF-88821',
    description: 'Merchant "GreenLeaf Retail" (merchant_id: ff_9921) reporting customer was double-charged $249.99 on transaction TXN-FF-88821 due to idempotency key collision. Chargeback risk. Requires manual refund and audit trail before responding to merchant.',
    status: 'OPEN',
    priority: 'HIGH',
    category: 'BILLING',
    reporter: 'merchant-support@finflow.io',
    created: new Date(Date.now() - 55 * 60_000).toISOString(),
  },
  'FF-1004': {
    id: '20004',
    key: 'FF-1004',
    title: 'Webhook Delivery Failures — payment.succeeded events not firing',
    description: 'FinFlow webhook dispatcher reporting 94% delivery failure rate for payment.succeeded events since 09:15 UTC. Root cause: Redis queue worker crashed. Merchants not receiving real-time payment confirmations. Estimated $0 direct loss but SLA breach if unresolved in 30 mins.',
    status: 'OPEN',
    priority: 'HIGH',
    category: 'INFRASTRUCTURE',
    reporter: 'platform-alerts@finflow.io',
    created: new Date(Date.now() - 18 * 60_000).toISOString(),
  },
  'FF-1005': {
    id: '20005',
    key: 'FF-1005',
    title: 'Add Read Replica to Dashboard Reporting DB — non-urgent',
    description: 'Analytics team requesting a read replica of the reporting PostgreSQL instance to offload heavy dashboard queries. No production impact. Requires DBA approval and a 2-hour maintenance window on weekend. Task estimated 4 hours.',
    status: 'OPEN',
    priority: 'LOW',
    category: 'INFRASTRUCTURE',
    reporter: 'analytics-team@finflow.io',
    created: new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString(),
  },
};

export const MOCK_JIRA_DEFAULT_ISSUE: JiraIssueMock = {
  id: '10099',
  key: 'JIRA-999',
  title: 'General Support Ticket',
  description: 'General system support request and inquiry.',
  status: 'OPEN',
  priority: 'MEDIUM',
  category: 'GENERAL',
  reporter: 'user@company.com',
  created: new Date().toISOString(),
};
