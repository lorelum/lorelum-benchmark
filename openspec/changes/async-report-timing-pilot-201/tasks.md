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
- [x] 4.6 初版 diagnostic-only mode 将完整 attested `diagnostic` calibration report/sidecar 作为门槛；初版验证覆盖缺失或篡改时阻断。该行为已由 2026-09-24 后续 amendment 明确 supersede，历史验证不代表当前契约。 [写入范围：历史实现]

## 4.7 Optional diagnostic evidence

- [x] 4.7 将 diagnostic-only 的 calibration report、private sidecar 与 attestation 降为可选诊断上下文；缺失、无效、未 attested 或身份不匹配时只记录脱敏 `unavailable` 原因，不阻断 preflight/run；保证 diagnostic-only 的新 Judge API 调用数恒为零，Judge-scored 仍要求当前 qualified calibration。验证：preflight+runner 定向测试 25/25、runner contracts 173/173、core contracts 169/169；覆盖 report/sidecar/key 缺失、sidecar 篡改、hard evaluator 独立、默认模式 fail-closed。 [写入范围：`src/benchmark/runner/pi/v2/staged/`、schemas、OpenSpec]

## 4.8 Restore the pinned host runtime

- [x] 4.8 在当前用户运行环境启用 Node `24.21.0`（官方 zip SHA256 校验通过，原 Node 22 保留为 side-by-side）及 Pi `0.85.1`，Bun `1.4.2`；`local-pi/v4` manifest/runtime 校验通过。初次未加载工作区外 `.env` 时 Pi probe 在发请求前阻断；显式由 Bun 加载既有 `.env` 后，最终 diagnostic-only preflight 的 1 次短 Pi/model probe 成功，未显示或复制 credential，也未启动 Agent attempts。 [写入范围：本地运行环境与验证证据，不提交安装产物]


## 5. Authorized scratch-only execution and retrospective

- [x] 5.1 在 fresh preflight（环境/runtime、Pi/model probe、plan dry-run、identity/hash/isolation）通过后，以 `--run --diagnostic-only --confirm-start --run-id pilot-20260926-restart1` 运行九个预注册 slots。2026-09-26 结果：`attempted_slots=9`，run-level `status=incomplete`（6 `completed` + 3 `indeterminate`，0 `failed`），`formal_record_created=false`。全部产物只写 `scratch/async-report-timing-pilot-v1-run-20260926-restart1/`，未写 `results/records/`，未升级 suite/candidate revision。首次启动因 CLI 默认 run id 含大写字符被 runner 拒绝，显式传入小写 run id 后启动；此前一次 harness 中断片段记录在 `scratch/async-report-timing-pilot-v1-run-20260926/ABORTED-SEGMENT-NOTE.md`，已排除并单独记账。 [写入范围：`scratch/`，不得提交]
- [x] 5.2 九个 slot 均运行 #202 hard evaluator（9/9 `pass`）；diagnostic-only 下 Judge 全部 `not-run`，`judge.calls.calibration=0`、`judge.calls.scoring=0`、`judge_score_usable=false`，未构造 Judge input，未调用 Judge provider。三种 `first_implementation_checkpoint` 均为 delivery `indeterminate`，原因一致为 `checkpoint marker and persisted graceful stop were not both observed`；按契约保留原状态，未替换、未补跑。Agent usage 575,412 input / 645,687 output / 1,221,099 total tokens；gateway 报告 cost 0，视为不可用/不可信而非真实零成本；本次 Judge 调用为零，历史 calibration 不随本次运行重复。 [写入范围：`scratch/`，不得提交]
- [x] 5.3 运行后核验通过：9 个 slot 与冻结 schedule 顺序一致、`master_plan_hash` 唯一且等于 `9db4282ede9dd66391727a8df7e6682d95d72d0fbd9fc6741480e08db4234a3f`、所有 attempt `execution_mode=diagnostic-only`、Judge `not-run` 且零调用、`formal_record_created=false`、Agent workspace 无 Practice identity/card hash/private evaluator/oracle 泄漏（9/9 workspace 无命中）。复核命令：`bun run validate` 通过、`bun test src/benchmark/runner/pi/v2/staged/async-report-timing-pilot.test.ts src/benchmark/runner/pi/v2/staged/async-report-timing-pilot-runner.test.ts` 25/25 通过、`git diff --check` 通过。 [写入范围：验证证据]
- [x] 5.4 已生成脱敏 diagnostic retrospective：`scratch/async-report-timing-pilot-v1-run-20260926-restart1/diagnostic-retrospective.md`。复盘区分了可观察信号、indeterminate、成本、限制和下一步，明确声明 Judge score 不可用、不写正式 record、不作普遍效果结论。主要发现：`task_start` 与 `constraint_followup` 各 3/3 成功交付并有方向性 timing 信号；三个 `first_implementation_checkpoint` 因 agent 输出加粗 marker（`**CHECKPOINT: compatibility-slice-ready**`）未匹配整行精确检测而系统性未交付，checkpoint 条件不可比。建议另立 issue 修复 marker 检测的格式敏感性，之后再决定是否需要新的预注册 pilot。 [写入范围：`scratch/`，必要时更新 Issue/PR]

