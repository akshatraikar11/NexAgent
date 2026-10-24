# simulate_dns_fault.ps1 - NexAgent DNS Fault Induction and Auto-Remediation Demo
# (Demos DNS cache fault, fault detection, agent remediation, real before/after state verification)
#
# Modes:
#   powershell -ExecutionPolicy Bypass -File simulate_dns_fault.ps1              # normal interactive demonstration
#   powershell -ExecutionPolicy Bypass -File simulate_dns_fault.ps1 -SelfCheck   # CI/proof self-check mode
#   powershell -ExecutionPolicy Bypass -File simulate_dns_fault.ps1 -SelfCheck -DisableFix  # negative test (fix disabled -> gates FAIL)
#   powershell -ExecutionPolicy Bypass -File simulate_dns_fault.ps1 -NegativeTest           # shorthand negative test
#
# Administrative Elevation:
#   Full fault injection requires writing to C:\Windows\System32\drivers\etc\hosts.
#   In non-Admin mode, the script reports non-Admin status and provides instructions for Admin.

param(
    [switch]$DiagnosticOnly,
    [switch]$SelfCheck,
    [switch]$DisableFix,
    [switch]$NegativeTest
)

if ($NegativeTest) {
    $DisableFix = $true
}

$ErrorActionPreference = "Continue"

$FAKE_HOST = "nexagent-demo-dns-fault.internal"
$FAKE_IP   = "192.0.2.1"   # RFC5737 TEST-NET-1, guaranteed non-routable
$HOSTS     = "$env:SystemRoot\System32\drivers\etc\hosts"
$INJECTED  = $false

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$results = @{}  # PASS/FAIL accumulator for SelfCheck mode

function Check($name, $passed, $detail) {
    $results[$name] = $passed
    if ($SelfCheck -or $NegativeTest) {
        $mark = if ($passed) { "PASS" } else { "FAIL" }
        Write-Host "[$mark] $name  $detail"
    }
}

if (-not $SelfCheck -and -not $NegativeTest) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " NexAgent - DNS Fault Induction and Auto-Remediation Demo  " -ForegroundColor Yellow
    Write-Host " (Demonstrates DNS cache fault, not VPN configuration)      " -ForegroundColor DarkGray
    if ($isAdmin) {
        Write-Host " [MODE] Administrator privileges: DETECTED (full injection enabled)" -ForegroundColor Green
    } else {
        Write-Host " [MODE] Non-Admin mode: Elevation required for hosts write" -ForegroundColor Yellow
    }
    if ($DisableFix) {
        Write-Host " [MODE] NEGATIVE TEST: Remediation fix is DISABLED (-DisableFix)" -ForegroundColor Red
    }
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

# ---- STEP 1: Baseline -------------------------------------------------------
if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "[1/5] BEFORE STATE" -ForegroundColor White }

$svc = Get-Service -Name RasMan -ErrorAction SilentlyContinue
$svcStatus = if ($svc) { $svc.Status.ToString() } else { "NOT_FOUND" }
if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  RasMan service  : $svcStatus" -ForegroundColor Green }

$adp = Get-NetAdapter | Where-Object Status -eq "Up" | Select-Object -First 1
$adpName = if ($adp) { $adp.Name } else { "NONE" }
if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  Active adapter  : $adpName" -ForegroundColor Green }

$p0 = Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet 2>$null
if (-not $SelfCheck -and -not $NegativeTest) {
    $lp0 = if ($p0) { "REACHABLE" } else { "UNREACHABLE" }
    $cp0 = if ($p0) { "Green" } else { "Red" }
    Write-Host "  Gateway 8.8.8.8 : $lp0" -ForegroundColor $cp0
}
Check "baseline_gateway_reachable" ($p0 -eq $true) "(8.8.8.8 ping before any changes)"

# ---- STEP 2: Fault injection ------------------------------------------------
if (-not $SelfCheck -and -not $NegativeTest) {
    Write-Host ""
    Write-Host "[2/5] FAULT INJECTION - Adding stale DNS entry to hosts file" -ForegroundColor Yellow
}

