## 0. 流程门禁（initial OpenSpec PR 前）

- [x] 0.1 确认 Issue #201 仍是单一问题，回读 #196/#197/#199/#200/#202 的 merged 状态、source/snapshot/treatment/evaluator/Judge identity；不修改已有冻结 revision。 [写入范围：Issue #201、`proposal.md`、`design.md`]
- [x] 0.2 运行 `openspec validate async-report-timing-pilot-201 --type change --strict --json`，从最新 `origin/main` 创建 `codex/async-report-timing-pilot-201`，并创建只含 OpenSpec artifacts 的 draft PR；此 PR 不得包含 schema、runner、plan、fixture、模型运行或结果。 [写入范围：`openspec/changes/async-report-timing-pilot-201/`、GitHub PR]

## 1. Planning confirmation（initial PR 后、实现前）

- [x] 1.1 在 Issue #201 与 `design.md` 回写需求方对九次矩阵、baseline/irrelevant scope、Agent model/environment/budget、Judge real opt-in/provider 和 diagnostic-only boundary 的明确确认。 [写入范围：Issue #201、`design.md`、`tasks.md`]
- [x] 1.2 仅在 strict validation、initial PR 和规划确认完成后，进入等效 Plan 阶段；若任一决定改变题面、oracle、对照、评测、treatment、environment 或结论解释，先重新规划。 [写入范围：`design.md`、`tasks.md`]
- [x] 1.3 在任何长时间 Agent attempt 前，执行目标 `deepseek/deepseek-v4-flash` 的 Pi/model short probe；校验 Pi `0.85.1`、gateway route、credential 和目标 model identity，失败时阻断 pilot。实现了环境可注入的 bounded probe；2026-09-22 实际 route probe 已通过。2026-09-23 使用隔离 Node `24.21.0` 与本地 `.env` 的最终 preflight 通过：Pi `0.85.1`、目标模型和 gateway route 均通过；短探活为 7,425ms、165 input / 2 output tokens，cost unavailable。 [写入范围：`src/benchmark/runner/pi/v2/`、验证证据]
- [x] 1.4 在 Agent attempt 前执行 plan dry-run 与 #200 完整 Judge calibration gate；实现已通过 mock calibration 验证。2026-09-23 使用 `.env` 中已配置的 Judge provider/model/real opt-in，并为本地签名生成独立 256-bit calibration attestation key；完整执行 9 calls / 3 repetitions，但 calibration 为 `diagnostic`，原因是 `reference median is below the minimum`。用量 10,596 input / 13,816 output tokens，cost unavailable，因此硬门禁未通过且未启动九次 Agent pilot；私有 report 仅留在 ignored scratch。 [写入范围：`src/benchmark/runner/pi/v2/`、`src/benchmark/judge/`、验证证据]

## 2. Pre-registration contract

- [x] 2.1 新增 `local-pi/v4` environment、版本化 system prompt、`async-report-timing-pilot/v1` plan schema 和 plan 文件，固定 candidate/task/treatment/runner/evaluator/Judge/environment/model/budget/hash、九次 schedule、failure taxonomy、workspace/privacy 和 claim boundary；生成并校验 canonical plan hash。 [写入范围：`schemas/`、`incubator/practice-injection-plans/`、`src/benchmark/`]
- [x] 2.2 为 plan parser/validator 添加 deterministic tests：额外字段、identity/hash drift、重复/缺失 node、非 3×3 repetitions、baseline/irrelevant 偷换、非隔离 workspace、model/budget/environment 缺失均 fail closed。 [写入范围：`src/benchmark/`、`schemas/`]
- [x] 2.3 完成 `bun run validate` 和 plan/snapshot/public-private leakage audit；未通过不得进入真实运行。2026-09-22 已通过本地与 GitHub CI 验证。 [写入范围：验证产物，不提交 generated output]

## 3. Nine-attempt orchestration

- [x] 3.1 在现有 #197 staged delivery API 之上实现 master-plan preflight、cyclic Latin-square schedule 和 9 个 attempt 的 scratch-only 编排；每个 attempt 使用独立 workspace/artifact root，并持有同一 plan hash。 [写入范围：`src/benchmark/runner/pi/v2/staged/`、`src/benchmark/`]
- [x] 3.2 接入 #202 hard evaluator host-side adapter；只把 evaluator version/overall status/stable check ids 加入 join，完整 oracle/reason/private check detail 留在 evaluator private boundary。 [写入范围：`src/benchmark/`、`incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/`（如只需调用则不改）]
- [x] 3.3 接入 #200 evidence projection/Judge adapter；固定 opaque blind case id、calibration/scoring budget、provider/model/prompt/rubric/input hash 与 unavailable/indeterminate accounting；Judge 不读取 condition/timing/Practice/private material。 [写入范围：`src/benchmark/`、`scratch/`（运行时）]
- [x] 3.4 实现成本/失败/indeterminate ledger 与 per-attempt result join；禁止重跑替换失败槽位，确保九个计划槽位都可审计。 [写入范围：`src/benchmark/`、`schemas/`]

## 4. Deterministic verification before any model call

