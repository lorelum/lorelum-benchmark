## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #156. (`openspec validate issue-156-practice-result-adapter --type change --strict --json` passed; PR #158 created.)
- [x] 1.2 Confirm with the requirements owner: adapter input source (v3 entries + plan.schedule), login-page validation scope (replay existing scratch only), and quality-gap semantics (whether not-run/judge-unavailable become gaps); record answers in `design.md` and this file before implementation. (Confirmed 2026-08-08: v3 entries + plan.schedule as input; replay existing scratch only, no model runs; keep #155 v1 quality-gap set of {indeterminate}.)

## 2. Practice adapter

- [x] 2.1 Add `src/benchmark/result-interpreter/v1/adapters/practice.ts`: consume profile-diagnostic-summary/v3 (schema check, entries + plan.schedule), group units by candidate × profile_input_hash, map fields (evaluation_status/semantic/practice_observation/trace/identity), attach the practice decision rule, and return a result-interpreter/v1 InterpretationInput. [Write scope: `src/benchmark/result-interpreter/v1/adapters/`]
- [x] 2.2 Add focused tests with synthetic v3 fixtures: unit grouping, field mapping, decision-rule attachment, identity drift → uncertain, redaction fail-closed, gap → uncertain, unsupported schema rejection. [Write scope: `src/benchmark/result-interpreter/v1/adapters/`]

## 3. Login-page replay validation

- [x] 3.1 Replay `scratch/profile-diagnostics/login-v2-three-condition-retest-v2/summary.json` through adapter + interpreter; write a redacted `result-interpreter-summary/v1` under `scratch/`; assert verdicts and gap paths. (Replay output: `scratch/result-interpreter/login-v2-three-condition-retest-v2/result-interpreter-summary.json`; unit verdict `uncertain` due to two execution-failed attempts, overall `uncertain`. Reproducible redacted fixture committed at `src/benchmark/result-interpreter/v1/adapters/fixtures/login-v3-replay-sample.json` and covered by tests.)
- [x] 3.2 Compare against the existing `report.conclusion_grade` and record the interpretation-difference note (old conservative grade vs strict verdict). (Recorded in design.md: old `diagnostic-or-uncertain` vs interpreter strict `uncertain` due to unhealthy attempts; strict per-attempt audit.)

## 4. Verification

- [x] 4.1 Run focused tests, `bun run validate`, OpenSpec strict validation, `git diff --check`, and public/private leakage audit; retain evidence in the PR. (25/25 focused tests passed; `bun run validate` OK; OpenSpec strict valid; `git diff --check` clean.)
- [x] 4.2 Confirm no model invocation, no formal run manifest/record/suite revision, and no modification to `profile-diagnostic-runner.ts` or the `result-interpreter/v1` core. (No model invocation; only additive adapter files under `src/benchmark/result-interpreter/v1/adapters/`.)