## Context

仓库级硬/软门槛契约（#132）、JudgeAgent 能力（#133）已合并到 main；
登录页 candidate `login-page-auth-flow-v1`（#135，PR #141）已合入，其 private
calibration 已建立 `sets.yaml`（reference/equivalent/anti-pattern 覆盖层）与
`calibration.md`，语义硬门槛与分层质量信号（`verify-layering.ts` 结构检测）已
就位。

Issue #136 要求：为登录页设计版本化 JudgeAgent rubric，把质量判断从隐藏实现偏好
中分离出来，并证明 JudgeAgent 对职责等价实现与反模式有区分度。仓库级
`src/benchmark/judge/` 已提供 provider 接口、`buildJudgeInput`（path-level
allowlist + 私有标记拒绝，fail closed）、确定性 mock provider 与
`judge-result/v1` sidecar 契约（provenance 必填：judge model/version、prompt
hash、rubric hash、input hash、状态、维度分数、理由、confidence）。

## Goals / Non-Goals

**Goals:**

- 定义登录页版本化 rubric（独立文件 + rubric hash）与维度分值：API/页面职责
  边界、状态处理、表单体验、UI/UX；描述不绑定文件名、目录或 helper。
- Judge 输入只含公开材料；完成输入脱敏审计，确保不含 condition、Practice
  文本、Oracle 或 private evaluator。
- 用 reference、不同命名/目录的职责等价实现、反模式与边界样例做离线校准
  （mock provider，不调用真实模型），并给出锚点与区分度口径。
- 固定 rubric hash、input hash、judge model/version 与评分重复策略。
- 明确 judge unavailable、低 confidence、评分分歧的报告方式。
- 通过 rubric/schema 校验、输入脱敏审计、judge mock 测试与 `bun run validate`。

**Non-Goals:**

- 不修改仓库级 JudgeAgent 引擎（`src/benchmark/judge/`、`judge-result/v1`
  schema 或 `evaluator-result/v2`）。
- 不把 rubric 分数变成功能硬门槛；judge 只产生软质量信号。
- 不执行三条件 pilot；不创建正式 record；不修改已有登录 candidate v1 结果。
- 不调用真实模型。

## Decisions

### 版本化 rubric 文件与 hash 固定

按 #133 决议，rubric 以独立文件 + rubric hash 引用。登录页 rubric 放
`incubator/practice-injection/login-page-auth-flow-v1/private/judge/rubric-v1.yaml`，
版本号 v1；内容含维度、max_points、评分锚点说明。rubric hash 用 sha256 固定，
在 judge 记录（`judge-result/v1` 的 `rubric_hash`）中引用。

### 维度与分值

rubric 覆盖 issue 要求的四个质量维度，描述使用结构特征与可观察行为，不绑定
任何文件名/目录/helper 命名：

- `api-page-boundary`：API/页面职责边界——组件不直接处理传输/原始响应，边界
  模块负责 transport 与错误状态翻译（与现有 `verify-layering.ts` 结构检测一致）。
- `state-handling`：状态处理——提交中/成功/失败反馈、防重复提交、错误可见。
- `form-experience`：表单体验——校验、提交期间禁用态、可访问性基础、防重复
  提交。
- `ui-ux`：UI/UX——布局、反馈可见性、可访问性。

每个维度给 `max_points` 与评分锚点说明；总分仅作为软信号报告，不翻转任务完成。

### Judge 输入脱敏与审计

Judge 输入构造沿用 `buildJudgeInput`：只允许 `public/task.md`、
`public/starter/`、candidate diff/source 与显式声明的公开运行材料；`looksPrivate`
拒绝 condition/Practice/Oracle/private evaluator/calibration 标记，fail closed。
实施时执行一次输入脱敏审计：构造 judge 输入 bundle 并断言不含私有标记、路径
均位于 public 根。

### 离线校准矩阵

在 candidate 的 `private/calibration/` 下扩展 judge 校准 fixtures/sets：

- `reference`：语义 pass + 分层/质量良好 → 高锚点。
- `equivalent`：不同命名/目录结构的职责等价实现 → 与 reference 相近判断
  （区分度容差内）。
- `anti-pattern`：组件直接处理传输/原始响应、无状态处理 → 可解释的较低分。
- `boundary`：边界样例（部分满足、命名不同但结构等价）→ 判断一致、可解释。

使用确定性 mock provider 离线执行，不调用模型。锚点分数不稳定时，标记 rubric
需修订，不进入 pilot。

### 评分重复策略（待规划确认）

issue 待确认问题：单次评分、多次取中位数或固定小 panel。默认推荐多次取中位数
（n=3，mock 下确定性可复现）；最终口径由需求方确认后写入 rubric/plan。

### 报告口径

