/**
 * PagerDuty Connector — real HTTP REST API
 *
 * Adds PagerDuty as a 5th MCP integration (alongside Jira/Slack/GitHub/Sentry).
 * Used by the Incident Response pipeline for:
 *   - Fetching active incidents (replaces/augments Sentry alerts)
 *   - Creating incidents when CCEP decides ESCALATE
 *   - Triggering on-call notifications
 *
 * Priority: 1. Real PagerDuty API (PAGERDUTY_TOKEN set) → 2. Mock fixtures
 * No MCP stdio for PagerDuty — their official API is REST-first.
 */
import { logger } from '../utils/logger.js';

export interface PagerDutyIncident {
  id: string;
  title: string;
  description: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  status: 'triggered' | 'acknowledged' | 'resolved';
  service: string;
  urgency: 'high' | 'low';
  createdAt: string;
  htmlUrl: string;
}

// ponytail: mock fixtures cover common incident patterns for demo mode
const MOCK_INCIDENTS: PagerDutyIncident[] = [
  {
    id: 'PD-INC-001',
    title: 'High CPU usage on payment-service prod',
    description: 'CPU utilization sustained above 95% for 10 minutes on payment-service cluster.',
    severity: 'P2', status: 'triggered', service: 'payment-service', urgency: 'high',
    createdAt: new Date(Date.now() - 15 * 60_000).toISOString(), htmlUrl: '#',
  },
  {
    id: 'PD-INC-002',
    title: 'Database replication lag > 30s',
    description: 'Read replica falling behind primary by 35 seconds in us-east-1.',
    severity: 'P3', status: 'triggered', service: 'postgres-primary', urgency: 'low',
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(), htmlUrl: '#',
  },
  {
    id: 'PD-INC-003',
    title: 'Complete outage: checkout API 100% errors',
    description: 'All requests to /api/checkout returning 503. Revenue impact active.',
    severity: 'P1', status: 'triggered', service: 'checkout-api', urgency: 'high',
    createdAt: new Date(Date.now() - 2 * 60_000).toISOString(), htmlUrl: '#',
  },
];

export class PagerDutyConnector {
  private get token(): string | undefined { return process.env.PAGERDUTY_TOKEN; }
  private get serviceId(): string | undefined { return process.env.PAGERDUTY_SERVICE_ID; }
  private get useReal(): boolean {
    return process.env.MOCK_MODE !== 'true' && !!this.token;
  }

  private headers() {
    return {
      Authorization: `Token token=${this.token}`,
      Accept: 'application/vnd.pagerduty+json;version=2',
      'Content-Type': 'application/json',
    };
  }

  /** List active (triggered/acknowledged) incidents */
  public async listActiveIncidents(limit = 5): Promise<PagerDutyIncident[]> {
    if (!this.useReal) return MOCK_INCIDENTS.slice(0, limit);
    try {
      const params = new URLSearchParams({ statuses: 'triggered,acknowledged', limit: String(limit), 'sort_by': 'created_at:desc' });
      const res = await fetch(`https://api.pagerduty.com/incidents?${params}`, {
        headers: this.headers(), signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`PagerDuty HTTP ${res.status}`);
      const data = await res.json() as { incidents: { id: string; title: string; description: string; urgency: string; status: string; service: { summary: string }; created_at: string; html_url: string; impacted_services?: { summary: string }[] }[] };
      logger.info(`[PAGERDUTY] Fetched ${data.incidents.length} active incidents`);
      return data.incidents.map((inc) => ({
        id: inc.id,
        title: inc.title,
        description: inc.description || inc.title,
        severity: (inc.urgency === 'high' ? 'P1' : 'P3') as PagerDutyIncident['severity'],
        status: inc.status as PagerDutyIncident['status'],
        service: inc.service.summary,
        urgency: inc.urgency as 'high' | 'low',
        createdAt: inc.created_at,
        htmlUrl: inc.html_url,
      }));
    } catch (err) {
      logger.warn({ err }, '[PAGERDUTY] listActiveIncidents failed, using mock');
      return MOCK_INCIDENTS.slice(0, limit);
    }
  }

  /** Trigger a new PagerDuty incident (called when CCEP decides ESCALATE) */
  public async triggerIncident(title: string, body: string, severity: 'critical' | 'error' | 'warning' | 'info' = 'error'): Promise<{ id: string; url: string }> {
    if (!this.useReal || !this.serviceId) {
      logger.info(`[PAGERDUTY] Mock: would trigger incident: ${title}`);
      return { id: `PD-MOCK-${Date.now()}`, url: '#' };
    }
    try {
      const res = await fetch('https://api.pagerduty.com/incidents', {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          incident: {
            type: 'incident',
            title,
            service: { id: this.serviceId, type: 'service_reference' },
            body: { type: 'incident_body', details: body },
            urgency: severity === 'critical' ? 'high' : 'low',
          },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`PagerDuty trigger HTTP ${res.status}`);
      const data = await res.json() as { incident: { id: string; html_url: string } };
      logger.info(`[PAGERDUTY] Real: triggered incident ${data.incident.id}`);
      return { id: data.incident.id, url: data.incident.html_url };
    } catch (err) {
      logger.warn({ err }, '[PAGERDUTY] triggerIncident failed');
      return { id: `PD-MOCK-${Date.now()}`, url: '#' };
    }
  }

  /** Acknowledge an incident */
  public async acknowledgeIncident(incidentId: string, from: string): Promise<boolean> {
    if (!this.useReal) return true;
    try {
      const res = await fetch(`https://api.pagerduty.com/incidents/${incidentId}`, {
        method: 'PUT',
        headers: { ...this.headers(), From: from },
        body: JSON.stringify({ incident: { type: 'incident', status: 'acknowledged' } }),
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } catch (err) {
      logger.warn({ err }, '[PAGERDUTY] acknowledgeIncident failed');
      return false;
    }
  }
}

export const pagerdutyConnector = new PagerDutyConnector();
