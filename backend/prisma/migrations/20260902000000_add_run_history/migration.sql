-- Migration: add TestRunHistory for flakiness and build transience scoring
-- Fixes 3 & 4: replaces fixture-derived isFlaky/errorType reads with real computed signals

CREATE TYPE "RunHistoryKind" AS ENUM ('test', 'build');

CREATE TABLE "test_run_history" (
    "id"       TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "branch"   TEXT NOT NULL,
    "passed"   BOOLEAN NOT NULL,
    "kind"     "RunHistoryKind" NOT NULL DEFAULT 'test',
    "runAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_run_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "test_run_history_testName_idx" ON "test_run_history"("testName");
CREATE INDEX "test_run_history_testName_kind_idx" ON "test_run_history"("testName", "kind");
