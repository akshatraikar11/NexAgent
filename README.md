# NexAgent

AI-powered IT operations automation platform that decides — per ticket, incident, CI failure, PR, and build — whether to resolve automatically or escalate to a human, using a four-signal learned policy called CCEP.

> **Setup status:** Both builds verified clean. 109/109 tests passing across 23 test suites. PostgreSQL required before first run.

---

## What NexAgent Actually Does

NexAgent takes incoming work items from IT and engineering workflows (Jira tickets, Sentry alerts, GitHub CI runs, pull requests, failed builds) and routes each one through a learned escalation formula: `score = w1×(1−confidence) + w2×error_rate + w3×guardrail_flags + w4×reversibility`. If the score exceeds a configurable threshold, the item is escalated to a human with a full signal breakdown. If not, the system acts automatically (posts a Jira comment, triggers a Slack alert, retries a flaky test, auto-merges a safe PR). Human overrides feed back into the `error_rate` signal, so the system becomes more conservative in categories where operators frequently correct it.

---

## Setup (tested — run these commands exactly)

### Prerequisites

- Node.js v18+ (tested on v22.19.0)
- PostgreSQL 16+ running locally (or via Docker)
- npm 10+

### Step 1 — PostgreSQL database

Open pgAdmin or psql and run:

```sql
CREATE USER nexagent WITH PASSWORD '<your-postgres-password>';
CREATE DATABASE nexagent_db OWNER nexagent;
GRANT ALL PRIVILEGES ON DATABASE nexagent_db TO nexagent;
```

### Step 2 — Backend

```powershell
cd backend
npm install          # .npmrc sets legacy-peer-deps automatically — no flags needed
copy .env.example .env          # Windows
# Edit .env — DATABASE_URL is already set for local Postgres
npx prisma migrate deploy
npm run db:seed
npm run dev
# → Server starts on http://localhost:3001
```

### Step 3 — Frontend (new terminal)

```powershell
cd frontend
npm install
npm run dev
# → App starts on http://localhost:3000
```

### Step 4 — Login

Open `http://localhost:3000`

Sign in with the administrator email and the `ADMIN_PASSWORD` you configured in `backend/.env`:
- Email: `admin@nexagent.dev`
- Password: The value configured for `ADMIN_PASSWORD` in your `.env` file

### Step 5 — Run a pipeline

Go to **Ticket Triage** in the sidebar → click **Run Pipeline**. You will see live step execution via SSE streaming and a CCEP decision with signal breakdown.

### One-command Docker setup (alternative)

```powershell
cd ..   # project root
docker compose up -d
# Postgres + ChromaDB + Backend + Frontend all start automatically
# Then: cd backend && npx prisma migrate deploy && npm run db:seed
```

---

## Architecture (verified from actual import chains)

