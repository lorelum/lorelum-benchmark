# Structure-fact discriminability design (offline)

## Current v2-e failure taxonomy

The fixed rubric and anchor-aware scorer removed model-supplied points, but each dimension had one broad full/partial/zero anchor. That contract still asked the model to make the final structural adjudication, so several distinct source facts collapsed into one coarse verdict:

| Fixture | Observed v2-e pattern | Diagnostic failure |
| --- | --- | --- |
| reference | Most dimensions settled at the partial half-cap; total 50 | A valid alternate layout was under-counted |
| equivalent | All dimensions full; total 100 | Equivalent/reference disagreement was 50 points |
| anti-pattern | Most dimensions partial; total 50 | No separation from reference |
| docs-present | Mostly partial; total 55 | Documentation/similar structure could not be isolated from code facts |
| baseline-policy-scatter | Mostly partial; total 55 | Scattered policy was not separated from reference |
| public-starter | All zero; total 0 | Correctly low, but does not repair the semantic-pass controls |

The failure is in adjudication granularity, not in the fixed rubric hash, fixture identity, or threshold. No task, starter, oracle, fixture, threshold, decision metric, or rubric was changed.

## Expected dimension-label matrix

Expected labels are source-design labels for offline rule tests; they are not model results and do not claim repaired discriminability.

| Fixture | contract | adapter | policy | billing | streaming | query/error | Expected total |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| reference | full | full | full | full | full | full | 100 |
| equivalent | full | full | full | full | full | full | 100 |
| anti-pattern | full | zero | zero | full | full | full | 60 |
| docs-present | full | zero | zero | full | full | full | 60 |
| baseline-policy-scatter | full | full | partial | partial | partial | full | 55 |
| public-starter | zero | zero | zero | zero | zero | zero | 0 |

Docs-present is intentionally identical to anti-pattern: only production source facts may be extracted; documentation and tests are not structural evidence.

## Deterministic predicate shape

The follow-up schema declares one or more boolean facts per dimension. Positive facts state concrete source capabilities, ownership, or containment; negative facts state forbidden leaks or ownership. Full requires every positive fact and no negative fact. Zero is checked first when a forbidden/core-missing predicate is true. The remaining reachable case is partial. This precedence makes labels mutually exclusive without a free-text adjudication step.

Ambiguity is not a label. Missing, duplicate, unknown, non-boolean, extra-field, unlabeled, or source-unverifiable fact output is malformed. Empty or generic evidence, direct labels/points, or a reference outside the shown canonical source map is malformed. The provider may retry the identical prompt, then must fail closed.

## Confusion and pairwise acceptance research

Calibration must aggregate a 3x3 expected/predicted matrix for each dimension and require all expected labels across the three samples before a totals-only check can pass. Totals use the unchanged rubric weights and thresholds. The label matrix is therefore a stricter addition, not a replacement.

The optional blinded pairwise phase is secondary. It may compare anonymized positive/negative source pairs, never exposing fixture names or expected labels, and must report side, dimension preference, and evidence. A pairwise win cannot repair label confusion or failed total separation; a tie or reversed preference keeps the result diagnostic-only.

## Execution boundary

This file records an offline design only. No candidate model, judge model, formal experiment, formal record, suite revision, or real calibration was run for this phase.

## Offline implementation validation (2026-08-24)

- Fact schema version: `practice-aware-structure-facts/v1`.
- Fact schema SHA-256: `ecfcdc82abe65462d0d5ba6692d423e42f67a6b470e2b1b71cffc0ffcc64b708`.
- `bun test src/benchmark/judge/judge-agent/practice-aware/v2/judge.test.ts`: 8 pass / 0 fail.
- `bun test src/benchmark/judge`: 99 pass / 0 fail.
- `bun run test:contracts`: 224 pass / 0 fail.
- `bun run validate`: workspace layout and snapshots pass.
- `openspec validate llm-provider-gateway-v3-practice-judge --type change --strict`: pass.
- Offline stubs covered the expected label matrix, deterministic points, malformed/unknown/missing/unverifiable fact fail-closed retries, confusion-matrix blocking, blinded pairwise parsing/evaluation, provider v2 wiring, and registry isolation from v1/generic-v2.
- Candidate model calls: 0. Judge model calls: 0. Formal experiment/record/suite revision: none.
