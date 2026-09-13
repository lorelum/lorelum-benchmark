## ADDED Requirements

### Requirement: Practice-effectiveness 对照仅在被声明的研究中适用
MUST：当当前 change 或 experiment 明确声明其目标是测量某个 Practice 是否带来可观察效果差异时，design 必须声明 baseline、相关 Practice 条件和按预先声明计量方式等长的无关 Practice 对照，以及它们保持可比输入、预期 baseline 缺口、私有验收和结论边界的方式。相关 Practice、无关对照或 baseline 缺口不得从题面、starter、公开 trace 或公共日志泄露。

该 requirement 不适用于未声明 Practice-effectiveness 研究目标的 runner、validation、流程、文档、local smoke、冻结 candidate 重放或 directional screen change；这些 change 不得被要求创建、解释或填写无关 Practice 对照的不适用说明。

#### Scenario: 声明 Practice-effectiveness 研究
- **WHEN** change design 明确测量相关 Practice 相对 baseline 和无关 Practice 的效果
- **THEN** design 声明三种条件、等长无关对照、可比输入、预期 baseline 缺口、私有验收和结论边界

#### Scenario: 未声明 Practice-effectiveness 研究
- **WHEN** change 只修复 runner、validation、流程或文档，执行授权 local smoke，或复用冻结 candidate 做新的 directional screen
- **THEN** 相关 Practice 与等长无关对照不构成该 change 的门禁，也不需要不适用说明
