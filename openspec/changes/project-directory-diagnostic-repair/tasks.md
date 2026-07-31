## 1. OpenSpec and planning gate

- [ ] 1.1 Strictly validate this change and create the initial OpenSpec-only PR linked to #126.
- [ ] 1.2 Confirm the fixed public behavior, existing relevant/irrelevant Practice pair, private semantic/quality acceptance role, immutable source/snapshot policy, and re-admission model boundary; record the answer in this change and #126.

## 2. Failure classification and repair

- [ ] 2.1 Reproduce the candidate failure in a clean workspace and classify the stable redacted failure category without exposing private material. [Execution scope: `scratch/`]
- [ ] 2.2 Implement the smallest candidate-scoped repair; version shared evaluator support if required and do not change a frozen helper in place. [Write scope: `incubator/practice-injection/project-directory-resource-state-v1/`, `src/benchmark/`]
- [ ] 2.3 Add focused regression tests for the classified failure and evaluator health boundary. [Write scope: `src/benchmark/`, candidate private tests]

## 3. Recalibration and re-admission

- [ ] 3.1 Run reference, responsibility-equivalent, and anti-pattern calibration; verify the runtime closure and public/private leakage boundary. [Execution scope: `scratch/`]
- [ ] 3.2 Regenerate the candidate snapshot and add a new immutable execution-plan identity without modifying pre-repair plans or scratch results. [Write scope: `incubator/`]
- [ ] 3.3 Run focused tests, `bun run validate`, OpenSpec strict validation, and `git diff --check`.
- [ ] 3.4 After all gates pass, run one authorized redacted three-condition re-admission gate and record only diagnostic status. [Execution scope: `scratch/`]
