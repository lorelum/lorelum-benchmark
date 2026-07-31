## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial OpenSpec-only PR linked to #128. (`openspec validate ... --strict` passed; PR #129)
- [x] 1.2 Record the confirmed fixed candidate behavior, Practice pair, private acceptance role, source/snapshot identity, model/prompt/budget boundary, and diagnostic-only interpretation in this change and #128. (Confirmed: one repeat is re-admission-only and cannot support expansion.)

## 2. Runner contract

- [x] 2.1 Parse and validate the explicit one-repeat re-admission declaration without loosening normal three-repeat plan validation. [Write scope: `src/benchmark/runner/pi/v2/profile-diagnostic-plan.ts`]
- [x] 2.2 Persist redacted gate metadata and force gated reports to `diagnostic-only`; preserve all existing semantic, Practice, health, and identity fields. [Write scope: `src/benchmark/runner/pi/v2/`]
- [x] 2.3 Add focused tests for valid/invalid gate shapes, three-condition schedule, identity fail-closed behavior, and non-promotable conclusions. [Write scope: `src/benchmark/runner/pi/v2/`]

## 3. Validation and re-admission

- [x] 3.1 Run focused tests, `bun run validate`, strict OpenSpec validation, public/private leakage audit, and `git diff --check`.
- [x] 3.2 After all gates pass, run one authorized redacted three-condition one-repeat re-admission gate; bind output to the repaired runner source identity and record diagnostic status only. [Execution scope: `scratch/`; all three conditions completed, evaluator health was evaluated, and the report remained `diagnostic-only`]