$faultCreated = $false
if ($DiagnosticOnly) {
    if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  Skipped (DiagnosticOnly mode)" -ForegroundColor DarkYellow }
    $faultCreated = $false
} elseif (-not $isAdmin) {
    if (-not $SelfCheck -and -not $NegativeTest) {
        Write-Host "  Hosts write failed: Administrator elevation required to write to $HOSTS." -ForegroundColor Yellow
        Write-Host "  Run as Administrator for real hosts fault injection." -ForegroundColor Yellow
    }
    $faultCreated = $false
} else {
    try {
        $ErrorActionPreference = "Stop"
        $ex = Select-String -Path $HOSTS -Pattern $FAKE_HOST -ErrorAction SilentlyContinue
        if (-not $ex) {
            Add-Content -Path $HOSTS -Value "`n$FAKE_IP  $FAKE_HOST  # NexAgent demo - safe to delete"
            $faultCreated = $true
            $INJECTED = $true
        } else {
            $faultCreated = $true  # already present from previous run
            $INJECTED = $true
        }
        if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  Injected: $FAKE_IP -> $FAKE_HOST (RFC5737, non-routable)" -ForegroundColor Red }
    } catch {
        if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  Hosts write error: $($_.Exception.Message)" -ForegroundColor Red }
        $faultCreated = $false
    } finally {
        $ErrorActionPreference = "Continue"
    }
}

$faultDetail = if ($faultCreated) {
    "(hosts entry $FAKE_IP -> $FAKE_HOST written)"
} else {
    "(FAILED: Administrator elevation required to write to $HOSTS)"
}
Check "fault_created" $faultCreated $faultDetail

# ---- STEP 3: Verify fault detectable (Real BEFORE state) ---------------------
if (-not $SelfCheck -and -not $NegativeTest) {
    Write-Host ""
    Write-Host "[3/5] VERIFY FAULT IS DETECTABLE (Before State)" -ForegroundColor Yellow
}

$faultDetected = $false
if ($faultCreated) {
    # Resolve the fake host to verify it actively points to the bad non-routable IP
    $r1 = Resolve-DnsName $FAKE_HOST -ErrorAction SilentlyContinue
    $resolvedIp = if ($r1) { ($r1 | Select-Object -ExpandProperty IPAddress -First 1) } else { $null }
    if ($resolvedIp -eq $FAKE_IP) {
        $faultDetected = $true
        if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  DNS resolves $FAKE_HOST -> $resolvedIp [FAULT ACTIVE]" -ForegroundColor Red }
    } else {
        if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  DNS could not resolve $FAKE_HOST to $FAKE_IP" -ForegroundColor DarkYellow }
    }
} else {
    if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  Skipped (no fault injected in non-Admin mode)" -ForegroundColor DarkYellow }
    $faultDetected = $false
}

$detectDetail = if ($faultDetected) {
    "(real before-state: $FAKE_HOST resolves to non-routable IP $FAKE_IP)"
} else {
    "(fault not active in before-state)"
}
Check "fault_detected" $faultDetected $detectDetail

# ---- STEP 4: Agent remediation & Real AFTER state verification --------------
if (-not $SelfCheck -and -not $NegativeTest) {
    Write-Host ""
    Write-Host "[4/5] AGENT REMEDIATION & AFTER STATE VERIFICATION" -ForegroundColor White
}

$fixApplied = $false
$stateChanged = $false
$verificationPassed = $false
$dnsFlushOk = $false
$remediationErrors = @()

if ($DisableFix) {
    if (-not $SelfCheck -and -not $NegativeTest) {
        Write-Host "  [NEGATIVE TEST] Remediation fix is DISABLED (-DisableFix). Gates must FAIL." -ForegroundColor Red
    }
    $fixApplied = $false
    $dnsFlushOk = $false
    $remediationErrors += "Fix disabled by operator (-DisableFix)"
} else {
    try {
        # Command 1: RasMan check
        if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  > Get-Service RasMan" -ForegroundColor DarkGray }
        $remSvc = (Get-Service -Name RasMan -ErrorAction SilentlyContinue).Status
        if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  RasMan: $remSvc" -ForegroundColor Cyan }

        # Remediation action: remove bad configuration from hosts and flush DNS cache
        if ($faultCreated -and $INJECTED) {
            try {
                $cleaned = Get-Content $HOSTS | Where-Object { $_ -notmatch $FAKE_HOST }
                Set-Content $HOSTS $cleaned
                if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  Corrupt hosts configuration removed" -ForegroundColor Green }
            } catch {
                $remediationErrors += "Failed to clean hosts entry: $($_.Exception.Message)"
            }
        }

        # Command 2: DNS flush
        if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  > Clear-DnsClientCache" -ForegroundColor DarkGray }
        Clear-DnsClientCache
        $dnsFlushOk = $?
        if ($dnsFlushOk) {
            if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  DNS cache FLUSHED" -ForegroundColor Green }
        } else {
            $remediationErrors += "DNS flush returned non-zero"
            if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  DNS flush failed" -ForegroundColor Yellow }
        }

        # Command 3: adapter check
        if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  > Get-NetAdapter active" -ForegroundColor DarkGray }
        $remAdp = (Get-NetAdapter | Where-Object Status -eq "Up" | Select-Object -First 1).Name
        if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  Active adapter: $remAdp" -ForegroundColor Cyan }

    } catch {
        $remediationErrors += $_.Exception.Message
        if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  Remediation error: $_" -ForegroundColor Red }
    }
}

