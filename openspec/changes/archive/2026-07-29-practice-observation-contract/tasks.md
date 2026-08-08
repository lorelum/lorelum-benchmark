## 0. Planning Gate

- [x] 0.1 After the OpenSpec-only PR exists, confirm in #114 and `design.md` the observable behavior and Practice behavior of both candidates, baseline discrimination, relevant/irrelevant controls, private semantic/quality acceptance, starter/snapshot identity, and model/prompt/budget/blind-review boundaries.
- [x] 0.2 Confirm the trial remains limited to evaluator-only replay and private calibration: no model calls, formal records, public task/Practice/condition changes, or candidate promotion.

## 1. Practice Observation Contract

- [x] 1.1 Update `docs/PRACTICE_BENCHMARK_GUIDE.md` and the candidate-author contract so every current and future Practice-injection card must declare independent semantic, Practice observation, and evaluator/execution health dimensions; preserve frozen inputs by requiring a new revision or independent change for adoption.
- [x] 1.2 Define and validate the profile diagnostic evaluator result shape with independent semantic, Practice observation, and indeterminate-reason fields.
- [x] 1.3 Update `profile-diagnostic-runner` parsing, entry state mapping, summary schema version, command exit semantics, and focused tests so a valid `not-observed` result remains `evaluated`.
- [x] 1.4 Add focused tests for semantic pass plus not-observed, semantic failure plus valid observation, indeterminate classification, invalid evaluator output, and redacted reporting.

## 2. Candidate Probe Trial

- [x] 2.1 Update `profile-update-command-boundary-v1` to resolve TypeScript relative imports to the canonical HTTP adapter identity and emit the new Practice observation contract.
- [x] 2.2 Update `project-directory-resource-state-v1` with the same resolver-based evidence and result contract.
- [x] 2.3 Extend both private evaluator/probe tests for equivalent `src/services/*` boundaries using `./http`, calibrated anti-patterns, and indeterminate unsupported analysis.
- [x] 2.4 Update both calibration matrices and expected states; run each private calibration matrix before any evaluator-only replay.
- [x] 2.5 Regenerate and verify both candidate snapshots after their private evaluator/calibration assets change.

## 3. Verification and Evidence

- [x] 3.1 Perform evaluator-only replay against available #90 scratch workspaces; record observed or indeterminate outcomes without a model call or formal record.
- [x] 3.2 Run public/private leakage audit, focused evaluator tests, `bun run test:pi:v2`, `bun run validate`, `openspec validate practice-observation-contract --strict`, and `git diff --check`.
- [x] 3.3 Record command outcomes and any unavailable replay input in the PR, then check completed tasks immediately.
- [x] 3.4 Document the per-run classification standard and the evidence threshold for a condition-level directional signal, including how non-healthy evaluations affect reporting and conclusions.
