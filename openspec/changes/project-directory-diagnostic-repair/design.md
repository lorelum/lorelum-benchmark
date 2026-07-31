## Context

The second #91 candidate, `project-directory-resource-state-v1`, failed its one-repeat gate after passing its runtime-closure calibration. The oracle attempt was non-healthy because the evaluator exited nonzero; baseline and irrelevant-practice were semantically healthy but their Practice observations were indeterminate. Sanitized diagnostics rule out closure, dependency, timeout, and launch failures, but do not expose private assertion content.

The candidate has no formal record and remains in `incubator/`. The diagnostic scratch output is historical evidence and must not be overwritten or merged with later results.

## Goals / Non-Goals

**Goals:**

- Reproduce the mismatch in a clean candidate-scoped workspace and classify it as candidate behavior, evaluator process contract, or probe calibration failure.
- Apply the smallest verified repair without changing the public task behavior, Practice pair, model, prompt, budget, or decision rule.
- Recalibrate reference, responsibility-equivalent, and anti-pattern fixtures; regenerate the candidate snapshot and bind a new execution-plan identity.
- Verify public/private separation, evaluator health, and a one-repeat redacted re-admission gate.

**Non-Goals:**

- No change to the first candidate, #91 historical scratch results, or formal benchmark records.
- No public disclosure of private evaluator/oracle/Practice text or calibration fixture content.
- No three-repeat #91 expansion, causal claim, or #92 aggregation in this change.

## Decisions

### Candidate-scoped repair before expansion

The repair remains candidate-scoped. If the mismatch is a reusable evaluator helper defect, the helper SHALL receive a new version and the candidate SHALL explicitly bind it; an existing frozen helper SHALL not be rewritten.

### Public behavior and treatment remain fixed

The public task describes project loading, search, loading, empty, error, and retry-recovery states. The repair SHALL preserve those observable requirements. The existing oracle and equal-length irrelevant Practice identities, condition channels, model, prompt, budget, and strict joint-pass decision rule are fixed inputs; changing any requires a separate confirmed scope.

### Fail closed and preserve evidence

Nonzero evaluator exits remain non-healthy even if structured output exists. Diagnosis may classify only stable redacted categories. The repaired candidate gets a new snapshot and a new immutable plan identity; the prior plan and scratch runs remain unchanged.

## Risks / Trade-offs

- [Private assertion is over-constrained] -> prove reference, responsibility-equivalent, and anti-pattern calibration behavior before accepting any evaluator change.
- [Candidate implementation violates public behavior] -> repair the candidate while preserving the public task and re-run semantic calibration.
- [Repair changes input identity] -> regenerate snapshot and use a new plan; never combine prior and repaired attempts.
- [Private diagnostics leak] -> restrict reports to stable categories, hashes, and redacted condition identity.

## Migration Plan

1. Strictly validate this change and create the OpenSpec-only PR linked to #126.
2. Confirm the fixed public behavior, treatment pair, private acceptance role, immutable source/snapshot policy, and re-admission model boundary with the requester.
3. Reproduce and classify the failure, then apply the minimal candidate-scoped repair with focused tests.
4. Run full private calibration, closure verification, public/private audit, `bun run validate`, and strict OpenSpec validation.
5. Regenerate the candidate snapshot and create a new plan identity; run one authorized redacted gate and report diagnostic-only admission status.

## Open Questions

- Does the failure arise from a public behavior mismatch, evaluator process exit semantics, or a probe/calibration defect? Implementation is blocked until the clean reproduction classifies it.
- The public task and existing treatment/decision-rule inputs are treated as fixed. Any contrary change requires explicit requester confirmation and a separate scope.