# Real AFTER-STATE check of the injected fault:
# Query $FAKE_HOST again — does it still resolve to $FAKE_IP?
$rAfter = Resolve-DnsName $FAKE_HOST -ErrorAction SilentlyContinue
$afterResolvedIp = if ($rAfter) { ($rAfter | Select-Object -ExpandProperty IPAddress -First 1) } else { $null }
$faultStillActive = ($afterResolvedIp -eq $FAKE_IP)

# REAL BEFORE/AFTER DEPENDENCY:
# state_changed is true ONLY IF fault was confirmed active before AND is no longer active after
$stateChanged = ($faultDetected -eq $true) -and ($faultStillActive -eq $false)

# fix_applied is true ONLY IF fix was enabled, DNS flush executed, AND state actually changed
$fixApplied = (-not $DisableFix) -and $dnsFlushOk -and $stateChanged

# Command 4: gateway re-check (post-fix connectivity)
$p2 = Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet 2>$null
if (-not $SelfCheck -and -not $NegativeTest) {
    $lp2 = if ($p2) { "True" } else { "False" }
    $cp2 = if ($p2) { "Green" } else { "Red" }
    Write-Host "  Gateway reachable: $lp2" -ForegroundColor $cp2
}

# Verification passed requires fix applied, real state change, and gateway reachability
$verificationPassed = $fixApplied -and $stateChanged -and ($p2 -eq $true)

if (-not $SelfCheck -and -not $NegativeTest) {
    if ($verificationPassed) {
        Write-Host "  verificationPassed = TRUE  -> pipeline records AUTO_RESOLVE" -ForegroundColor Green
    } else {
        Write-Host "  verificationPassed = FALSE -> pipeline records AUTO_RESOLVE_FAILED_VERIFICATION + escalates" -ForegroundColor Red
    }
}

$fixDetail = if ($fixApplied) {
    "(Clear-DnsClientCache and hosts repair executed and fixed fault)"
} else {
    "(fix not applied or failed to alter fault state)"
}
Check "fix_applied" $fixApplied $fixDetail

$stateDetail = if ($stateChanged) {
    "(real before/after: fault was active before AND absent after)"
} else {
    "(state did not change from faulty to healthy)"
}
Check "state_changed" $stateChanged $stateDetail

$verifDetail = if ($verificationPassed) {
    "(all remediation gates verified: fix_applied, state_changed, gateway ping)"
} else {
    "(verification gate failed -> escalates to AUTO_RESOLVE_FAILED_VERIFICATION)"
}
Check "verification_passed" $verificationPassed $verifDetail

# ---- STEP 5: Rollback and cleanup -------------------------------------------
if (-not $SelfCheck -and -not $NegativeTest) {
    Write-Host ""
    Write-Host "[5/5] ROLLBACK AND CLEANUP" -ForegroundColor White
}

$rollbackOk = $false
if ($INJECTED -and (Test-Path $HOSTS)) {
    try {
        $cleaned = Get-Content $HOSTS | Where-Object { $_ -notmatch $FAKE_HOST }
        Set-Content $HOSTS $cleaned
        Clear-DnsClientCache | Out-Null
        $rollbackOk = $true
        if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  Hosts entry removed and cache flushed (rollback complete)" -ForegroundColor Green }
    } catch {
        $rollbackOk = $false
        if (-not $SelfCheck -and -not $NegativeTest) {
            Write-Host "  [WARN] Could not remove hosts entry: $($_.Exception.Message.Split([char]10)[0])" -ForegroundColor Yellow
        }
    }
} else {
    $rollbackOk = $true  # nothing to roll back
    if (-not $SelfCheck -and -not $NegativeTest) { Write-Host "  No hosts entry to remove (system clean)" -ForegroundColor DarkGray }
}

