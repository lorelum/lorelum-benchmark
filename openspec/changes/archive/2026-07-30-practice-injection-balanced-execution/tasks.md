## 1. Lifecycle And Planning Gate

- [x] 1.1 Strict-validate this OpenSpec change and complete the public/private leakage audit for its artifacts.
- [x] 1.2 Create the OpenSpec-only commit and PR linked to issue #116 on this branch; do not include runner, candidate, model-run, or result changes.
- [x] 1.3 Record the requirements-owner planning confirmation in issue #116, `design.md`, and this checklist: observable behavior, baseline discrimination, relevant and equal-length irrelevant controls, private acceptance, immutable inputs, model/prompt/tools/budget, blind-review boundary, schedule algorithm, minimum repeats, independent-candidate threshold, and uncertainty presentation.

## 2. Plan And Schedule Contract

- [x] 2.1 Define versioned diagnostic-plan and schedule types that bind candidate identity, source commit, snapshot ID, profile input hash, plan seed, algorithm version, blocks, and condition positions.
- [x] 2.2 Implement deterministic pre-execution schedule construction and fail-closed validation for condition membership, per-block balance, duplicate attempts, identity mismatches, and plan-seed/model-parameter separation.
- [x] 2.3 Persist redacted planned and actual execution order in ignored scratch artifacts without Practice text, private paths, evaluator/oracle content, or workspace paths.

## 3. Reporting And Conclusion Boundary

- [x] 3.1 Implement stratified summaries for planned denominators, raw joint-pass proportions, oracle deltas, semantic outcomes, every Practice observation state, and evaluation health.
- [x] 3.2 Implement conclusion grades that retain incomplete, unhealthy, and indeterminate attempts and limit three-repeat output to candidate-level directional screening.
- [x] 3.3 Prevent causal, generalized, and reproducible-direction language unless the pre-registered evidence threshold and uncertainty presentation are supplied.

## 4. Verification

- [x] 4.1 Add focused tests for schedule reproducibility, reconstruction, condition balance, plan-before-invocation behavior, and no provider model seed.
- [x] 4.2 Add focused tests for candidate identity binding, planned-denominator retention, non-health and indeterminate handling, report deltas, conclusion downgrades, and private-data redaction.
- [x] 4.3 Run focused runner tests, `bun run validate`, OpenSpec strict validation, and the public/private leakage audit; record evidence and explicitly state that no Pi/model execution, formal record, or suite revision was created.
