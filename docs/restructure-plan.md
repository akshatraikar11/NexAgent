# NexAgent Restructure Plan

## 1. Current Structure

```
C:\Users\sumit\Downloads\NexAgent\          ← workspace root (NO .git)
├── NexAgent\                               ← Phase 1 backend root (NO .git)
│   ├── src\
│   │   ├── app.ts
│   │   ├── index.ts
│   │   ├── ccep\         (scorer.ts, signals.ts, weights.ts)
│   │   ├── chromadb\     (client.ts)
│   │   ├── config\       (index.ts)
│   │   ├── db\           (client.ts)
│   │   ├── guardrails\   (scanner.ts)
│   │   ├── llm\          (router.ts, mock.ts)
│   │   ├── mcp\          (jira.connector.ts, slack.connector.ts, mock-data\)
│   │   ├── middleware\   (auth.ts, errorHandler.ts, requestLogger.ts)
│   │   ├── observability\(langfuse.ts)
│   │   ├── orchestrator\ (errors.ts, registry.ts, runner.ts, types.ts)
│   │   ├── pipelines\    (ticket-triage.pipeline.ts, incident-response.pipeline.ts, kb-self-learning.pipeline.ts)
│   │   ├── routes\       (auth, ticket, decision, pipeline, sse, category, settings, audit, kb routes)
│   │   ├── schemas\      (auth, decision, pipeline, settings, ticket schemas)
│   │   ├── sse\          (manager.ts)
│   │   └── utils\        (logger.ts)
│   ├── tests\
│   │   ├── unit\         (ccep-scorer, ccep_formula, guardrails, orchestrator tests)
│   │   ├── integration\  (mcp-fallback, pipeline-*, sse tests)
│   │   └── db\           (migration.test.ts)
│   ├── prisma\
│   │   ├── schema.prisma
│   │   └── rollback.sql
│   ├── data\
│   │   └── scenarios.csv
│   ├── results\
│   │   └── eval_report.md
│   ├── specs\
│   │   └── guardrails_scanner_spec.json
│   ├── node_modules\
│   ├── .env
│   ├── .env.example
│   ├── DEVIATIONS.md
│   ├── fit_weights.py
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── weights.json
│
└── frontend\                               ← Phase 2 Next.js app (HAS own .git — single init commit)
    ├── app\
    │   ├── fonts\
    │   ├── login\page.tsx
    │   ├── favicon.ico
    │   ├── globals.css
    │   ├── layout.tsx
    │   └── page.tsx
    ├── components\
    │   ├── ui\  (badge, button, card, input)
    │   ├── AppShell.tsx
    │   ├── Header.tsx
    │   └── Sidebar.tsx
    ├── lib\
    │   ├── api.ts
    │   ├── auth-context.tsx
    │   └── utils.ts
    ├── node_modules\
    ├── .env.local           (NEXT_PUBLIC_API_URL=http://localhost:3001)
    ├── .eslintrc.json
    ├── .git\                ← single auto-commit from create-next-app, no real history
    ├── .gitignore
    ├── next-env.d.ts
    ├── next.config.mjs
    ├── package.json
    ├── package-lock.json
    ├── postcss.config.mjs
    ├── README.md
    ├── tailwind.config.ts
    └── tsconfig.json
```

---

## 2. Proposed Structure

```
C:\Users\sumit\Downloads\NexAgent\          ← workspace root (NO .git — unchanged)
├── backend\                                ← renamed from NexAgent\
│   ├── src\
│   ├── tests\
│   ├── prisma\
│   ├── data\
│   ├── results\
│   ├── specs\
│   ├── node_modules\
│   ├── .env
│   ├── .env.example
│   ├── DEVIATIONS.md
│   ├── fit_weights.py
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── weights.json
│
├── frontend\                               ← moved from sibling location (same path)
│   ├── app\
│   ├── components\
│   ├── lib\
│   ├── node_modules\
│   ├── .env.local
│   ├── .eslintrc.json
│   ├── .gitignore
│   ├── next-env.d.ts
│   ├── next.config.mjs
│   ├── package.json
│   ├── package-lock.json
│   ├── postcss.config.mjs
│   ├── README.md
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
└── docs\
    └── restructure-plan.md
```

---

## 3. Every Directory/File Being Moved

