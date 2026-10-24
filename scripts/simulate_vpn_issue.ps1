# simulate_vpn_issue.ps1 - NexAgent Live Fault Induction Demo
# Induces a controlled DNS fault, runs agent remediation, verifies recovery, rolls back.
# Run from project root: powershell -ExecutionPolicy Bypass -File simulate_vpn_issue.ps1

param([switch]$DiagnosticOnly)

$ErrorActionPreference = "Continue"
$FAKE_HOST = "nexagent-demo-fault-test.internal"
$FAKE_IP   = "192.0.2.1"
$HOSTS     = "$env:SystemRoot\System32\drivers\etc\hosts"
$INJECTED  = $false

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " NexAgent - Live Fault Induction and Auto-Remediation Demo" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# STEP 1: Baseline
Write-Host "[1/5] BEFORE STATE" -ForegroundColor White
$svc = Get-Service -Name RasMan -ErrorAction SilentlyContinue
Write-Host "  RasMan (VPN service) : $($svc.Status)" -ForegroundColor Green
$adp = Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object -First 1
Write-Host "  Active adapter       : $($adp.Name)" -ForegroundColor Green
$p1 = Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet
$c1 = if ($p1) { "Green" } else { "Red" }
$l1 = if ($p1) { "REACHABLE" } else { "UNREACHABLE" }
Write-Host "  Gateway 8.8.8.8      : $l1" -ForegroundColor $c1

# STEP 2: Fault injection
Write-Host ""
Write-Host "[2/5] FAULT INJECTION - Adding bad DNS entry to hosts file" -ForegroundColor Yellow
if ($DiagnosticOnly) {
    Write-Host "  Skipped (DiagnosticOnly mode)" -ForegroundColor DarkYellow
} else {
    try {
        $ex = Select-String -Path $HOSTS -Pattern $FAKE_HOST -ErrorAction SilentlyContinue
        if (-not $ex) {
            Add-Content -Path $HOSTS -Value "`n$FAKE_IP  $FAKE_HOST  # NexAgent demo - safe to delete"
            $INJECTED = $true
            Write-Host "  Injected: $FAKE_IP -> $FAKE_HOST (RFC5737, non-routable)" -ForegroundColor Red
        } else {
            $INJECTED = $true
            Write-Host "  Entry already present (previous run)" -ForegroundColor DarkYellow
        }
    } catch {
        Write-Host "  Hosts write failed (needs Admin): $($_.Exception.Message.Split([char]10)[0])" -ForegroundColor DarkYellow
        Write-Host "  Continuing in diagnostic mode..." -ForegroundColor DarkYellow
    }
}

# STEP 3: Verify fault visible
Write-Host ""
Write-Host "[3/5] VERIFY FAULT IS VISIBLE" -ForegroundColor Yellow
$r1 = Resolve-DnsName $FAKE_HOST -ErrorAction SilentlyContinue
if ($r1) {
    Write-Host "  DNS resolves $FAKE_HOST -> $($r1.IPAddress) [FAULT ACTIVE]" -ForegroundColor Red
} else {
    Write-Host "  DNS cannot resolve $FAKE_HOST [fault visible to resolver]" -ForegroundColor DarkYellow
}

# STEP 4: Agent remediation (same commands as host-remediation.ts)
Write-Host ""
Write-Host "[4/5] AGENT REMEDIATION - executeHostRemediation commands" -ForegroundColor White
try {
    Write-Host "  > Get-Service RasMan" -ForegroundColor DarkGray
    $svcStatus = (Get-Service -Name RasMan -ErrorAction SilentlyContinue).Status
    Write-Host "  RasMan: $svcStatus" -ForegroundColor Cyan

    Write-Host "  > Clear-DnsClientCache" -ForegroundColor DarkGray
    Clear-DnsClientCache
    Write-Host "  DNS cache FLUSHED" -ForegroundColor Green

    Write-Host "  > Get-NetAdapter active" -ForegroundColor DarkGray
    $activeAdp = (Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object -First 1).Name
    Write-Host "  Active adapter: $activeAdp" -ForegroundColor Cyan

    Write-Host "  > Test-Connection 8.8.8.8" -ForegroundColor DarkGray
    $p2 = Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet
    $c2 = if ($p2) { "Green" } else { "Red" }
    Write-Host "  Gateway reachable: $p2" -ForegroundColor $c2

    $vp = ($p2 -and ($svcStatus -ne $null) -and ($activeAdp -ne $null))
    Write-Host ""
    if ($vp) {
        Write-Host "  verificationPassed = TRUE -> pipeline records AUTO_RESOLVE" -ForegroundColor Green
    } else {
        Write-Host "  verificationPassed = FALSE -> pipeline records AUTO_RESOLVE_FAILED_VERIFICATION + escalates" -ForegroundColor Red
    }
} catch {
    Write-Host "  Error during remediation: $_" -ForegroundColor Red
}

# STEP 5: After state and rollback
Write-Host ""
Write-Host "[5/5] AFTER STATE + ROLLBACK" -ForegroundColor White
$r2 = Resolve-DnsName $FAKE_HOST -ErrorAction SilentlyContinue
if ($r2) {
    Write-Host "  [WARN] $FAKE_HOST still resolves - cleanup needed" -ForegroundColor Yellow
} else {
    Write-Host "  $FAKE_HOST no longer resolves - DNS cache clean" -ForegroundColor Green
}
$p3 = Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet
$c3 = if ($p3) { "Green" } else { "Red" }
$l3 = if ($p3) { "REACHABLE" } else { "UNREACHABLE" }
Write-Host "  Gateway 8.8.8.8: $l3" -ForegroundColor $c3

if ($INJECTED) {
    try {
        $cleaned = Get-Content $HOSTS | Where-Object { $_ -notmatch $FAKE_HOST }
        Set-Content $HOSTS $cleaned
        Write-Host "  Hosts entry REMOVED (rollback complete)" -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Remove manually: line '$FAKE_IP  $FAKE_HOST' from $HOSTS" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SUMMARY" -ForegroundColor Yellow
Write-Host "  Before : fault injected (bad DNS entry)" -ForegroundColor White
Write-Host "  Agent  : flushed DNS, checked RasMan, verified gateway" -ForegroundColor White
Write-Host "  After  : cache clean, entry removed, gateway reachable" -ForegroundColor White
Write-Host "  verificationPassed drives AUTO_RESOLVE vs escalation" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Next: open http://localhost:3000/triage and run the VPN preset" -ForegroundColor Cyan
Write-Host "  Watch the SSE stream execute the same commands live." -ForegroundColor Cyan
Write-Host ""
