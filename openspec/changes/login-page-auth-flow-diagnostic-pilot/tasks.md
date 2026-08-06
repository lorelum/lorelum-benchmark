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

- [x] 5.1 After preflight and independent review pass, execute the three-condition diagnostic pilot into ignored `scratch/`; read only the redacted summary, keep raw pi logs / evaluator output / judge sidecars / diffs in scratch, and report diagnostic/uncertain conclusions only. (Independent review pass: fix 全部清零; final preflight passed; `scratch/login-page-auth-flow-pilot-final3` completed all 6 planned attempts in ~22min with `global_cap_reached=false` and no `stalled=true`. Healthy results: baseline 2/2 (Judge 90, 96), oracle-practice 1/2 (Judge 90; one 5min timeout), irrelevant-practice 1/2 (Judge 66; one 5min timeout). Summary is `uncertain` because oracle and irrelevant did not each reach the required 2 healthy repetitions; no formal record or suite revision created.)

- [x] 5.2 Complete the pilot run with the committed config (`repetitions=1` per condition, 5min budget, timeout retry, 30min global cap): `scratch/login-page-auth-flow-pilot-v5` finished 2026-08-05 with all 3 planned conditions healthy (`global_cap_reached=false`; no timeout/stall/not-run in final entries; oracle-practice first attempt timed out and auto-retried once, final `retry_count=1`). Judge n=3 median: baseline=90, oracle-practice=76, irrelevant-practice=96; semantic evaluator and practice observation recorded per attempt. Summary outcome = `no-obvious-signal` (oracle not strictly greater than both controls) -> diagnostic-only conclusion; no formal record or suite revision created. `bun run validate`, OpenSpec strict validation, and run-local tests (17 pass) all green.

- [x] 5.3 Model-tier rerun (`deepseek-v4-flash`, decision recorded in design.md and issue #137 comment, 2026-08-05): `scratch/login-page-auth-flow-pilot-v6` finished 2026-08-05 with all 3 planned conditions healthy (`global_cap_reached=false`, no timeout/stall/not-run in final entries; oracle-practice first attempt timed out at the 5min budget and auto-retried once, final `retry_count=1`). Judge n=3 median: baseline=90, oracle-practice=80, irrelevant-practice=80; semantic evaluator and practice observation recorded per attempt. Summary outcome = `no-obvious-signal` (oracle not strictly greater than both controls) -> diagnostic-only conclusion; no formal record or suite revision created. Per-attempt pi durations (flash): 102s / 120s / 259s vs v5 (v4-pro) 155s / 111s / 108s — flash is not reliably faster on this task and a 5min timeout still occurred once. `bun run validate`, OpenSpec strict validation, and run-local tests (17 pass) all green at config commit `af0bf01`.

## 6. v2 复测（#145/#146/#148 合并后）

- [x] 6.1 将分支同步到 main（含 #145 候选 v2、#146/#148 judge provider），把冻结的 v1 候选恢复到 main 状态；`bun run validate` 与 OpenSpec strict 全绿（26/26）。
- [x] 6.2 创建冻结复测计划 `incubator/practice-injection-plans/login-page-auth-flow-v2-three-condition-retest.yaml`（`repetitions: 6` = cyclic-latin-square 6 块 → 每条件 6 次、共 18 attempts）；plan dry-run 通过、候选校准两项（calibration-matrix + judge-practice-rubric-v2-calibration）通过、leakage audit（materialize 基线无 private 材料）通过、judge rubric 加载通过。
- [x] 6.3 执行三条件复测 pilot（6 次/条件，deepseek-v4-pro，10min/次预算，indeterminate 预算 0.25）到 ignored scratch（`scratch/profile-diagnostics/login-v2-three-condition-retest`，18 attempts，interrupted=false）。结果：baseline joint_pass 0/4（2 次执行失败：1× Pi 超时、1× evaluator 非零退出），oracle-practice joint_pass 2/6（judge 100×2/0×4），irrelevant-practice joint_pass 0/6（judge 全 0）；judge 全部 observed、indeterminate_rate 0、无 diagnostic_only。decision_rule 下 oracle 严格高于两个 control → 方向性信号，但 `overall_conclusion_grade=diagnostic-only`（单候选 + baseline 健康样本不足）。不创建正式 record / suite revision。
- [x] 6.4 更新 PR #143 标题与正文（含 judge sidecar、indeterminate 预算门禁结果与生命周期边界），并同步 change 文档；提交推送到分支。

- [x] 6.5 需求方 2026-08-06 修正实验设计：task 恢复分层要求（真实口吻），复测目标改为「practice 注入提升分层规范度」；更新 v2 task.md + snapshot + plan（`login-page-auth-flow-v2-three-condition-retest-v2`）；记录第一轮为 headroom 验证跑与 #145 spec 覆盖；重跑三条件 pilot（已执行 18 attempts：oracle joint_pass 3/5、baseline 1/5、irrelevant 2/6，judge 中位 oracle 100 / baseline 0，方向性信号 + diagnostic-only）；按需求方决定将冻结 plan 重复次数由 6 降至 3（每条件 3 次、共 9 attempts）并更新 PR #143。
