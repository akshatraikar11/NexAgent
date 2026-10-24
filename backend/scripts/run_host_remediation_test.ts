import { executeHostRemediation } from '../src/agency/host-remediation.js';

async function main() {
  console.log('=== RUNNING LIVE HOST REMEDIATION ON WINDOWS 11 ===');
  const result = await executeHostRemediation('VPN connection failure', 'Flushing DNS cache and checking gateway reachability');
  console.log('\nResult:');
  console.log(JSON.stringify(result, null, 2));
}

main();
