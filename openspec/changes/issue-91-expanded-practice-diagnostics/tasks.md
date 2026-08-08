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
- [x] 3.4 Make timed-out Windows Pi shims terminate their descendant process tree without killing unrelated Bun/evaluator workers; add focused cleanup classification coverage. (`bun run test:pi:v2`: 68/68 passed.)

## 4. One-repeat diagnostic gate

- [x] 4.1 Execute one repeat per condition for the selected candidate after prerequisites pass; do not create a formal record or suite revision. [Execution scope: `scratch/`]
- [x] 4.2 Produce a redacted summary grouped by candidate and `profile_input_hash`, preserving planned denominators and all outcome states. [Execution scope: `scratch/`]
- [x] 4.3 Apply the strict joint-pass rule: oracle led both controls in this one-block diagnostic, but #91 remains limited to diagnostic evidence pending three-repeat screening; no causal or generalized claims.

## 5. Balanced three-repeat screening

- [x] 5.1 Execute the first declared candidate's fixed three-repeat screen from `balanced-diagnostics-v2`; retain only redacted scratch evidence and bind it to the active runner source. (9/9 attempts completed; candidate result is `directional-screen`.)
- [ ] 5.2 Execute the second declared candidate's fixed three-repeat screen only after an explicit continuation decision; do not combine incomplete candidate denominators or emit an aggregate conclusion. (Continuation plan and prerequisites passed; first attempt timed out before evaluation, so no candidate result or aggregate conclusion was emitted.)

## 6. v2 candidate 三条件诊断执行（需求方确认扩展，2026-08-08）

- [x] 6.1 完成 v2 执行前小幅修订：两个 v2 candidate 每 attempt 预算 10→25 分钟；探针领域翻译检查改为结构化（接受 taken/409/type-kind-outcome 判别词，N5）；探针矩阵重校准 4/4；snapshot 重生成；`private/calibration.md` 同步记录。
- [x] 6.2 新增 v2 执行计划并 dry-run：`practice-injection-candidates-v2-three-condition-diagnostics-v1`（2 candidate × 3 条件 × 3 重复）、`practice-injection-profile-update-v2-one-repeat-smoke`（smoke）、`practice-injection-project-directory-v2-one-repeat-rerun`（补跑）。
- [x] 6.3 执行 smoke（3 attempts）验证模型行为与管线；确认 oracle 遵循 Practice、baseline 偶发自建边界。
- [x] 6.4 执行全量 18 attempts（2 candidate × 3 条件 × 3 重复）并补跑 project-directory oracle block-3（re-admission，替换失败槽位，不新增分母）。
- [x] 6.5 汇总 scratch 结果：profile-update oracle 3/3 > baseline 1/3、irrelevant 1/3；project-directory oracle 3/3 > baseline 0/3、irrelevant 0/3 → 两候选方向性信号；judge 聚合 oracle 更高。
- [x] 6.6 记录 #92 聚合分母规则（N2）：re-admission 补跑槽位替换失败槽位、不跨 plan 合并计数；结论仅方向性/诊断，不宣称精准注入；条件 C 未实现。