```
Browser
  │
  ├─ POST /pipelines/run  ──────────────────────────────────┐
  │   frontend/lib/usePipeline.ts                           │
  │   frontend/lib/api.ts                                   │
  │                                                         ▼
  │                              backend/src/routes/pipeline.routes.ts
  │                                  authenticateJWT + rate limit (30/10min)
  │                                  prisma.pipelineRun.create() ──► PostgreSQL
  │                                  setImmediate(runPipeline)   [async]
  │                                  res 202 { runId }
  │
  ├─ GET /sse/pipeline/:runId?token=...
  │   backend/src/routes/sse.routes.ts
  │   better-sse channel per runId
  │
  ▼   [background execution]
backend/src/orchestrator/runner.ts
  │
  │  for each Step:
  │    emit SSE STARTED ──────────────────────────────────► Browser (live steps)
  │    step.execute(context)
  │    │
  │    ├─ fetch_ticket / parse_alert / fetch_pr / fetch_build
  │    │    JiraMCPConnector / SentryConnector / GitHubConnector
  │    │    priority: real HTTP → MCP stdio → mock fixtures
  │    │
  │    ├─ classify_itil / classify_severity
  │    │    agency/severity.ts  [pure function, P0-P3 matrix]
  │    │
  │    ├─ search_kb
  │    │    chromadb/client.ts → ChromaDB (fallback: in-memory)
  │    │
  │    ├─ generate_response
  │    │    llm/router.ts → Promise.all([Gemini, Groq])
  │    │    computeResponseSimilarity() → cosine similarity
  │    │    calculateCalibratedConfidence() → halve if similarity < 0.85
  │    │    (fallback: MOCK_DEFAULT_LLM_RESPONSE if MOCK_MODE=true)
  │    │
  │    ├─ run_guardrails
  │    │    guardrails/scanner.ts [pure regex — PII, SQLi, prompt injection]
  │    │    guardrails/pre-llm-screen.ts [injection screen BEFORE LLM]
  │    │
  │    ├─ ccep_evaluate
  │    │    ccep/scorer.ts
  │    │    score = w1*(1-conf) + w2*err + w3*flags/3 + w4*rev
  │    │    score >= threshold → ESCALATE, else → AUTO_RESOLVE
  │    │
  │    └─ execute_or_escalate
  │         if AUTO_RESOLVE: Jira comment + Slack post
  │         if ESCALATE:     Slack alert + PagerDuty trigger (P0/P1 only)
  │         if AUTO_RESOLVE but verification failed: AUTO_RESOLVE_FAILED_VERIFICATION
  │              → escalates to human + records distinct outcome in DB
  │         prisma.decision.create() ──────────────────────► PostgreSQL
  │
  │    emit SSE COMPLETED ─────────────────────────────────► Browser
  │    prisma.stepLog.update() ───────────────────────────► PostgreSQL
  │
  prisma.pipelineRun.update(COMPLETED) ──────────────────► PostgreSQL
  │
SSE closes → browser polls GET /pipelines/:runId → renders result
```

---

## Six Workflows

| # | Name | Trigger | Auto-Resolve Action | Escalation Target |
|---|------|---------|---------------------|-------------------|
| 1 | Ticket Triage | Jira ticket | Post Jira comment + Slack #it-support | #it-escalations |
| 2 | Incident Response | Sentry alert | Slack #sre-incidents summary | #sre-oncall + PagerDuty (P0/P1) |
| 3 | KB Self-Learning | Post auto-resolution | Ingest solution to ChromaDB | Rejected by quality gate |
| 4 | CI Triage | GitHub CI failure | Retry flaky tests | Block PR + #engineering |
| 5 | Build/Deploy | Build failure | Retry build | #devops-alerts CRITICAL |
| 6 | MergeGate | Pull request | Auto-merge (squash) | Senior dev review request |

---

## CCEP Formula

```
escalation_score = w1×(1 − model_confidence)
                 + w2×historical_error_rate
                 + w3×min(guardrail_flags, 3) / 3
                 + w4×action_reversibility_weight

If score ≥ threshold → ESCALATE
Else → AUTO_RESOLVE
```

- **Tuned Ticket Triage threshold:** `θ = 0.32` (selected via margin-first train+val sweep, N=255, pre-defined safety constraint: missed-escalation rate ≤ 10%; sweep and test sets share 0 rows — verified by overlap assertion in `fit_weights.py`).
- **MergeGate threshold:** `θ = 0.32` (unified threshold; `auto_merge_pr` reversibility weight is 0.30 because Git merges to feature branches are 1-click reversible via `git revert`; auto-merge requires 4 explicit preconditions: required checks green, zero guardrail flags, bounded diff size ≤ 20 files / ≤ 500 lines, and target branch unprotected; defined in `ccep/constants.ts`).

Weights fitted offline by logistic regression on 300 labeled scenarios (`backend/data/scenarios.csv`, `backend/weights.json`).

| Weight | Signal | Fitted Value |
|--------|--------|-------------|
| w1 | Model uncertainty (`1 − confidence`) | 0.2562 |
| w2 | Historical error rate (Bayesian smoothed) | 0.2260 |
| w3 | Guardrail flag count (normalized) | 0.1677 |
| w4 | Action reversibility weight | 0.3502 |
| **Sum** | | **1.0001** |

---

## Tech Stack (from actual package.json)

