## Context

P1 的实验唯一计划性变量是同一长任务中 Practice 的送达节点。#196 提供公开异步报表 starter、三回合 task script 和明确的 `first_implementation_checkpoint` 任务语义；#199 提供固定的 Pack-sourced `practice-card` treatment：`agentic-coding-replan-on-material-drift/v1`，来源为 `lorelum-packs` 的 `agentic-coding-v0.4.0`，并固定 Pack commit、Practice ID、Lore content digest、来源文件 hash 和 card body hash。#197 不重新解析这些内容，也不判断 Practice 是否相关。

当前 Pi v2 staged 设施已有预注册计划、候选 identity 检查、Pi session start/resume 和脱敏结果的基础，但它面向已有的 staged 诊断流程。这个 change 增加一个清晰隔离的三节点 delivery contract，避免把 timing 语义散落在 Pi command 拼接、candidate evaluator 或生产触发器中。

约束来自 `AGENTS.md`、`docs/BENCHMARK_PROTOCOL.md`、`docs/TASK_LIFECYCLE.md`、`docs/PI_RUNNER.md`、`treatments/README.md` 和 #196/#199：candidate 仍位于 `incubator/`，不创建正式 record；private treatment/evaluator/oracle/scoring 不进入 Agent workspace 或公共输入；已有有结果 revision/helper 不原地改写。

## Goals / Non-Goals

**Goals:**

- 在单个 Pi v2 Agent session 中支持 `task_start`、`constraint_followup`、`first_implementation_checkpoint` 三个预声明 delivery nodes。
- 在 runner 启动前校验固定 treatment identity，并在每个 declared node 投放同一份 Practice bytes；runner 不 query、rerank、替换或自动判断。
- 让 task script 显式控制 constraint follow-up 和首个实现检查点的边界，不用重启会话、墙钟等待、token 数或文件信号伪造 timing。
- 对 baseline/未声明 condition fail closed；把私有审计证据与 Agent/public 可见的脱敏 trace 分开。
- 用 mock/fixture 在无模型、无网络、无正式 record 条件下验证协议。

**Non-Goals:**

- 不实现 natural-language query、Practice 相关性判断、自动触发、文件信号/意图识别、冷却策略或生产 Trigger Orchestrator。
- 不修改 #196 candidate 业务代码、#199 treatment 内容、#202 hard evaluator 或 #200 JudgeAgent。
- 不改变 task、starter、evaluator、JudgeAgent、model、prompt、budget、tool policy 或 condition identity；这些只能在规划澄清后作为已冻结输入引用。
- 不实现跨宿主适配，不执行真实模型调用，不创建正式 record，不将 candidate 升级为 suite revision。

## Decisions

### 1. 用显式三节点控制面，而不是时间或启发式触发

runner 将 delivery node 建模为版本化 union：`task_start`、`constraint_followup`、`first_implementation_checkpoint`。每个节点由 staged task script/adapter 的显式边界确认；节点未确认时不得提前投放，节点不支持时记录 `unsupported` 或 `indeterminate` 并 fail closed。这样保证对照只改变 delivery node，而不是改变 session、workspace 或等待时长。

备选方案是按墙钟延迟、Pi turn 数或 workspace 文件变化注入；这些方案无法证明用户约束已送达或首个实现检查点已经完成，并且属于 issue 明确排除的触发识别，因此不采用。

### 2. 通过单一 session controller 续接对话

adapter 只创建一次 Agent session。`task_start` 在首个 Agent 响应前交付；`constraint_followup` 先将 #196 task script 定义的用户补充约束送达，再在 Agent 继续响应前交付；`first_implementation_checkpoint` 在脚本收到明确 checkpoint acknowledgement 后交付。后续阶段使用同一 session id，任何新 session、session id 不一致或无法确认续接都视为 execution failure。

备选方案是把三个节点拆为三个独立 Pi 调用或把文本拼进初始 prompt；前者引入会话/上下文混淆，后者无法保持节点变量，均不采用。

### 3. runner 只消费 #199 的 frozen payload

runner API 接收已解析的 treatment manifest/payload reference 和 condition-scoped delivery declaration，先校验 Pack ref/version/commit、Practice ID、source/content/card hash 及 payload bytes，再执行节点投放。Lore CLI、semantic model、query/rerank 和 fallback selection 不得出现在 runner execution path。

备选方案是在每个 condition 或节点调用 `lore query/get`；这会使 Pack 更新、索引状态或排序漂移混入 timing 结果，且违反 #199 的固定输入契约，因此不采用。

