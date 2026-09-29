## Context

截至 2026-09-22，`origin/main` 已包含并合并 #196、#197、#199、#200、#202 的交付。当前固定输入如下，实施前必须重新从 `main` 与对应 snapshot 回读，不能以工作区路径或 mutable latest 代替：

- candidate：`incubator/practice-injection/async-report-lifecycle-v1/`，source commit `74962ee0c98f7775b0eb626f7b49b878035d8778`，candidate snapshot id `ee588de3877ab91f2c1dfe8219bb7f9834671dd2a275531485f9d0630e0165d2`。
- public task hash：`public/task.md` = `3c6680a7b494c61034b547cb8846ff715e7c9c9f4e513726ecabed852e02d570`；`public/stage-2/task.md` = `cfedffac9345e1bc9b951737f1e817c07714265cd41584bb6f506fc81714ba66`。
- treatment：`agentic-coding-replan-on-material-drift/v1`，Pack ref `agentic-coding-v0.4.0`，Pack commit `df89b8d432a01c53361a0e23df6896a772942b09`，Practice id `agentic-coding.implementation.replan-on-material-drift`，card hash `4a8de5d1546bfd7ed074b8f40e06ad142c4cb79ebdc90781f4b5c87b1bf03b97`。
- runner：`staged-practice-delivery/v1`，三个正式 delivery nodes 为 `task_start`、`constraint_followup`、`first_implementation_checkpoint`；每个 attempt 只交付一次 card，并保持同一 Pi session。
- hard evaluator：#202 的 deterministic evaluator v1；Judge：#200 的 `judge-agent/async-report-replan/v1`、`replan-evidence/v1` 和 `async-report-replan-judge-accounting/v1`。

## Planning confirmation (2026-09-22)

需求方已确认以下实施边界，并要求先验证可达性再进入长时间 pilot：

1. **九次矩阵**：严格执行三个 timing node 各三次，共九次；baseline/未声明 condition 只做无模型 no-payload/isolation 校验，不进入九次分母；不加入等长无关 Practice。
2. **Agent runtime**：新增并固定 `local-pi/v4`，Pi `0.85.1`，model `deepseek/deepseek-v4-flash`，model version `operator-local-experiment`；每 attempt 固定 `max_turns=128` 和 `max_duration_ms=1_500_000`，并以环境声明的 tool policy hash 绑定。
3. **Judge runtime**：#200 的真实 calibration/scoring 使用同一 `deepseek/deepseek-v4-flash` 完整 model ID；calibration 最多 9 calls、3 repetitions，scoring 每 attempt 1 call、0 retry；必须配置新的 provider/key 并显式设置 `LORELUM_JUDGE_REAL=1`。不复用历史 Judge key、model、calibration 或结果。
4. **运行顺序**：先执行 Pi/model short probe，再执行 plan dry-run，再执行完整 Judge calibration；三者全部通过后才允许启动九次 Agent pilot。任一前置 gate 失败都不启动长时间 pilot。
5. **运行授权**：九次探索仍是 scratch-only diagnostic；不写 `results/records/`，不升级 suite/candidate revision，不把 pilot 结果用于发布或普遍效果结论。

当前已有非破坏性 Pi/model probe 已通过：Pi `0.85.1`、目标模型 `deepseek/deepseek-v4-flash`、本地 gateway route 和 credential 可完成 `Reply with exactly: ok`。该结果只证明当前 route 可达；实现后的 preflight 仍必须校验 `local-pi/v4` manifest 与同一目标 model identity。

## Planning amendment (2026-09-24)

需求方同意继续按“校准不合格时不无限重跑、为 timing pilot 留有限恢复路径”的方向推进。本节 supersede 2026-09-22 planning confirmation 第 4 项关于“任一 calibration gate 失败即阻止所有 Agent attempt”的解释；并按模式细化第 3 项：Judge-scored 仍需 inference endpoint/API key/`LORELUM_JUDGE_REAL=1`，diagnostic-only 仅需 `LORELUM_JUDGE_CALIBRATION_KEY` 验证 attestation，不要求 Judge inference endpoint/API key/real opt-in。当前报告来自同一 #201 的已完成九次 calibration，只能作为完整、attested 的 diagnostic package 复用，不能当作 qualified calibration、不能用于评分，也不属于跨实验/历史 calibration 复用。其他已确认范围不变。