$rRollback = Resolve-DnsName $FAKE_HOST -ErrorAction SilentlyContinue
$rollbackVerified = ($rRollback -eq $null) -or (-not $INJECTED)

Check "rollback_restored" ($rollbackOk -and $rollbackVerified) "(hosts entry removed, DNS clean)"

# ---- Final output -----------------------------------------------------------
if ($NegativeTest) {
    Write-Host ""
    $expectedFailures = (-not $fixApplied) -and (-not $stateChanged) -and (-not $verificationPassed)
    if ($expectedFailures) {
        Write-Host "[PASS] NEGATIVE TEST PASSED: When fix is disabled, gates FAIL as required:" -ForegroundColor Green
        Write-Host "  - fix_applied:          $fixApplied (FAIL as expected)"
        Write-Host "  - state_changed:        $stateChanged (FAIL as expected)"
        Write-Host "  - verification_passed:  $verificationPassed (FAIL as expected)"
        exit 0
    } else {
        Write-Host "[FAIL] NEGATIVE TEST FAILED: Gates did not fail when fix was disabled!" -ForegroundColor Red
        exit 1
    }
} elseif ($SelfCheck) {
    Write-Host ""
    $passed = ($results.Values | Where-Object { $_ -eq $true }).Count
    $total  = $results.Count
    $allOk  = ($results.Values | Where-Object { $_ -eq $false }).Count -eq 0
    Write-Host "[$( if ($allOk) { 'PASS' } else { 'FAIL' })] $passed/$total checks passed"
    if (-not $allOk) {
        Write-Host "`nFailed checks:"
        $results.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { Write-Host "  - $($_.Key)" }
        if (-not $isAdmin) {
            Write-Host "`n============================================================" -ForegroundColor Yellow
            Write-Host " INSTRUCTIONS FOR ADMINISTRATOR" -ForegroundColor Yellow
            Write-Host "============================================================" -ForegroundColor Yellow
            Write-Host " Non-Admin mode was detected. Fault injection and real before/after"
            Write-Host " state verification require modifying C:\Windows\System32\drivers\etc\hosts."
            Write-Host " To run with full Administrator privileges:"
            Write-Host "   1. Open an elevated PowerShell prompt (Run as Administrator)."
            Write-Host "   2. Run:"
            Write-Host "      powershell -ExecutionPolicy Bypass -File simulate_dns_fault.ps1 -SelfCheck"
            Write-Host " Or launch elevated directly from this shell:"
            Write-Host "   Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File `\"$PSCommandPath`\" -SelfCheck'"
            Write-Host "============================================================`n" -ForegroundColor Yellow
        }
        exit 1
    }
    exit 0
} else {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " SUMMARY" -ForegroundColor Yellow
    Write-Host "  Fault type : DNS cache poisoning ($FAKE_HOST -> $FAKE_IP)" -ForegroundColor White
    Write-Host "  Before     : Fault verified active via DNS lookup" -ForegroundColor White
    Write-Host "  Fix        : hosts repair + Clear-DnsClientCache" -ForegroundColor White
    Write-Host "  After      : Fault verified absent via DNS lookup" -ForegroundColor White
    Write-Host "  State      : state_changed=$stateChanged, fix_applied=$fixApplied" -ForegroundColor White
    Write-Host "  Decision   : verificationPassed=$verificationPassed -> $(if($verificationPassed){'AUTO_RESOLVE'}else{'AUTO_RESOLVE_FAILED_VERIFICATION'})" -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Run as Administrator for full fault injection:" -ForegroundColor Cyan
    Write-Host "  Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File `\"$PSCommandPath`\"'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Self-check mode:" -ForegroundColor Cyan
    Write-Host "  powershell -ExecutionPolicy Bypass -File simulate_dns_fault.ps1 -SelfCheck" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Negative test (fix disabled -> gates fail):" -ForegroundColor Cyan
    Write-Host "  powershell -ExecutionPolicy Bypass -File simulate_dns_fault.ps1 -NegativeTest" -ForegroundColor Cyan
    Write-Host ""
}
