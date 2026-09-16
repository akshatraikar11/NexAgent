# Evaluation 2 — Orchestrator vs Naive Single-Prompt

**Sample size:** 20 scenarios from scenarios.csv
**Pipeline:** Full CCEP multi-signal scoring (fitted weights)
**Naive baseline:** Single Gemini prompt, escalate if confidence < 0.7

| Approach | Accuracy |
| :------- | :------- |
| Full Pipeline + CCEP | 85.0% |
| Naive Single-Prompt | 55.0% |

**Delta:** 30.0 percentage points in favor of pipeline.

> Note: Pipeline accuracy uses ground-truth signal values from the dataset (isolating CCEP policy value).
> Naive baseline uses live/mock LLM confidence estimation.
