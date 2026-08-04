## Why

Issue #136：仓库级 JudgeAgent（#133）只提供通用软评分能力（provider、输入脱敏、
provenance 与 `judge-result/v1` sidecar），登录页 candidate（#135）还没有自己的
版本化质量 rubric 和 private calibration。需要把登录页质量判断从隐藏实现偏好中
分离出来，并证明 JudgeAgent 对职责等价实现与反模式有区分度，而不是评价
reference 路径。

## What Changes

- 新增登录页版本化 rubric（独立文件 + rubric hash），定义质量维度与分值：
  API/页面职责边界、状态处理、表单体验和 UI/UX；维度描述不绑定文件名、目录或
  helper。
- Judge 输入只使用公开材料（`public/task.md`、`public/starter/`、candidate
  diff/source 与显式声明的公开运行材料）；完成输入脱敏审计，确保输入不含
  condition、Practice 文本、Oracle 或 private evaluator。
- 在登录页 candidate 的 private calibration 下新增 judge 校准矩阵：reference、
  不同命名/目录的职责等价实现、反模式与边界样例；使用确定性 mock provider 离线
  执行，不调用真实模型。
- 固定 rubric hash、input hash、judge model/version 与评分重复策略。
- 明确 judge unavailable、低 confidence 与评分分歧的报告方式，沿用
  `judge-result/v1` sidecar 契约，不改写语义硬门槛。

## Capabilities

### New Capabilities

- `login-page-judge-rubric`: 定义登录页版本化 rubric 的维度与分值、provenance
  固定、输入脱敏审计、离线校准矩阵，以及 judge unavailable/低 confidence/分歧
  的报告口径。

### Modified Capabilities

- 无（不修改仓库级 JudgeAgent 引擎或 `judge-result/v1` 契约）。

## Impact

- Candidate private：`incubator/practice-injection/login-page-auth-flow-v1/private/judge/`
  （rubric 文件 + hash）与 `private/calibration/`（judge fixtures/sets）新增。
- 校验：rubric/schema 校验、输入脱敏审计、judge mock 测试、离线校准矩阵、
  `bun run validate`；不调用真实模型。
- 范围：#136。不修改 `src/benchmark/judge/` 引擎与 `judge-result/v1` schema、
  不修改登录页 candidate v1 已有结果、不执行三条件 pilot、不创建正式 record。
