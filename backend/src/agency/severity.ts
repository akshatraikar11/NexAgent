/**
 * P0–P3 severity classification adapted from agency-agents NEXUS incident-response runbook.
 * @see agency-agents-main/strategy/runbooks/scenario-incident-response.md
 */

export type IncidentSeverity = 'P0' | 'P1' | 'P2' | 'P3';

export interface SeverityClassification {
  severity: IncidentSeverity;
  responseTimeTarget: string;
  escalateImmediately: boolean;
  responseTeam: string[];
  rationale: string;
}

const SEVERITY_RULES: {
  severity: IncidentSeverity;
  keywords: string[];
  responseTime: string;
  team: string[];
}[] = [
  {
    severity: 'P0',
    keywords: ['data loss', 'security breach', 'completely down', '100% error', 'auth system failure', 'ddos', 'corruption', 'payment processing down'],
    responseTime: 'Immediate (all hands)',
    team: ['Infrastructure Maintainer', 'DevOps Automator', 'Executive Summary Generator', 'Support Responder'],
  },
  {
    severity: 'P1',
    keywords: ['database', 'outage', 'connection pool', '50% error', 'latency spike', 'prod', 'production', 'memory exhaustion', 'cascade'],
    responseTime: '< 1 hour',
    team: ['Infrastructure Maintainer', 'DevOps Automator', 'Support Responder'],
  },
  {
    severity: 'P2',
    keywords: ['degraded', 'workaround', 'non-critical', 'search not working', 'api errors'],
    responseTime: '< 4 hours',
    team: ['Relevant Developer Agent', 'Evidence Collector'],
  },
  {
    severity: 'P3',
    keywords: ['staging', 'dev', 'warning', 'minor', 'cosmetic', 'typo', 'test environment'],
    responseTime: 'Next sprint',
    team: ['Sprint Prioritizer'],
  },
];

export function classifyIncidentSeverity(
  title: string,
  description: string,
  errorCount = 0,
  environment = 'production'
): SeverityClassification {
  const text = `${title} ${description}`.toLowerCase();

  for (const rule of SEVERITY_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return {
        severity: rule.severity,
        responseTimeTarget: rule.responseTime,
        escalateImmediately: rule.severity === 'P0' || rule.severity === 'P1',
        responseTeam: rule.team,
        rationale: `Matched ${rule.severity} keyword rules from NEXUS incident-response runbook.`,
      };
    }
  }

  // Heuristic fallback
  if (environment === 'production' && errorCount > 500) {
    return {
      severity: 'P1',
      responseTimeTarget: '< 1 hour',
      escalateImmediately: true,
      responseTeam: SEVERITY_RULES[1].team,
      rationale: `Production alert with ${errorCount} errors exceeds P1 threshold.`,
    };
  }
  if (environment !== 'production') {
    return {
      severity: 'P3',
      responseTimeTarget: 'Next sprint',
      escalateImmediately: false,
      responseTeam: SEVERITY_RULES[3].team,
      rationale: 'Non-production environment — default P3.',
    };
  }

  return {
    severity: 'P2',
    responseTimeTarget: '< 4 hours',
    escalateImmediately: false,
    responseTeam: SEVERITY_RULES[2].team,
    rationale: 'No keyword match — default P2 medium severity.',
  };
}

/** Map severity to CCEP action reversibility weight hint */
export function severityToReversibilityHint(severity: IncidentSeverity): number {
  switch (severity) {
    case 'P0': return 1.0;
    case 'P1': return 0.9;
    case 'P2': return 0.5;
    case 'P3': return 0.1;
  }
}
