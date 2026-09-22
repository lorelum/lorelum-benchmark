## Context

截至 2026-09-22，`origin/main` 已包含并合并 #196、#197、#199、#200、#202 的交付。当前固定输入如下，实施前必须重新从 `main` 与对应 snapshot 回读，不能以工作区路径或 mutable latest 代替：

- candidate：`incubator/practice-injection/async-report-lifecycle-v1/`，source commit `74962ee0c98f7775b0eb626f7b49b878035d8778`，candidate snapshot id `ee588de3877ab91f2c1dfe8219bb7f9834671dd2a275531485f9d0630e0165d2`。
- public task hash：`public/task.md` = `3c6680a7b494c61034b547cb8846ff715e7c9c9f4e513726ecabed852e02d570`；`public/stage-2/task.md` = `cfedffac9345e1bc9b951737f1e817c07714265cd41584bb6f506fc81714ba66`。
- treatment：`agentic-coding-replan-on-material-drift/v1`，Pack ref `agentic-coding-v0.4.0`，Pack commit `df89b8d432a01c53361a0e23df6896a772942b09`，Practice id `agentic-coding.implementation.replan-on-material-drift`，card hash `4a8de5d1546bfd7ed074b8f40e06ad142c4cb79ebdc90781f4b5c87b1bf03b97`。
- runner：`staged-practice-delivery/v1`，三个正式 delivery nodes 为 `task_start`、`constraint_followup`、`first_implementation_checkpoint`；每个 attempt 只交付一次 card，并保持同一 Pi session。
- hard evaluator：#202 的 deterministic evaluator v1；Judge：#200 的 `judge-agent/async-report-replan/v1`、`replan-evidence/v1` 和 `async-report-replan-judge-accounting/v1`。

## Planning gate: decisions requiring confirmation

以下是本 change 的建议默认值；它们会改变运行身份或结果解释，因此在 initial OpenSpec PR 创建后必须由需求方确认，并写回本文件、Issue #201 和 tasks.md，确认前不得实施或调用模型：

1. **九次矩阵**：严格执行三个 timing node 各三次，共九次；baseline/未声明 condition 只做无模型 preflight isolation，不进入九次分母；不加入等长无关 Practice。若要保留无关对照，应另立计划并改变分母。
2. **Agent runtime**：建议使用已声明的 `local-pi/v3`，Pi `0.85.1`，model `deepseek/deepseek-v4-pro`，model version `local-native-skill-2026-07-19`，并以环境声明的 tool policy hash 绑定；每 attempt 的 max duration 建议固定为 25 分钟，max turns 由 adapter/runtime 实际上限显式记录，不用墙钟延迟模拟时机。
3. **Judge runtime**：建议执行 #200 真实 Judge calibration（最多 9 calls、3 repetitions）后进行每 attempt 一次、零 retry 的 scoring；provider/model、API endpoint、预算和显式 `LORELUM_JUDGE_REAL=1` opt-in 必须在 preflight 通过后才可使用。缺少配置时标记 `judge-unavailable`，不伪造分数、不阻止 hard evaluator 记录。
4. **运行授权**：九次探索仍是 scratch-only diagnostic，不是 formal run；不写 `results/records/`、不升级 suite、不把 pilot 结果用于发布。但真实 Agent/Judge 调用会产生外部成本，必须在实施前确认上述 provider/预算与 opt-in 已可用。

如果需求方确认上述默认值，后续实现将只围绕该边界推进；任一不同选择都需要重新写回 planning gate 后再实施。

## Execution design

### 1. Immutable pre-registration

新增 `async-report-timing-pilot/v1` plan contract（计划文件放在 `incubator/practice-injection-plans/`），内容包括 experiment id/version、candidate identity、task hashes、treatment/provenance hashes、node schedule、repetitions=3、agent/Judge/evaluator identities、environment/budget、workspace policy、failure taxonomy 和 claim boundary。计划 hash 作为所有 attempt、trace、hard result、Judge accounting 和 cost ledger 的 join key。

计划采用预先声明的 cyclic Latin-square schedule：每个 block 含三个 node，每个 node 在三个 block 中各出现一次，避免把 delivery node 与固定运行位置完全重合。计划生成后不按中途结果重排；失败不补跑替换，不修改分母。

### 2. Preflight and isolation

preflight 必须在第一条 Agent 请求前完成：candidate path 只能从冻结 source/snapshot materialize；public workspace 只能包含 task/starter 与声明的 condition-scoped runtime；private evaluator/oracle/rubric/Pack body 不得复制到 Agent workspace 或 prompt。校验 candidate/snapshot、task/stage-2 hash、treatment manifest/card identity、runner/evaluator/Judge/rubric hash、environment/model/budget、plan hash 和 clean workspace。

每个 attempt 都使用全新 workspace 和独立 artifact directory；artifact root 与 Agent workspace 必须 realpath 分离。attempt 结束后才在 host side 读取 private transcript、运行 #202 evaluator 和构造 #200 evidence projection；任何失败都 fail closed 并保留状态。

### 3. Nine attempt execution

编排器复用现有 #197 one-attempt API，不重新实现 delivery semantics。每个 attempt 按计划节点只投放一次固定 card；`constraint_followup` 与 `first_implementation_checkpoint` 继续使用 #197 冻结的同 session continuation/marker。baseline 和 undeclared path 只通过 mock/preflight 证明无 payload，不能成为隐含第四条件。

每次 attempt 至少产生：private delivery audit/summary、redacted public trace、Pi stdout/stderr/transcript artifact、execution health、final candidate diff、hard evaluator result、Judge evidence/accounting、usage/duration/cost ledger 和 terminal status。原始 private transcript、Practice body、Pack provenance、evaluator oracle/source、Judge calibration labels 仅留在 host-side private/scratch boundary。

### 4. Independent outcome join

hard evaluator 只按 #202 v1 CLI 读取 Agent app root，返回其冻结的 overall status/stable check id projection；完整 check reason 与 oracle 不进入 Judge 输入。Judge 只接收 #200 的 public-safe `replan-evidence/v1`，使用 opaque blind case id；真实 condition、node、attempt/repetition 和 hard result 在评分后通过 plan-hash/attempt-id 私有 join。

结果聚合分开报告：execution health；hard semantic status；Judge quality state/score；delivery status；Agent/Judge calibration/scoring/failure/indeterminate usage 与 cost。禁止把这些维度压成隐藏总分或用 Judge 改写 hard gate。

### 5. Diagnostic retrospective

复盘仅回答该固定 candidate、固定 Practice、固定 runtime 和九个 attempt 的限定性问题：哪些 node 的 trace/evaluator/Judge 信号可解释、成本和失败来自哪里、是否存在条件漂移或不可比 attempt、下一步是否值得另立更大实验。样本不足、模型不可达、Judge unavailable、delivery/evaluator failure 或 indeterminate 超预算都保留 diagnostic/indeterminate，不补造成功结果，不上升为 Pack coverage、query quality 或自动触发结论。

## Risks and mitigations

- **模型或 Judge 端点不可达** → preflight 只允许显式 opt-in；失败写入不可比/indeterminate，停止该 attempt，不伪造结果。
- **运行身份漂移** → 所有 identity 与 hash 绑定到 master plan；运行中 drift 立即 fail closed。
- **私有材料泄露** → workspace、prompt、public trace、Judge evidence 分层审计；运行前和运行后都执行 leakage audit。
- **模型超时导致 timing 混淆** → 固定 per-attempt budget；不以等待或 turn 数制造时机；不重跑替换失败槽位。
- **九次结果被过度解读** → 计划、结果摘要和 PR 明确 diagnostic-only claim boundary。