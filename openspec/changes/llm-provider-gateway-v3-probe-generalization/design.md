## Context

#168 对冻结的 `llm-provider-gateway-v2` 跑出 `diagnostic-only`：joint-pass 为 baseline 0/3、oracle 1/3、irrelevant 1/3。逐 attempt 复核发现 `verify-provider-gateway-v2.ts` 仍用 policy/ledger 标识符集合做职责判定：oracle rep1/rep3 实际已集中执行政策，却因未命中固定名称被判 `not-observed`；irrelevant rep1 因偶然命名命中被判 `observed`。judge-agent/generic/v2 的 `policy-centralization` 反而显示 oracle 3/3 满分、对照各 1/3 满分。因此问题主要在探针对真实模型命名分布的泛化不足，而不是模型完全不接受 Practice。

## Goals / Non-Goals

**Goals:**

- 把“结构探针名称无关 + 真实命名变体校准”从设计意图固化为 stable capability。
- 创建独立 `llm-provider-gateway-v3`，用泛化探针修复 v2 的假阴/假阳，并保持公开题面可对照。
- 把同一证据原则写进 judge criterion rationale 规范。
- 建立可确定性重放的 private naming-variant 回归矩阵。

**Non-Goals:**

- 不修改 v1/v2、其 snapshot 或 #168 diagnostic 结果。
- 不重写共享 evaluator helper；v3 使用 candidate-local private evaluator。
- 不执行模型调用、不创建正式 record、不升级 suite revision。
- 不把 judge 作为唯一 oracle，不引入隐藏加权总分。

## Decisions

### 生命周期

- v2 已有本地诊断结果，按任务生命周期冻结；所有探针、evaluator、calibration 与 snapshot 修复落在 `llm-provider-gateway-v3`。
- v3 只进入 `incubator/`；后续三条件 pilot 和 suite 升级另立 issue。

### 通用规范落点

- 新增 stable capability `practice-structure-probe-calibration`，作为所有候选结构探针的跨任务执行规范。
- 同时给 `judge-agent-rubric-scoring` 增加 evidence-based rationale 要求，防止 judge 也通过名称相似性给分。
- 不修改 `practice-injection-candidate-v2`、`llm-provider-gateway-v2-practice-candidate` 或 `judge-agent/generic/v1/v2` 已冻结对象。

### v3 公开输入

- 首选方案：v3 的 `public/task.md/starter/tests/docs` 复刻 v2 的公开行为契约，仅让 candidate id、snapshot 与 private 材料不同。这样唯一因变量是探针/校准，能直接判断修复是否把诊断结论从 `diagnostic-only` 改成可验证的方向信号。
- 若规划澄清要求同时改题面，必须拆成独立 change 或在 design 中显式记录题面变化，不能在 probe 修复中夹带。

### 结构探针实现方向

- 首选方案 A：以 import graph + 数据流/所有权证据分类，不依赖精确标识符。
- 分类基座：
  - `handler/server`：公开 `/api/chat` 与 `/api/usage` 路由。
  - `adapter/transport`：持有 fetch/SSE 与供应商 wire 字段映射。
  - `policy`：被 handler 调用的非 transport 模块，持有 retry/fallback/budget/idempotency/执行状态，并调用 adapter。
  - `ledger`：唯一持有 usage record 写入、聚合查询、预算预占/结算状态的非 adapter 模块。
- 命名只作为 optional hint，不能单独决定通过；hint 命中的同时必须找到结构证据。示例：识别 `tryReserve/settle/logRecord` 等价行为时，要求模块被 handler 依赖、不包含 fetch、持有 usage/budget state，并实际被 handler 调用。
- 若后期实现发现纯 AST 无法稳定处理 TypeScript 控制流，允许在 candidate-local evaluator 中做受限的编译/语义分析，但不得引入模型调用或共享 helper 改动。

### calibration fixtures

