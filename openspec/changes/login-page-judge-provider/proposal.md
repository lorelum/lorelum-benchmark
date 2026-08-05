## Why

v2 judge（#144）是确定性 AST 判分器，已作为共享 helper 位于
`src/benchmark/judge/practice-layered-api/v2/`，但未接入 runner 的 judge
provider：诊断 pilot（#137 及 #145 的 smoke）只有 semantic + practice_observation，
无法在 runner 内显式选择 v2、产出 v2 judge-result/v1 sidecar，也没有 SourceMap
构造契约与 indeterminate 协议。登录页复测要用 v2 做主评分，需要这条通道。

## What Changes

- 在 `src/benchmark/judge/` 增加 `practice-layered-api/v2` judge provider（包装共享
  v2 scorer），加入 provider 注册表；`mock-judge` 保持默认。
- 定义 SourceMap 构造契约：从候选 workspace/app 收集文件（排除生成目录）、按键
  排序、规范序列化 candidate_diff —— 同一候选无论文件遍历顺序如何结果一致。
- 接线诊断 runner：评估后运行候选声明的 judge provider，每个 attempt 写
  `judge.sidecar.json`，summary 记录脱敏 judge 字段（judge id/version、state、
  score、criteria、rubric hash）。
- 定义 indeterminate 协议：indeterminate attempt 保留在计划分母；条件级
  indeterminate 率超过声明预算时该候选的 judge 通道标记为 diagnostic-only；
  冻结计划绑定 v2 rubric hash 与 criterion 级结果表。
- 补充契约测试与输入脱敏审计（复用 buildJudgeInput 的私有标记拒绝）。

## Capabilities

### New Capabilities

- `login-page-judge-provider`: runner judge provider 注册与选择、SourceMap 构造
  契约（确定性）、逐 attempt judge sidecar 与脱敏 summary、indeterminate 分母
  保留与预算协议。

## Impact

- `src/benchmark/judge/`：provider 注册表 + source-map 构造/序列化 + practice
  provider。
- `src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts`：评估后运行 judge
  provider、写 sidecar、summary 含脱敏 judge 字段。
- `incubator/practice-injection/login-page-auth-flow-v2/private/conditions.yaml`：
  声明 `judge.provider: practice-layered-api/v2`。
- 契约/协议文档：indeterminate 预算与分母写入诊断计划/冻结计划说明。
- 范围：#146。不修改 v2 判分逻辑、不引入 LLM judge、不创建正式 record、不改
  evaluator-result/v2 与 joint_pass 派生规则。
