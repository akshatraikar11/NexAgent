# NexAgent

AI-powered IT operations automation platform that decides — per ticket, incident, CI failure, PR, and build — whether to resolve automatically or escalate to a human, using a four-signal learned policy called CCEP.

> **Setup status:** Both builds verified clean. 53/53 tests passing. PostgreSQL required before first run.

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
CREATE USER nexagent WITH PASSWORD 'nexagent_pass';
CREATE DATABASE nexagent_db OWNER nexagent;
GRANT ALL PRIVILEGES ON DATABASE nexagent_db TO nexagent;
```

### Step 2 — Backend

```powershell
cd backend
npm install
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

Default credentials (seeded by `npm run db:seed`):
- Email: `admin@nexagent.dev`
- Password: `NexAgent_Dev_2026!`

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

If score ≥ threshold (default 0.60) → ESCALATE
Else → AUTO_RESOLVE
```

Weights fitted offline by logistic regression on 300 labeled scenarios (`backend/data/scenarios.csv`).

| Weight | Signal | Fitted Value |
|--------|--------|-------------|
| w1 | Model confidence | 0.2524 |
| w2 | Category override rate | 0.2106 |
| w3 | Guardrail flag count | 0.2138 |
| w4 | Action reversibility | 0.3232 |

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
| next 14 | React framework (24 routes) |
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

| Eval | What it measures | Result |
|------|-----------------|--------|
| 1 — 4-way baseline | CCEP vs fixed threshold (N=300, 45-row test split) | Fitted F1=0.606, Precision=1.000 |
| 2 — Pipeline vs naive | Fair comparison (estimated signals only) | See `results/eval2_orchestrator_vs_naive.md` |
| 3 — KB self-learning | Simulated auto-resolution lift | +15pp (55%→70%) |
| 4 — Cross-domain transfer | Ticket Triage weights → Incident Response | F1=0.800, Precision=1.000 |

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
Bootstrap confidence intervals overlap between Fitted CCEP (F1=0.606) and Fixed Threshold (F1=0.562) — the improvement is directional, not statistically significant at α=0.05 on this dataset size.

**6. CI/Build/MergeGate pipelines have no integration tests.**
Only Ticket Triage, Incident Response, and KB Self-Learning have integration tests. The other three pipelines are tested only via the demo script.

**7. No DB indexes were in the original schema (now added).**
`Decision.createdAt`, `AuditLog.timestamp`, `Notification.(userId, isRead)`, and `TicketSLA.slaBreachAt` indexes were added in this session. Existing deployments need `prisma migrate deploy` to apply them.

**8. OPERATOR role cannot approve overrides.**
Override actions require `ADMIN` role (enforced on backend with `requireRole('ADMIN')`). The approvals page now shows a clear message to OPERATOR users instead of a silent 403.

**9. CI Triage / Build-Deploy flakiness signals need history to reach full accuracy.**
`computeFlakinessScore()` / `computeBuildTransienceScore()` compute a real flip-rate over recorded runs (`RunHistory` table), but need at least 5 recorded runs for a given test/workflow before the computed signal is used. Before that (a fresh deployment, or any environment without a live DB), they fall back to a documented cold-start prior. Verified via `npm run demo`: all 6 workflows produce the correct decision (11/11 scenarios) in both the cold-start and — once `RunHistory` accumulates — the fully-computed case.

---

## Running Evaluations

```powershell
cd backend

# Fit CCEP weights (requires Python + scikit-learn)
python fit_weights.py

# Eval 2: Pipeline vs naive (corrected methodology)
npx tsx scripts/eval_orchestrator_vs_naive.ts

# Eval 3: KB self-learning impact
npx tsx scripts/eval_kb_impact.ts

# Demo all 6 workflows (11 scenarios)
npm run demo
```

---

## Tests

```powershell
cd backend && npm test
# → 53/53 passing (12 test files)
# Unit: CCEP scorer, guardrails, orchestrator, SLA/correlation, agency severity
# Integration: ticket triage, incident response, KB pipeline, SSE streaming, MCP fallback
```

---

## License

Academic project — B.E. Information Technology, Final Year Major Project.
