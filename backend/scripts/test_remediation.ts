import { executeHostRemediation } from '../src/agency/host-remediation.js';

async function main() {
  console.log('[TEST] Starting live host remediation test on this machine...');
  const res = await executeHostRemediation(
    'VPN Access Gateway Failure',
    'Remote Access Connection Manager and DNS cache issues'
  );
  console.log('\n--- REAL SYSTEM EXECUTION OUTPUT ---');
  console.log('Platform:', res.platform);
  console.log('VPN Service (RasMan):', res.serviceStatus);
  console.log('DNS Purged & Refreshed:', res.dnsFlushed);
  console.log('Gateway Ping (8.8.8.8):', res.gatewayPing ? 'SUCCESS' : 'FAILED');
  console.log('Execution Latency:', res.durationMs + 'ms');
  console.log('\nCommand Logs:');
  res.commandLogs.forEach((l) => console.log('  ', l));
  console.log('\nSummary:', res.summary);
  console.log('--- TEST COMPLETED SUCCESSFULLY ---');
}

main().catch(console.error);
