# Evaluation 3 — KB Self-Learning Impact

**Method:** Simulated 20 ticket scenarios comparing auto-resolution rate
**before** KB ingestion (no KB match boost) vs **after** KB ingestion (+0.15 confidence boost when KB match exists).

| Phase | Auto-Resolved | Rate |
| :---- | :------------ | :--- |
| Before KB ingestion | 11/20 | 55.0% |
| After KB ingestion | 14/20 | 70.0% |

**Lift:** +15.0 percentage points after KB self-learning.

### Interpretation

KB self-learning ingests only non-overridden auto-resolutions (quality gate).
Repeat tickets with matching KB entries receive higher model confidence,
pushing more routine tickets past the auto-resolve threshold while
high-risk tickets (billing, security, prod outages) remain escalated.

> Quality gate: solutions ingested only if CCEP selected AUTO_RESOLVE and no human override within 24h.
