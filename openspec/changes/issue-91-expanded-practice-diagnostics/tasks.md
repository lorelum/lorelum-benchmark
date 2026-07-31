## 1. OpenSpec and planning gate

- [ ] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #91.
- [ ] 1.2 Confirm observable behavior, expected baseline defect, related and equal-length irrelevant controls, private semantic/quality acceptance, immutable source identities, model/prompt/budget, and blind-review boundary; record the answers in this change.

## 2. Plan-bound runner reconciliation

- [ ] 2.1 Restore or implement plan-only input using `balanced-diagnostics-v1`, identity validation, schedule ordering, and a one-repeat gate slice without candidate-local overrides. [Write scope: `src/benchmark/runner/pi/v2/`, `incubator/practice-injection-plans/`]
- [ ] 2.2 Add focused tests for plan identity mismatch, repetition override rejection, redacted schedule output, and preserved denominators. [Write scope: `src/benchmark/runner/pi/v2/`]

## 3. Prerequisite validation

- [ ] 3.1 Run Pi/model preflight after planning confirmation, with failure classification that does not echo credentials or create a workspace. [Execution scope: `scratch/`]
- [ ] 3.2 Run both complete calibration matrices through the versioned runtime closure in a clean isolated environment; report hashes and pass/fail only. [Execution scope: `scratch/`]
- [ ] 3.3 Run focused tests, `bun run validate`, OpenSpec strict validation, `git diff --check`, and public/private leakage audits.

## 4. One-repeat diagnostic gate

- [ ] 4.1 Execute one repeat per condition for both candidates only after prerequisites pass; do not create a formal record or suite revision. [Execution scope: `scratch/`]
- [ ] 4.2 Produce a redacted summary grouped by candidate and `profile_input_hash`, preserving planned denominators and all outcome states. [Execution scope: `scratch/`]
- [ ] 4.3 Apply the strict joint-pass rule and decide whether to authorize three-repeat screening or keep #91 paused, without causal or generalized claims.
