## 0. 流程门禁（initial OpenSpec PR 前）

- [ ] 0.1 确认 Issue #201 仍是单一问题，回读 #196/#197/#199/#200/#202 的 merged 状态、source/snapshot/treatment/evaluator/Judge identity；不修改已有冻结 revision。 [写入范围：Issue #201、`proposal.md`、`design.md`]
- [ ] 0.2 运行 `openspec validate async-report-timing-pilot-201 --type change --strict --json`，从最新 `origin/main` 创建 `codex/async-report-timing-pilot-201`，并创建只含 OpenSpec artifacts 的 draft PR；此 PR 不得包含 schema、runner、plan、fixture、模型运行或结果。 [写入范围：`openspec/changes/async-report-timing-pilot-201/`、GitHub PR]

## 1. Planning confirmation（initial PR 后、实现前）

- [ ] 1.1 在 Issue #201 与 `design.md` 回写需求方对九次矩阵、baseline/irrelevant scope、Agent model/environment/budget、Judge real opt-in/provider 和 diagnostic-only boundary 的明确确认。 [写入范围：Issue #201、`design.md`、`tasks.md`]
- [ ] 1.2 仅在 strict validation、initial PR 和规划确认完成后，进入等效 Plan 阶段；若任一决定改变题面、oracle、对照、评测、treatment、environment 或结论解释，先重新规划。 [写入范围：`design.md`、`tasks.md`]

## 2. Pre-registration contract

- [ ] 2.1 新增 `async-report-timing-pilot/v1` plan schema 和版本化 plan 文件，固定 candidate/task/treatment/runner/evaluator/Judge/environment/model/budget/hash、九次 schedule、failure taxonomy、workspace/privacy 和 claim boundary；生成并校验 canonical plan hash。 [写入范围：`schemas/`、`incubator/practice-injection-plans/`、`src/benchmark/`]
- [ ] 2.2 为 plan parser/validator 添加 deterministic tests：额外字段、identity/hash drift、重复/缺失 node、非 3×3 repetitions、baseline/irrelevant 偷换、非隔离 workspace、model/budget/environment 缺失均 fail closed。 [写入范围：`src/benchmark/`、`schemas/`]
- [ ] 2.3 完成 `bun run validate` 和 plan/snapshot/public-private leakage audit；未通过不得进入真实运行。 [写入范围：验证产物，不提交 generated output]

## 3. Nine-attempt orchestration

- [ ] 3.1 在现有 #197 staged delivery API 之上实现 master-plan preflight、cyclic Latin-square schedule 和 9 个 attempt 的 scratch-only 编排；每个 attempt 使用独立 workspace/artifact root，并持有同一 plan hash。 [写入范围：`src/benchmark/runner/pi/v2/staged/`、`src/benchmark/`]
- [ ] 3.2 接入 #202 hard evaluator host-side adapter；只把 evaluator version/overall status/stable check ids 加入 join，完整 oracle/reason/private check detail 留在 evaluator private boundary。 [写入范围：`src/benchmark/`、`incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/`（如只需调用则不改）]
- [ ] 3.3 接入 #200 evidence projection/Judge adapter；固定 opaque blind case id、calibration/scoring budget、provider/model/prompt/rubric/input hash 与 unavailable/indeterminate accounting；Judge 不读取 condition/timing/Practice/private material。 [写入范围：`src/benchmark/`、`scratch/`（运行时）]
- [ ] 3.4 实现成本/失败/indeterminate ledger 与 per-attempt result join；禁止重跑替换失败槽位，确保九个计划槽位都可审计。 [写入范围：`src/benchmark/`、`schemas/`]

## 4. Deterministic verification before any model call

- [ ] 4.1 用 mock Pi/Judge/evaluator 验证 3×3 schedule、plan hash、identity、same-session delivery、baseline/undeclared no-payload、workspace isolation 和 condition-blind evidence。 [写入范围：`src/benchmark/`]
- [ ] 4.2 增加失败矩阵：preflight drift、missing opt-in、unsupported node、delivery failure、session mismatch、evaluator failure、Judge unavailable/indeterminate、budget exhaustion；每项 fail closed 且不产生 formal record。 [写入范围：`src/benchmark/`、`schemas/`]
- [ ] 4.3 在 mock-only 条件下运行 `bun run validate`、相关 contract tests、`bun run check:openspec-purpose`、`git diff --check` 和 public/private leakage audit。 [写入范围：验证证据]

## 5. Authorized scratch-only execution and retrospective

- [ ] 5.1 在 preflight、planning confirmation、模型/Judge explicit opt-in 和 deterministic tests 全部通过后，执行九个预注册 attempt；运行结果只写被忽略的 `scratch/`，不写 `results/records/`，不升级 suite/candidate revision。 [写入范围：`scratch/`，不得提交]
- [ ] 5.2 对每个 attempt 运行 hard evaluator 和 blinded Judge；分别记 Agent、Judge calibration、Judge scoring、失败和 indeterminate 的 duration/usage/cost/state；不补跑替换失败槽位。 [写入范围：`scratch/`，不得提交]
- [ ] 5.3 运行后验证九个槽位、condition/node 一致性、trace/provenance/plan hash、hard/Judge independence、cost ledger、failure/indeterminate 状态和 no-leakage；执行 `bun run validate`、相关测试和 `git diff --check`。 [写入范围：验证证据]
- [ ] 5.4 生成脱敏 diagnostic retrospective，区分观察到的信号、失败/不确定、成本、限制和下一步；不写正式 record 或普遍效果结论。 [写入范围：`scratch/`，必要时更新 Issue/PR]

## 验证证据

初始 PR 阶段只要求 strict OpenSpec validation、工作区范围检查和 `git diff --check`；实现阶段必须补齐上述 mock contract tests、`bun run validate`、泄露审计和运行后九槽位核验。模型调用、Judge 真实调用和九次实验在 planning confirmation 与 preflight 通过前不得执行。