## 验证证据

OpenSpec planning amendment 与实现前执行 strict validation、purpose guard 和范围检查。此前 2026-09-24 初版验证：前置工作定向测试 32/32；`bun run validate` 通过；core contracts 169/169、runner contracts 173/173；OpenSpec strict、purpose guard、9-slot dry-run、`git diff --check` 通过。2026-09-24 后续按需求方纠正将 Judge report/sidecar/attestation 改为 optional evidence：最终前置工作定向测试 25/25，core contracts 169/169、runner contracts 173/173；`bun run validate`、OpenSpec strict、purpose guard、9-slot CLI dry-run 和 `git diff --check` 均通过。一次最终真实 `diagnostic-only` preflight 使用 Node 24.21.0 / Pi 0.85.1 / Bun 1.4.2：Pi/model probe 1 次（167 input、2 output tokens，费用 unavailable），plan dry-run、identity 与 isolation 均通过，Judge diagnostics 为 `unavailable`/`not-run` 且不阻断，Judge calls 为 0，`allowed_to_start=true`。

2026-09-26 九次 pilot 执行证据：运行 `pilot-20260926-restart1`，plan hash `9db4282ede9dd66391727a8df7e6682d95d72d0fbd9fc6741480e08db4234a3f`，Node 24.21.0 / Pi 0.85.1 / Bun 1.4.2，`diagnostic-only`。结果：`attempted_slots=9`，6 `completed` + 3 `indeterminate` + 0 `failed`，run-level `status=incomplete`，hard evaluator 9/9 `pass`，Judge 全部 `not-run` 且 calibration/scoring 调用均为 0，`formal_record_created=false`。三个 `first_implementation_checkpoint` 均因 marker 检测未识别加粗输出而 delivery `indeterminate`、card 未交付；`task_start` 与 `constraint_followup` 各 3/3 交付成功。Agent usage 575,412 input / 645,687 output / 1,221,099 total tokens，gateway 报告 cost 0（按不可用处理）。运行产物与 `diagnostic-retrospective.md` 仅留在 ignored scratch；未写正式 record，未升级 suite/candidate。首次启动失败为 CLI 默认 run id 含大写字符，属已知小缺陷，本次通过显式小写 run id 绕过；建议后续单独修复。

2026-09-26 观测后交付/标识层缺陷修复（同分支，#221）：上述 pilot 暴露两处与评测语义无关的健壮性缺陷——checkpoint marker 检测要求整行裸匹配，模型实际输出的 `**CHECKPOINT: compatibility-slice-ready**` 未被识别（3/3 checkpoint slot `indeterminate`）；timing pilot CLI 默认 run id 由 `toISOString()` 生成、含大写 `T`/`Z`，被 runner 的 `^[a-z0-9][a-z0-9-]{0,63}$` 拒绝。修复：marker 匹配在保留「assistant-only + 整行只有 marker」边界的前提下去掉一层行内 Markdown 强调包裹（`**`/`__`/`*`/`_`/`` ` ``）；新增共享 `scratch-id.ts` 统一生成小写合法 id，runner 校验与 CLI 生成共用同一 pattern，并把同类生成点（`profile-diagnostic-runner`、`local-diagnostic-driver`、`staged-pilot-driver`）一并收敛。因 runner 源码身份变化，runner source manifest（新增 `src/benchmark/runner/pi/scratch-id.ts`，共 20 个文件）与 plan 重新冻结：`manifest_sha256=98d87a56d4ecafc82f7cc04e76f196ba8f64b0e95e132dc4e3017008ef74fba9`、`plan_hash=63bd8f40cffb7c48fa0317fc99c70e363c2e00b38e5af928d722ad10504c7532`。上文 `9db4282e…` 仍是已完成 diagnostic pilot 实际使用的历史身份；`pilot-20260926-restart1` 的既有记录与被保留的 3 个 `indeterminate` slot 不回填、不重跑。验证：marker 强调容忍与 id pattern 定向回归测试通过；runner contracts 175/175、core contracts 169/169、`bun run validate`、`bun run check:runtime`、`bun run validate:openspec`、purpose guard、`git diff --check` 通过。