**Backend**

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.21.1 | HTTP server |
| @prisma/client | ^5.22.0 | PostgreSQL ORM |
| better-sse | ^0.11.0 | Server-Sent Events |
| @google/generative-ai | ^0.24.0 | Gemini LLM |
| groq-sdk | ^0.9.0 | Groq/Llama LLM |
| chromadb | ^1.9.0 | Vector knowledge base |
| zod | ^3.23.8 | Input validation |
| express-rate-limit | ^8.7.0 | Rate limiting |
| bcryptjs | ^2.4.3 | Password hashing |
| jsonwebtoken | ^9.0.2 | JWT auth |
| helmet | ^8.0.0 | Security headers |
| @modelcontextprotocol/sdk | ^1.1.0 | MCP stdio transport |
| pino | ^9.5.0 | Structured logging |

**Frontend**

| Package | Purpose |
|---------|---------|
| next 14 | React framework (18 routes) |
| tailwindcss | Styling |
| recharts | Charts (bar, line, radar, radial) |
| lucide-react | Icons |
| class-variance-authority | Component variants |

**ML (offline)**

| Package | Purpose |
|---------|---------|
| scikit-learn | Logistic regression weight fitting |
| numpy / pandas | Data processing |

---

## Evaluation Results

> **Honest note on Eval 1:** F1=1.000 on the 45-row test split reflects a linearly separable
> synthetic dataset — not a result that should be expected on real-world data. The dataset is
> single-annotator and synthetic; treat all numbers as proof-of-concept only.
> Previous run reported F1=0.978 with a data-leakage bug (42/45 test rows appeared in the
> threshold-sweep tuning set). The corrected run (overlap=0, verified by assertion) gives F1=1.000
> on the same 45 rows at θ=0.32. Both are consistent with the small synthetic dataset.

| Eval | What it measures | Result |
|------|-----------------|--------|
| 1 — 4-way baseline | CCEP vs baselines (held-out test split, N=45, θ=0.32) | Fitted F1=1.000 (P=1.000, R=1.000) beats Fixed Threshold (t=0.60) F1=0.414 (P=1.000, R=0.261). Missed-escalations: 0.0% (0/23). Note: F1=1.000 reflects small, linearly-separable synthetic data — not a production benchmark. |
| 2 — Pipeline vs naive | Fair comparison (estimated signals only) | CCEP Est 55.0% vs Naive 55.0% (tie, 0.0pp delta); Oracle ceiling: 85.0% (+30.0pp) |
| 3 — KB self-learning | Simulated auto-resolution lift | +15.0pp lift (55.0% → 70.0%); this is a parameterised simulation, not measured longitudinal data — labelled "illustrative" in results |
| 4 — Cross-domain transfer | Ticket Triage weights → 30 unobserved Incident Response scenarios | F1=0.973, Precision=0.947, Recall=1.000 (F1 delta -0.027 vs primary domain, within ±0.10) |

Run all evaluations: `cd backend && npm run eval:all`

---

## Running One Live Pipeline

To demo real (non-mock) behavior with the least setup, enable just the LLM call —
you don't need live Jira/Slack/GitHub credentials for this:

1. Get a free Gemini API key from https://aistudio.google.com/apikey
2. In `backend/.env`, set:
   ```
   MOCK_MODE=false
   GEMINI_API_KEY=your_real_key_here
   ```
   Leave `GROQ_API_KEY` blank — the router falls back to a single-model path if only one key is set.
3. Restart the backend (`npm run dev`) and run any pipeline from the UI.
   The `generate_response` / `analyze_failure` / `classify_error` steps will now call the real
   Gemini API; Jira/Slack/GitHub/Sentry/PagerDuty connectors remain mock unless you also set
   `GITHUB_TOKEN`, `JIRA_API_TOKEN`, etc. (see `.env.example`).

This is enough to show one real LLM response end-to-end while keeping the rest of the demo
deterministic and fast.

---

## Known Limitations

> This section is required and accurate. Do not omit it when presenting.

**1. All external integrations are mock by default.**
`MOCK_MODE=true` in `.env` means Gemini, Groq, Jira, Slack, GitHub, and Sentry all return fixture data. No live API call has been tested against a real service in the current test suite. Real calls require setting the corresponding env vars and `MOCK_MODE=false`.

