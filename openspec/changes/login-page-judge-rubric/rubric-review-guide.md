# 登录页 JudgeAgent rubric / 校准独立审查指南

## 用途与门禁

本 change（#136）为登录页 candidate（`login-page-auth-flow-v1`）设计版本化
JudgeAgent rubric、输入脱敏审计与离线校准矩阵。本指南供独立 AI 执行
pass-or-fix 审查；全部 fix 清零后 change 才可进入 pilot。审查记录写回本文件
「审查记录」与 PR 证据链。

本指南是公开 artifact，**不包含**私有阈值、校准分数或私有路径内容；审查者按
「审查输入」自行读取私有材料与运行只读命令。

## 审查输入（只读）

- 候选私有 judge 目录：`incubator/practice-injection/login-page-auth-flow-v1/private/judge/`
  （`rubric-v1.yaml`、`rubric.ts`、`score.ts`、`aggregate.ts`、`input-audit.ts`、
  `calibrate.ts`、`judge.test.ts`）
- 校准集合：`private/calibration/sets.yaml`（`login-page-judge/v1`）与
  `private/calibration/sets/login-page-judge/v1/overlays/`（anti-pattern / boundary）
- 校准矩阵（只读运行）：
  `bun run src/benchmark/kernel/kernel.ts calibrate incubator/practice-injection/login-page-auth-flow-v1 --output <scratch 空目录>`
  （两 role；judge 矩阵由 `private/judge/calibrate.ts` 输出 JSON）
- 脱敏审计（只读运行）：
  `bun run incubator/practice-injection/login-page-auth-flow-v1/private/judge/input-audit.ts`
- 聚焦测试（只读运行）：
  `bun test incubator/practice-injection/login-page-auth-flow-v1/private/judge`

## 审查者提示词

你是一名独立评审员，负责对 Lorelum Benchmark 仓库 #136 的登录页 JudgeAgent
rubric 与离线校准做 pass-or-fix 审查。你**不修改任何文件**，只做只读检查与
只读命令运行，最后输出结构化审查报告：逐条检查项结论（pass / fix）、fix 清单
（问题、证据、建议修复）、总体结论（pass 或 fix 未清零）。全程不调用外部模型、
不联网、不创建正式记录。

## 检查清单

1. **Rubric 维度与分值**
   - 维度覆盖 API/页面职责边界、状态处理、表单体验、UI/UX。
   - 描述使用结构特征与可观察行为；不出现文件路径、文件名、目录布局或 helper
     名（路径/命名无关）。
   - 各维度 max_points 合计 100；职责边界与状态处理权重不低于表单与 UI/UX。
2. **评分器实现**
   - 确定性、离线，不调用模型。
   - 结构检测不依赖固定命名：不同命名/目录的职责等价实现应得到相近判断。
   - 输出符合 `judge-result/v1`（`assertJudgeResultV1` 通过、provenance 完整：
     judge id/version、prompt/rubric/input hash、维度分数、理由、confidence）。
3. **校准矩阵区分度**
   - reference 与 equivalent 判断相近（容差内）。
   - anti-pattern 明显更低且理由可解释（例如组件直接处理 transport/原始响应、
     无状态反馈）。
   - boundary 样例判断稳定、理由一致；锚点不稳定时应标记 rubric 修订。
4. **输入脱敏**
   - judge 输入只含公开材料（task.md、public starter、candidate diff/source、
     显式声明的公开运行材料）；不含 condition、Practice、Oracle、private
     evaluator、calibration 标记。
   - 私有标记或越权路径 fail-closed。
5. **无 condition 推断**
   - 从 task.md、starter、candidate diff 无法推断 condition 或 Practice 标识。
6. **报告口径**
   - `judge-unavailable` 与 `not-observed` 严格区分；低 confidence 与评分分歧
     有明确记录方式（不伪造低分）。

## 审查记录

### round 1（2026-08-04，独立评审子代理）

- 日期 / 审查者 / 结论：2026-08-04 / 独立评审员（与实现者分离）/ round 1 发现
  3 项 fix（P1、P2、P3），已全部修复并验证，**fix 清零**。
- 只读命令：`bun test private/judge` 修复前 11 pass、修复后 13 pass；
  `input-audit.ts` 通过（fail_closed_negative_checks 为空）；judge 校准矩阵
  passed（reference=100 / equivalent=100 Δ=0 / anti-pattern=29 gap=71 /
  boundary=51，全部 observed、无分歧、无低 confidence）。

fix 清单与处理：

1. **Fix-1（P1）状态变量命名硬绑定**：评分器原硬编码 `submitting`/
   `setSubmitting`，等价实现改名为 `isPending` 即掉 30 分。修复：从
   `useState(false)` 解构捕获状态 flag 名（setter 置 true 者优先），
   `disabled`/`aria-busy`/防重复/finally 重置均用捕获名匹配；login-page-judge
   集合的 equivalent fixture 改为 `isPending`/`setPending` 改名变体；新增回归
   测试。修复后矩阵 equivalent=100（Δ=0）。
2. **Fix-2（P2）import 别名/扩展名敏感**：`resolveImport` 增加 `.js`/`.jsx`/
   index 候选；未解析的项目 import（`./` 或 `@/`）且组件不 fetch、不读原始
   响应时按边界委托处理（30 分，不再误判为 15）；新增别名 import 回归测试。
3. **Fix-3（P3）多 `<form>` 组件选择**：`scoreDimensions` 优先选择带 onSubmit
   的组件文件，避免共享 Form 组件被误选。

- 全部 fix 清零；锚点分数稳定（确定性 mock，spread 恒为 0），本 change 不进入
  pilot；真实模型对 rubric 的实际区分效果留到 pilot 阶段验证。