### 4. 公共 trace 与私有 audit sidecar 分层

私有 sidecar 保存每次 delivery 的 session、stage、condition、固定 treatment identity、Pack provenance、Practice/body hash、节点确认和 outcome；Agent/public trace 只保留实现 runner 所需的最小 stage/condition/treatment-version/status 信息。两种输出都禁止 Practice 正文、private filesystem path、evaluator、oracle、scoring 和 Pack 全量内容；Practice ID、card hash 和完整 Pack provenance 仅存在 non-Agent audit sidecar。

备选方案是把完整 trace 直接写入 Pi stdout 或 Agent workspace；这会破坏 private/public 隔离，因此不采用。

### 5. 以独立 v1 contract 保留历史 runner 语义

新增 `staged-practice-delivery/v1` contract/types 与专用 adapter/测试，必要时在 `schemas/` 添加严格 schema。既有 `profile-diagnostic-runner`、two-stage helper 和已记录结果的 runner 行为不被重写；如果需要共享代码，使用向后兼容的 facade 或新版本 helper。

## Risks / Trade-offs

- **[Risk] Pi host 无法在某个节点提供可靠 acknowledgement。** → 将节点确认作为显式 adapter 协议；缺失时记录 `unsupported`/`indeterminate` 并停止，不静默提前或延后投放。
- **[Risk] 运行代码误把 treatment metadata 当成 Agent-visible 内容。** → 输入类型区分 payload 与 redacted trace，private sidecar 单独写入；增加 serialization/leakage tests。
- **[Risk] 同一 session 的续接语义在不同 Pi 版本变化。** → 固定 Pi v2 adapter/version 与 session id 校验；仅在契约测试通过的宿主路径启用，跨宿主保持 non-goal。
- **[Risk] #196/#199 的 frozen identity 与 runner plan 不一致。** → delivery 前做 candidate/treatment/snapshot/hash 全量 identity check，任何不一致 fail closed。
- **[Risk] 初始设计仍缺少节点 wire protocol 细节。** → 在开始实现前完成规划澄清，并把确认结果写回本 design/tasks；未决问题不通过实现门禁。

## Migration Plan

1. 从最新 `origin/main` 创建 `codex/pi-staged-practice-delivery-197`，先提交并建立只含本 OpenSpec artifacts 的初始 PR。
2. 在初始 PR 后确认规划问题：可观察节点边界、baseline defect/区分度、Practice 与等长无关对照、private acceptance、starter/source commit、model/prompt/budget/tool/blind boundary；将答案回写 issue #197 与本 change 的 design/tasks。
3. 按 tasks 顺序实现 contract、adapter、runner integration 和 offline tests；每个 benchmark code/schema 改动后运行 `bun run validate`。
4. 执行 focused contract tests、public/private audit、`git diff --check`，并按仓库双轮 review 规范分别留档 `ai-code-review` 与 `thermo-nuclear-code-quality-review`；不运行模型、不创建正式 record。
5. 若验证失败，保留 candidate/diagnostic 状态，仅在同一 PR 内修复本 change；不修改 #196/#199 的 frozen source 或已有结果。

## Open Questions

1. `constraint_followup` 的确认边界是否由 runner 发送一个脚本定义的 user turn 并等待 Agent 的下一次 continuation，还是由 Pi adapter 提供单独的 `send_user_message`/`continue` 原语？
2. `first_implementation_checkpoint` 的唯一 acknowledgement wire format 是什么？应由 task script 输出固定 sentinel、adapter 接收结构化事件，还是使用现有 staged driver 的回调；不得退化为文件/意图启发式。
3. P1 三个 timing condition 是否都使用 #199 固定的 retrieval treatment metadata，并仅以 delivery node 为变量；baseline 与未声明 condition 的 exact condition ids/声明格式是否沿用现有 staged plan convention？
4. 私有 audit sidecar 的持久化形状是否采用每次 delivery 一条 JSONL 事件加一次 attempt summary，还是只保留结构化 summary；公共脱敏 trace 是否需要包含 session id，还是仅包含稳定 session binding 状态？
5. 首个实现检查点之前允许的 Agent budget、tools、system/task prompts 和盲化边界是否完全复用 #196/#199 已冻结声明，还是需要在 #197 的 plan 中复制并 hash-bind 一份？

这些问题如果改变题面、Practice behavior、oracle/evaluator、treatment、environment 或结论解释，必须在实现前确认；不得由实现者自行假设。