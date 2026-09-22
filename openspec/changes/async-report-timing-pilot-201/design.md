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
3. **Judge runtime**：#200 的真实 calibration/scoring 使用同一 `deepseek-v4-flash` 档位；calibration 最多 9 calls、3 repetitions，scoring 每 attempt 1 call、0 retry；必须配置新的 provider/key 并显式设置 `LORELUM_JUDGE_REAL=1`。不复用历史 Judge key、model、calibration 或结果。
4. **运行顺序**：先执行 Pi/model short probe，再执行 plan dry-run，再执行完整 Judge calibration；三者全部通过后才允许启动九次 Agent pilot。任一前置 gate 失败都不启动长时间 pilot。
5. **运行授权**：九次探索仍是 scratch-only diagnostic；不写 `results/records/`，不升级 suite/candidate revision，不把 pilot 结果用于发布或普遍效果结论。

当前已有非破坏性 Pi/model probe 已通过：Pi `0.85.1`、目标模型 `deepseek/deepseek-v4-flash`、本地 gateway route 和 credential 可完成 `Reply with exactly: ok`。该结果只证明当前 route 可达；实现后的 preflight 仍必须校验 `local-pi/v4` manifest 与同一目标 model identity。

## Execution design

### 1. Immutable pre-registration

新增 `async-report-timing-pilot/v1` plan contract（计划文件放在 `incubator/practice-injection-plans/`），内容包括 experiment id/version、candidate identity、task hashes、treatment/provenance hashes、node schedule、repetitions=3、agent/Judge/evaluator identities、environment/budget、workspace policy、failure taxonomy 和 claim boundary。计划 hash 作为所有 attempt、trace、hard result、Judge accounting 和 cost ledger 的 join key。计划同时固定 #202 evaluator snapshot、#200 evaluation-plan/rubric/evidence/accounting identity；preflight 会在任何长时间 Agent attempt 前重新读取这些 host-side identity 并比较 hash。

计划采用预先声明的 cyclic Latin-square schedule：每个 block 含三个 node，每个 node 在三个 block 中各出现一次，避免把 delivery node 与固定运行位置完全重合。计划生成后不按中途结果重排；失败不补跑替换，不修改分母。

### 2. Preflight and isolation

preflight 必须在第一条 Agent 请求前完成：candidate path 只能从冻结 source/snapshot materialize；public workspace 只能包含 task/starter 与声明的 condition-scoped runtime；private evaluator/oracle/rubric/Pack body 不得复制到 Agent workspace 或 prompt。校验 candidate/snapshot、task/stage-2 hash、treatment manifest/card identity、runner/evaluator/Judge/rubric hash、environment/model/budget、plan hash 和 clean workspace。

长时间 pilot 采用 fail-closed gate，顺序固定为：

1. 读取并校验 `local-pi/v4` environment、Pi 版本、model ID/version、tool policy、runtime/package/lockfile；
2. 使用目标 model 执行一次不写 workspace 的短 probe，确认 Pi route、gateway 和 credential 可完成最小请求；
3. 解析 master plan，执行 scratch dry-run，生成 9 个 slot、循环拉丁方顺序并验证 snapshot/hash/isolation；
4. 校验 Judge provider/model/credential/`LORELUM_JUDGE_REAL=1`，执行 #200 完整 calibration；
5. 只有 Judge calibration 达到 `qualified` 才允许进入九次 Agent attempt。

任何 preflight、dry-run 或 calibration gate 失败都只生成 preflight-blocked/invalid-plan 诊断摘要，不创建 attempt、不调用九次 Agent、不写 `results/records/`。每个 attempt 都使用全新 workspace 和独立 artifact directory；artifact root 与 Agent workspace 必须 realpath 分离。attempt 结束后才在 host side 读取 private transcript、运行 #202 evaluator 和构造 #200 evidence projection；任何失败都 fail closed 并保留状态。

### 3. Nine attempt execution

编排器复用现有 #197 one-attempt API，不重新实现 delivery semantics。每个 attempt 按计划节点只投放一次固定 card；`constraint_followup` 与 `first_implementation_checkpoint` 继续使用 #197 冻结的同 session continuation/marker。baseline 和 undeclared path 只通过 mock/preflight 证明无 payload，不能成为隐含第四条件。

每次 attempt 至少产生：private delivery audit/summary、redacted public trace、Pi stdout/stderr/transcript artifact、execution health、final candidate diff、hard evaluator result、Judge evidence/accounting、usage/duration/cost ledger 和 terminal status。原始 private transcript、Practice body、Pack provenance、evaluator oracle/source、Judge calibration labels 仅留在 host-side private/scratch boundary。

### 4. Independent outcome join

hard evaluator 只按 #202 v1 CLI 读取 Agent app root，返回其冻结的 overall status/stable check id projection；完整 check reason 与 oracle 不进入 Judge 输入。Judge 只接收 #200 的 public-safe `replan-evidence/v1`，使用 opaque blind case id；真实 condition、node、attempt/repetition 和 hard result 在评分后通过 plan-hash/attempt-id 私有 join。

结果聚合分开报告：execution health；hard semantic status；Judge quality state/score；delivery status；Agent/Judge calibration/scoring/failure/indeterminate usage 与 cost。禁止把这些维度压成隐藏总分或用 Judge 改写 hard gate。

### 5. Diagnostic retrospective

复盘仅回答该固定 candidate、固定 Practice、固定 runtime 和九个 attempt 的限定性问题：哪些 node 的 trace/evaluator/Judge 信号可解释、成本和失败来自哪里、是否存在条件漂移或不可比 attempt、下一步是否值得另立更大实验。样本不足、模型不可达、Judge unavailable、delivery/evaluator failure 或 indeterminate 超预算都保留 diagnostic/indeterminate，不补造成功结果，不上升为 Pack coverage、query quality 或自动触发结论。

## Risks and mitigations

- **模型或 Judge 端点不可达** → 先做 Pi/model short probe 与完整 Judge calibration；任一 gate 失败即阻断九次 pilot，不消耗长时间 Agent 预算，不伪造结果。
- **运行身份漂移** → 所有 identity 与 hash 绑定到 master plan；运行中 drift 立即 fail closed。
- **私有材料泄露** → workspace、prompt、public trace、Judge evidence 分层审计；运行前和运行后都执行 leakage audit。
- **模型超时导致 timing 混淆** → 固定 per-attempt budget；不以等待或 turn 数制造时机；不重跑替换失败槽位。
- **九次结果被过度解读** → 计划、结果摘要和 PR 明确 diagnostic-only claim boundary。