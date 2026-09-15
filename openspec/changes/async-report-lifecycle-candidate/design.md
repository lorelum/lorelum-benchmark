## Context

Issue #196 要求建立一个异步报表生命周期 candidate，作为 P1 timing MVP 的共同 starter 和公开会话脚本。当前主线已有 Pi v2 staged runner、通用 outcome contract 和 Practice-injection 候选布局，但没有一个能同时展示任务生命周期、分段进度、检查点暂停/继续、旧新版本并行及应用回退安全的异步报表任务。

本 change 只负责 candidate fixture 和公开任务情境。#197 的 delivery runner、#199 的 Pack-sourced treatment、#202 的 private evaluator、#200 的 JudgeAgent 以及 #201 的探索运行均不在本 change 内。candidate 继续放在 `incubator/`，不进入 active suite，不产生正式 record。

## Goals / Non-Goals

**Goals:**

- 建立 `incubator/practice-injection/async-report-lifecycle-v1/` 的可提交 candidate 目录。
- 提供仅由 `public/task.md` 与 `public/starter/` 构成的 Agent 起始输入，并使题面描述可观察的产品行为而不泄露 oracle、evaluator 或 Practice 内容。
- 将任务分成可被同一会话脚本驱动的阶段：初次检查与计划、用户补充兼容/回退约束、复查后实施和验证。
- 在 starter 中提供可观察的报表生命周期、分段进度与 checkpoint pause/resume 语义，并提供旧新 API/worker 并行及回退安全所需的公开上下文。
- 固定并记录一个明确的首个实现检查点，供后续 #197 runner 在同一 session 中投放 delivery。
- 保存 candidate 元数据、source commit 和不可变 snapshot；通过 public/private 审计、候选测试、`bun run validate` 和 `git diff --check`。

**Non-Goals:**

- 不实现 Practice 查询、Pack treatment、delivery runner、自动触发或生产 Trigger Orchestrator。
- 不创建 private evaluator/oracle/calibration/scoring；这些由 #202 和 #200 的独立 change 负责。
- 不运行模型、不创建正式 record、不冻结 suite task revision、不进入 `suites/`。
- 不把兼容/回退的完整验收清单写进 Agent 可见题面，也不允许通过实现结构偏好替代外部可观察语义。

## Decisions

### 1. Candidate 目录和公开起始输入

使用 `incubator/practice-injection/async-report-lifecycle-v1/`，其中 Agent 起始输入只包含：

```text
public/
  task.md
  starter/
```

`task.md` 同时承载公开目标、用户可观察约束和多回合脚本的可读阶段标记。`starter/` 是可运行的最小异步报表应用及其公开开发依赖。候选元数据和 snapshot 放在 `private/`，但不会被复制到 Agent workspace 或模型输入。

选择该布局而不是 `suites/`，因为 #196 只建立 candidate；选择把会话脚本与题面保持同源而不是另建 runner 私有脚本，是为了让后续 #197 能审计脚本定义的节点而不把隐藏约束交给 Agent。若 runner 后续需要机器可读的节点索引，应在 #197 的独立 contract 中消费公开脚本的声明，不在本 change 偷加 runner 语义。

### 2. 以外部可观察行为而非参考结构定义 starter

starter 的公开目标覆盖：

- 报表任务可排队、进入处理中并最终完成或失败；
- worker 分段处理并持久化进度；
- pause 只在 checkpoint 生效，resume 保留已完成进度；
- 旧版 API/worker 与新版应用代码可以在迁移窗口并行工作；
- 应用代码回退后，已持久化状态仍能被安全读取、继续或明确失败。

这些是产品语义；具体模块名、目录、类名和抽象层次不写进公开题面，也不作为 #196 的通过条件。后续 #202 必须用 reference/equivalent/negative 行为夹具证明 evaluator 能区分语义，而不是偏好某一种实现结构。

### 3. 固定多回合脚本和首个实现检查点

公开任务声明三个顺序阶段：

1. Agent 先检查 starter 并提出初步方案，不跳过计划阶段；
2. 用户补充“旧客户端与后台任务会并行、上线可回退”的事实，要求 Agent 复查原假设；
3. Agent 在复查后进入实现和验证。

