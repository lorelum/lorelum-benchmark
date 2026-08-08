## 1. OpenSpec and planning gate

- [ ] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #156. (`openspec validate issue-156-practice-result-adapter --type change --strict --json` passed; PR created.)
- [ ] 1.2 Confirm with the requirements owner: adapter input source (v3 entries + plan.schedule), login-page validation scope (replay existing scratch only), and quality-gap semantics (whether not-run/judge-unavailable become gaps); record answers in `design.md` and this file before implementation.

## 2. Practice adapter

- [ ] 2.1 Add `src/benchmark/result-interpreter/v1/adapters/practice.ts`: consume profile-diagnostic-summary/v3 (schema check, entries + plan.schedule), group units by candidate × profile_input_hash, map fields (evaluation_status/semantic/practice_observation/trace/identity), attach the practice decision rule, and return a result-interpreter/v1 InterpretationInput. [Write scope: `src/benchmark/result-interpreter/v1/adapters/`]
- [ ] 2.2 Add focused tests with synthetic v3 fixtures: unit grouping, field mapping, decision-rule attachment, identity drift → uncertain, redaction fail-closed, gap → uncertain, unsupported schema rejection. [Write scope: `src/benchmark/result-interpreter/v1/adapters/`]

## 3. Login-page replay validation

- [ ] 3.1 Replay `scratch/profile-diagnostics/login-v2-three-condition-retest-v2/summary.json` through adapter + interpreter; write a redacted `result-interpreter-summary/v1` under `scratch/`; assert verdicts (oracle strict lead → signal) and gap paths. [Execution scope: `scratch/`]
- [ ] 3.2 Compare against the existing `report.conclusion_grade` and record the interpretation-difference note (old conservative grade vs strict verdict). [Execution scope: `scratch/`]

## 4. Verification

- [ ] 4.1 Run focused tests, `bun run validate`, OpenSpec strict validation, `git diff --check`, and public/private leakage audit; retain evidence in the PR.
- [ ] 4.2 Confirm no model invocation, no formal run manifest/record/suite revision, and no modification to `profile-diagnostic-runner.ts` or the `result-interpreter/v1` core.