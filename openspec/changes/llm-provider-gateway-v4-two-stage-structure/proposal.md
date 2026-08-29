# Proposal

## Why

PR #184 已得到明确的负面校准结果：practice-aware LLM judge 无法稳定恢复结构标签，也无法区分正负夹具，只能保留为 `diagnostic-only / calibration failed`。继续增强该 judge 不是有效方向。因此，#185 改为研究两段式任务：Stage 1 建立初始实现，Stage 2 在同一 workspace 接收维护变更，并用 deterministic structure observation 观察 Practice 是否让修改更集中、边界更稳定。

## What Changes

- 新增独立 `incubator/practice-injection/llm-provider-gateway-v4/` candidate，不修改 v1/v2/v3。
- 新增版本化 two-stage injection profile、staged diagnostic plan、staged diagnostic runner 和 Stage 1 immutable snapshot 流程。
- Stage 1 只公开初始功能需求；Stage 2 题面只在第二阶段 materialize，且必须接受提前泄露审计。
- 保留 baseline、oracle-practice、irrelevant-practice 三条件，并使用 `project-convention/v1` 注入。
- 新增 deterministic two-stage structure evaluator：基于 TypeScript AST、import graph、call/value edge 和 Stage 1 -> Stage 2 diff 分类；ambiguous 必须返回 `indeterminate`。
- 新增 offline fixture matrix，逐 check 校准 expected label；最低覆盖 reference、equivalent、baseline scatter、anti-pattern、docs-present、starter 和 ambiguous。
- 预注册 saturation / no discriminability 规则；本 change 只交付并验证 offline 机制，不调用 candidate 或 judge model，不创建 formal record，不升级 suite revision。

## Capabilities

### New Capabilities

- `two-stage-practice-structure`: 定义 staged execution、Stage 1 snapshot、public/private 隔离、Practice 泄露防护、deterministic structure observation、offline 校准和 saturation 决策边界。
- `llm-provider-gateway-v4-two-stage-structure`: 定义 v4 candidate 的独立身份、两段题面与行为边界、三条件 Practice 对照、离线校准角色和禁止模型调用的交付边界。

### Modified Capabilities

None.

## Impact

- 新增 OpenSpec artifacts；初始 PR 只包含这些 artifacts 与必要流程约束。
- 后续实现将新增 schemas、kernel profile、runner、evaluator helper、candidate、private calibration fixtures 与 focused tests。
- 不修改 `llm-provider-gateway-v3`、其 snapshot、fixtures、thresholds、judge contract 或 verification evidence。
- 不修改 v1/v2 candidate、冻结 suite、treatment、environment、record 或历史结论。
- 不把 LLM judge 作为 primary pass/fail signal；不把 #184 的 structure-fact contract 晋级为全局规范。