一次不调用模型的离线审计显示，九条真实 calibration observation 的 `input_hash` 均与当前确定性重建的 Judge input 一致；没有发现 runner input builder 丢弃已投影 evidence 的迹象。现有诊断更支持正向校准证据本身不足以满足冻结门槛。逐次 fixture 内容与理由继续留在 private scratch，不复制到公开 OpenSpec。

本修订仅拆分“Judge score 是否可采信”与“是否可执行 Agent timing pilot”，不改变 #200 v1。原 diagnostic-only 方案曾要求完整 calibration report 和 sidecar；该门槛已由下方 2026-09-24 后续 amendment 明确降为可选诊断证据：

- **Judge-scored（默认）**：保持原门禁，完整 calibration 必须 `qualified` 才可运行九次 attempt 并调用 Judge scoring。
- **diagnostic-only（显式选择）**：用户明确传入 `--run --diagnostic-only --confirm-start` 且 candidate/snapshot、plan/dry-run、environment/runtime、Pi/model probe、hard evaluator、workspace/private isolation 等全部非 Judge 执行门禁通过，即可运行预注册九个 Agent slots。此路径不要求 Judge inference endpoint/API key、`LORELUM_JUDGE_REAL=1`、calibration report/sidecar 或 `LORELUM_JUDGE_CALIBRATION_KEY`；不重跑 calibration，也不发起 attempt-level Judge 调用。有效且 attested 的 report/sidecar 只作为可选私有诊断注释。
- diagnostic-only 每个 slot 仍运行 #202 hard evaluator；Judge 明确记录为 `not-run`，原因为 `calibration-unqualified-diagnostic-only`，Judge score eligibility 为 false。不得从 Judge 侧得出质量或条件比较结论；执行健康、delivery 与 hard evaluator 结果仍独立记录。
- 不自动降级。未明确选择 diagnostic-only 或任何非 Judge gate 失败时仍 fail closed；Judge-scored 对 calibration `qualified` 的要求不变。diagnostic-only 缺少、损坏、未 attested 或身份不匹配的可选诊断包仅记为 `unavailable`，不阻断 Agent timing pilot。两种模式都维持九个 slot、失败不替换、scratch-only、不写 formal record、不升级 suite/candidate。

当前真实 calibration 已符合“完整但 diagnostic”的报告条件；本修订只授权实现该模式，不等于启动九次长时间 Agent pilot。真实运行仍需之后显式选择 diagnostic-only 并确认启动。
## Planning amendment (2026-09-24, optional Judge diagnostics)

需求方明确要求解除 Judge 诊断文件对 Agent timing pilot 的依赖。此 amendment supersedes 同日较早 amendment 中“diagnostic-only 必须提供完整 attested report 和 sidecar”的要求：

- diagnostic-only 的启动资格只由显式 `--run --diagnostic-only --confirm-start` 与全部非 Judge 执行门禁决定。
- calibration report、private diagnostics sidecar 和 attestation key 均为可选证据。文件缺失、格式无效、sidecar 不完整、attestation/key 不可用或身份不匹配时，preflight/run 记录 `unavailable` 与固定脱敏原因；Judge-calibration gate 记 `not-run` 并不阻断。禁止把这些缺失伪装成 Judge `qualified` 或 `diagnostic`。
- 若可选 package 完整且验证成功，只将其作为 private 诊断注释；其验证结果不改变 timing/hard-evaluator 的执行资格。
- diagnostic-only 不调用 Judge calibration 或 scoring API。本次九次 Agent pilot 的 Judge calls 为零；先前已发生的 calibration 使用量仍单独记账，缺失 artifact 不得解释为历史零成本。
- `judge-scored` 模式保持原门禁：必须有当前完整 attested `qualified` calibration、Judge provider/credential 与 `LORELUM_JUDGE_REAL=1`。所有模式继续 fail closed 于非 Judge identity、hash、runtime、probe、hard-evaluator 和 isolation 门禁。

## Execution design

### 1. Immutable pre-registration

