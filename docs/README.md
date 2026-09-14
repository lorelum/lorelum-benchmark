# 文档导航与适用范围

本文是阅读导航，不是第二套 benchmark 规范。它帮助维护者判断该读哪些资料、每份资料适用于什么问题；具体要求仍以对应的根规则、稳定契约或当前变更记录为准。

## 先选对权威来源

- **仓库级安全、生命周期与协作流程**：先读根目录 [`AGENTS.md`](../AGENTS.md)。Agent skills 是操作辅助，不能改写它或适用的机器契约。
- **当前变更的目标与决定**：看该项 GitHub Issue 和 `openspec/changes/<active-change>/`。如果用户澄清与现有文字冲突，应先显式对齐 Issue/OpenSpec；不能把历史表述静默升级成用户目标。
- **跨变更稳定行为**：只读适用于当前范围的 `openspec/specs/` 与 `schemas/`。某条 requirement 若只对一个 task、candidate、model、profile 或一次实验成立，不应当作全仓库默认规则。
- **具体操作与领域方法**：按下表选相应维护指南。指南的领域范围之外，不自动继承其中的要求。
- **任务或研究证据**：task card、Issue 分析和 pilot 报告解释特定对象或样本，不自动成为通用规则。
- **历史材料**：`openspec/changes/archive/`、已退休 revision 和已标明为草案的计划用于追溯，不是当前默认实现任务。若当前变更确实依赖历史决定，应明确指出具体引用。

如果两个适用的规范来源仍互相矛盾，不要自行挑一份继续实现；指出冲突、建议权威来源持有人修正，并按 `AGENTS.md` 对该类变更的流程处理。

## 仓库入口

| 文档 | 类型与适用范围 | 不应被误读为 |
| --- | --- | --- |
| [`../README.md`](../README.md) | 仓库简介与当前状态快照 | 生命周期、评测或变更流程的完整规范 |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | 任务夹具创建、冻结与结果产物的操作入口；前置门禁见 `AGENTS.md` | 可以跳过 Issue/OpenSpec/Plan 的授权 |
| [`CHANGE_WORKFLOW.md`](CHANGE_WORKFLOW.md) | 只在 benchmark 变更/获准诊断时读取的 Issue、OpenSpec、分支、规划与验证步骤 | 不适用于纯文档导航浏览或可直接 PR 的非契约修复 |
| [`PR_REVIEW.md`](PR_REVIEW.md) | 只在触及 benchmark contract 的 PR review 阶段读取 | review 可以顺带改动被审代码 |
| [`AGENT_GUIDANCE_MAINTENANCE.md`](AGENT_GUIDANCE_MAINTENANCE.md) | 仅在满足沉淀触发条件时评估如何处理 Agent 纠错与规则更新 | 每次用户纠正都要追加一条规则或日志 |
| [`BENCHMARK_PROTOCOL.md`](BENCHMARK_PROTOCOL.md) | 固定 Vercel React Skill 的 G0/G1 性能对比轨道及共享结果表达 | 所有 Practice-injection 研究的完整方法；后者还须读 Practice 指南 |
| [`PRACTICE_BENCHMARK_GUIDE.md`](PRACTICE_BENCHMARK_GUIDE.md) | Practice 候选的设计边界；treatment 投递以 [`treatments/README.md`](../treatments/README.md) 为准，跨变更契约以适用的 stable spec 为准 | 不应把带 candidate 编号的校准/矩阵或独立审查流程当成新 candidate 的默认验收门禁 |
| [`TASK_LIFECYCLE.md`](TASK_LIFECYCLE.md) | candidate、pilot、frozen、official、published、retired 的版本生命周期 | 任务语义或 evaluator 的唯一来源 |
| [`WORKSPACE_LAYOUT.md`](WORKSPACE_LAYOUT.md) | 目录所有权和工作区概览；treatment 交付细节见 `treatments/README.md` | 私有 treatment 可以任意复制到 Agent 输入 |
| [`PI_RUNNER.md`](PI_RUNNER.md) | Pi adapter、请求、trace 与运行记录契约 | 授权正式运行的充分条件；仍须满足 `AGENTS.md` 与 formal smoke 前置条件 |
| [`FORMAL_SANDBOX.md`](FORMAL_SANDBOX.md) | 正式 runner 的 sandbox 部署与网络边界 | 普通本地诊断的通用环境要求 |
| [`FORMAL_SMOKE.md`](FORMAL_SMOKE.md) | formal G0/G1 smoke 的启动条件和复核流程 | 正式运行授权；不得仅凭此页发起运行 |
| [`KERNEL.md`](KERNEL.md) | candidate workspace kernel 的架构、版本和复现约束 | 任一具体 track 的完整产品或评测契约 |
| [`SLIMMING_PLAN.md`](SLIMMING_PLAN.md) | 明确标注为非可执行的可行性草稿 | 已批准的实现计划 |
| [`issue-92-practice-injection-analysis.md`](issue-92-practice-injection-analysis.md) | #92 特定小样本 Practice 注入诊断证据 | 通用因果结论、retrieval 有效性或全局评测规范 |
| [`examples/task-card.example.yaml`](examples/task-card.example.yaml) | task-card 格式示例 | 可覆盖 schema、当前 OpenSpec 或 `AGENTS.md` 的规范 |

## 更新或新增维护文档时

1. 开头说明文档目的、适用范围/非目标，以及它是规范、操作指南、证据报告还是未批准草案。
2. 先找唯一 canonical source；引用它而不是复制整段规则。若事实或规则冲突，修正来源并同步必要的入口链接。
3. 证据报告要给出对象、样本/条件、结论边界；研究建议和示例不得伪装成已批准规则或通用验证。
4. 被新决定取代的材料保留其历史证据价值，标明已被取代及后继来源；不要保留两份互相竞争的“当前版”。
5. 仅当核心维护指南新增、移除或变更适用范围时更新本导航；不为普通任务或每次编辑维护额外台账。
## OpenSpec 与工作树草稿

- `openspec/specs/` 是经评审的稳定 capability；只在其声明范围内适用。
- `openspec/changes/` 下的活动 change 只服务其对应 Issue/change；`archive/` 是历史留档。
- 未跟踪的本地文件、研究稿或 agent skill 不属于已提交的仓库规范。审查时先确认其状态和归属，不要顺手把它们并入无关 PR。
- `docs/README.md` 只维护阅读路线和适用范围。新增或退役一份核心维护指南时更新对应索引行；不在此复制整套规则，也不为普通任务建立纠错日志。
