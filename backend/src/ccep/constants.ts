/**
 * constants.ts — Single Source of Truth for CCEP Configuration
 *
 * The CCEP escalation threshold was tuned on train+val splits (N=255) to satisfy
 * the pre-defined safety constraint: keeping the missed-escalation rate <= 10%
 * (i.e. recall on the ESCALATE class >= 90%).
 *
 * Value: 0.32 — selected by the margin-first rule in fit_weights.py (2026-10-24).
 *
 * SELECTION RULE: among thresholds meeting the safety target, pick the widest
 * boundary margin — the distance from theta to the nearest TUNING row already on
 * the wrong side of the boundary — tie-broken by the higher threshold.
 *
 * WHY changed from 0.33: the old rule ("highest threshold meeting target") parked
 * theta exactly on the safety knee. On the 255-row tuning set that left only
 * 0.0024 of slack to the nearest wrong-side row, and only 0.0094 on the held-out
 * test split (nearest ESCALATE = 0.3394), so a tiny score drift could flip a
 * decision. The margin-first rule keeps the same safety guarantee and buys
 * robustness:
 *   - theta=0.33: tuning margin 0.0024, test margin 0.0094
 *   - theta=0.32: tuning margin 0.0099 (4.1x wider), test margin 0.0194 (2.1x wider)
 *   - theta=0.32 also sits inside the widest empty gap of the tuning score
 *     distribution, [0.3101, 0.3249] (width 0.0148; centre 0.3175).
 * Held-out test at theta=0.32: recall(escalate)=1.000, missed-escalation 0.0%
 * (0/23), escalation rate 51.1%. Tuning at theta=0.32: recall 0.933, missed-esc
 * 0.067 (within the <=10% bar), escalation rate 49.4%. theta=0.34 breaks the bar
 * (missed-esc 0.104), which pins the safety knee at 0.33.
 *
 * History: 0.34 -> 0.33 (2026-10-24, fixed a split-leakage bug in fit_weights.py
 * where sweep_threshold() re-derived train/val rows from the CSV split column
 * (270+19=289) while split_dataset() used a random stratified fallback
 * (210+45=255), leaking 42/45 test rows into the tuning set). 0.33 -> 0.32
 * (2026-10-24, margin-first selection rule).
 *
 * Reproduced by: python fit_weights.py (seed=42). Overlap assertion PASSED
 * (0 shared scenario IDs between the sweep tuning set and the test set).
 */
export const DEFAULT_CCEP_THRESHOLD = 0.32;

/**
 * MERGEGATE_THRESHOLD — policy gate for PR auto-merge decisions.
 *
 * UNIFIED WITH DEFAULT_CCEP_THRESHOLD = 0.32:
 * Replaced the circular argument ("0.60 because 0.33 blocks every PR") with:
 * 1. Explicit preconditions in `evaluateMergePreconditions()`:
 *    - required checks green (ciStatus === 'success')
 *    - zero guardrail flags (no secrets/PII/injection and no high-risk modules)
 *    - bounded diff size (files <= 20, lines <= 500)
 *    - target branch unprotected (not release/production/hotfix)
 *    Any PR that fails any precondition is escalated unconditionally before
 *    CCEP scoring.
 * 2. Justified action_reversibility_weight for `auto_merge_pr` = 0.30:
 *    Git merges to development/feature branches are atomic and 1-click reversible
 *    via `git revert`, with no direct production blast radius (unlike prod_deploy=1.0
 *    and database status_change=0.5).
 * 3. With rev=0.30, a clean PR (PR-42: conf=0.85, err=0.10, flags=0) scores:
 *    CCEP = 0.2562*(1-0.85) + 0.2260*(0.10) + 0 + 0.3502*(0.30) = 0.1661 < 0.32 -> AUTO_RESOLVE.
 *    A risky PR (PR-99) fails preconditions and scores > 0.50 >= 0.32 -> ESCALATE.
 *
 * Therefore, MergeGate operates seamlessly under the universal threshold θ = 0.32.
 */
export const MERGEGATE_THRESHOLD = DEFAULT_CCEP_THRESHOLD;