新增 `async-report-timing-pilot/v1` plan contract（计划文件放在 `incubator/practice-injection-plans/`），内容包括 experiment id/version、candidate identity、task hashes、treatment/provenance hashes、node schedule、repetitions=3、agent/Judge/evaluator identities、environment/budget、workspace policy、failure taxonomy 和 claim boundary。计划 hash 作为所有 attempt、trace、hard result、Judge accounting 和 cost ledger 的 join key。计划同时固定 #202 evaluator snapshot、#200 evaluation-plan/rubric/evidence/accounting identity；preflight 会在任何长时间 Agent attempt 前重新读取这些 host-side identity 并比较 hash。

计划采用预先声明的 cyclic Latin-square schedule：每个 block 含三个 node，每个 node 在三个 block 中各出现一次，避免把 delivery node 与固定运行位置完全重合。计划生成后不按中途结果重排；失败不补跑替换，不修改分母。

### 2. Preflight and isolation

preflight 必须在第一条 Agent attempt 前完成：candidate path 只能从冻结 source/snapshot materialize；public workspace 只能包含 task/starter 与声明的 condition-scoped runtime；private evaluator/oracle/rubric/Pack body 不得复制到 Agent workspace 或 Judge prompt。校验 candidate/snapshot、task/stage-2 hash、treatment manifest/card identity、runner/evaluator/Judge/rubric hash、environment/model/budget、plan hash 和 clean workspace。

`judge-scored`（默认）模式的 fail-closed 顺序固定为：

1. 读取并校验 `local-pi/v4` environment、Pi 版本、model ID/version、tool policy、runtime/package/lockfile；
2. 使用目标 model 执行一次不写 workspace 的短 probe，确认 Pi route、gateway 和 credential 可完成最小请求；
3. 解析 master plan，执行 scratch dry-run，生成 9 个 slot、循环拉丁方顺序并验证 snapshot/hash/isolation；
4. 校验 Judge provider/model/credential/`LORELUM_JUDGE_REAL=1`，执行 #200 完整 calibration；
5. 仅 calibration 为 `qualified` 时，才可运行 Agent slots 并对 attempts 调用 Judge scoring。

diagnostic-only 模式保留所有 candidate/snapshot/evaluator/plan/isolation/Agent opt-in 检查，不执行新 Judge calibration、不要求 Judge provider/credential/attestation key，且禁止 attempt-level Judge 请求。若可选缓存诊断包完整、身份匹配且 attestation 有效，则附加到 private preflight evidence；否则只记录 `unavailable` 与脱敏原因，绝不阻断 timing 执行。运行摘要与每个 slot 必须记录 `execution_mode=diagnostic-only`、`judge_score_usable=false`、Judge `not-run` 与零本次 Judge calls。

模式默认始终是 `judge-scored`；只有命令同时显式选择 `--run`、`--diagnostic-only` 和 `--confirm-start` 才允许有限恢复，绝不因 Judge gate 失败自动降级。任何其他 preflight、dry-run、plan identity、隔离或 Agent gate 失败仍阻止九次 Agent attempts；仅可选 Judge diagnostics 的缺失/验证失败不阻断。运行不创建 formal record；attempt 使用全新 workspace 与独立 artifact directory，artifact root 与 Agent workspace 必须 realpath 分离。attempt 结束后才在 host side 读取 private transcript、运行 #202 evaluator 和（仅 Judge-scored 模式）构造 #200 evidence projection；失败均保留状态。
### 3. Nine attempt execution

编排器复用现有 #197 one-attempt API，不重新实现 delivery semantics。每个 attempt 按计划节点只投放一次固定 card；`constraint_followup` 与 `first_implementation_checkpoint` 继续使用 #197 冻结的同 session continuation/marker。baseline 和 undeclared path 只通过 mock/preflight 证明无 payload，不能成为隐含第四条件。

每次 attempt 至少产生：private delivery audit/summary、redacted public trace、Pi stdout/stderr/transcript artifact、execution health、final candidate diff、hard evaluator result、usage/duration/cost ledger 和 terminal status。Judge-scored 模式另产 Judge evidence/accounting；diagnostic-only 模式写明 Judge `not-run`、资格状态和未调用成本，不构造 Judge input。原始 private transcript、Practice body、Pack provenance、evaluator oracle/source、Judge calibration labels 仅留在 host-side private/scratch boundary。