**2. PagerDuty integration requires manual env configuration.**
`PAGERDUTY_TOKEN` and `PAGERDUTY_SERVICE_ID` must be set for real PagerDuty incidents. Mock mode returns `PD-MOCK-*` IDs.

**3. Sentry has no real HTTP path.**
`SentryMCPConnector` only supports MCP stdio (`MCP_SENTRY_CMD`) or mock fixtures. No direct Sentry REST API integration.

**4. ChromaDB falls back to in-memory keyword matching.**
If ChromaDB is not running (no Docker), KB search uses a simple keyword match instead of semantic embeddings. Results are less accurate.

**5. CCEP dataset is 300 synthetically-authored scenarios, single annotator.**
The dataset (`scenarios.csv`) is synthetic and labeled by a single annotator. On the 45-row held-out test split at tuned threshold θ=0.32, Fitted CCEP achieves F1=1.000 (P=1.000, R=1.000) vs Fixed Threshold (t=0.60) F1=0.414. The perfect score reflects small, linearly-separable synthetic data — not a production benchmark. Confidence intervals from bootstrap resampling are degenerate at this score ([1.000, 1.000]); the meaningful comparison is missed-escalation rate (0.0%) vs Fixed Threshold (73.9%). An earlier run reported F1=0.978 with a threshold-sweep data-leakage bug; the current run is clean (overlap assertion PASSED, 0 shared rows between sweep tuning set and test set).

**6. All 6 pipelines have end-to-end integration tests.**
Ticket Triage, Incident Response, KB Self-Learning, CI Triage, Build-Deploy Failure, and MergeGate PR Review are all tested with dedicated Vitest suites, alongside HTTP integration tests.

**7. DB indexes added in migration 20261024.**
`AUTO_RESOLVE_FAILED_VERIFICATION` DecisionOutcome, updated `Settings.ccepThreshold` default (0.32), and `reversibilityMap.auto_merge_pr` (0.3) require `prisma migrate deploy` on existing deployments.

**8. OPERATOR role cannot approve overrides.**
Override actions require `ADMIN` role (enforced on backend with `requireRole('ADMIN')`).

**9. CI Triage / Build-Deploy flakiness signals need history.**
`computeFlakinessScore()` / `computeTransienceScore()` need at least 5 recorded runs. Before that they fall back to a documented cold-start prior.

**10. Host remediation is Windows-only and runs real PowerShell commands.**
On VPN/DNS/network tickets, `executeHostRemediation()` runs real PowerShell (RasMan query, DNS flush, gateway ping). Each command has a 5-second timeout. On Unix/macOS, the function returns `executed:false / NOT_SUPPORTED`. The `verificationPassed` flag in the result drives downstream decisions — if false, the pipeline records `AUTO_RESOLVE_FAILED_VERIFICATION` and escalates to a human rather than claiming success.

---

## Running Evaluations

```powershell
cd backend

# Fit CCEP weights (requires Python + scikit-learn; PYTHONIOENCODING=utf-8 on Windows)
$env:PYTHONIOENCODING="utf-8"; python fit_weights.py

# Eval 2: Pipeline vs naive (corrected methodology)
npx tsx scripts/eval_orchestrator_vs_naive.ts

# Eval 3: KB self-learning impact
npx tsx scripts/eval_kb_impact.ts

# Demo all 6 workflows (11 scenarios)
npm run demo

# Demo operator feedback loop (human override -> live historical error rate update)
npm run demo:feedback
```

---

## Tests

```powershell
cd backend && npm test
# → 109/109 passing (23 test files, 100% green)
# Unit: CCEP scorer (incl. NaN guards), guardrails, orchestrator, SLA/correlation,
#       agency severity, signals (smoothing), host-remediation failure paths,
#       threshold consistency, demo-policy flag, CCEP formula
# Integration: ticket triage, incident response, KB pipeline, CI triage, build-deploy,
#              mergegate, SSE streaming (concurrent), HTTP routes, MCP fallback,
#              verification-failure outcome (AUTO_RESOLVE_FAILED_VERIFICATION)
# DB: migration
```

---

## License

Academic project — B.E. Information Technology, Final Year Major Project.
