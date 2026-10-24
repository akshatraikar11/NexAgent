import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before importing host-remediation
vi.mock('child_process', () => {
  return {
    exec: vi.fn(),
  };
});

import { exec } from 'child_process';
import { executeHostRemediation, isNetworkOrVpnTicket } from '../../src/agency/host-remediation.js';

describe('Host Remediation — Safe Verification and Failure Path Diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keyword filter rejects loose "connection" without network/vpn context', () => {
    expect(isNetworkOrVpnTicket('Database connection pool exhausted', 'SequelizeConnectionError', 'BACKEND')).toBe(false);
    expect(isNetworkOrVpnTicket('Slack connection dropped in workspace', 'Socket closed', 'COLLAB')).toBe(false);
    expect(isNetworkOrVpnTicket('VPN connection dropped', 'Gateway timeout', 'NETWORK')).toBe(true);
    expect(isNetworkOrVpnTicket('Internet connection failing in building 4', 'Wi-Fi drop', 'IT_SUPPORT')).toBe(true);
    expect(isNetworkOrVpnTicket('DNS resolution failure for jira', 'Lookup timeout', 'IT_SUPPORT')).toBe(true);
  });

  it('records verificationPassed: false and captures error when Clear-DnsClientCache throws', async () => {
    // Platform is Windows on test machine, or if win32:
    const mockExec = vi.mocked(exec);
    // Cast needed: mock returns void but TS expects ChildProcess; vitest runtime ignores the return value
    mockExec.mockImplementation(((cmd: any, cb: any) => {
      const commandStr = String(cmd);
      if (commandStr.includes('Get-Service')) {
        cb(null, { stdout: 'Running\n', stderr: '' });
      } else if (commandStr.includes('Clear-DnsClientCache')) {
        cb(new Error('Access denied: Administrator privileges required to flush DNS cache'), { stdout: '', stderr: 'Access denied' });
      } else if (commandStr.includes('Get-NetAdapter')) {
        cb(null, { stdout: 'Ethernet\n', stderr: '' });
      } else if (commandStr.includes('Test-Connection')) {
        cb(null, { stdout: 'True\n', stderr: '' });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    }) as any);

    const result = await executeHostRemediation('VPN adapter unresponsive', 'DNS cache corrupted');
    expect(result.executed).toBe(true);
    expect(result.dnsFlushed).toBe(false);
    expect(result.verificationPassed).toBe(false);
    expect(result.errors.some(e => e.includes('DNS flush failed'))).toBe(true);
    expect(result.summary).toContain('UNVERIFIED');
  });

  it('records verificationPassed: false when gateway ping returns false or times out', async () => {
    const mockExec = vi.mocked(exec);
    mockExec.mockImplementation(((cmd: any, cb: any) => {
      const commandStr = String(cmd);
      if (commandStr.includes('Get-Service')) {
        cb(null, { stdout: 'Running\n', stderr: '' });
      } else if (commandStr.includes('Clear-DnsClientCache')) {
        cb(null, { stdout: '', stderr: '' });
      } else if (commandStr.includes('Get-NetAdapter')) {
        cb(null, { stdout: 'Ethernet\n', stderr: '' });
      } else if (commandStr.includes('Test-Connection')) {
        // Ping returns false
        cb(null, { stdout: 'False\n', stderr: '' });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    }) as any);

    const result = await executeHostRemediation('VPN connection down', 'Unable to reach gateway');
    expect(result.executed).toBe(true);
    expect(result.gatewayPing).toBe(false);
    expect(result.verificationPassed).toBe(false);
    expect(result.errors.some(e => e.includes('Gateway ping returned false'))).toBe(true);
  });

  it('records verificationPassed: false when RasMan service query fails', async () => {
    const mockExec = vi.mocked(exec);
    mockExec.mockImplementation(((cmd: any, cb: any) => {
      const commandStr = String(cmd);
      if (commandStr.includes('Get-Service')) {
        cb(new Error('WMI service query timeout'), { stdout: '', stderr: 'WMI error' });
      } else if (commandStr.includes('Clear-DnsClientCache')) {
        cb(null, { stdout: '', stderr: '' });
      } else if (commandStr.includes('Get-NetAdapter')) {
        cb(null, { stdout: 'Ethernet\n', stderr: '' });
      } else if (commandStr.includes('Test-Connection')) {
        cb(null, { stdout: 'True\n', stderr: '' });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    }) as any);

    const result = await executeHostRemediation('VPN service not responding', 'RasMan status check');
    expect(result.serviceStatus).toBe('QUERY_FAILED');
    expect(result.verificationPassed).toBe(false);
    expect(result.errors.some(e => e.includes('RasMan query failed'))).toBe(true);
  });

  it('reports verificationPassed: true ONLY when all steps succeed without errors', async () => {
    const mockExec = vi.mocked(exec);
    mockExec.mockImplementation(((cmd: any, cb: any) => {
      const commandStr = String(cmd);
      if (commandStr.includes('Get-Service')) {
        cb(null, { stdout: 'Running\n', stderr: '' });
      } else if (commandStr.includes('Clear-DnsClientCache')) {
        cb(null, { stdout: '', stderr: '' });
      } else if (commandStr.includes('Get-NetAdapter')) {
        cb(null, { stdout: 'Wi-Fi\n', stderr: '' });
      } else if (commandStr.includes('Test-Connection')) {
        cb(null, { stdout: 'True\n', stderr: '' });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    }) as any);

    const result = await executeHostRemediation('VPN connection issues', 'DNS resolver reset');
    expect(result.dnsFlushed).toBe(true);
    expect(result.gatewayPing).toBe(true);
    expect(result.serviceStatus).toBe('Running');
    expect(result.verificationPassed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.summary).toContain('VERIFIED');
  });

  it('negative test: when fix is disabled or fails, verificationPassed must FAIL (false)', async () => {
    const mockExec = vi.mocked(exec);
    mockExec.mockImplementation(((cmd: any, cb: any) => {
      const commandStr = String(cmd);
      if (commandStr.includes('Get-Service')) {
        cb(null, { stdout: 'Running\n', stderr: '' });
      } else if (commandStr.includes('Clear-DnsClientCache')) {
        // Fix disabled or fails
        cb(new Error('Remediation fix disabled / failed'), { stdout: '', stderr: 'Action failed' });
      } else if (commandStr.includes('Get-NetAdapter')) {
        cb(null, { stdout: 'Wi-Fi\n', stderr: '' });
      } else if (commandStr.includes('Test-Connection')) {
        cb(null, { stdout: 'False\n', stderr: '' });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    }) as any);

    const result = await executeHostRemediation('VPN connection issues', 'DNS resolver reset');
    expect(result.dnsFlushed).toBe(false);
    expect(result.verificationPassed).toBe(false);
    expect(result.summary).toContain('UNVERIFIED');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
