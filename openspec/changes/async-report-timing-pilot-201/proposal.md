# Issue #201：执行异步报表 Practice 时机 MVP 的九次探索

## Why

Issue #196、#197、#199、#200、#202 已分别冻结异步报表候选、同会话三节点 delivery、Pack-sourced Practice、任务专用 JudgeAgent 和 deterministic hard evaluator；其验证均已完成并合并到 `main`。当前缺少把这些固定输入组合成一次可审计 P1 timing pilot 的执行与复盘链路。

Issue #201 要回答的不是“Practice 是否普遍有效”，而是一个更窄的问题：在同一公开任务、同一 Pack card、同一会话脚本和同一模型条件下，把唯一计划性变量限定为 Practice delivery node，三个 node 各执行三次，能否得到完整、可解释的诊断证据。

## What Changes

- 预注册一个版本化的九次 timing exploration plan，固定 candidate、task/stage-2 prompt、Practice/Pack provenance、三个 delivery node、重复数、schedule、模型/环境/预算、evaluator 与 Judge 版本，以及失败和 indeterminate 的停止规则。
- 增加 preflight，验证 candidate snapshot/lifecycle、public/private 隔离、prompt/treatment/evaluator/Judge hash、运行环境、显式 opt-in 和干净 workspace；preflight 未通过不得调用模型或创建 record。
- 在现有 #197 staged delivery runner 之上执行三种 node 各三次的同会话 attempt，不重 query、不换 Practice、不补跑替换失败槽位；每次保存 runner trace、Pi transcript、hard evaluator、Judge accounting、成本与状态。
- 增加 #202 hard evaluator 与 #200 JudgeAgent 的受限 join：Judge 只接收脱敏 `replan-evidence/v1`，condition/timing 在评分后由编排层关联；hard gate、Judge soft signal、执行健康和成本状态分别表达。
- 生成只用于诊断的私有结果索引和脱敏复盘摘要，明确成功、失败、indeterminate、成本、解释边界和下一阶段决策；不升级 suite revision、不写正式 record、不形成普遍或产品效果结论。

## Non-Goals

- 不实现自然语言 query、Pack 排名、Practice 自动注入、文件信号、意图识别、context recovery 或生产 Trigger Orchestrator。
- 不修改 #196 public task/starter、#197 delivery semantics、#199 treatment body/provenance、#200 rubric/calibration、#202 evaluator v1 或任何已有冻结 revision。
- 不把 baseline、未声明 condition 或等长无关 Practice 偷换进九次 timing 分母；它们仅用于 preflight/隔离校验，若要扩展条件必须另立实验计划。
- 不创建 `results/records/` 正式记录、suite revision、模型效果结论或可发布 benchmark 结论。

## Impact

预计新增一个 `incubator/practice-injection-plans/` 下的 experiment plan/schema、staged timing pilot 编排与 contract tests、私有 scratch-only execution/review tooling，以及本 change 的验证和复盘文档。生成的 transcript、workspace、cost ledger、evaluator/Judge 原始结果和 diff 只存于被忽略的 `scratch/`；不得提交 `node_modules/`、运行 workspace、日志或 generated diff。

本 change 不新增或修改 `openspec/specs/` 的 stable capability；change-specific contract 仅约束 Issue #201 这一次诊断性探索。

关联 Issue：#201。