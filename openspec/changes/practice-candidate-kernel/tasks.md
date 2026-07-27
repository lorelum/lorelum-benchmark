## 0. Planning Gate

- [ ] 0.1 After this initial PR passes strict validation, confirm the kernel representation, first validation input scope, lockfile ownership, public/private materialization boundary, and snapshot source set with the requirements owner; write the answers to Issue #98 and this design/tasks.
- [ ] 0.2 Confirm candidate-specific semantic behavior, relevant and equal-length irrelevant Practice, expected baseline limitation, responsibility-equivalent calibration, and no-model execution boundaries for the #89 inputs used to validate this kernel.

## 1. Kernel And Materialization

- [ ] 1.1 Add a versioned kernel source directory and a candidate declaration/overlay contract in the confirmed representation. [Write scope: `src/benchmark/`, `incubator/practice-injection/`]
- [ ] 1.2 Add a resolver that constructs only the public task and starter tree, rejects private source references, and uses a clean destination. [Write scope: `src/benchmark/`]
- [ ] 1.3 Add focused materialization and public/private leakage tests, including private-path traversal rejection. [Write scope: `src/benchmark/`]

## 2. Calibration And Snapshot

- [ ] 2.1 Add a shared, candidate-declared offline calibration entry point that reports candidate-owned semantic and quality-probe outcomes without interpreting their domain rules. [Write scope: `src/benchmark/`]
- [ ] 2.2 Add the resolved candidate snapshot contract and verification, preserving existing suite and #75 snapshot behavior. [Write scope: `src/benchmark/`]
- [ ] 2.3 Add focused calibration and snapshot tests for source changes, resolved-output changes, generated-output exclusions, and public/private isolation. [Write scope: `src/benchmark/`]

## 3. Validation Inputs And Handoff

- [ ] 3.1 Author the confirmed #89 profile and directory inputs against the shared contract; keep their Practice, oracle, evaluator, and calibration fixtures candidate-private. [Write scope: `incubator/practice-injection/`]
- [ ] 3.2 Run each input's public semantic checks, calibration roles, leakage audit, resolved snapshot verification, and `bun run validate`; do not invoke Pi, a model provider, retrieval, or create records.
- [ ] 3.3 Run strict OpenSpec validation, document validation evidence and non-executed model boundaries in PR #98, then merge #98 before rebasing #89 onto the resulting mainline contract.
