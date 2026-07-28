## Context

#89 扩展登录页 candidate 的单题方向性信号，但要求新 candidate 不能把 reference 的路径、命名
或单一错误表示伪装成 Practice。仓库已通过 #81 固化公开行为、注入 Practice、私有语义验收、
私有质量信号和实现偏好的五类信息边界；#94 已为本地实跑提供 Pi 与模型端点 preflight。

本 change 的首个提交只建立可审查的 OpenSpec。candidate 的技术栈、主题、可观察任务行为、
baseline 缺陷和质量 probe 若未确认，不得由实现者自行假设。

边界声明：本 change 消费 #100 定义的 `injection-calibration/v1` profile，不定义 profile
契约本身；candidate 的 kernel 声明依赖 #100 合并。

## Kernel/Profile Integration

#101 与 #102 已分别固定 track-agnostic kernel 和 `injection-calibration/v1`
runtime。#89 的两个 candidate 是该 profile 的首个真实消费者，必须在 candidate
declaration 中声明 `core: v1`、`profile: injection-calibration/v1` 和
`materializer_kind: react-vite`。

每个 `private/conditions.yaml` 必须使用 profile v1 的四个条件、真实 SHA-256 和
结构化 strict joint-pass decision rule；`private/practices/metadata.yaml` 必须列出所选
卡片的 ID、version、path 与 `practice-card/v1:utf8-rendered-characters` 实测长度。profile
会从卡片内容重新计量，拒绝过期 metadata。resolved snapshot 的 `profile_input_hash` 是
Practice、metadata 和规则的唯一公开可引用身份；Practice 文本和 `private/practices/` 路径
不得进入 snapshot files、workspace、日志或汇总。

source pin 采用两步：先提交不含生成物的 candidate source seed，再在 declaration/snapshot
提交中记录该 seed commit。不得使用不含 candidate 文件的 OpenSpec commit 作为 source pin。

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
3. 每个 candidate 的 `baseline`、`oracle-practice` 与 `irrelevant-practice` 三条件；baseline
   不注入 Practice，且无关对照按预先声明的固定计量方式等长，并说明它们为何均不泄露 reference
   偏好。
4. 每个 candidate 的预期 baseline 缺陷；public starter 必须在公开语义通过时缺失质量信号，以及
   独立 anti-pattern、可区分性和可接受的职责等价实现。
5. 私有语义硬门槛、仅报告的质量 probe、reference/equivalent/anti-pattern calibration 与
   public/private 泄露审计。
6. 后续 #90/#91 执行所沿用的模型、提示、工具、预算、重复次数和盲评边界；本 change 不执行它们。

任何会改变题面、oracle、对照、评测、treatment、environment 或结论解释的未决项均阻止实现。

## Candidate Contract

在规划澄清后，每个 candidate 使用独立的 `incubator/practice-injection/<candidate-id>/` 目录：

- `public/` 只包含任务说明和 starter；题面只描述用户可观察行为和已声明公共接口。
- `private/` 包含 candidate 声明、条件清单、相关/无关 Practice、私有 evaluator、校准样例、
  oracle 和 snapshot；这些材料不能复制到 agent workspace 或公开日志。
- `private/candidate.yaml` 必须声明 kernel/profile/materializer；`conditions.yaml` 和
  `practices/metadata.yaml` 必须能被 `injection-calibration/v1` resolver 校验。baseline 解析
  不得取得任一 Practice 文本；执行阶段只可按选定 condition 取得内存 payload。
- `private/conditions` 必须声明 `baseline`（不注入 Practice）、`oracle-practice`（只注入相关
  Practice）和 `irrelevant-practice`（只注入等长无关 Practice）。三条件必须使用同一 public
  snapshot、模型、系统提示、工具策略、预算、重复次数和干净工作区策略；除声明的注入内容外不得
  改变执行输入。
- 质量 probe 只报告与 Practice 映射的职责信号，不将内部路径、helper 或命名作为通过条件。
- snapshot 覆盖候选输入；其 resolved profile-input hash 绑定 Practice 输入。candidate 源、
  Practice、metadata、probe 或 calibration 变更后必须重新生成。

## Validation Plan

每个 candidate 在任何模型调用前完成：

1. reference 通过公开语义和质量 probe。
2. 职责等价实现以不同命名/布局/领域结果形式通过质量 probe。
3. public starter 通过公开语义但失败质量 probe，证明无 Practice 的初始输入可与 quality signal
   区分。
4. 已登记 anti-pattern 通过公开语义但失败质量 probe，证明 probe 能拒绝已知绕过。
5. public/private 边界审计与 candidate snapshot 验证。
6. `bun run validate` 通过。
7. profile resolver 校验通过，且完整 snapshot manifest 不含 `private/practices/` 路径。

后续本地实跑由 #90 承接。#90 必须以 profile-aware adapter 先验证 candidate snapshot 和
`profile_input_hash`，再对每个 condition 调用 condition-specific payload resolver；不得复用
#75 的非-kernel `run-local.ts` 作为 profile runner 回放。#94 当前的实现只覆盖登录页 candidate
的 preflight；#90 必须在首次 candidate 执行前复用或抽取同等语义，并验证失败时不会进入任一
candidate 的执行循环。

## Risks / Trade-offs

- 跨栈 candidate 能扩大适用性，但会混入工具链与任务复杂度差异；统一栈能控制混杂，但对
  Practice 的迁移性证据较弱。此项必须由规划澄清决定。
- 质量 probe 过度依赖静态结构会误测实现偏好；因此 reference、职责等价和 anti-pattern 三类
  calibration 是候选进入执行前的硬门禁。
- 候选过多会在方向性信号尚弱时分散校准成本；本 change 限制为 2-3 个。
