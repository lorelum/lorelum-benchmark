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
- practice-card 正文写入一次性 OS temp 文件，Pi argv 只传该文件路径；Pi 退出后删除临时
  文件。公开 trace 只记录 practice id/version/hash，不记录正文或 temp 路径。
- `irrelevant-practice` 注入等长无关卡（rendered character 相对差 ≤10%），不提供可用约束。
- `baseline` 无注入。全部 Practice/对照卡位于 `private/practices/`，公开 task.md/starter
  不含 PX-47 规则正文。

### 本地诊断隔离

- 本地 profile diagnostic 用显式 Pi extension 替换内置工具。文件型工具将请求路径解析到
  真实路径并拒绝 workspace 外目标或外部 symlink；bash 仅允许固定依赖、测试、构建命令。
- 该 extension 是诊断执行边界，不改变 candidate 公开题面、practice 内容、judge 语义或
  scorer；条件间工具能力保持一致。
- `bun run test` 由 extension 在 app/ 下以外部 vite server + `PLAYWRIGHT_BASE_URL` 运行，
  规避 Windows 上 playwright 无法回收 bun→vite 进程树导致的挂起；`bun install`/`bun run
  build` 同样定向到 app/。
- 诊断 evaluator 的 web server 直接以 node/vite 单进程启动，stop 用 TerminateProcess
  兜底，避免 taskkill 被沙箱拒绝后端口无法释放（`evaluator-cleanup-unverified`）。

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
- [本地 Pi 可用宿主 shell 访问 private] → 禁用内置工具并启用 workspace-confined
  extension；诊断后再审计 argv、workspace 与 trace。
- [等长无关卡难以完全等价] → 以 rendered character 相对差 ≤10% 为门槛，并在 calibration
  中验证无关卡不提供可用约束。

## 诊断结果（r5/r6，diagnostic-only）

- r5（2026-08-21）：9/9 attempts `execution-failed`，全部为 DeepSeek 账户周配额 429
  （GoUsageLimitError），agent 未产生任何实现；证据 `scratch/async-operation-authority-diagnostic-r5/`。
- r6（2026-08-24，更换 API key 后重跑）：9/9 attempts 全部 `evaluated`，证据
  `scratch/async-operation-authority-diagnostic-r6/summary.json`。
- 结果：baseline / irrelevant-practice / oracle-practice 各 3 次全部 judge v2=100 +
  公开测试通过 + practice_observation=observed；oracle_deltas（baseline 与
  irrelevant-practice）raw=0、bootstrap 95% CI=[0,0]，零区分度。
- 结论：candidate 未达验收口径（baseline / irrelevant-practice 应失败），不具区分度。
  注入机制本身正常：irrelevant-practice 卡被 agent 看到并忽略；oracle 卡经一次性私有
  temp 文件路径注入，argv/trace 无卡正文。根因是公开 `dashboard.spec.ts` 完整编码了
  PX-47 的可观测行为（测试 7/8 以 600ms/200ms 界定静默窗口，测试 5/6 编码陈旧前台
  结果丢弃与后台失败静默），无实践卡亦可测试驱动复现，故 baseline / irrelevant-practice
  同样完整采纳。公开 task.md 仅声明「符合 PX-47，规范正文作为项目资料提供，请勿假定其
  内容」，不含规则正文，public/private 边界未破坏。
- 处置：candidate 不升级；需任务重设计（目标行为不可仅由公开测试推导，例如将窗口语义
  改为无法从测试边界推断的私有规则）后重新执行三条件诊断。全程未创建正式 record、未
  升级 suite revision。
- 决策（2026-08-24，需求方）：放弃本诊断方向，采纳层测量暂停。candidate 不重设计、不升级，
  不再投入；回到 skill-trigger 原任务（t100237 系列）核心交付收尾。#180/#181 按决策关闭，
  本 change 归档；分支上保留的 runner/extension 修复（temp 文件注入、workspace-confined
  工具、进程清理）供未来诊断按需复用。
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

2026-08-19，需求方在 #180 规划澄清中确认四项推荐口径：

1. 被测行为严格复用 skill-trigger v4 的 Dashboard 场景（后台协调 + 前台导航/重载 +
   500ms 窗口），不改公开题面，唯一因变量是「注入通道下的采纳」。
2. 对照组复用 skill-trigger v4 现有 `irrelevant.form-validation.v1` 卡（已等长、已校准，
   语义无关），不新建无关卡。
3. 私有质量门只采用 judge v2 语义验收（reference_min=90）+ 公开测试通过，不引入额外
   结构探针；evaluate.ts 以公开测试语义作为 practice_observation 证据，政策符合性由
   judge v2 判定。
4. 模型/预算沿用 practice-injection 最近先例：`deepseek/deepseek-v4-flash`、25 分钟、
   5 次 repetition、盲评（judge 只看 diff 不看 condition），全程 diagnostic-only。
