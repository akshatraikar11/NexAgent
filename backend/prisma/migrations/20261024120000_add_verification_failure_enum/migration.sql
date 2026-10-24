-- AlterEnum
ALTER TYPE "DecisionOutcome" ADD VALUE IF NOT EXISTS 'AUTO_RESOLVE_FAILED_VERIFICATION';

-- AlterTable: update Settings ccepThreshold default to match DEFAULT_CCEP_THRESHOLD = 0.32
-- (0.34 -> 0.33: re-tuned after fixing a split-leakage bug in fit_weights.py.
--  0.33 -> 0.32: margin-first selection rule — widest boundary margin among
--  thresholds meeting the <=10% missed-escalation constraint.)
ALTER TABLE "Settings" ALTER COLUMN "ccepThreshold" SET DEFAULT 0.32;
ALTER TABLE "Settings" ALTER COLUMN "reversibilityMap" SET DEFAULT '{"slack_notification":0.1,"jira_comment":0.3,"status_change":0.5,"auto_merge_pr":0.3,"prod_deploy":1.0}';
