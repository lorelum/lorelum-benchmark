## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #137. (`openspec validate login-page-auth-flow-diagnostic-pilot --type change --strict` passed; PR #143)
- [x] 1.2 Confirm with the requirements owner: repetition count (2), judge scoring repetition strategy per attempt (n=3 median), pilot local-provider-only (local mock judge); recorded in design.md without an issue comment.

## 2. Execution plan freezing

- [x] 2.1 Freeze and validate the execution plan artifact: `private/execution/plan.yaml` + `plan.ts` (source_commit, profile, model, pi_version, budget, repetitions, prompt_template, judge channel/n=3); `verifyPlanFrozen` detects drift; snapshot verified read-only; plan dry-run passes without model calls.

## 3. Pilot executor implementation

- [x] 3.1 Implement `private/execution/run-local.ts` for `login-page-auth-flow-v1`: clean workspace per attempt (task.md + public starter only), Practice runtime injection, per-attempt semantic evaluator + JudgeAgent (local mock, n=3 median, `judge-result/v1` sidecar), execution failure categories, identity binding, scratch-only output.
- [x] 3.2 Add dry-run and preflight gates: plan freeze + snapshot read-only verification, public/private workspace audit, runner/evaluator preflight (pi version match + model reachability), JudgeAgent preflight (rubric load + hash); any failed gate stops before model calls. Semantic evaluator runs against a pre-started Vite server via `PLAYWRIGHT_BASE_URL` (Playwright standalone webServer hangs on this host).

## 4. Tests and verification

- [x] 4.1 Add focused tests (14 pass): plan-freeze validation (incl. pi_version/prompt_template drift + prompt hash), workspace isolation (no private/oracle material), judge sidecar schema/provenance, failure-category classification + redaction, summary aggregation (signal / no-obvious-signal / uncertain, incl. judge-unavailable -> uncertain), buildSummary prompt-hash binding.
- [x] 4.2 Run plan dry-run, public/private audit, JudgeAgent preflight, `bun run validate`, OpenSpec strict validation, and `git diff --check`; record command outcomes and omissions in the PR. (`bun run test:pi:v2` crashes on `src/benchmark/runner/pi/v2/process-tree.test.ts` (Bun panic, Windows process-tree kill) — environmental, no runner code changed; recorded as omission.)
- [x] 4.3 Confirm no formal record, no suite revision, no release, and no modification to shared runner/schema/existing results; check off completed tasks immediately.

## 5. Pilot execution (post-review gate)

- [ ] 5.1 After preflight and independent review pass, execute the three-condition diagnostic pilot into ignored `scratch/`; read only the redacted summary, keep raw pi logs / evaluator output / judge sidecars / diffs in scratch, and report diagnostic/uncertain conclusions only. (Independent review pass: fix 全部清零; preflight passed; first run reached baseline/attempt-2 then hung on the Playwright standalone webServer — fixed by pre-starting the Vite server with PLAYWRIGHT_BASE_URL; verified evaluator completes ~12s; re-run in progress.)