沿用 `judge-result/v1`：`judge-unavailable`（判分资源未产出信号）与
`not-observed`（有已校准负面证据）严格区分；低 confidence 与评分分歧在 sidecar
中记录 reason 与各次得分，不改写语义硬门槛与 `evaluator-result/v2`。

## Risks / Trade-offs

- [维度描述绑定命名] → rubric 用结构特征与可观察行为描述；校准含不同命名/目录
  的 equivalent fixture，验证无路径/命名依赖。
- [judge 从输入推断 condition] → 输入脱敏审计 + allowlist；审计断言输入 bundle
  不含私有标记。
- [锚点不稳定] → 多次取中位数 + 锚点容差；不稳定则标记 rubric 修订，不进入
  pilot。
- [把分数当硬门槛] → 沿用 #132/#133 契约：judge 只产生软信号，不改任务完成。

## Migration Plan

1. 创建本 OpenSpec-only PR（仅 artifacts），引用 #136，通过 strict validation。
2. 规划澄清：确认评分重复策略（单次/多次中位数/固定 panel）、锚点与区分度容差、
   低 confidence 与分歧报告口径；不写回 issue 评论，答案写回本 design。
3. 实现 rubric 文件、输入脱敏审计、校准 fixtures/sets 与 judge mock 测试；
   持续提交到同一 PR。
4. 运行离线校准矩阵、输入脱敏审计、rubric/schema 校验、`bun run validate`，
   保留证据。
5. 不执行模型调用、不创建 record、不升级 candidate；评审通过后再由独立
   calibration/pilot 承接。

回滚：删除新增 rubric/校准 artifacts 即可；不触碰 `src/benchmark/judge/`、
`judge-result/v1` 与已有 candidate v1 结果。

## Open Questions

- 评分重复策略：单次评分、多次取中位数，还是固定小 panel？
- reference 与 equivalent 的允许偏差（区分度容差）以及 anti-pattern 应低多少
  （锚点与区分度口径）如何界定？
- 低 confidence 阈值与评分分歧的报告口径（多次评分差异大于多少视为分歧）？

## Resolved Questions

- 评分重复策略：确认采用 deterministic mock provider 的 n=3 次评分取中位数，
  已固化到 `rubric-v1.yaml`（repetition.count=3 / aggregate=median）。
- 锚点与区分度口径：reference 总分 >= 80；equivalent 与 reference 差值 <= 10；
  anti-pattern 总分 <= 50 且比 reference 低 >= 25；boundary 不要求固定分数，
  只要求分类与理由稳定。
- 低 confidence 与分歧口径：confidence < 65 记为低 confidence；三次评分
  spread > 15 记为分歧，分歧时 sidecar 状态为 `indeterminate` 并记录各次分数
  与原因（不伪造低分）。
- 被测行为：保持四个质量维度（API/页面职责边界、状态处理、表单体验、UI/UX）；
  baseline 预期缺陷仅限职责边界与状态反馈不足，不把命名、目录或 helper 结构
  当作缺陷（评分器为结构检测，不依赖固定命名）。
- 对照：只校准 reference、不同命名/目录的 equivalent、anti-pattern、boundary
  四类 private fixture，不新增 unrelated Practice 对照。
- 复用边界：继续使用现有 candidate 的 public starter、private semantic
  evaluator 与 `judge-result/v1`；不修改 starter、现有 evaluator、snapshot 或
  正式 record。
- 模型边界：只使用 deterministic mock（固定 prompt、mock-judge@0.1.0、离线），
  不调用真实模型、不进入 default suite、不创建 pilot/formal record。

## Planning Confirmation

Requirements owner confirmed the full planning scope through task conversation
and plan-mode questions (no issue comment on #136):

- ④ 被测行为：四个质量维度（API/页面职责边界、状态处理、表单体验、UI/UX）；
  baseline 预期缺陷仅限职责边界与状态反馈不足，采用结构检测，命名/目录/helper
  差异永不扣分。
- ⑤ 对照范围：只校准 reference、不同命名/目录的 equivalent、anti-pattern、
  boundary 四类 private fixture，不新增 unrelated Practice 对照。
- ⑥ 复用边界：继续使用现有 candidate 的 public starter、private semantic
  evaluator 与 `judge-result/v1`，不修改 starter、现有 evaluator、snapshot 或
  正式 record。
- ⑦ 模型边界：保持 issue 范围 **mock-only**（固定 prompt、mock-judge@0.1.0、
  离线）；不调用真实模型、不进入 default suite、不创建 pilot/formal record；
  真实模型对 rubric 的实际区分效果留到 pilot 阶段验证。
- ⑧ 独立审查：需要独立 AI 审查门禁（参照 #135），审查 rubric 维度路径无关性、
  校准矩阵区分度、输入脱敏与无 condition 推断；pass-or-fix 记录进 PR 证据链。

实现按 tasks.md 推进并持续提交到同一分支与 PR #142。
