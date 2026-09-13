## ADDED Requirements

### Requirement: OpenSpec-ready changes require a visible implementation plan and requester confirmation

MUST：除 OpenSpec artifacts 的起草、strict validation、初始 OpenSpec-only PR 创建和只读调查外，任何 change 在开始首个非 OpenSpec 实施动作前，Agent 必须同时满足以下条件：

1. 该 change 的 required OpenSpec artifacts 已完成并通过 strict validation；
2. 承载该 change 的初始 PR 已创建，且当时只包含 OpenSpec artifacts 与必要流程约束；
3. Agent 已进入平台提供的 Plan mode；若平台没有可切换的 Plan mode，则必须给出等效且清晰标记的可见实施计划；
4. 该计划向需求方说明预期结果、确切写入范围、非目标、预期行为、验证与反例、未决问题以及确认后的执行步骤；
5. 需求方已明确确认该计划。

“非 OpenSpec 实施动作”包括写入或修改规则、流程文档、代码、schema、fixture、runner、evaluator、treatment、environment 或 record。只读检查不得被当作实施，也不得借此绕过确认后才可写入的要求。计划与确认应在当前协作会话或同一 PR 的可追溯证据链中可见；仓库不得为此另设规则登记册、例外表或周期性报告门禁。

#### Scenario: OpenSpec 完成后尚未展示计划

- **WHEN** change 已通过 strict validation 并已创建初始 OpenSpec-only PR，但 Agent 尚未展示实施计划或尚未获得需求方明确确认
- **THEN** Agent 不得修改任何非 OpenSpec 实施文件，也不得开始候选、任务、runner、评测、规则或流程的实现

#### Scenario: 需求方确认可执行的计划

- **WHEN** Agent 已在 Plan mode 或等效可见规划阶段展示包含结果、写入范围、非目标、预期行为、验证/反例、未决问题和执行步骤的计划，且需求方明确确认
- **THEN** Agent 可以仅按该计划在同一 change 分支和初始 PR 中开始非 OpenSpec 实施

#### Scenario: 客户端没有 Plan mode 控件

- **WHEN** 当前协作客户端没有可进入的 Plan mode
- **THEN** Agent 必须展示清晰标记的等效实施计划并等待需求方明确确认，且不得以客户端限制为由跳过规划门禁

#### Scenario: 实施中出现实质性偏离

- **WHEN** 已获确认后的实现需要实质改变范围、规则适用性、语义、用户可见行为、验证策略或非目标
- **THEN** Agent 必须停止该偏离部分，更新可见计划并再次获得需求方明确确认后才能继续
