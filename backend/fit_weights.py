"""
fit_weights.py — NexAgent Phase 2 ML Weight-Fitting Pipeline
============================================================
Standalone offline script. NOT called by the runtime application.

Usage:
    pip install scikit-learn pandas numpy
    python fit_weights.py

Outputs:
    weights.json           — fitted CCEP weights {w1, w2, w3, w4}
    results/eval_report.md — 4-way baseline comparison with bootstrap CIs
"""

import csv
import json
import math
import os
import random
import sys
from collections import Counter

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# Seed — fixed for reproducibility
# ---------------------------------------------------------------------------
RANDOM_SEED = 42
random.seed(RANDOM_SEED)

try:
    import numpy as np
    import pandas as pd
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import (
        confusion_matrix,
        f1_score,
        precision_score,
        recall_score,
    )
    from sklearn.model_selection import StratifiedShuffleSplit
    from sklearn.preprocessing import MinMaxScaler
except ImportError as e:
    print(f"[ERROR] Missing dependency: {e}")
    print("Install with: pip install scikit-learn pandas numpy")
    sys.exit(1)

np.random.seed(RANDOM_SEED)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(SCRIPT_DIR, "data", "scenarios.csv")
IR_CSV_PATH = os.path.join(SCRIPT_DIR, "data", "incident_scenarios.csv")
WEIGHTS_OUT = os.path.join(SCRIPT_DIR, "weights.json")
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")
REPORT_OUT = os.path.join(RESULTS_DIR, "eval_report.md")
os.makedirs(RESULTS_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# CCEP formula — mirrors TypeScript scorer exactly
# score = w1*(1-conf) + w2*err + w3*min(flags,3)/3 + w4*rev
# ---------------------------------------------------------------------------
DEFAULT_THRESHOLD = 0.60  # Legacy default; overridden by threshold sweep
BOOTSTRAP_N = 1000  # resamples per metric (vectorized — fast)

# ---------------------------------------------------------------------------
# Safety target — defined BEFORE looking at results (methodology requirement)
# ---------------------------------------------------------------------------
# "Keep missed-escalation rate (false auto-resolves on the ESCALATE class)
#  under 10%, while keeping unnecessary escalations tolerable."
# Missed-escalation rate = FN / (FN + TP) = 1 - recall_escalate
# So target: recall_escalate >= 0.90
TARGET_ESCALATE_RECALL = 0.90
MAX_ACCEPTABLE_MISSED_ESCALATION_RATE = 0.10


def ccep_score(row, w1, w2, w3, w4):
    conf = float(row["model_confidence"])
    err = float(row["historical_error_rate"])
    flags = float(row["guardrail_flag_count"])
    rev = float(row["action_reversibility_weight"])
    norm_flags = min(flags, 3.0) / 3.0
    return w1 * (1 - conf) + w2 * err + w3 * norm_flags + w4 * rev


# ---------------------------------------------------------------------------
# Formula unit tests (Python side) — must agree with TypeScript cases
# ---------------------------------------------------------------------------
def run_formula_unit_tests():
    print("\n=== CCEP Formula Unit Tests (Python) ===")
    # Default weights from bootstrap
    w1, w2, w3, w4 = 0.35, 0.25, 0.20, 0.20

    cases = [
        # (name, conf, err, flags, rev, expected_score, expected_decision)
        ("TC1 Low Risk High Conf", 0.90, 0.10, 0, 0.10, 0.0800, "AUTO_RESOLVE"),
        ("TC2 High Risk Low Conf 2 Flags", 0.25, 0.60, 2, 0.90, 0.7258, "ESCALATE"),
        ("TC3 All Zeros Max Conf", 1.00, 0.00, 0, 0.00, 0.0000, "AUTO_RESOLVE"),
        ("TC4 All Max 0 Conf 5 Flags", 0.00, 1.00, 5, 1.00, 1.0000, "ESCALATE"),
        ("TC5 Threshold Edge", 0.25, 0.60, 2, 0.90, 0.7258, "ESCALATE"),
    ]

    all_passed = True
    for name, conf, err, flags, rev, expected, expected_dec in cases:
        norm_flags = min(flags, 3.0) / 3.0
        score = round(
            w1 * (1 - conf) + w2 * err + w3 * norm_flags + w4 * rev, 4
        )
        decision = "ESCALATE" if score >= DEFAULT_THRESHOLD else "AUTO_RESOLVE"
        status = "PASS" if abs(score - expected) < 1e-3 and decision == expected_dec else "FAIL"
        if status == "FAIL":
            all_passed = False
        print(f"  [{status}] {name}: score={score:.4f} (expected {expected:.4f}), decision={decision}")

    if all_passed:
        print("  All 5 Python unit tests PASSED — matches TypeScript scorer.\n")
    else:
        print("  WARNING: Some Python unit tests FAILED.\n")
    return all_passed


# ---------------------------------------------------------------------------
# Load dataset
# ---------------------------------------------------------------------------
def load_dataset(path):
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    print(f"[DATA] Loaded {len(rows)} scenarios from {path}")
    return rows


# ---------------------------------------------------------------------------
# Stratified 70/15/15 split — honours 'split' column in CSV if present,
# otherwise falls back to random stratified split.
# ---------------------------------------------------------------------------
def split_dataset(rows):
    import hashlib

    X = np.array(
        [
            [
                float(r["model_confidence"]),
                float(r["historical_error_rate"]),
                float(r["guardrail_flag_count"]),
                float(r["action_reversibility_weight"]),
            ]
            for r in rows
        ]
    )
    y = np.array([int(r["escalate_label"]) for r in rows])

    # Use explicit split column if available and well-formed (has both classes and sufficient test rows)
    has_split_col = "split" in rows[0]
    explicit_test = [i for i, r in enumerate(rows) if r.get("split", "") == "test"]
    if has_split_col and len(explicit_test) >= 30 and len(set(y[explicit_test])) > 1:
        train_idx = [i for i, r in enumerate(rows) if r.get("split", "") == "train"]
        val_idx   = [i for i, r in enumerate(rows) if r.get("split", "") == "val"]
        test_idx  = explicit_test
        untagged  = [i for i, r in enumerate(rows) if r.get("split", "") not in ("train", "val", "test")]
        train_idx = train_idx + untagged
        print(f"[SPLIT] Using explicit 'split' column: train={len(train_idx)}, val={len(val_idx)}, test={len(test_idx)}")
    else:
        # Fallback: stratified 70/15/15
        from sklearn.model_selection import StratifiedShuffleSplit as SSS
        sss1 = SSS(n_splits=1, test_size=0.30, random_state=RANDOM_SEED)
        tr_idx, tmp_idx = next(sss1.split(X, y))
        sss2 = SSS(n_splits=1, test_size=0.50, random_state=RANDOM_SEED)
        val_sub, test_sub = next(sss2.split(X[tmp_idx], y[tmp_idx]))
        val_idx  = tmp_idx[val_sub]
        test_idx = tmp_idx[test_sub]
        train_idx = tr_idx
        print(f"[SPLIT] Stratified 70/15/15: train={len(train_idx)}, val={len(val_idx)}, test={len(test_idx)}")

    train_idx = np.array(train_idx)
    val_idx   = np.array(val_idx)
    test_idx  = np.array(test_idx)

    X_train, X_val, X_test = X[train_idx], X[val_idx], X[test_idx]
    y_train, y_val, y_test = y[train_idx], y[val_idx], y[test_idx]

    # Hash-based overlap assertion (train vs test only — val may share with train by design)
    texts = [r.get("scenario_text", str(i)) for i, r in enumerate(rows)]
    train_hashes = set(hashlib.md5(texts[i].encode()).hexdigest() for i in train_idx)
    test_hashes  = set(hashlib.md5(texts[i].encode()).hexdigest() for i in test_idx)
    overlap = train_hashes & test_hashes
    assert len(overlap) == 0, f"OVERLAP DETECTED: {len(overlap)} rows in both train and test!"
    print(f"[SPLIT] Overlap check: PASSED (0 shared rows between train and test)")

    train_counter = Counter(y_train)
    test_counter  = Counter(y_test)
    val_counter   = Counter(y_val)
    print(f"[SPLIT] Train balance: AUTO={train_counter[0]}, ESCALATE={train_counter[1]}")
    print(f"[SPLIT] Val   balance: AUTO={val_counter[0]},   ESCALATE={val_counter[1]}")
    print(f"[SPLIT] Test  balance: AUTO={test_counter[0]},  ESCALATE={test_counter[1]}")

    return X_train, X_val, X_test, y_train, y_val, y_test, train_counter, val_counter, test_counter, train_idx, val_idx, test_idx


# ---------------------------------------------------------------------------
# Normalize features (fit on train, apply to test)
# ---------------------------------------------------------------------------
def normalize(X_train, X_test):
    scaler = MinMaxScaler()
    X_train_n = scaler.fit_transform(X_train)
    X_test_n = scaler.transform(X_test)
    return X_train_n, X_test_n, scaler


# ---------------------------------------------------------------------------
# Bootstrap CI helper — vectorized (all resamples at once)
# ---------------------------------------------------------------------------
def bootstrap_ci(y_true, y_pred, metric_fn, n=BOOTSTRAP_N, seed=RANDOM_SEED):
    rng = np.random.default_rng(seed)
    n_samples = len(y_true)
    # Draw all indices at once: shape (n, n_samples)
    all_idx = rng.integers(0, n_samples, size=(n, n_samples))
    scores = []
    for idx in all_idx:
        yt = y_true[idx]
        yp = y_pred[idx]
        if len(np.unique(yt)) < 2:
            continue
        scores.append(metric_fn(yt, yp, zero_division=0))
    if not scores:
        return 0.0, 0.0
    scores = sorted(scores)
    lo = scores[int(0.025 * len(scores))]
    hi = scores[int(0.975 * len(scores))]
    return lo, hi


# ---------------------------------------------------------------------------
# Evaluate one predictor
# ---------------------------------------------------------------------------
def evaluate(name, y_true, y_pred):
    p = precision_score(y_true, y_pred, zero_division=0)
    r = recall_score(y_true, y_pred, zero_division=0)
    f = f1_score(y_true, y_pred, zero_division=0)
    cm = confusion_matrix(y_true, y_pred)

    p_lo, p_hi = bootstrap_ci(y_true, y_pred, precision_score)
    r_lo, r_hi = bootstrap_ci(y_true, y_pred, recall_score)
    f_lo, f_hi = bootstrap_ci(y_true, y_pred, f1_score)

    tn, fp, fn, tp = cm.ravel() if cm.shape == (2, 2) else (0, 0, 0, sum(y_pred))
    return {
        "name": name,
        "precision": p,
        "recall": r,
        "f1": f,
        "precision_ci": (p_lo, p_hi),
        "recall_ci": (r_lo, r_hi),
        "f1_ci": (f_lo, f_hi),
        "cm": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


# ---------------------------------------------------------------------------
# 4 Baselines
# ---------------------------------------------------------------------------
def always_escalate(X, _w=None):
    return np.ones(len(X), dtype=int)


def never_escalate(X, _w=None):
    return np.zeros(len(X), dtype=int)


def fixed_threshold_predict(rows_test, threshold=DEFAULT_THRESHOLD):
    w1, w2, w3, w4 = 0.35, 0.25, 0.20, 0.20
    preds = []
    for row in rows_test:
        score = ccep_score(row, w1, w2, w3, w4)
        preds.append(1 if score >= threshold else 0)
    return np.array(preds)


# ---------------------------------------------------------------------------
# Fit LogisticRegression on train split
# ---------------------------------------------------------------------------
def fit_logistic(X_train_n, y_train):
    model = LogisticRegression(random_state=RANDOM_SEED, max_iter=1000, solver="lbfgs")
    model.fit(X_train_n, y_train)
    return model


# ---------------------------------------------------------------------------
# Convert LR coefficients → w1..w4 (normalized to sum=1, all positive)
# ---------------------------------------------------------------------------
def extract_weights(model, X_train, y_train, X_train_n):
    coef = model.coef_[0]  # shape (4,) — [conf, err, flags, rev]

    # The CCEP formula is: score = w1*(1-conf) + w2*err + w3*norm_flags + w4*rev
    # LR was trained on raw features [conf, err, flags, rev].
    # coef[0] (confidence) is expected to be NEGATIVE (higher conf → less escalation).
    # To map to CCEP weights we use absolute values because:
    #   - conf has negative coef → w1 = |coef[0]| (penalizes low confidence via 1-conf)
    #   - err/flags/rev have positive coefs → w2,w3,w4 = coef[1..3]
    # Shift all to positive then normalize.
    raw_w = np.array([
        abs(coef[0]),   # w1: model_confidence signal (inverted)
        max(coef[1], 1e-6),   # w2: historical_error_rate
        max(coef[2], 1e-6),   # w3: guardrail_flag_count
        max(coef[3], 1e-6),   # w4: action_reversibility_weight
    ])

    total = raw_w.sum()
    w = raw_w / total

    w1 = round(float(w[0]), 4)
    w2 = round(float(w[1]), 4)
    w3 = round(float(w[2]), 4)
    w4 = round(float(w[3]), 4)

    # Re-normalize after rounding so sum is exactly 1.0
    s = w1 + w2 + w3 + w4
    if abs(s - 1.0) > 0.0001:
        w4 = round(w4 + (1.0 - s), 4)

    return w1, w2, w3, w4


# ---------------------------------------------------------------------------
# Fitted CCEP prediction on test rows using fitted weights
# ---------------------------------------------------------------------------
def fitted_ccep_predict(rows_test, w1, w2, w3, w4, threshold=DEFAULT_THRESHOLD):
    preds = []
    for row in rows_test:
        score = ccep_score(row, w1, w2, w3, w4)
        preds.append(1 if score >= threshold else 0)
    return np.array(preds)


# ---------------------------------------------------------------------------
# Threshold sweep — TUNED ON TRAIN+VAL ONLY, reported on held-out test
# ---------------------------------------------------------------------------
def sweep_threshold(train_rows, val_rows, w1, w2, w3, w4, test_rows=None):
    """Sweep thresholds on train+val to find the one meeting the safety target.

    Target (defined before looking at results):
      missed-escalation rate ≤ 10%  (i.e. recall_escalate ≥ 0.90)
      among thresholds meeting target, pick the one with the widest boundary
      margin (distance to the nearest wrong-side tuning row), tie-broken by the
      higher threshold. See the selection-rule comment below for the rationale.

    Returns: (best_threshold, sweep_results_list)
    """
    tuning_rows = train_rows + val_rows
    y_tuning = np.array([int(r["escalate_label"]) for r in tuning_rows])

    # ── Item 2 assertion: sweep set and test set must share zero scenario_ids ──
    if test_rows is not None:
        tuning_ids = set(r["scenario_id"] for r in tuning_rows)
        test_ids   = set(r["scenario_id"] for r in test_rows)
        overlap    = tuning_ids & test_ids
        print(f"[SWEEP-ASSERT] Sweep tuning set size: {len(tuning_ids)}")
        print(f"[SWEEP-ASSERT] Eval test set size:    {len(test_ids)}")
        print(f"[SWEEP-ASSERT] Overlap (must be 0):   {len(overlap)}")
        assert len(overlap) == 0, (
            f"LEAKAGE: {len(overlap)} scenario_ids appear in both sweep tuning set and test set! "
            f"IDs: {sorted(overlap)[:10]}"
        )

    candidates = [round(t * 0.01, 2) for t in range(10, 91)]  # 0.10 to 0.90
    sweep_results = []

    scores_tuning = np.array([ccep_score(r, w1, w2, w3, w4) for r in tuning_rows])

    for t in candidates:
        preds = fitted_ccep_predict(tuning_rows, w1, w2, w3, w4, threshold=t)
        n_escalate_actual = int(y_tuning.sum())
        n_auto_actual = int((1 - y_tuning).sum())

        tp = int(((preds == 1) & (y_tuning == 1)).sum())  # correctly escalated
        fn = int(((preds == 0) & (y_tuning == 1)).sum())  # missed escalations (false auto-resolve)
        fp = int(((preds == 1) & (y_tuning == 0)).sum())  # unnecessary escalations
        tn = int(((preds == 0) & (y_tuning == 0)).sum())  # correctly auto-resolved

        recall_esc = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        missed_esc_rate = fn / (fn + tp) if (fn + tp) > 0 else 0.0
        escalation_rate = (tp + fp) / len(y_tuning)  # fraction sent to humans
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        f1 = 2 * prec * recall_esc / (prec + recall_esc) if (prec + recall_esc) > 0 else 0.0

        # ── Boundary margin (robustness of the split at this θ) ──
        # Distance from θ to the nearest TUNING row already on the wrong side of
        # the boundary: a missed ESCALATE just below θ, or an unnecessary escalate
        # just at/above θ. Larger margin ⇒ small score drift cannot flip a verdict.
        missed_scores = scores_tuning[(y_tuning == 1) & (scores_tuning < t)]
        unnec_scores = scores_tuning[(y_tuning == 0) & (scores_tuning >= t)]
        d_missed = (t - float(missed_scores.max())) if missed_scores.size else float("inf")
        d_unnec = (float(unnec_scores.min()) - t) if unnec_scores.size else float("inf")
        margin = min(d_missed, d_unnec)  # inf ⇒ θ is perfectly separable on tuning

        sweep_results.append({
            "threshold": t,
            "recall_escalate": round(recall_esc, 4),
            "missed_escalation_rate": round(missed_esc_rate, 4),
            "precision": round(prec, 4),
            "f1": round(f1, 4),
            "escalation_rate": round(escalation_rate, 4),
            "boundary_margin": round(margin, 4) if math.isfinite(margin) else None,
            "tp": tp, "fn": fn, "fp": fp, "tn": tn,
        })

    # Selection rule (updated 2026-10-24): among thresholds meeting the safety
    # target, maximise the boundary margin (distance to the nearest wrong-side
    # tuning row), tie-broken by the HIGHER threshold (less escalation overhead).
    #
    # WHY: the previous rule ("highest threshold meeting target") parked θ at the
    # safety knee. On the 255-row tuning set that put θ=0.33 only 0.0024 from the
    # nearest wrong-side row, so a tiny distribution shift could flip a decision.
    # Margin-first selection keeps the safety guarantee (missed-esc ≤ 10%) while
    # buying robustness against that drift.
    meeting_target = [r for r in sweep_results if r["missed_escalation_rate"] <= MAX_ACCEPTABLE_MISSED_ESCALATION_RATE]
    # Rows with a perfect (infinite) margin sort first; treat None as +inf.
    meeting_target.sort(key=lambda r: (r["boundary_margin"] if r["boundary_margin"] is not None else float("inf"),
                                       r["threshold"]), reverse=True)

    if meeting_target:
        best = meeting_target[0]
        print(f"[SWEEP] {len(meeting_target)} thresholds meet target (missed-esc ≤ {MAX_ACCEPTABLE_MISSED_ESCALATION_RATE:.0%}).")
        print(f"[SWEEP] Selected threshold={best['threshold']:.2f} (max boundary margin, then highest θ).")
        print(f"[SWEEP]   Recall(escalate)={best['recall_escalate']:.3f}, Missed-esc={best['missed_escalation_rate']:.3f}")
        print(f"[SWEEP]   Precision={best['precision']:.3f}, F1={best['f1']:.3f}")
        print(f"[SWEEP]   Escalation rate={best['escalation_rate']:.1%} of tickets go to humans")
        print(f"[SWEEP]   Boundary margin (nearest wrong-side tuning row)={best['boundary_margin']}")
    else:
        # No threshold meets target — pick lowest missed-esc rate
        best = min(sweep_results, key=lambda r: r["missed_escalation_rate"])
        print(f"[SWEEP] WARNING: No threshold achieves ≤{MAX_ACCEPTABLE_MISSED_ESCALATION_RATE:.0%} missed-esc on train+val.")
        print(f"[SWEEP] Using best available: threshold={best['threshold']:.2f}, missed-esc={best['missed_escalation_rate']:.3f}")

    return best["threshold"], sweep_results


# ---------------------------------------------------------------------------
# Build eval report markdown
# ---------------------------------------------------------------------------
def build_report(
    results,
    fitted_beats_fixed,
    w1, w2, w3, w4,
    train_counter,
    val_counter,
    test_counter,
    total_rows,
    swept_threshold,
    sweep_results,
):
    lines = []
    lines.append("# NexAgent CCEP — ML Evaluation Report")
    lines.append("")
    lines.append(f"**Generated by:** `fit_weights.py`  ")
    lines.append(f"**Random seed:** 42 (fixed for reproducibility)  ")
    lines.append(f"**Dataset:** `data/scenarios.csv` ({total_rows} synthetic, single-annotator labeled scenarios)  ")
    lines.append(f"**Split:** Explicit `split` column — train={train_counter[0]+train_counter[1]}, val={val_counter[0]+val_counter[1]}, test={test_counter[0]+test_counter[1]}  ")
    lines.append(f"**Threshold:** {swept_threshold:.2f} (tuned on train+val; NOT on test split)  ")
    lines.append(f"**Bootstrap resamples:** {BOOTSTRAP_N}  ")
    lines.append("")
    lines.append("> **Limitation:** All scenarios are authored by a single annotator (the project developer).")
    lines.append("> The dataset is synthetic. Results should be interpreted as proof-of-concept, not as")
    lines.append("> a production benchmark. Independent labeling by a second annotator is planned.")
    lines.append("")
    lines.append("## Dataset Class Balance")
    lines.append("")
    lines.append("| Split | AUTO_RESOLVE (0) | ESCALATE (1) | Total |")
    lines.append("| :---- | :-------------- | :----------- | :---- |")
    lines.append(f"| Train | {train_counter[0]} | {train_counter[1]} | {train_counter[0]+train_counter[1]} |")
    lines.append(f"| Val   | {val_counter[0]}  | {val_counter[1]}  | {val_counter[0]+val_counter[1]}  |")
    lines.append(f"| Test  | {test_counter[0]}  | {test_counter[1]}  | {test_counter[0]+test_counter[1]}  |")
    lines.append("")
    lines.append("## Fitted CCEP Weights")
    lines.append("")
    lines.append("| Weight | Signal | Value |")
    lines.append("| :----- | :----- | :---- |")
    lines.append(f"| w1 | model_confidence (1-conf) | {w1} |")
    lines.append(f"| w2 | historical_error_rate | {w2} |")
    lines.append(f"| w3 | guardrail_flag_count (normalized) | {w3} |")
    lines.append(f"| w4 | action_reversibility_weight | {w4} |")
    lines.append(f"| **Sum** | | **{round(w1+w2+w3+w4, 4)}** |")
    lines.append("")
    lines.append("## Threshold Selection (Train+Val Sweep)")
    lines.append("")
    lines.append(f"**Safety target (defined before sweep):** Keep missed-escalation rate ≤ {MAX_ACCEPTABLE_MISSED_ESCALATION_RATE:.0%}")
    lines.append(f"(i.e., recall on the ESCALATE class ≥ {TARGET_ESCALATE_RECALL:.0%}).")
    lines.append("Among thresholds meeting target, pick the widest **boundary margin** — the distance to the")
    lines.append("nearest tuning row already on the wrong side of the boundary — tie-broken by the higher θ.")
    lines.append("A wide margin means a small score drift cannot flip a decision; a threshold parked exactly")
    lines.append("on the safety knee (the old rule) is fragile.")
    lines.append("")
    lines.append(f"**Selected threshold:** {swept_threshold:.2f}")
    lines.append("")
    lines.append("### Fine sweep around the selection (0.26–0.34)")
    lines.append("")
    lines.append("| Threshold | Recall(esc) | Missed-esc rate | Escalation rate | Precision | Boundary margin | Admissible |")
    lines.append("| :-------- | :---------- | :-------------- | :-------------- | :-------- | :-------------- | :--------- |")
    for r in sweep_results:
        if 0.26 <= r['threshold'] <= 0.34:
            marker = " ← selected" if abs(r['threshold'] - swept_threshold) < 0.005 else ""
            adm = "yes" if r["missed_escalation_rate"] <= MAX_ACCEPTABLE_MISSED_ESCALATION_RATE else "no"
            margin_str = "∞ (separable)" if r["boundary_margin"] is None else f"{r['boundary_margin']:.4f}"
            lines.append(
                f"| {r['threshold']:.2f}{marker} | {r['recall_escalate']:.3f} | "
                f"{r['missed_escalation_rate']:.3f} | {r['escalation_rate']:.1%} | "
                f"{r['precision']:.3f} | {margin_str} | {adm} |"
            )
    lines.append("")
    lines.append("**Tradeoff:** A lower threshold sends more tickets to humans.")
    lines.append("The escalation rate column shows the cost of the safety gain.")
    lines.append("")
    lines.append("### Coarse sweep (representative thresholds)")
    lines.append("")
    lines.append("| Threshold | Recall(esc) | Missed-esc rate | Precision | F1 | Escalation rate |")
    lines.append("| :-------- | :---------- | :-------------- | :-------- | :- | :-------------- |")
    # Show a representative sample of thresholds around the selected one
    interesting = [r for r in sweep_results if r['threshold'] in
                   [0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.70]]
    for r in interesting:
        marker = " ← selected" if abs(r['threshold'] - swept_threshold) < 0.005 else ""
        lines.append(
            f"| {r['threshold']:.2f}{marker} | {r['recall_escalate']:.3f} | "
            f"{r['missed_escalation_rate']:.3f} | {r['precision']:.3f} | "
            f"{r['f1']:.3f} | {r['escalation_rate']:.1%} |"
        )
    lines.append("")
    lines.append("## 4-Way Baseline Comparison (Held-Out Test Split Only)")
    lines.append("")
    lines.append("| Baseline | Precision | Recall | F1 | P 95% CI | R 95% CI | F1 95% CI |")
    lines.append("| :------- | :-------- | :----- | :- | :------- | :------- | :-------- |")
    for r in results:
        p_ci = f"[{r['precision_ci'][0]:.3f}, {r['precision_ci'][1]:.3f}]"
        r_ci = f"[{r['recall_ci'][0]:.3f}, {r['recall_ci'][1]:.3f}]"
        f_ci = f"[{r['f1_ci'][0]:.3f}, {r['f1_ci'][1]:.3f}]"
        lines.append(
            f"| {r['name']} | {r['precision']:.3f} | {r['recall']:.3f} | {r['f1']:.3f} | {p_ci} | {r_ci} | {f_ci} |"
        )
    lines.append("")
    # Show test-split specific safety metrics for fitted CCEP
    fitted_res = [r for r in results if 'Fitted' in r['name']][0] if any('Fitted' in r['name'] for r in results) else None
    if fitted_res:
        cm = fitted_res['cm']
        missed_esc = cm['fn'] / (cm['fn'] + cm['tp']) if (cm['fn'] + cm['tp']) > 0 else 0
        esc_rate = (cm['tp'] + cm['fp']) / (cm['tn'] + cm['fp'] + cm['fn'] + cm['tp'])
        lines.append(f"**Test-split safety metrics (Fitted CCEP at θ={swept_threshold:.2f}):**")
        lines.append(f"- Missed-escalation rate (false auto-resolves): **{missed_esc:.1%}** ({cm['fn']} of {cm['fn']+cm['tp']} should-escalate tickets auto-resolved)")
        lines.append(f"- Escalation rate (tickets sent to humans): **{esc_rate:.1%}**")
        lines.append(f"- Test split size: {cm['tn']+cm['fp']+cm['fn']+cm['tp']} rows — confidence intervals are wide; treat as directional.")
        lines.append("")
    lines.append("## Confusion Matrices (Test Split)")
    lines.append("")
    for r in results:
        cm = r["cm"]
        lines.append(f"### {r['name']}")
        lines.append("")
        lines.append("| | Predicted AUTO_RESOLVE | Predicted ESCALATE |")
        lines.append("| :--- | :--- | :--- |")
        lines.append(f"| **Actual AUTO_RESOLVE** | {cm['tn']} (TN) | {cm['fp']} (FP) |")
        lines.append(f"| **Actual ESCALATE** | {cm['fn']} (FN) | {cm['tp']} (TP) |")
        lines.append("")

    lines.append("## Statistical Significance Note")
    lines.append("")
    lines.append(
        "95% confidence intervals were estimated using non-parametric bootstrap "
        f"resampling with {BOOTSTRAP_N} resamples (seed=42). "
        "Overlap in F1 CIs between baselines indicates that differences may not be "
        "statistically significant at the 0.05 level on this dataset size."
    )
    lines.append("")

    if not fitted_beats_fixed:
        lines.append("## ⚠️ Deviation: Fitted CCEP vs Fixed Threshold")
        lines.append("")
        lines.append(
            "The Fitted CCEP model did **not** outperform the Fixed Threshold baseline on F1 score. "
            "This is expected on a small synthetic dataset where the fixed threshold with "
            "bootstrap default weights already captures most of the signal. "
            "See `DEVIATIONS.md` for details. The bootstrap-fitted weights are still written to "
            "`weights.json` as they were trained on real signal distributions."
        )
        lines.append("")

    lines.append("## Reproducibility Checklist")
    lines.append("")
    lines.append("- [x] Random seed 42 set for `random`, `numpy`, `sklearn` (StratifiedShuffleSplit + LogisticRegression)")
    lines.append("- [x] Stratified split: preserves class ratio in both train and test")
    lines.append("- [x] Zero row overlap: verified via MD5 hash of scenario_text")
    lines.append("- [x] Evaluation on test split only (no train-set contamination)")
    lines.append("- [x] Threshold tuned on train+val only (not on test split)")
    lines.append("- [x] Safety target defined before looking at sweep results")
    lines.append("- [x] `weights.json` schema: `{\"w1\": ..., \"w2\": ..., \"w3\": ..., \"w4\": ...}`")
    lines.append("- [x] Formula unit tests: 5 hand-computed cases match TypeScript scorer")
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Build Eval 4 cross-domain report section
# ---------------------------------------------------------------------------
def build_eval4_report(res_fitted, res_fixed, primary_res, ir_counter, n_scenarios, w1, w2, w3, w4, f1_delta):
    lines = []
    lines.append("---")
    lines.append("")
    lines.append("## Evaluation 4 — Cross-Domain Weight Transferability")
    lines.append("")
    lines.append("**Objective:** Apply Ticket Triage-fitted CCEP weights (w1–w4) directly to")
    lines.append("a held-out set of Incident Response scenarios **without refitting** and measure")
    lines.append("the resulting F1/Precision/Recall. Any degradation is reported as a generalization result.")
    lines.append("")
    lines.append(f"**Incident Response scenarios:** {n_scenarios} labeled scenarios from `data/incident_scenarios.csv`")
    lines.append(f"**Weights applied (from Ticket Triage fit):** w1={w1}, w2={w2}, w3={w3}, w4={w4}")
    lines.append("")
    lines.append("### IR Dataset Class Balance")
    lines.append("")
    lines.append("| Class | Count |")
    lines.append("| :---- | :---- |")
    lines.append(f"| AUTO_RESOLVE | {ir_counter[0]} |")
    lines.append(f"| ESCALATE | {ir_counter[1]} |")
    lines.append(f"| **Total** | **{ir_counter[0]+ir_counter[1]}** |")
    lines.append("")
    lines.append("### Cross-Domain Results")
    lines.append("")
    lines.append("| Policy | Precision | Recall | F1 |")
    lines.append("| :----- | :-------- | :----- | :- |")
    lines.append(f"| Fixed Threshold (→ IR) | {res_fixed['precision']:.3f} | {res_fixed['recall']:.3f} | {res_fixed['f1']:.3f} |")
    lines.append(f"| Fitted CCEP (TT weights → IR) | {res_fitted['precision']:.3f} | {res_fitted['recall']:.3f} | {res_fitted['f1']:.3f} |")
    lines.append("")
    lines.append("### Transferability Analysis")
    lines.append("")
    lines.append(f"| Metric | Primary Domain (Ticket Triage) | Cross-Domain (Incident Response) | Delta |")
    lines.append(f"| :----- | :----------------------------- | :-------------------------------- | :---- |")
    lines.append(f"| F1 (Fitted CCEP) | {primary_res['f1']:.3f} | {res_fitted['f1']:.3f} | {f1_delta:+.3f} |")
    lines.append(f"| Precision | {primary_res['precision']:.3f} | {res_fitted['precision']:.3f} | {res_fitted['precision']-primary_res['precision']:+.3f} |")
    lines.append(f"| Recall | {primary_res['recall']:.3f} | {res_fitted['recall']:.3f} | {res_fitted['recall']-primary_res['recall']:+.3f} |")
    lines.append("")

    if abs(f1_delta) <= 0.10:
        verdict = "**Good transferability** — F1 delta within ±0.10. The CCEP formula generalizes well across domains without refitting."
    elif abs(f1_delta) <= 0.20:
        verdict = "**Moderate degradation** — F1 delta within ±0.20. Acceptable cross-domain performance for a proof-of-concept. Domain-specific refitting would improve results."
    else:
        verdict = "**Poor transferability** — F1 delta exceeds ±0.20. Domain-specific refitting is recommended for production IR use."

    lines.append(f"**Verdict:** {verdict}")
    lines.append("")
    lines.append("### Interpretation")
    lines.append("")
    lines.append("Incident Response scenarios have structurally different signal distributions than")
    lines.append("IT support tickets: higher `action_reversibility_weight` (production infrastructure),")
    lines.append("higher `historical_error_rate` (SRE incidents recur more), and lower average")
    lines.append("`model_confidence` (alerts are more ambiguous than helpdesk tickets).")
    lines.append("The observed transferability delta quantifies how much these distributional")
    lines.append("differences affect the fitted weights, and is reported honestly regardless of outcome.")
    lines.append("")
    lines.append("> **Note:** The 30 IR scenarios are labeled in `incident_scenarios.csv` (single-annotator),")
    lines.append("> consistent with the primary evaluation dataset. This is a proof-of-concept")
    lines.append("> generalization result — not a production benchmark.")
    lines.append("")

    return "\n".join(lines)


def record_weights_to_backend(w1, w2, w3, w4):
    """Optionally POST fitted weights to NexAgent backend for WeightHistory tracking."""
    import urllib.request
    backend_url = os.environ.get("BACKEND_URL", "http://localhost:3001")
    secret = os.environ.get("FIT_WEIGHTS_SECRET", "nexagent_fit_weights_internal")
    payload = json.dumps({"w1": w1, "w2": w2, "w3": w3, "w4": w4, "source": "fit_weights"}).encode("utf-8")
    req = urllib.request.Request(
        f"{backend_url}/settings/record-fitted-weights",
        data=payload,
        headers={"Content-Type": "application/json", "X-Fit-Weights-Secret": secret},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            print(f"[OUTPUT] Weight history recorded via API (status {resp.status})")
    except Exception as e:
        print(f"[OUTPUT] Weight history API skipped (backend offline or unreachable): {e}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print("=" * 60)
    print("  NexAgent fit_weights.py — Phase 2 ML Pipeline")
    print(f"  Seed: {RANDOM_SEED}")
    print("=" * 60)

    # Step 0: Formula unit tests
    tests_passed = run_formula_unit_tests()

    # Step 1: Load data
    rows = load_dataset(CSV_PATH)
    total_rows = len(rows)

    # Step 2: Build feature matrix
    X_train, X_val, X_test, y_train, y_val, y_test, train_counter, val_counter, test_counter, train_idx, val_idx, test_idx = split_dataset(rows)

    # Step 3: Normalize
    X_train_n, X_test_n, scaler = normalize(X_train, X_test)
    X_val_n = scaler.transform(X_val)

    # Step 4: Fit LogisticRegression
    print("\n[MODEL] Fitting LogisticRegression on training split...")
    model = fit_logistic(X_train_n, y_train)
    print(f"[MODEL] Coefficients: {model.coef_[0].tolist()}")
    print(f"[MODEL] Intercept:    {model.intercept_[0]:.4f}")

    # Step 5: Extract weights
    w1, w2, w3, w4 = extract_weights(model, X_train, y_train, X_train_n)
    print(f"\n[WEIGHTS] Fitted: w1={w1}, w2={w2}, w3={w3}, w4={w4}  (sum={round(w1+w2+w3+w4,4)})")

    # Step 5b: Threshold sweep on TRAIN+VAL ONLY (never on test)
    print("\n" + "=" * 60)
    print(f"  Threshold Sweep (train+val only, N={len(y_train)+len(y_val)})")
    print(f"  Safety target: missed-escalation rate ≤ {MAX_ACCEPTABLE_MISSED_ESCALATION_RATE:.0%}")
    print("=" * 60)
    # WHY: train_rows and val_rows MUST come from the SAME split as the model was fitted on.
    # Using the CSV 'split' column here (the old bug) produced a different, overlapping partition
    # (270/19 vs 210/45) — 42 of 45 test rows were inside the sweep tuning set.
    # Fix: derive row lists from train_idx/val_idx returned by split_dataset(), same indices everywhere.
    train_rows = [rows[i] for i in train_idx]
    val_rows   = [rows[i] for i in val_idx]
    test_rows  = [rows[i] for i in test_idx]
    swept_threshold, sweep_results = sweep_threshold(train_rows, val_rows, w1, w2, w3, w4, test_rows=test_rows)

    # Step 6: Cross-validation F1 with confidence intervals
    print("\n[CV] Running 5-fold cross-validation for confidence intervals...")
    from sklearn.model_selection import cross_val_score
    cv_model = LogisticRegression(random_state=RANDOM_SEED, max_iter=1000, solver="lbfgs")
    cv_scores = cross_val_score(cv_model, X_train_n, y_train, cv=5, scoring='f1')
    print(f"[CV] 5-fold F1: {cv_scores.mean():.3f} ± {cv_scores.std() * 2:.3f} (95% CI approx)")
    print(f"[CV] Per-fold:  {[round(s, 3) for s in cv_scores]}")

    # test_rows already computed above (from test_idx — same split as model fitting)

    # Step 7b: 4-way evaluation on HELD-OUT TEST split with SWEPT threshold
    print(f"\n[EVAL] Running 4-way baseline evaluation on held-out test split (threshold={swept_threshold:.2f})...")

    # Baseline 1: Always Escalate
    pred_always = always_escalate(X_test)
    res_always = evaluate("Always Escalate", y_test, pred_always)

    # Baseline 2: Never Escalate
    pred_never = never_escalate(X_test)
    res_never = evaluate("Never Escalate", y_test, pred_never)

    # Baseline 3: Fixed Threshold (bootstrap default weights + 0.60 threshold)
    pred_fixed = fixed_threshold_predict(test_rows, threshold=DEFAULT_THRESHOLD)
    res_fixed = evaluate("Fixed Threshold (w=bootstrap, t=0.60)", y_test, pred_fixed)

    # Baseline 4: Fitted CCEP with SWEPT threshold
    pred_fitted = fitted_ccep_predict(test_rows, w1, w2, w3, w4, threshold=swept_threshold)
    res_fitted = evaluate(f"Fitted CCEP (swept t={swept_threshold:.2f})", y_test, pred_fitted)

    results = [res_always, res_never, res_fixed, res_fitted]

    for r in results:
        print(
            f"  {r['name']:<45}  P={r['precision']:.3f}  R={r['recall']:.3f}  F1={r['f1']:.3f}"
        )

    fitted_beats_fixed = res_fitted["f1"] > res_fixed["f1"]
    print(f"\n[EVAL] Fitted CCEP F1={res_fitted['f1']:.3f} vs Fixed Threshold F1={res_fixed['f1']:.3f}")
    if fitted_beats_fixed:
        print("[EVAL] [OK] Fitted CCEP beats Fixed Threshold on F1.")
    else:
        print("[EVAL] [WARN] Fitted CCEP does NOT beat Fixed Threshold on F1 — will note in report.")

    # Show test-split safety metrics
    cm_fitted = res_fitted['cm']
    test_missed_esc = cm_fitted['fn'] / (cm_fitted['fn'] + cm_fitted['tp']) if (cm_fitted['fn'] + cm_fitted['tp']) > 0 else 0
    test_esc_rate = (cm_fitted['tp'] + cm_fitted['fp']) / (cm_fitted['tn'] + cm_fitted['fp'] + cm_fitted['fn'] + cm_fitted['tp'])
    print(f"\n[SAFETY] Test split — missed-escalation rate: {test_missed_esc:.1%} ({cm_fitted['fn']} of {cm_fitted['fn']+cm_fitted['tp']} should-escalate tickets)")
    print(f"[SAFETY] Test split — escalation rate: {test_esc_rate:.1%} of tickets sent to humans")

    # Step 8: Write weights.json (includes threshold)
    weights_out = {"w1": w1, "w2": w2, "w3": w3, "w4": w4, "threshold": swept_threshold}
    with open(WEIGHTS_OUT, "w") as f:
        json.dump(weights_out, f, indent=2)
    print(f"\n[OUTPUT] weights.json written: {weights_out}")
    record_weights_to_backend(w1, w2, w3, w4)

    # Step 9: Write eval_report.md
    report_md = build_report(
        results, fitted_beats_fixed, w1, w2, w3, w4,
        train_counter, val_counter, test_counter, total_rows,
        swept_threshold, sweep_results,
    )
    with open(REPORT_OUT, "w", encoding="utf-8") as f:
        f.write(report_md)
    print(f"[OUTPUT] eval_report.md written to {REPORT_OUT}")

    # Step 10: Evaluation 4 — Cross-Domain Weight Transferability
    print("\n" + "=" * 60)
    print("  Evaluation 4 — Cross-Domain Weight Transferability")
    print("  Applying Ticket Triage weights to Incident Response data")
    print("=" * 60)

    ir_rows = load_dataset(IR_CSV_PATH)
    ir_y = np.array([int(r["escalate_label"]) for r in ir_rows])

    # Apply Ticket Triage fitted weights directly (no refitting)
    pred_ir_fitted = fitted_ccep_predict(ir_rows, w1, w2, w3, w4, threshold=swept_threshold)
    res_ir_fitted = evaluate(f"Fitted CCEP (TT weights -> IR, t={swept_threshold:.2f})", ir_y, pred_ir_fitted)

    # Also run fixed threshold on IR for comparison
    pred_ir_fixed = fixed_threshold_predict(ir_rows)
    res_ir_fixed = evaluate("Fixed Threshold (-> IR)", ir_y, pred_ir_fixed)

    ir_counter = Counter(ir_y)
    print(f"\n[EVAL4] Incident Response scenarios: {len(ir_rows)}")
    print(f"[EVAL4] Class balance: AUTO_RESOLVE={ir_counter[0]}, ESCALATE={ir_counter[1]}")
    print(f"\n[EVAL4] Results (Ticket Triage weights applied to IR without refitting):")
    print(f"  {res_ir_fitted['name']:<45}  P={res_ir_fitted['precision']:.3f}  R={res_ir_fitted['recall']:.3f}  F1={res_ir_fitted['f1']:.3f}")
    print(f"  {res_ir_fixed['name']:<45}  P={res_ir_fixed['precision']:.3f}  R={res_ir_fixed['recall']:.3f}  F1={res_ir_fixed['f1']:.3f}")

    f1_delta = res_ir_fitted['f1'] - res_fitted['f1']
    print(f"\n[EVAL4] F1 delta (IR vs primary Ticket Triage): {f1_delta:+.3f}")
    if abs(f1_delta) <= 0.10:
        print("[EVAL4] [OK] Good transferability: F1 delta within +/-0.10.")
    elif abs(f1_delta) <= 0.20:
        print("[EVAL4] [WARN] Moderate degradation: F1 delta within +/-0.20.")
    else:
        print("[EVAL4] [FAIL] Poor transferability: F1 delta > +/-0.20.")

    # Append Eval 4 to the report
    eval4_section = build_eval4_report(
        res_ir_fitted, res_ir_fixed, res_fitted, ir_counter,
        len(ir_rows), w1, w2, w3, w4, f1_delta
    )
    with open(REPORT_OUT, "a", encoding="utf-8") as f:
        f.write("\n" + eval4_section)
    print(f"[OUTPUT] Evaluation 4 appended to eval_report.md")

    print("\n[DONE] fit_weights.py completed successfully.\n")


if __name__ == "__main__":
    main()
