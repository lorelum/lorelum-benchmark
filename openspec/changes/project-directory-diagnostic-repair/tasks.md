## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial OpenSpec-only PR linked to #126. (`openspec validate ... --strict` passed; PR #127)
- [x] 1.2 Confirm the fixed public behavior, existing relevant/irrelevant Practice pair, private semantic/quality acceptance role, immutable source/snapshot policy, and re-admission model boundary; record the answer in this change and #126. (Confirmed: all remain fixed; root cause is public workspace provisioning.)

## 2. Failure classification and repair

- [x] 2.1 Reproduce the candidate failure in a clean workspace and classify the stable redacted failure category without exposing private material. [Execution scope: `scratch/`; public tests pass after frozen install]
- [x] 2.2 Implement public lockfile dependency provisioning after Pi and before evaluator invocation; do not change candidate/evaluator/probe inputs. [Write scope: `src/benchmark/runner/pi/v2/`]
- [x] 2.3 Add focused regression tests for provisioning order, frozen-install failure, and evaluator health boundary. [Write scope: `src/benchmark/runner/pi/v2/`]

## 3. Recalibration and re-admission

- [x] 3.1 Run reference, responsibility-equivalent, and anti-pattern calibration; verify the runtime closure and public/private leakage boundary. [Execution scope: `scratch/`; both matrices and runner public-workspace audit passed]
- [x] 3.2 Record the repaired runner source identity for re-admission without modifying candidate snapshots or pre-repair plans. [Execution scope: `scratch/`; runner commit `9d8647f`]
- [x] 3.3 Run focused tests, `bun run validate`, OpenSpec strict validation, and `git diff --check`.
- [ ] 3.4 After all gates pass, run one authorized redacted three-condition re-admission gate and record only diagnostic status. [Execution scope: `scratch/`]
