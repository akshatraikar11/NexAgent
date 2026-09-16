#!/usr/bin/env python3
"""
Inter-Annotator Agreement (IAA) Tool for NexAgent Escalation Dataset
====================================================================
Usage:
  1. Generate 40-row stratified sample:
       python scripts/inter_annotator_agreement.py --generate

  2. After teammate fills in annotator2_label column in data/iaa_sample.csv:
       python scripts/inter_annotator_agreement.py --compute

  3. Quick check that sample was generated correctly:
       python scripts/inter_annotator_agreement.py --check
"""

import argparse
import csv
import os
import sys
from collections import Counter
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
RESULTS_DIR = PROJECT_ROOT / "results"
SCENARIOS_CSV = DATA_DIR / "scenarios.csv"
IAA_SAMPLE_CSV = DATA_DIR / "iaa_sample.csv"
IAA_REPORT_MD = RESULTS_DIR / "inter_annotator_agreement.md"

SAMPLE_SIZE = 40


def load_scenarios():
    """Load all scenarios from the main dataset."""
    rows = []
    with open(SCENARIOS_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def stratified_sample(rows, n=SAMPLE_SIZE, seed=42):
    """
    Select n rows stratified by 'category' column.
    Uses a deterministic seed for reproducibility.
    """
    import random
    rng = random.Random(seed)

    # Group by category
    by_category = {}
    for row in rows:
        cat = row.get("category", "UNKNOWN")
        by_category.setdefault(cat, []).append(row)

    categories = sorted(by_category.keys())
    num_cats = len(categories)

    # Base allocation: floor(n / num_cats) per category
    base = n // num_cats
    remainder = n - (base * num_cats)

    sampled = []
    for i, cat in enumerate(categories):
        pool = by_category[cat]
        rng.shuffle(pool)
        take = base + (1 if i < remainder else 0)
        take = min(take, len(pool))  # Don't exceed pool size
        sampled.extend(pool[:take])

    # If we're still short (unlikely), fill from any remaining
    if len(sampled) < n:
        used_ids = {r["scenario_id"] for r in sampled}
        remaining = [r for r in rows if r["scenario_id"] not in used_ids]
        rng.shuffle(remaining)
        sampled.extend(remaining[: n - len(sampled)])

    return sampled[:n]


def generate_sample():
    """Generate the IAA sample CSV for a second annotator."""
    rows = load_scenarios()
    sample = stratified_sample(rows)

    # Write sample with empty annotator2_label column
    fieldnames = [
        "scenario_id",
        "scenario_text",
        "model_confidence",
        "historical_error_rate",
        "guardrail_flag_count",
        "action_reversibility_weight",
        "escalate_label",          # Annotator 1 (original)
        "annotator2_label",        # Annotator 2 (teammate fills this)
        "category",
    ]

    with open(IAA_SAMPLE_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in sample:
            writer.writerow({
                "scenario_id": row["scenario_id"],
                "scenario_text": row["scenario_text"],
                "model_confidence": row["model_confidence"],
                "historical_error_rate": row["historical_error_rate"],
                "guardrail_flag_count": row["guardrail_flag_count"],
                "action_reversibility_weight": row["action_reversibility_weight"],
                "escalate_label": row["escalate_label"],
                "annotator2_label": "",   # Empty - teammate fills this
                "category": row["category"],
            })

    # Print summary
    cats = Counter(row["category"] for row in sample)
    print(f"[OK] Generated {IAA_SAMPLE_CSV}")
    print(f"   {len(sample)} rows, stratified across {len(cats)} categories:")
    for cat, count in sorted(cats.items()):
        print(f"     {cat}: {count} rows")
    print()
    print("[NEXT] Have your teammate fill in the 'annotator2_label' column")
    print("   (0 = auto-resolve, 1 = escalate) WITHOUT looking at 'escalate_label'.")
    print("   Then run: python scripts/inter_annotator_agreement.py --compute")


def cohens_kappa(y1, y2):
    """
    Compute Cohen's kappa for two lists of binary labels.
    kappa_val = (p_o - p_e) / (1 - p_e)
    """
    assert len(y1) == len(y2), "Label lists must be the same length"
    n = len(y1)

    # Observed agreement
    agree = sum(1 for a, b in zip(y1, y2) if a == b)
    p_o = agree / n

    # Expected agreement by chance
    # Count how often each annotator used each label
    a1_pos = sum(y1)
    a1_neg = n - a1_pos
    a2_pos = sum(y2)
    a2_neg = n - a2_pos

    p_e = ((a1_pos * a2_pos) + (a1_neg * a2_neg)) / (n * n)

    if p_e == 1.0:
        return 1.0  # Perfect agreement by definition

    kappa_val = (p_o - p_e) / (1 - p_e)
    return kappa_val


def interpret_kappa(k):
    """Landis & Koch (1977) interpretation scale."""
    if k < 0:
        return "Poor (less than chance)"
    elif k < 0.21:
        return "Slight"
    elif k < 0.41:
        return "Fair"
    elif k < 0.61:
        return "Moderate"
    elif k < 0.81:
        return "Substantial"
    else:
        return "Almost Perfect"


def compute_agreement():
    """Compute Cohen's kappa from the completed IAA sample."""
    if not IAA_SAMPLE_CSV.exists():
        print("[ERROR] No IAA sample found. Run with --generate first.")
        sys.exit(1)

    rows = []
    with open(IAA_SAMPLE_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    # Check completeness
    missing = [r for r in rows if r.get("annotator2_label", "").strip() == ""]
    if missing:
        print(f"[ERROR] {len(missing)} rows still have empty annotator2_label.")
        print("   Have your teammate complete all labels before running --compute.")
        sys.exit(1)

    # Extract labels
    y1 = [int(r["escalate_label"]) for r in rows]
    y2 = [int(r["annotator2_label"]) for r in rows]
    n = len(y1)

    # Overall metrics
    raw_agree = sum(1 for a, b in zip(y1, y2) if a == b)
    raw_pct = (raw_agree / n) * 100
    kappa_val = cohens_kappa(y1, y2)
    interpretation = interpret_kappa(kappa_val)

    # Per-category breakdown
    by_cat = {}
    for row, a1, a2 in zip(rows, y1, y2):
        cat = row.get("category", "UNKNOWN")
        by_cat.setdefault(cat, {"agree": 0, "total": 0})
        by_cat[cat]["total"] += 1
        if a1 == a2:
            by_cat[cat]["agree"] += 1

    # Confusion matrix
    tp = sum(1 for a, b in zip(y1, y2) if a == 1 and b == 1)
    tn = sum(1 for a, b in zip(y1, y2) if a == 0 and b == 0)
    fp = sum(1 for a, b in zip(y1, y2) if a == 0 and b == 1)
    fn = sum(1 for a, b in zip(y1, y2) if a == 1 and b == 0)

    # Generate report
    report = f"""# Inter-Annotator Agreement Report

## Summary

| Metric | Value |
|--------|-------|
| Sample size | {n} rows |
| Sampling method | Stratified by category |
| Categories covered | {len(by_cat)} |
| Raw agreement | {raw_agree}/{n} ({raw_pct:.1f}%) |
| **Cohen's kappa** | **{kappa_val:.3f}** |
| Interpretation | {interpretation} (Landis & Koch, 1977) |

## Confusion Matrix

|  | Annotator 2: Escalate | Annotator 2: Auto-Resolve |
|--|----------------------|--------------------------|
| **Annotator 1: Escalate** | {tp} (agree) | {fn} (disagree) |
| **Annotator 1: Auto-Resolve** | {fp} (disagree) | {tn} (agree) |

## Per-Category Breakdown

| Category | Agreed | Total | Agreement % |
|----------|--------|-------|-------------|
"""
    for cat in sorted(by_cat.keys()):
        d = by_cat[cat]
        pct = (d["agree"] / d["total"]) * 100
        report += f"| {cat} | {d['agree']} | {d['total']} | {pct:.0f}% |\n"

    report += f"""
## Methodology

- **Dataset**: 40 rows sampled from `data/scenarios.csv` (N=300), stratified by `category`
- **Task**: Binary classification -- should this scenario be escalated to a human (1) or auto-resolved (0)?
- **Annotator 1**: Original dataset author (all 300 labels)
- **Annotator 2**: Independent labeler (40-row subsample)
- **Metric**: Cohen's kappa accounts for chance agreement, unlike raw percentage
- **Seed**: Deterministic (seed=42) for reproducibility

## Interpretation Scale (Landis & Koch, 1977)

| kappa Range | Interpretation |
|---------|---------------|
| < 0.00 | Poor |
| 0.00-0.20 | Slight |
| 0.21-0.40 | Fair |
| 0.41-0.60 | Moderate |
| 0.61-0.80 | Substantial |
| 0.81-1.00 | Almost Perfect |
"""

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    with open(IAA_REPORT_MD, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"[OK] Inter-Annotator Agreement computed")
    print(f"   kappa = {kappa_val:.3f} -- {interpretation}")
    print(f"   Raw agreement: {raw_agree}/{n} ({raw_pct:.1f}%)")
    print(f"   Report saved to: {IAA_REPORT_MD}")


def check_sample():
    """Quick validation that the sample CSV exists and has the right shape."""
    if not IAA_SAMPLE_CSV.exists():
        print("[ERROR] No IAA sample found. Run with --generate first.")
        sys.exit(1)

    with open(IAA_SAMPLE_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    filled = sum(1 for r in rows if r.get("annotator2_label", "").strip() != "")
    cats = Counter(r.get("category", "UNKNOWN") for r in rows)

    print(f"[OK] IAA sample exists: {IAA_SAMPLE_CSV}")
    print(f"   Rows: {len(rows)}")
    print(f"   Categories: {len(cats)} -- {dict(sorted(cats.items()))}")
    print(f"   Annotator 2 labels filled: {filled}/{len(rows)}")
    if filled == len(rows):
        print("   -> Ready to run --compute")
    else:
        print(f"   -> {len(rows) - filled} labels still missing")


def main():
    parser = argparse.ArgumentParser(
        description="Inter-Annotator Agreement tool for NexAgent escalation dataset"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--generate", action="store_true",
                       help="Generate 40-row stratified sample for second annotator")
    group.add_argument("--compute", action="store_true",
                       help="Compute Cohen's kappa after teammate fills in labels")
    group.add_argument("--check", action="store_true",
                       help="Check sample file status")

    args = parser.parse_args()

    if args.generate:
        generate_sample()
    elif args.compute:
        compute_agreement()
    elif args.check:
        check_sample()


if __name__ == "__main__":
    main()
