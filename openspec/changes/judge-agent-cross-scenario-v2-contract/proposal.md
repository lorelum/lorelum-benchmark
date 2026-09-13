## Why

`judge-agent/generic/v2` is a public-only, provenance-bound soft-score provider, but its rubric and scoring prompts still embed frontend transport and LLM-gateway-specific quality signals. It therefore cannot safely claim to assess an arbitrary benchmark scenario merely because it receives `task.md` and a candidate diff. Issue #198 must first define the missing cross-scenario contract and validation boundary without changing the current staged-runner MVP or task-specific rubrics.

## What Changes

- Define a versioned, public-only **scenario descriptor** that supplies the problem framing, observable behaviors, reviewable quality signals, admissible evidence, exclusions, and uncertainty boundary for a single scoring scenario.
- Define a rubric lifecycle that separates model-generated **rubric proposals** from human-confirmed, versioned **approved rubrics**. A generated proposal is never self-authorizing for scored or reported conclusions.
- Define evidence-bound score semantics: the judge receives only the descriptor, declared public task/evidence, and candidate source; it cites supplied evidence or returns `indeterminate`, never inventing private acceptance knowledge.
- Define a reusable calibration-pack contract for reference, behaviorally equivalent, and anti-pattern examples, including private acceptance labels/thresholds, discrimination evidence, and scenario-family admission criteria.
- Define compatibility/provenance boundaries with the existing `judgeagent-soft-scoring` and `benchmark-outcome-contract` capabilities: cross-scenario quality remains an optional, fail-closed soft signal and does not alter semantic completion, execution health, or formal records.
- Keep this change at the design-and-validation-plan stage. It does not implement a provider, modify `generic/v2`, add fixtures, invoke a model, execute a benchmark run, or create a record.

## Capabilities

### New Capabilities

- `judge-agent-cross-scenario-contract`: Public scenario descriptors, rubric lifecycle, evidence-bound scoring, calibration-pack eligibility, and provenance rules for a future cross-scenario JudgeAgent facility.

### Modified Capabilities

- None. Existing `judgeagent-soft-scoring` and `benchmark-outcome-contract` requirements remain in force; a later implementation change must supply any necessary versioned deltas rather than silently changing them.

## Impact

- **Design evidence:** `src/benchmark/judge/judge-agent/generic/v2/{rubric,score,calibrate,provider}.ts`, `src/benchmark/judge/input.ts`, and the historical #132/#133/#146/#153 contracts are the capability baseline for this design.
- **Future implementation candidates (out of scope here):** a new provider/version and public descriptor schema under `schemas/`, a versioned provenance sidecar if `judge-result/v1` cannot represent the approved descriptor/rubric relationship, and private calibration acceptance material.
- **Unaffected:** the staged runner MVP, fixed task-specific rubrics, `judge-result/v1`, semantic hard gates, existing frozen tasks and records, CI's mock/default-no-network posture, and all private oracle/scoring material.
