import { describe, it, expect } from 'vitest';
import { classifyIncidentSeverity } from '../../src/agency/severity.js';

describe('Agency-Agents NEXUS Severity Classification', () => {
  it('classifies payment outage as P0', () => {
    const result = classifyIncidentSeverity(
      'Payment processing service down',
      '100% error rate on all payment API requests',
      5000,
      'production'
    );
    expect(result.severity).toBe('P0');
    expect(result.escalateImmediately).toBe(true);
  });

  it('classifies staging warning as P3', () => {
    const result = classifyIncidentSeverity(
      'Minor memory spike staging',
      'Memory usage exceeded 80% on staging worker',
      12,
      'staging'
    );
    expect(result.severity).toBe('P3');
    expect(result.escalateImmediately).toBe(false);
  });

  it('classifies database prod issue as P1', () => {
    const result = classifyIncidentSeverity(
      'Database connection timeout',
      'PostgreSQL connection pool exhausted in production',
      800,
      'production'
    );
    expect(['P0', 'P1']).toContain(result.severity);
    expect(result.responseTeam.length).toBeGreaterThan(0);
  });
});
