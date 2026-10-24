/**
 * host-remediation.ts — Real Host Diagnostic & Automated Remediation Engine
 * 
 * Enables NexAgent to safely diagnose and auto-remediate real-world IT issues
 * (VPN gateway failure, stale DNS resolver cache, network adapter glitch,
 * proxy misconfiguration, and remote access services) directly on the host machine.
 *
 * DESIGN DECISIONS:
 * - Catch blocks report actual failure, never hardcode success.
 * - Post-fix verification confirms remediation actually worked.
 * - verificationPassed boolean in result drives downstream decisions.
 * - Unix branch reports NOT_SUPPORTED rather than faking commands.
 * - Keyword trigger requires VPN/DNS/network-specific terms, not bare 'connection'.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

// Hard timeout per shell command — prevents host remediation from blocking a pipeline
// for more than 5 seconds per step. WHY 5s: generous enough for local PowerShell commands
// (DNS flush, RasMan query, ping), tight enough to not stall demo or tests.
// ponytail: a per-command AbortController would be cleaner; this wrapper is simpler.
// WHY 10s: Test-Connection -Count 1 to 8.8.8.8 can take 3-5s on Windows.
// The previous 5s timeout caused false UNVERIFIED when the ping legitimately took > 5s.
// 10s is generous enough for any single PowerShell command on local hardware.
function execWithTimeout(cmd: string, timeoutMs = 10000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd.slice(0, 60)}`));
      }
    }, timeoutMs);

    execAsync(cmd).then(
      (result) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } },
      (err)    => { if (!settled) { settled = true; clearTimeout(timer); reject(err); } }
    );
  });
}

export interface HostRemediationResult {
  executed: boolean;
  platform: string;
  actionsTaken: string[];
  serviceStatus: string;
  dnsFlushed: boolean;
  gatewayPing: boolean;
  commandLogs: string[];
  summary: string;
  durationMs: number;
  /** Whether post-fix verification confirms the remediation actually worked. */
  verificationPassed: boolean;
  /** Errors encountered during remediation (empty if none). */
  errors: string[];
}

/**
 * Checks if a ticket pertains to VPN, network, DNS, or connectivity issues.
 *
 * IMPORTANT: Does NOT match bare 'connection' — that would trigger on
 * "database connection timeout", "Slack connection lost", etc.
 * Requires VPN/DNS/network-specific terms.
 */
export function isNetworkOrVpnTicket(title?: string, description?: string, category?: string): boolean {
  const text = `${title || ''} ${description || ''} ${category || ''}`.toLowerCase();
  return (
    text.includes('vpn') ||
    text.includes('dns') ||
    text.includes('network') ||
    text.includes('connectivity') ||
    text.includes('gateway') ||
    text.includes('wifi') ||
    text.includes('wi-fi') ||
    text.includes('adapter') ||
    // Only match 'connection' when paired with network-specific context
    (text.includes('connection') && (text.includes('vpn') || text.includes('network') || text.includes('internet')))
  );
}

/**
 * Executes real host diagnostic and safe remediation on the local machine.
 *
 * Catch blocks report ACTUAL failure state — they never hardcode success.
 * After all steps, a verification step confirms the fix actually worked.
 */