candidate 必须显式命名一个位于第 2 阶段之后、完整实现/验证之前的首个实现检查点。该检查点必须有可审计的事件证据（例如第一项实现变更和对应的聚焦验证已经完成），但具体事件定义、消息格式和是否需要一个最小验证动作属于规划澄清门，未确认前不得写 starter 或 runner 实现。

### 4. 私有内容最小化

#196 的 `private/` 只保存 candidate identity、lifecycle、source commit、公开文件 snapshot 和后续 change 所需的最小 provenance。具体 semantic oracle、negative fixtures、scoring、calibration 和 treatment 正文不在本 change 创建，避免在尚未确认任务区分度前提前建立或泄露私有验收。

### 5. 不可变源码和候选生命周期

candidate 元数据记录 repository、source commit、version 和 snapshot manifest。任何改动 public task、starter 或候选契约的行为都会产生新的 candidate snapshot/revision，而不是覆盖已用于校准或运行的源码。当前版本保持 `candidate` 状态；即使候选测试通过，也不能自动升级为 pilot、suite revision 或正式 benchmark 产品。

### 6. 变更与后续 issue 的边界

- #199 只能消费 #196 稳定下来的公开任务和约束语义，并固定已发布 Pack Practice。
- #197 只能消费 #196 声明的脚本阶段和首个检查点，以及 #199 固定的 treatment metadata。
- #202 只能消费 #196 的外部行为契约，并在自己的 private 边界中创建 evaluator/oracle。
- #200 只能消费 allowlisted 的公开任务和最小公开证据摘要；不接触 #196 的 private 内容。

## Risks / Trade-offs

- [任务过于简单，无法区分“重审方案”和表面修改] → 保留真实的分段状态、迁移窗口、旧新并行和回退路径；在 #202 中使用 reference/equivalent/negative 行为夹具校准，无法区分时保持 candidate。
- [公开题面泄露完整兼容清单或 oracle] → 只描述用户可观察目标；在实现后执行 public/private 泄露审计，任何 evaluator/oracle/scoring 不进入 `public/` 或 Agent workspace。
- [首个检查点定义不清导致三种 timing condition 不可比] → 在规划澄清阶段冻结检查点的事件边界、可观察证据和失败处理，未冻结前阻断 fixture 实现。
- [旧新并行/回退语义被某一种参考目录结构绑死] → #196 只声明外部行为；结构偏好和实现目录不写进 oracle，#202 单独构造 equivalent/negative fixtures。
- [候选误升级为正式任务] → 元数据保持 `candidate`，不加入 suite manifest、不创建 record，并在 tasks 中设置生命周期门禁。
- [当前工作区存在无关未提交改动] → 本 change 从最新 `origin/main` 的独立 `codex/async-report-lifecycle-candidate` worktree 开始；不混入原工作区内容。

## Open Questions

以下问题必须在 strict validation 和初始 OpenSpec-only PR 创建后向需求方确认，并把答案写回本 change 的 design/tasks 与 Issue #196；确认前不得创建 candidate fixture 或任何模型运行：

1. 首个实现检查点的精确定义是什么：以哪一个实现事件、哪一个最小验证动作和哪一份可审计证据作为 `first_implementation_checkpoint`？
2. 公开 starter 的状态存储/worker 依赖是否接受 Bun/TypeScript 的本地内存加文件持久化实现，还是必须使用指定数据库/队列依赖？
3. 对旧新并行和回退安全，要求公开任务必须覆盖的最小用户可观察行为集合是什么；哪些行为只留给 #202 的 private fixtures？
4. MVP 的 baseline 预期缺陷和可区分度目标是什么：baseline 应在哪些行为上自然失败，且不能通过题面直接提示修复方案？
5. #199 treatment 选定后，#196 的公开任务是否采用默认 `practice-card` 形式；本 candidate 是否完全不物化 Practice 文本？
6. #201 需要的 baseline、相关 Practice、等长无关对照和三 timing nodes 的条件矩阵如何冻结；#196 只提供任务，不预先决定实验结论。
7. starter 的初始源码提交、运行时版本、依赖和锁文件的不可变来源是哪一个具体 commit？
