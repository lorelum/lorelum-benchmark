## Why

#91 已合并：扩大样本的 practice 注入对照本地结果（`profile-diagnostic-summary/v3`）已产生；
#155 全局解释器核心与 #156 practice adapter 已合并，并用登录页 Practice（
`login-v2-three-condition-retest-v2`）回放验证。本 change 用已验证的 adapter + 核心对 #91
扩大样本语料做**脱敏、诊断性汇总**：按 `candidate × profile_input_hash` 固定输入分组应用
strict joint-pass rule，报告跨 candidate 的诊断性分布、执行缺口与不确定性，为"是否值得
继续扩大本地样本"提供可审计依据。不创建正式 record，不把少量 candidate 信号写成通用效果。

## What Changes

- 新增 #92 汇总 driver：输入多份 `profile-diagnostic-summary/v3`（#91 语料清单），逐份经
  practice adapter + `result-interpreter/v1` 判定，输出：
  - 机器可读：每份 `result-interpreter-summary/v1` + 语料级聚合 JSON（仅判定分布与执行
    缺口，无加权总分、无聚合 signal）。
  - 人读：脱敏 markdown 报告，每个 `candidate × profile_input_hash` 一条结论并映射
    source_commit / snapshot_id / `profile_input_hash`，按 #92 成功/失败/不确定口径收口。
- 固定输入隔离：不同 source_commit / snapshot_id / `profile_input_hash` 绝不合并分母
  （由核心 gate 强制执行）。
- 缺口处理：缺失 summary / 未完成候选 / 执行异常 → 列缺口，overall 保持 `uncertain`；
  只对完整且同输入身份的单元给判定。
- #75 历史背景：单列"不可比历史背景"，不参与 profile v1 判定与分母。
- 泄露审计：Practice 文本、私有路径、工作区路径不得进入汇总与报告。

## Capabilities

### New Capabilities

- `practice-diagnostic-summary`: 定义 #92 汇总契约：多语料输入、逐单元判定、跨 candidate
  诊断性分布、缺口/不确定收口、#75 分离与脱敏报告输出。

### Modified Capabilities

无。不修改 `result-interpreter/v1`、practice adapter 或 runner。

## Impact

- 代码：新增 `src/benchmark/result-interpreter/v1/adapters/practice-corpus-report.ts` 与
  配套 focused tests（含脱敏 fixture 与语料清单驱动）；不调用模型。
- 验证：`bun run validate`、OpenSpec strict validation、public/private 泄露审计；对 #91
  语料回放（不重跑）。
- 关联 issue：#92；前置 #91、#155、#156。