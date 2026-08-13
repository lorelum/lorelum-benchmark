## Context

#168 的 `llm-provider-gateway-v2` judge 校准失败：auto rubric 给 anti-pattern 72 > reference 66，且 LLM confidence 非整数导致 fail-closed。优化共享 `judge-agent/generic/v1`，但不得破坏已有前端 candidate 的 judge 行为。

## Goals / Non-Goals

**Goals:**

- 扩展 rubric quality guideline，覆盖跨请求/后端政策维度。
- 强化 judge 输出解析的数值归一。
- 增加固定 rubric 复用。
- 用 v2 gateway 与既有 candidate 做回归校准。

**Non-Goals:**

- 不改 candidate/suite/treatment/record。
- 不改变语义完成判定与 `judge-result/v1` 契约。
- 不在本 change 跑三条件 Pi 诊断。

## Decisions

### 版本策略（规划澄清确认）

- 不修改 `judge-agent/generic/v1`；新增 `judge-agent/generic/v2`，只把 `llm-provider-gateway-v2` 迁移到 v2；既有 candidate 继续使用 v1，保持历史软评分可复现。

### rubric guideline

- 在 `rubricQualityGuideline` 增加政策维度，措辞面向任务自适应，不强制所有任务都用。

### 输出解析

- `assertScoredCandidate` 先归一 confidence（round）与 points（round），再执行现有结构/范围/覆盖校验。

### 固定 rubric

- `createJudgeAgentProvider` 读取 `LORELUM_JUDGE_RUBRIC_TEXT`，存在则 parse + hash 复用；否则走生成路径。

## Risks / Trade-offs

- [归一过宽可能接受错误输出] → 仅归一数值字段，缺失/未知/重复/超范围仍 fail closed。
- [改动共享 provider 影响既有 candidate] → 保留默认行为，新增测试覆盖 mock 与 `practice-layered-api/v2`，并用真实 opt-in 回归 v2 gateway。

## Migration Plan

1. 创建 OpenSpec change 与初始 PR。
2. 实现 rubric guideline、输出归一、固定 rubric。
3. 更新 judge 单元测试与校准夹具，运行 `bun run test:contracts` / `bun run validate`。
4. 真实 opt-in 校准 `llm-provider-gateway-v2` 并记录证据；未通过前不合并。

## Open Questions

已确认：固定 rubric 采用 `LORELUM_JUDGE_RUBRIC_TEXT` 环境变量注入。

## Planning Confirmation

2026-08-13（需求方确认）：

1. 新增 `judge-agent/generic/v2`，不修改 v1。
2. 只迁移 `llm-provider-gateway-v2` 到 v2。
3. 固定 rubric 通过环境变量注入，默认行为向后兼容。
