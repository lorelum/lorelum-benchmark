## Context

skill-trigger-orchestration 轨道（#96）在 r17c 达成发现层 3/3：agent 每次都自主完成
`docs_search → docs_open → policy_lookup` 完整查询链路并获得 `react.project-operation-authority`
约束。但三个 attempt 的公开语义测试全过、judge v2 全判不符合（43/41/40），根因是三者
只实现「距最近前台操作完成 >500ms」近似，缺失「启动时无前台在途」与「窗口从最近前台操作
启动时刻起算」。归档决策将采纳层移交 practice-injection 轨道，用显式注入去除「规则不可
推断 vs 采纳可观察」的测量冲突：Practice 是注入的处理变量，不依赖自主查询，可直接测完整
采纳。

## Goals / Non-Goals

**Goals:**

- 在 practice-injection 轨道新建 `async-operation-authority-v1`，用 `oracle-practice`
  注入通道验证采纳层「窗口起点 + 前台在途」完整语义。
- 复用 skill-trigger 的卡、judge v2、公开测试与校准资产，保持冻结资产不变。
- 形成 baseline / oracle-practice / irrelevant-practice 三条件区分度证据，全程
  diagnostic-only。

**Non-Goals:**

- 不修改 skill-trigger v4 的卡、judge v2、公开测试、校准矩阵或 snapshot。
- 不修改共享 judge provider 签名或 `src/benchmark/judge/providers.ts` 的 id。
- 不升级 suite revision、不创建正式 record、不调用模型。
- 不重写公共题面：复用 skill-trigger v4 的 Dashboard 场景与 `dashboard.spec.ts`。

## Decisions

### 生命周期与 profile

- 新建独立 candidate `async-operation-authority-v1`，`lifecycle_stage: candidate`，
  `injection-calibration/v2` profile + `react-vite` materializer。
- 三条件 baseline / oracle-practice / irrelevant-practice，`lorelum-retrieval` 显式
  unavailable；decision_rule 为 `joint-pass-count`，oracle 严格大于每个 control。

### 注入通道与隐私

- `oracle-practice` 用 `condition-scoped-private-runtime` + `practice-card/v1` 运行时注入
  `react.project-operation-authority` 卡；卡文本不物化进 agent workspace。
- `irrelevant-practice` 注入等长无关卡（rendered character 相对差 ≤10%），不提供可用约束。
- `baseline` 无注入。全部 Practice/对照卡位于 `private/practices/`，公开 task.md/starter
  不含 PX-47 规则正文。

### 采纳判定

- 公开语义测试通过 + judge v2 ≥90 视为完整采纳。
- 公开测试复用 `dashboard.spec.ts` 第 8 条「前台在途 + 后台协调」可观察回归，使近似实现
  在公开层即可失败。
- 对照组（baseline / irrelevant-practice）完整采纳判定应失败，形成区分度。

### 复用与校准

- Practice 卡、judge v2、公开测试与校准矩阵从 skill-trigger v4 复制进新 candidate；
  原始冻结资产保持逐字节不变。
- calibration base 复用 react-vite app-shell/v2 base，在 sets.yaml 显式声明跨 profile
  共享并绑定 digest（`injection-calibration/v2` 校验要求 base profile/materializer 匹配）。
- 校准矩阵沿用 reference 90+ / anti-pattern ≤75 / never-apply 失败，新增
  `injection-calibration/v2` 兼容 overlay 结构。

## Risks / Trade-offs

- [复用公开题面可能让 baseline 偶然通过] → 依赖校准矩阵的 baseline expectation 与对照组
  joint-pass 判定；若 baseline 通过，record 为 diagnostic-only 并单独讨论题面，不夹带改动。
- [judge v2 语义验收与公开测试口径不一致] → 以 judge v2 为语义验收，公开测试为可观察失败
  证据；两者同时满足才视为完整采纳，避免近似实现漏网。
- [injection-calibration/v2 的 react-vite base 共享需要 digest 绑定] → 在 sets.yaml 显式
  声明跨 profile 共享并绑定 digest，避免 profile 不匹配。
- [等长无关卡难以完全等价] → 以 rendered character 相对差 ≤10% 为门槛，并在 calibration
  中验证无关卡不提供可用约束。

## Migration Plan

1. 创建 issue #180、分支与 OpenSpec change；提交仅含 OpenSpec artifacts 的初始 PR。
2. 完成规划澄清并写回 #180 与 design Planning Confirmation；确认被测行为、对照组卡、
   私有质量门、模型/预算/盲评边界。
3. 创建 `incubator/practice-injection/async-operation-authority-v1/` 骨架并复制公开题面
   与私有 practices/evaluator/calibration。
4. 编写 private candidate/conditions/oracle/manifests，固定 judge v2 声明与注入通道。
5. 建立 calibration overlays 与 snapshot；运行 `bun run validate`、OpenSpec strict、泄露
   审计、`git diff --check`。
6. 用户授权后执行诊断性注入验证（不创建正式 record、不升级 suite）；终检冻结资产不变。

回滚：删除新 candidate 目录与 calibration overlays；OpenSpec delta 未归档前不改变 stable
specs。

## Open Questions

1. 被测行为是否严格限定为 skill-trigger v4 的 Dashboard 场景（不含 API 分层），还是需要
   额外场景？
2. 对照组等长无关卡采用哪张（复用现有 irrelevant 卡还是新建），预期失败口径为何？
3. 私有质量门是否只采用 judge v2 语义验收，还是需要附加 evaluator 探针？
4. 模型、提示、预算与盲评边界采用 practice-injection 最近先例（`deepseek-v4-flash`、
   10-25 分钟、5 次 repetition、盲评），还是按本候选调整？

## Planning Confirmation

待需求方在 #180 规划澄清中确认上述四项推荐口径后回写此处。