- [x] 4.1 用 mock Pi/Judge/evaluator 验证 3×3 schedule、plan hash、identity、same-session delivery、baseline/undeclared no-payload、workspace isolation 和 condition-blind evidence。 [写入范围：`src/benchmark/`]
- [x] 4.2 增加失败矩阵：preflight drift、missing opt-in、unsupported node、delivery failure、session mismatch、evaluator failure、Judge unavailable/indeterminate、budget exhaustion；每项 fail closed 且不产生 formal record。 [写入范围：`src/benchmark/`、`schemas/`]
- [x] 4.3 在 mock-only 条件下运行 `bun run validate`、相关 contract tests、`bun run check:openspec-purpose -- origin/main`、`git diff --check` 和 public/private leakage audit。2026-09-23 验证：OpenSpec strict、purpose guard、`bun run validate`、9-slot dry-run 均通过；`test:contracts:core --timeout=30000` 169/169、`test:contracts:runner` 169/169、preflight+Judge diagnostics 定向测试 22/22 通过。2026-09-24 诊断模式实现前完成一次真实 diagnostic-only preflight：Pi/model 与 provider gate 通过，Judge calibration 9 calls 后仍 diagnostic，未启动 Agent attempt；Judge diagnostics 定向集 28/28、core contracts 169/169、runner contracts 169/169 通过。费用字段 unavailable。 [写入范围：验证证据]

- [x] 4.4 在 #201 runner 边界增加 calibration/scoring 诊断适配层：捕获既有 Judge API 返回的逐次 criterion 分数/理由、confidence、hash、usage、duration 和安全 failure code；不更改 #200 v1 源码、身份、评分语义、阈值、9-call budget 或重试策略。以注入式 completion 验证 9 次诊断调用上限、case 标签不进入 Judge prompt、门禁明细与 frozen qualification 判断一致、HTTP/结构化输出失败脱敏。 [写入范围：`src/benchmark/runner/pi/v2/staged/`、`schemas/`]
- [x] 4.5 生成 scratch-only private JSON/Markdown 诊断 artifact，显示所有 calibration 门禁判断及逐次结果；preflight summary 只给出私有 artifact 的相对路径，不泄露标签、理由或凭证；cached report 缺详情时明确标记不可回溯。私有写入拒绝 symlink 路径；schema、leakage 与缓存报告缺详情测试通过。 [写入范围：`src/benchmark/runner/pi/v2/staged/`、`schemas/`]
- [x] 4.6 增加显式 diagnostic-only execution mode：仅接受身份与 attestation 有效的完整 `diagnostic` calibration report 和匹配的 private sidecar；保留全部非 Judge 执行门禁；真实启动必须显式 `--run --diagnostic-only --confirm-start`；不生成 attempt-level Judge input/请求，逐 slot 记 `not-run`、零 scoring calls 与不可采信状态；默认 scored 模式仍 fail closed。mock/contract tests 覆盖无自动降级、零 Judge scoring calls、hard evaluator 独立通过、sidecar/report 缺失或篡改时阻断。前置工作定向 tests 与 Judge diagnostics tests 合计 32/32 通过，无外部模型调用、无 Agent attempt。 [写入范围：`src/benchmark/runner/pi/v2/staged/`、`schemas/`、plan manifest]

## 5. Authorized scratch-only execution and retrospective

- [ ] 5.1 仅在所有非 Judge 执行门禁（环境/runtime、Pi/model probe、plan dry-run、identity/hash/isolation、hard evaluator 与 deterministic tests）通过后运行九个预注册 slots。Judge-scored 模式还要求 calibration `qualified`；diagnostic-only 模式必须有完整 attested `diagnostic` report 并由操作者显式传入 `--diagnostic-only --confirm-start`。运行结果只写 ignored `scratch/`，不写 `results/records/`，不升级 suite/candidate revision。 [写入范围：`scratch/`，不得提交]
- [ ] 5.2 对每个 attempt 运行 hard evaluator；仅 Judge-scored 模式运行 blinded Judge。diagnostic-only 模式不发 Judge 请求，每个 slot 将 Judge 写为 `not-run`，记录 calibration 未 qualified 的原因，并分别记 Agent、Judge calibration、Judge scoring（零调用）、失败和 indeterminate 的 duration/usage/cost/state；不补跑替换失败槽位。 [写入范围：`scratch/`，不得提交]
- [ ] 5.3 运行后验证九个槽位、condition/node 一致性、trace/provenance/plan hash、hard/Judge independence、执行模式标记、diagnostic-only 下零 Judge scoring calls、cost ledger、failure/indeterminate 状态和 no-leakage；执行 `bun run validate`、相关测试和 `git diff --check`。 [写入范围：验证证据]
- [ ] 5.4 生成脱敏 diagnostic retrospective，区分观察到的信号、失败/不确定、成本、限制和下一步；diagnostic-only 结果明确声明 Judge score 不可用，不写正式 record 或普遍效果结论。 [写入范围：`scratch/`，必要时更新 Issue/PR]

## 验证证据

OpenSpec planning amendment 与实现前执行 strict validation、purpose guard 和范围检查。2026-09-24 最终实现验证：前置工作三文件合计 32/32；`bun run validate` 通过；`bun run test:contracts:core --timeout=30000` 169/169、`bun run test:contracts:runner` 173/173；OpenSpec strict、purpose guard、9-slot CLI dry-run、`git diff --check` 通过。首次并行运行 contracts 时 core 中 4 项因默认 5 秒 timeout 失败；串行使用 30 秒 timeout 后全部通过。最终验证未发起真实 Judge/Pi 请求或 Agent attempt。完成 5.1 前必须由操作者显式选择 `--run --diagnostic-only --confirm-start`；否则不运行九次 pilot。