## Context

仓库目前有三处局部结果契约：`schemas/evaluator-result-v2.schema.json`（语义硬门槛 + 质量分/probe）、profile diagnostic runner 的 `DiagnosticEntry`（`evaluation_status`、`semantic`、`practice_observation`、派生 `joint_pass`）与 `schemas/run-record.schema.json` 的 `outcome`（`automated_checks_passed`、`quality_score`、`evaluator`）。这些契约各自演进，但没有一份仓库级文档统一回答：一次运行是否健康、功能是否完成、质量是否达标，以及 `joint_pass` 到底是什么。

登录页 candidate（#75）与后续 Practice 工作（#114/#118）已证明"质量信号失败 = 任务失败"和"非健康 evaluator 进入比较"都会扭曲结论。Issue #132 要求把 execution health、语义硬门槛、JudgeAgent 软评分和 `joint_pass` 的关系固定为仓库级契约，并规定它们在 evaluator、summary、record 中的表达。

本 change 只定义契约（schemas/docs/断言与测试），不实现 JudgeAgent provider，不修改登录 candidate 或 #91/#125 结果，不调用模型，不规定 reference 的文件路径、helper 名称或布局。

## Goals / Non-Goals

**Goals:**

- 定义 execution health 的成功、失败与不确定状态，并规定其不得由语义或质量结果推导。
- 定义公开产品语义为唯一任务完成硬门槛：`semantic=pass` 决定功能完成，质量分不得单独翻转任务完成状态。
- 定义 JudgeAgent/Practice 质量信号为独立软指标，含 `quality not-observed` 与 `judge unavailable` 状态。
- 规定 `joint_pass` 仅为派生报告字段，不得作为任务完成、health 或加权总分。
- 规定 evaluator result、summary、record 各自必须保留原始分数、probe 分值、计划分母与失败原因，禁止隐藏加权总分。
- 为 JudgeAgent 结果显式选择新版本 schema 或独立 sidecar；不静默扩展 `evaluator-result/v2`。
- 通过 schema 测试、`bun run test:pi:v2` 与 `bun run validate` 验证契约可执行。

**Non-Goals:**

- 不实现 JudgeAgent provider、不调用模型、不创建 candidate/snapshot/record。
- 不修改登录 candidate 或 #91/#125 结果，不改写冻结 evaluator helper 行为。
- 不规定 reference 文件路径、helper 名称、目录布局或实现偏好。
- 不改变 profile diagnostic 的既有健康/语义/观测分类语义，只统一其表达与报告规则。
- 不引入新的加权总分或把任何质量分并入任务完成判定。

## Decisions

### Execution health 是独立于语义与质量的健康维度

Execution health 表示"运行/评测链路本身是否可用"，与候选代码质量无关。状态为：

- 成功：evaluator/runner 进程正常完成并产出完整结构化结果（现有 `evaluated` / `completed`）。
- 失败：超时、启动失败、非零退出、invalid-output、not-executable（现有 `execution-failed`、`invalid-output`、`not-executable`）。
- 不确定：链路完成状态无法可靠判定（如依赖缺失、结果被截断、replay 不可用）——必须显式标记 `indeterminate`，不得静默归入成功或失败。

健康状态 MUST 只由运行链路证据决定，MUST NOT 从语义或质量结果推导。非健康/不确定尝试不得进入任何比较分母的通过/观测分子，但必须保留在计划分母中并单独计数。

### 语义硬门槛是唯一任务完成信号

任务功能完成由公开产品语义检查决定：`semantic=pass` 即功能完成；`semantic=fail` 即功能未完成。质量软评分（JudgeAgent 或 Practice probe）在任何情况下都不得单独把 `semantic=pass` 的运行翻转为失败，也不得把 `semantic=fail` 的运行翻转为通过。

### JudgeAgent/Practice 质量信号是独立软指标