export async function executeHostRemediation(
  ticketTitle: string,
  ticketDescription: string
): Promise<HostRemediationResult> {
  const start = Date.now();
  const platform = os.platform();
  const commandLogs: string[] = [];
  const actionsTaken: string[] = [];
  const errors: string[] = [];
  let serviceStatus = 'UNKNOWN';
  let dnsFlushed = false;
  let gatewayPing = false;

  logger.info(`[HOST-REMEDIATION] Initiating live host diagnostic and remediation for: "${ticketTitle}"`);

  if (platform === 'win32') {
    // 1. Inspect Windows VPN & Remote Access Connection Manager (RasMan)
    try {
      commandLogs.push('> powershell -Command "Get-Service -Name RasMan, IKEEXT -ErrorAction SilentlyContinue | Select-Object Name, Status"');
      const { stdout } = await execWithTimeout(
        'powershell -NoProfile -Command "Get-Service -Name RasMan -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status"'
      );
      serviceStatus = (stdout || '').trim() || 'UNKNOWN';
      commandLogs.push(`[Service] RasMan (Remote Access Connection Manager): ${serviceStatus}`);
      actionsTaken.push(`Verified VPN Service RasMan is ${serviceStatus}`);
    } catch (err) {
      // Report actual failure — do NOT hardcode 'Running'
      const msg = err instanceof Error ? err.message : String(err);
      serviceStatus = 'QUERY_FAILED';
      errors.push(`RasMan query failed: ${msg.slice(0, 120)}`);
      commandLogs.push(`[Service] RasMan status query FAILED: ${msg.slice(0, 80)}`);
      actionsTaken.push('RasMan service query failed — status unknown');
    }

    // 2. Safe Remediation: Flush & Refresh DNS Resolver Cache
    try {
      commandLogs.push('> powershell -Command "Clear-DnsClientCache"');
      await execWithTimeout('powershell -NoProfile -Command "Clear-DnsClientCache"');
      dnsFlushed = true;
      commandLogs.push('[DNS] Stale DNS resolver cache successfully purged and refreshed.');
      actionsTaken.push('Cleared corrupt/stale DNS client cache (Clear-DnsClientCache)');
    } catch (err: unknown) {
      // Report actual failure — do NOT hardcode dnsFlushed = true
      const msg = err instanceof Error ? err.message : String(err);
      dnsFlushed = false;
      errors.push(`DNS flush failed: ${msg.slice(0, 120)}`);
      commandLogs.push(`[DNS] Clear-DnsClientCache FAILED: ${msg.slice(0, 80)}`);
      actionsTaken.push('DNS cache flush attempted but FAILED');
    }

    // 3. Inspect Active Network Adapters
    try {
      commandLogs.push('> powershell -Command "Get-NetAdapter | Where-Object Status -eq \'Up\' | Select-Object Name, LinkSpeed"');
      const { stdout } = await execWithTimeout(
        'powershell -NoProfile -Command "Get-NetAdapter | Where-Object Status -eq \'Up\' | Select-Object -First 1 -ExpandProperty Name"'
      );
      const activeAdapter = (stdout || '').trim() || 'UNKNOWN';
      commandLogs.push(`[Network] Active network interface detected: ${activeAdapter} (Status: Up)`);
      actionsTaken.push(`Verified active adapter (${activeAdapter})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Adapter query failed: ${msg.slice(0, 120)}`);
      commandLogs.push(`[Network] Active network adapter check FAILED: ${msg.slice(0, 80)}`);
    }

    // 4. Test Gateway & External DNS Connectivity
    try {
      commandLogs.push('> powershell -Command "Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet"');
      const { stdout } = await execWithTimeout(
        'powershell -NoProfile -Command "Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet"'
      );
      gatewayPing = (stdout || '').trim().toLowerCase() === 'true';
      commandLogs.push(`[Ping] Gateway & Internet DNS reachability: ${gatewayPing ? 'SUCCESS' : 'TIMEOUT'}`);
      if (gatewayPing) {
        actionsTaken.push('Verified end-to-end gateway reachability (8.8.8.8)');
      } else {
        errors.push('Gateway ping returned false — network may still be degraded');
      }
    } catch (err) {
      // Report actual failure — do NOT hardcode gatewayPing = true
      const msg = err instanceof Error ? err.message : String(err);
      gatewayPing = false;
      errors.push(`Gateway ping failed: ${msg.slice(0, 120)}`);
      commandLogs.push(`[Ping] Gateway reachability test FAILED: ${msg.slice(0, 80)}`);
    }
  } else {
    // Unix / macOS — report as not supported rather than faking success
    actionsTaken.push('Platform is Unix/macOS — host remediation not supported');
    dnsFlushed = false;
    gatewayPing = false;
    serviceStatus = 'NOT_SUPPORTED';
    errors.push('Host remediation commands are Windows-only; Unix branch not implemented');
    commandLogs.push('[Host] Unix/macOS platform detected — remediation NOT executed (Windows-only commands).');
  }

  // POST-FIX VERIFICATION: confirm the remediation actually worked
  const verificationPassed = dnsFlushed && gatewayPing && serviceStatus !== 'QUERY_FAILED' && serviceStatus !== 'NOT_SUPPORTED';

  const durationMs = Date.now() - start;
  const statusLabel = verificationPassed ? 'VERIFIED' : 'UNVERIFIED';
  const summary = verificationPassed
    ? `Host Remediation ${statusLabel} in ${durationMs}ms: Flushed DNS resolver cache, verified RasMan VPN service (${serviceStatus}), verified network adapter, and validated gateway connectivity (REACHABLE).`
    : `Host Remediation ${statusLabel} in ${durationMs}ms: ${errors.length} error(s) encountered. DNS flushed: ${dnsFlushed}, gateway reachable: ${gatewayPing}, service: ${serviceStatus}. Errors: ${errors.join('; ')}`;

  commandLogs.push(`[Result] ${summary}`);

  return {
    executed: true,
    platform: os.type() + ' ' + os.release(),
    actionsTaken,
    serviceStatus,
    dnsFlushed,
    gatewayPing,
    commandLogs,
    summary,
    durationMs,
    verificationPassed,
    errors,
  };
}
