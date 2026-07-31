## 1. OpenSpec and planning gate

- [ ] 1.1 Strictly validate this change and create the initial OpenSpec-only PR linked to #128.
- [ ] 1.2 Record the confirmed fixed candidate behavior, Practice pair, private acceptance role, source/snapshot identity, model/prompt/budget boundary, and diagnostic-only interpretation in this change and #128.

## 2. Runner contract

- [ ] 2.1 Parse and validate the explicit one-repeat re-admission declaration without loosening normal three-repeat plan validation. [Write scope: `src/benchmark/runner/pi/v2/profile-diagnostic-plan.ts`]
- [ ] 2.2 Persist redacted gate metadata and force gated reports to `diagnostic-only`; preserve all existing semantic, Practice, health, and identity fields. [Write scope: `src/benchmark/runner/pi/v2/`]
- [ ] 2.3 Add focused tests for valid/invalid gate shapes, three-condition schedule, identity fail-closed behavior, and non-promotable conclusions. [Write scope: `src/benchmark/runner/pi/v2/`]

## 3. Validation and re-admission

- [ ] 3.1 Run focused tests, `bun run validate`, strict OpenSpec validation, public/private leakage audit, and `git diff --check`.
- [ ] 3.2 After all gates pass, run one authorized redacted three-condition one-repeat re-admission gate; bind output to the repaired runner source identity and record diagnostic status only. [Execution scope: `scratch/`]