### 4. Independent outcome join

hard evaluator 只按 #202 v1 CLI 读取 Agent app root，返回其冻结的 overall status/stable check id projection；完整 check reason 与 oracle 不进入 Judge 输入。Judge 只接收 #200 的 public-safe `replan-evidence/v1`，使用 opaque blind case id；真实 condition、node、attempt/repetition 和 hard result 在评分后通过 plan-hash/attempt-id 私有 join。

结果聚合分开报告：execution mode；execution health；hard semantic status；Judge quality state/score 或 `not-run`；delivery status；Agent/Judge calibration/scoring/failure/indeterminate usage 与 cost。diagnostic-only 结果不得产生 Judge 条件比较或 Judge 质量结论；禁止把这些维度压成隐藏总分或用 Judge 改写 hard gate。

### 5. Judge diagnostic usability

本次已观察到 #200 calibration report 只保留各 fixture median，`evaluateCalibrationMedians` 只返回首个失败原因；真实 Judge scoring 的部分异常路径也会被折叠成通用 `Judge unavailable`。#201 只在 pilot orchestration boundary 补诊断适配层，不改动被冻结的 #200 v1 源码、快照、identity、prompt、rubric、fixture、threshold、资格语义、call budget 或 retry 行为。

- 通过 #200 现有 `runCalibration` / `scoreForCalibration` API 包装真实 calibration completion，捕获最多 9 次既定调用的逐次结构化得分：opaque case id、host-side fixture category、repetition、总分、各 criterion points/rationale、confidence、prompt/input hashes、duration、usage 和状态。不得为诊断增加调用或重试。
- 私有 `scratch/<pilot>/preflight/private/` 下同时写 machine-readable JSON 和人类可读 Markdown；列出所有 calibration gate predicate 的 observed value、固定 threshold、pass/fail 与失败原因。主 preflight summary 仍不包含 calibration labels 或 criterion rationales，仅指向 private diagnostics artifact。
- 对 pilot scoring completion 错误记录有限的安全分类（transport/timeout、HTTP status、response parse、structured output rejected、input/provenance），不保存完整 exception、endpoint、key、prompt 或整段模型输出。成功评分仍复用现有 #200 result 和 criterion detail。
- 如果使用外部提供的 cached calibration report 而无逐次详情，明确标注“详情未随导入报告提供”，不得从 median 伪造逐次分数或理由。
- 当次已完成的 9 calls 没有 per-call details，不能回填；不为实现本 change 自动重跑真实模型或启动 Agent pilot。

## 6. Diagnostic retrospective

复盘仅回答该固定 candidate、固定 Practice、固定 runtime 和九个 attempt 的限定性问题：哪些 node 的 trace/evaluator/Judge 信号可解释、成本和失败来自哪里、是否存在条件漂移或不可比 attempt、下一步是否值得另立更大实验。样本不足、模型不可达、Judge unavailable、delivery/evaluator failure 或 indeterminate 超预算都保留 diagnostic/indeterminate，不补造成功结果，不上升为 Pack coverage、query quality 或自动触发结论。

## Risks and mitigations

- **模型或 Judge 端点不可达/校准不合格** → 任何模式先做 Pi/model short probe；Judge-scored 模式要求完整 calibration qualified。diagnostic-only 可显式运行；若可选诊断包可验证则附注，缺失或无效则记录 unavailable，不阻断 timing/hard-evaluator 证据，也不自动降级或伪造 Judge 分数/结论。
- **运行身份漂移** → 所有 identity 与 hash 绑定到 master plan；运行中 drift 立即 fail closed。
- **私有材料泄露** → workspace、prompt、public trace、Judge evidence 分层审计；运行前和运行后都执行 leakage audit。
- **模型超时导致 timing 混淆** → 固定 per-attempt budget；不以等待或 turn 数制造时机；不重跑替换失败槽位。
- **九次结果被过度解读** → 计划、结果摘要和 PR 明确 diagnostic-only claim boundary。