- 保留 v2 的 public-starter、reference、equivalent、type-based、docs-present 与 anti-pattern 基线。
- 从 #168 的已保存 attempt 提炼并 sanitize 为 private overlays，不提交 workspace/log/diff：
  - `oracle-naming-variant-a`：oracle rep1 的 `Gateway` 集中政策与 `logRecord/makeRecord` 账本变体，预期 `pass/observed`。
  - `oracle-naming-variant-b`：oracle rep3 的 `recordUsage` 与集中执行政策变体，预期 `pass/observed`。
  - `irrelevant-naming-collision`：irrelevant rep1 的 `reserveBudget/settleBudget/retryAttempts` 命名碰撞，预期 `pass/not-observed`。
  - `ledger-naming-variant`：以不同命名承担 usage/latency/cost/tenant/trace 聚合的边界账本，预期 `pass/observed`。
  - 可选 `baseline-good-structure`：baseline 中语义通过但政策未完全集中或账本散落的样例，预期按复核标签固定。
- 这些变体必须由需求方确认标签后写回 issue/design；judge v2 的 criterion 证据只作复核输入，不作唯一 oracle。

### 评分与决策

- semantic 仍由公开 `bun run test` 决定。
- `practice_observation` 由 v3 泛化探针决定。
- `joint_pass = semantic=pass && practice_observation=observed`，不引入加权或 judge 覆盖。
- judge-agent/generic/v2 仅 soft sidecar，rationale 必须证据化；未通过命名变体校准时不支撑方向性结论。

## Risks / Trade-offs

- [纯 AST 仍可能误分类动态调用或不同模块组织] → 用真实输出变体回归包兜底；无法稳定分类时返回 `indeterminate`，阻止模型比较。
- [把真实模型输出提交进 calibration 可能带入私有泄露] → 只提炼 `src/` 与 fixture 所需结构，放 `private/calibration/`，不进入 workspace/prompt，并跑泄露审计。
- [v3 复用公开题面仍无法让 baseline 与 irrelevant 自然分布干净] → 这正是下一阶段诊断对象；若结果仍收敛，需单独讨论改题面，不在本 change 内夹带。
- [修改 judge spec 影响所有 judge 用户] → 只新增 evidence-based rationale 要求，不修改既有 provider/契约；用 v2 gateway 与既有 candidate regression 验证。

## Migration Plan

1. 创建 issue #172、分支与 OpenSpec change；提交仅含 OpenSpec artifacts 的初始 PR。
2. 完成规划澄清并写回 #172 与本 design；确认 v3 public input 是否复刻、命名变体标签与 judge 规范边界。
3. 实现通用 capability 的 private regression 契约与 v3 candidate 骨架。
4. 实现 v3 probe/evaluator、naming-variant calibration overlays 与 snapshot。
5. 增加 judge spec 证据测试与 v3 calibration 回归；运行 `bun run validate`、OpenSpec strict、泄露审计、`git diff --check`。
6. 终检 v1/v2 不变、无模型调用、无 record、无 suite 升级。

回滚：删除 v3 目录与新 calibration overlays；OpenSpec delta 未归档前不改变 stable specs。

## Open Questions

1. v3 是否完全复刻 v2 公开题面，只替换 private probe/calibration/snapshot？
2. naming-variant fixture 的复核标签采用“人工复核 + judge criterion 证据”，还是只采用人工复核？
3. 通用规范新增独立 capability 是否被需求方接受，还是必须直接改 `practice-injection-candidate-v2`？

## Planning Confirmation

2026-08-14，需求方在 #172 规划澄清中确认三项推荐口径：

1. v3 完全复刻 v2 的公开 `task.md/starter/tests/docs`；candidate id、snapshot 与 private probe/calibration/snapshot 身份不同，以隔离题面变化与探针变化。
2. naming-variant fixture 的预期标签采用“人工复核 + judge criterion 证据”复核；人工复核是最终 oracle，judge v2 证据仅用于解释与二次核对，不得单独决定标签。
3. 新增独立 capability `practice-structure-probe-calibration`；不把该规范塞入 `practice-injection-candidate-v2`，也不修改既有冻结 capability。
