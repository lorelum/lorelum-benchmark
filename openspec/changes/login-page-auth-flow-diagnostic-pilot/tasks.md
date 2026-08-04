## 1. OpenSpec and planning gate

- [ ] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #137. (`openspec validate login-page-auth-flow-diagnostic-pilot --type change --strict` passed; PR #xxx)
- [ ] 1.2 Confirm with the requirements owner: repetition count (default 2), judge scoring repetition strategy per attempt (n=3 median vs single), and pilot local-provider-only (mock judge vs real provider); record answers in this change's design without writing an issue comment unless the owner asks.

## 2. Execution plan freezing

- [ ] 2.1 Freeze and validate the execution plan artifact: candidate source commit, `private/snapshot.json`, login-page rubric hash, profile hash, model, prompt hash, budget, and repetitions; plan dry-run must pass without model calls. [Write scope: `incubator/practice-injection/login-page-auth-flow-v1/private/execution/`]

## 3. Pilot executor implementation

- [ ] 3.1 Implement `private/execution/run-local.ts` for `login-page-auth-flow-v1` (adapt #75 pattern): clean workspace per attempt (only `public/task.md` + `public/starter/`), Practice runtime injection, per-attempt semantic evaluator + JudgeAgent (login-page rubric, `judge-result/v1` sidecar), execution failure categories, identity binding, and scratch-only output. [Write scope: `incubator/practice-injection/login-page-auth-flow-v1/private/execution/`]
- [ ] 3.2 Add dry-run and preflight gates: snapshot/conditions/rubric-hash validation, public/private workspace audit, runner/evaluator preflight, and JudgeAgent preflight; any failed gate stops before model calls. [Write scope: `incubator/practice-injection/login-page-auth-flow-v1/private/execution/`]

## 4. Tests and verification

- [ ] 4.1 Add focused tests: plan-freeze validation, workspace isolation (no private material), judge sidecar schema/provenance shape, failure-category classification, and summary aggregation (signal / no-obvious-signal / uncertain). [Write scope: `incubator/practice-injection/login-page-auth-flow-v1/private/execution/`]
- [ ] 4.2 Run plan dry-run, public/private audit, JudgeAgent preflight, `bun run test:pi:v2`, `bun run validate`, OpenSpec strict validation, and `git diff --check`; record command outcomes and omissions in the PR. [Execution scope: repo-wide]
- [ ] 4.3 Confirm no formal record, no suite revision, no release, and no modification to shared runner/schema/existing results; check off completed tasks immediately. [Execution scope: repo-wide]

## 5. Pilot execution (post-review gate)

- [ ] 5.1 After preflight and independent review pass, execute the three-condition diagnostic pilot into ignored `scratch/`; read only the redacted summary, keep raw pi logs / evaluator output / judge sidecars / diffs in scratch, and report diagnostic/uncertain conclusions only. [Execution scope: `incubator/practice-injection/login-page-auth-flow-v1` + `scratch/`]
