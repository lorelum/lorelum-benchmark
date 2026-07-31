## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #91. (`openspec validate ... --strict` passed; PR #125)
- [x] 1.2 Confirm observable behavior, expected baseline defect, related and equal-length irrelevant controls, private semantic/quality acceptance, immutable source identities, model/prompt/budget, and blind-review boundary; record the answers in this change. (Authorized: execute the immutable `balanced-diagnostics-v2` three-repeat plan as scratch-only diagnostic evidence.)

## 2. Plan-bound runner reconciliation

- [x] 2.1 Implement a plan-derived one-candidate, first-block gate using `balanced-diagnostics-v2`, identity validation, schedule ordering, and no candidate-local overrides. [Write scope: `src/benchmark/runner/pi/v2/`, `incubator/practice-injection-plans/`]
- [x] 2.2 Add focused tests for one-repeat selection, redacted schedule output, and preserved denominators. [Write scope: `src/benchmark/runner/pi/v2/`]

## 3. Prerequisite validation

- [x] 3.1 Run Pi/model preflight after planning confirmation, with failure classification that does not echo credentials or create a workspace. [Execution scope: `scratch/`; passed within the gate run]
- [x] 3.2 Run both complete calibration matrices through the versioned runtime closure in a clean isolated environment; report hashes and pass/fail only. [Execution scope: `scratch/`; both exited 0 and passed]
- [x] 3.3 Run focused tests, `bun run validate`, OpenSpec strict validation, `git diff --check`, and public/private leakage audits. (30 focused tests passed; validate and strict validation passed.)

## 4. One-repeat diagnostic gate

- [x] 4.1 Execute one repeat per condition for the selected candidate after prerequisites pass; do not create a formal record or suite revision. [Execution scope: `scratch/`]
- [x] 4.2 Produce a redacted summary grouped by candidate and `profile_input_hash`, preserving planned denominators and all outcome states. [Execution scope: `scratch/`]
- [x] 4.3 Apply the strict joint-pass rule: oracle led both controls in this one-block diagnostic, but #91 remains limited to diagnostic evidence pending three-repeat screening; no causal or generalized claims.
