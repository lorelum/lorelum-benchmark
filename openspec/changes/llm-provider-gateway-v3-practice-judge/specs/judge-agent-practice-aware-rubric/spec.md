# judge-agent-practice-aware-rubric Specification

## Purpose

定义 Practice-aware rubric 生成 judge provider 的通用要求：在通用 LLM rubric 生成基础上，把候选声明注入的 Practice 文本作为 rubric 生成输入，使评分维度显式度量 Practice 结构遵循度而非仅功能完成度；三条件同尺子，不改变语义判定。

## ADDED Requirements

### Requirement: Practice-aware rubric 生成

Practice-aware judge provider MUST 支持可选 `practice_text` 输入；提供时 rubric 生成 prompt MUST 同时包含公开 `task.md` 与该 Practice 文本，使 rubric criterion 显式度量 Practice 声明的结构纪律（如 transport-isolation、boundary-translation、raw-response-containment、domain-delegation、policy-centralization、budget-atomicity 等）。未提供 Practice 时行为 MUST 与通用 rubric 生成一致。

#### Scenario: Practice 输入生效

- **WHEN** candidate 注入 oracle Practice 且 judge provider 收到该文本
- **THEN** 生成的 rubric 至少含一个度量 Practice 结构纪律的 criterion，而非仅功能完整度

#### Scenario: 无 Practice 输入时向后兼容

- **WHEN** candidate 未注入 Practice（baseline）或 provider 未收到 practice_text
- **THEN** rubric 生成行为与通用 rubric 一致，仍按 task.md 产出结构合法 rubric

### Requirement: 三条件同尺子

同一 diagnostic 的三个条件 MUST 使用同一 rubric hash；Practice-aware provider MUST 以 candidate 声明的 oracle Practice 文本（或固定 rubric）作为唯一 rubric 生成输入，MUST NOT 按条件切换 rubric。

#### Scenario: rubric 一致性

- **WHEN** diagnostic 对 baseline / oracle-practice / irrelevant-practice 执行 judge
- **THEN** 三条件 rubric_hash 一致，criterion 维度与权重相同

### Requirement: 不修改冻结 generic/v1/v2

Practice-aware provider MUST 为独立版本目录（如 `judge-agent/practice-aware/v1`），MUST NOT 修改 `judge-agent/generic/v1` 或 `judge-agent/generic/v2` 的文件、契约或行为。

#### Scenario: generic/v2 不变

- **WHEN** Practice-aware provider 交付
- **THEN** `src/benchmark/judge/judge-agent/generic/v1/` 与 `v2/` 的文件与测试无 diff

### Requirement: judge 仍为软信号

Practice-aware judge 分数 MUST NOT 改变 semantic 或 practice_observation 结论，MUST NOT 作为唯一 oracle；输出仍为 `judge-result/v1`，fail closed 行为与通用 rubric scoring 一致。

#### Scenario: 分数不改变硬门槛

- **WHEN** candidate 通过公开语义测试但 judge 低分
- **THEN** semantic 仍为 pass，judge 分数作为独立软信号记录

### Requirement: 输入只含公开材料

Practice 文本 MUST 来自 candidate 声明的 condition-scoped private runtime channel，且在传入 rubric 生成前 MUST 通过与 `buildJudgeInput` 相同的公开/私有边界检查；含私有路径、oracle 或 evaluator 材料的输入 MUST fail closed。

#### Scenario: 私有输入被拒绝

- **WHEN** practice_text 含私有路径或 oracle 内容
- **THEN** 构造器以脱敏原因拒绝，不调用 provider
