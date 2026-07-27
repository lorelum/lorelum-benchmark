## Context

#89 扩展登录页 candidate 的单题方向性信号，但要求新 candidate 不能把 reference 的路径、命名
或单一错误表示伪装成 Practice。仓库已通过 #81 固化公开行为、注入 Practice、私有语义验收、
私有质量信号和实现偏好的五类信息边界；#94 已为本地实跑提供 Pi 与模型端点 preflight。

本 change 的首个提交只建立可审查的 OpenSpec。candidate 的技术栈、主题、可观察任务行为、
baseline 缺陷和质量 probe 若未确认，不得由实现者自行假设。

## Goals / Non-Goals

### Goals

- 选择 2-3 个可独立校准的 incubator candidate，扩大任务样本而不改变实验条件之外的变量。
- 使每个 candidate 都能证明：公开语义可以通过，而注册的 anti-pattern 会缺失相应 Practice
  质量信号。
- 保持 Practice 可迁移、public/private 隔离、职责等价实现可接受，以及候选快照可验证。

### Non-Goals

- 不运行 Pi、模型调用、retrieval、盲评或创建正式 record。
- 不修改 #75 登录页 candidate 或将任何 candidate 冻结为 suite revision。
- 不修改共享 runner、schema、正式 environment 或 treatment。

## Planning Gate

OpenSpec strict validation 与初始 PR 创建后、任何 candidate 文件创建前，需求方必须确认并将答案
写回 issue #89 与本 design/tasks：

1. 每个 candidate 的公开可观察行为、所属技术栈与 candidate 数量（2 或 3）。
2. 是否统一使用 React + Vite + TypeScript + Playwright 以控制混杂，或允许跨栈并明确其比较边界。
3. 每个 candidate 的相关 Practice 主题、等长无关对照，以及它们为何均不泄露 reference 偏好。
4. 每个 candidate 的预期 baseline/anti-pattern 缺陷、可区分性和可接受的职责等价实现。
5. 私有语义硬门槛、仅报告的质量 probe、reference/equivalent/anti-pattern calibration 与
   public/private 泄露审计。
6. 后续 #90/#91 执行所沿用的模型、提示、工具、预算、重复次数和盲评边界；本 change 不执行它们。

任何会改变题面、oracle、对照、评测、treatment、environment 或结论解释的未决项均阻止实现。

## Candidate Contract

在规划澄清后，每个 candidate 使用独立的 `incubator/practice-injection/<candidate-id>/` 目录：

- `public/` 只包含任务说明和 starter；题面只描述用户可观察行为和已声明公共接口。
- `private/` 包含 candidate 声明、条件清单、相关/无关 Practice、私有 evaluator、校准样例、
  oracle 和 snapshot；这些材料不能复制到 agent workspace 或公开日志。
- 质量 probe 只报告与 Practice 映射的职责信号，不将内部路径、helper 或命名作为通过条件。
- snapshot 覆盖候选输入；candidate 源、Practice、probe 或 calibration 变更后必须重新生成。

## Validation Plan

每个 candidate 在任何模型调用前完成：

1. reference 通过公开语义和质量 probe。
2. 职责等价实现以不同命名/布局/领域结果形式通过质量 probe。
3. 已登记 anti-pattern 或 naive starter 通过公开语义但失败质量 probe。
4. public/private 边界审计与 candidate snapshot 验证。
5. `bun run validate` 通过。

后续本地实跑由 #90 承接，且仅在 #94 preflight 成功后进行。

## Risks / Trade-offs

- 跨栈 candidate 能扩大适用性，但会混入工具链与任务复杂度差异；统一栈能控制混杂，但对
  Practice 的迁移性证据较弱。此项必须由规划澄清决定。
- 质量 probe 过度依赖静态结构会误测实现偏好；因此 reference、职责等价和 anti-pattern 三类
  calibration 是候选进入执行前的硬门禁。
- 候选过多会在方向性信号尚弱时分散校准成本；本 change 限制为 2-3 个。