质量信号状态至少包括：`observed`（观测到对应质量）、`not-observed`（有已校准负面证据）、`indeterminate`（无法可靠分类）、`not-run`（未执行）与 `judge-unavailable`（JudgeAgent 不可用/未产出）。`judge-unavailable` MUST 与 `not-observed` 区分：前者是评测资源缺失，不是候选质量问题。质量信号不得改变任务完成状态。

### joint_pass 是派生报告字段

`joint_pass` 只由 `semantic=pass` 且质量信号成立（`observed`）派生。它是报告/汇总层的派生值，不是 evaluator 的原始输入，不得参与任务完成判定，也不得作为 evaluator health 或加权总分。

### 保留原始分数、分母与失败原因；禁止隐藏加权总分

每个 `x/y` 必须可解释分子、分母与通过含义。分母保留计划运行次数；非健康/不确定尝试保留在分母并单独计数，不得静默剔除或改记为质量缺失。保留每个 probe 的 `points`/`max_points`、semantic check 的 `failure_reason` 与 quality 的原始状态。不引入任何把语义、质量、health 合并的隐藏加权总分。

### JudgeAgent 结果采用 sidecar（推荐）或新版本 schema

`evaluator-result/v2` 已被现有消费方与记录引用，其语义/质量结构稳定。新状态（如 `judge-unavailable`、JudgeAgent 软评分）若无法用 v2 表达，MUST 采用：

- 独立 sidecar schema（推荐）：新增如 `judge-result/v1`，与 `evaluator-result/v2` 并列存在，互不覆盖；或
- 新版本 schema：新增 `evaluator-result/v3`，v2 保持冻结。

禁止向 v2 静默追加字段或改变其语义。此决策在规划澄清阶段与需求方确认后落定；本 change 的 design/tasks 以 sidecar 为默认推荐，最终以确认记录为准。

### 文档与 schema 测试作为强制契约载体

`docs/BENCHMARK_PROTOCOL.md`、`docs/PRACTICE_BENCHMARK_GUIDE.md` 与 `docs/PI_RUNNER.md` 将按上述规则补充 outcome 契约章节；新 schema（按确认结果）附带 JSON Schema 断言测试与 runner/validator 聚焦测试，确保契约可执行、可回归。

## Risks / Trade-offs

- [现有消费方依赖 v2 形状] → 新状态走 sidecar 或新版本，v2 冻结，消费方可继续按原契约读取。
- [`judge-unavailable` 被误当 `not-observed`] → 状态枚举显式区分，schema 与报告模板分别呈现。
- [健康"不确定"被静默归入成功/失败] → 契约强制 `indeterminate` 显式标记并保留在分母计数。
- [加权总分悄悄进入报告] → 契约禁止任何隐藏加权总分；报告模板只允许原始计数与派生 joint_pass。
- [文档与 schema 脱节] → 每处规则同时落文档与 schema 断言测试，验证命令纳入 CI 清单。

## Migration Plan

1. 创建本 OpenSpec-only PR（仅 artifacts），引用 #132，通过 strict validation。
2. 进入规划澄清阶段，确认 JudgeAgent 结果表达方式（sidecar vs 新版本）与其余验收口径，写回 issue 与本 design。
3. 按确认结果新增/调整 schema 与 docs，添加断言与聚焦测试。
4. 运行 schema 测试、`bun run test:pi:v2`、`bun run validate` 与 OpenSpec strict validation，保留证据。
5. 不执行模型调用、不创建 record、不升级 candidate。

回滚：删除新增 schema/docs/测试即可恢复；不触碰 v2、冻结 helper 或历史记录。

## Open Questions

- JudgeAgent 结果采用新版本 schema 还是独立 sidecar？（推荐 sidecar，不修改 `evaluator-result/v2`。）
- execution health 的 `indeterminate` 是否需要在现有 profile diagnostic 枚举中新增，还是仅作为新 schema 的契约状态？（默认：仅新 schema 契约状态，不改变现有枚举。）
- `joint_pass` 的派生规则是否需要逐 task 声明质量信号成立条件？（默认：由 evaluator 输出的 quality 状态统一派生，无需逐 task 声明。）