| Action | From | To |
| :----- | :--- | :- |
| Rename folder | `NexAgent\NexAgent\` | `NexAgent\backend\` |
| Move folder | `NexAgent\frontend\` | stays at `NexAgent\frontend\` |

**The frontend is already at the correct location** (`NexAgent\frontend\`).
Only the backend folder needs renaming: `NexAgent\` → `backend\`.

No individual files need to be moved within either project.

---

## 4. Configuration / Path Changes Required

### Backend — path changes needed

| File | What changes | Why |
| :--- | :----------- | :-- |
| `backend\src\ccep\weights.ts` | `path.resolve(process.cwd(), 'weights.json')` | Uses `process.cwd()` — resolves to wherever `npm run dev` is called from. As long as commands are run from `backend\`, this is unchanged. **No edit needed.** |
| `backend\src\config\index.ts` | `bootstrapWeightsPath: path.resolve(process.cwd(), 'weights.json')` | Same — `process.cwd()` relative to run location. **No edit needed.** |
| `backend\fit_weights.py` | `SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))` — all paths relative to script location | Fully self-contained: `data/`, `results/`, `weights.json` all resolve from script's own directory. **No edit needed.** |
| `backend\prisma\schema.prisma` | `url = env("DATABASE_URL")` | Reads from env — unchanged. **No edit needed.** |
| `backend\tsconfig.json` | `"rootDir": "./"`, `"outDir": "./dist"`, paths `@/*: ["src/*"]` | All relative to tsconfig location — unchanged. **No edit needed.** |
| `backend\vitest.config.ts` | `path.resolve(__dirname, './src')` | Relative to file location — unchanged. **No edit needed.** |

### Frontend — path changes needed

| File | What changes | Why |
| :--- | :----------- | :-- |
| None | — | Frontend is already at `NexAgent\frontend\` — correct final location. All internal paths use `@/*` alias pointing to `./*` from its own root. **No edit needed.** |

### Git metadata

| Item | Action |
| :--- | :----- |
| `frontend\.git\` | **Remove** — it was auto-created by `create-next-app` with a single dummy commit ("Initial commit from Create Next App"). No real history exists. Safe to remove after confirming no source files depend on it (they don't — `.git` is metadata only). |
| `NexAgent\backend\` | No `.git` was present in `NexAgent\NexAgent\` — nothing to handle. |

---

## 5. Risk of Breaking Phase 1

| Risk | Severity | Mitigation |
| :--- | :------- | :--------- |
| Backend `npm` scripts break if run from wrong directory | Medium | All scripts must be run from `backend\`. README will document this. |
| `weights.json` not found if `process.cwd()` is wrong | Low | `loadCCEPWeights()` falls back to `BOOTSTRAP_DEFAULT_WEIGHTS` with a log warning — backend still starts. |
| Prisma client not found after rename | Low | `npx prisma generate` re-run from `backend\` regenerates it. |
| TypeScript `@/*` path alias breaks | None | Alias is relative to `tsconfig.json` location — unchanged. |
| `fit_weights.py` path references break | None | Script uses `__file__`-relative paths — works from any working directory. |
| Frontend `NEXT_PUBLIC_API_URL` points wrong place | None | Still `http://localhost:3001` — backend port unchanged. |
| Integration tests fail due to DB unavailability | None | Already run in mock/offline mode; no DB required. |

---

## 6. How Backend Tests Will Be Verified After Move

```powershell
# From backend\ directory:
npx tsc --noEmit          # TypeScript typecheck — expect 0 errors
npm run test:unit         # vitest unit tests — expect 18/18 pass
npm run test              # all vitest tests
python fit_weights.py     # ML pipeline — expect 5/5 Python unit tests PASS
```

---

## 7. How Frontend Will Be Verified After Move

```powershell
# From frontend\ directory:
npx tsc --noEmit          # TypeScript typecheck
npm run lint              # ESLint
npm run build             # Next.js production build — expect 0 errors
```

---

## 8. Summary of Operations (in order)

1. Rename `C:\Users\sumit\Downloads\NexAgent\NexAgent\` → `C:\Users\sumit\Downloads\NexAgent\backend\`
2. Remove `C:\Users\sumit\Downloads\NexAgent\frontend\.git\` (single dummy commit, safe)
3. Run `npx prisma generate` from `backend\` to confirm Prisma client intact
4. Run `npx tsc --noEmit` from `backend\` — expect 0 errors
5. Run `npm run test:unit` from `backend\` — expect 18/18 pass
6. Run `python fit_weights.py` from `backend\` — expect 5/5 Python tests pass
7. Run `npx tsc --noEmit` from `frontend\` — expect 0 errors
8. Run `npm run build` from `frontend\` — expect successful build

No source files are edited. No API routes change. No DB schema changes. No formula changes.
