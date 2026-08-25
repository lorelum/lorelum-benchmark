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

### Requirement: Practice-aware scoring anchors

Practice-aware rubric dimensions MUST carry explicit full/partial/zero scoring anchors. The model MUST return exhaustive per-anchor satisfied/evidence output and MUST NOT return criterion points. The provider MUST derive points deterministically: a satisfied zero anchor produces zero; a satisfied partial anchor caps the dimension at floor(max_points/2); full points require every full anchor satisfied and no partial/zero anchor satisfied. Missing, duplicate, undeclared, non-exhaustive anchor output, or model-supplied points MUST fail closed after an identical-prompt retry rather than being repaired or defaulted. Functional correctness MUST NOT compensate for an unmet structural anchor.

#### Scenario: 结构性部分满足不能拿满分

- **WHEN** retry/fallback 已抽出，但 budget、idempotency 或 metering 仍由 handler/scattered modules 持有
- **THEN** provider 按 partial anchor 机械结算该维度，不得超过满分的一半

#### Scenario: anchor 输出不完整或携带分数

- **WHEN** scorer 缺少/重复/未声明 anchor，或在模型输出中携带 criterion points
- **THEN** 该样本按 malformed scorer contract 使用相同 prompt 重试；仍失败则 fail closed，不修复、不默认

#### Scenario: 无 Practice 输入保持兼容

- **WHEN** rubric 没有 Practice/scoring anchors
- **THEN** provider 使用 generic-compatible scoring 路径，不修改 generic/v1/v2 helper

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

### Requirement: 声明的 oracle Practice 窄例外

Practice-aware provider MAY 只把 candidate `private/conditions.yaml` 中 `oracle-practice` 声明的 Practice 文本用于 rubric 生成或固定 rubric 绑定；声明路径、Practice SHA-256、固定 rubric 路径与 rubric SHA-256 MUST 全部验证一致。irrelevant Practice、baseline payload、任意替代路径、private evaluator、oracle verdict 或 scoring secret MUST NOT 进入 judge 输入；不匹配或未声明时 MUST fail closed。

#### Scenario: 私有或未声明输入被拒绝

- **WHEN** practice_text 含私有路径、oracle/evaluator 内容，或路径与声明不一致
- **THEN** 构造器以脱敏原因拒绝，不调用 provider

#### Scenario: 固定 rubric 绑定

- **WHEN** practice-aware provider 为 candidate 评分
- **THEN** runner 只加载 conditions 声明的固定 rubric，验证 SHA-256，并把该 rubric hash 用于所有条件

#### Scenario: 声明缺失或 hash 不匹配

- **WHEN** oracle Practice 或 rubric 声明缺失、路径替换或 SHA-256 不匹配
- **THEN** judge 通道记录 unavailable/diagnostic-only 原因，不产出可比较分数

### Requirement: Structure-fact extraction and deterministic derivation

后续 practice-aware judge 版本 MUST 把模型职责限定为源代码结构事实抽取，并把 full/partial/zero 与分数推导留给 provider。模型 MUST 只返回预先声明且穷尽的布尔源事实、具体证据和源引用；MUST NOT 返回维度标签、criterion 分数、总分或 expected fixture 身份。provider MUST 按互斥优先级推导 full/partial/zero，校准 MUST 同时报告每个维度的 expected/predicted 混淆矩阵和总分。事实输出若缺失、重复、未知、含额外字段、非布尔、证据不具体、引用未展示源、含歧义或不完整，MUST 在相同 prompt 重试后失败关闭，MUST NOT 修复或默认给分。

#### Scenario: 事实抽取不能裁决维度

- **WHEN** 抽取模型在事实表外返回 `dimension_label`、`points` 或总体偏好
- **THEN** provider 判定输出 malformed，用相同 prompt 重试，仍失败则 fail closed

#### Scenario: 标签推导是确定性的

- **WHEN** 同一已验证事实向量被输入多次
- **THEN** 每个维度得到相同 full/partial/zero 和分数；zero 谓词优先于 full 谓词，其余可达状态为 partial

#### Scenario: 维度错误必须可见

- **WHEN** 校准总分分离，但任一夹具维度标签与期望不一致
- **THEN** confusion matrix 与标签准确性检查失败，结果保持 diagnostic-only

#### Scenario: 文档不能冒充结构

- **WHEN** 夹具添加描述目标边界的指南，但不修改生产源代码
- **THEN** 抽取事实与推导标签只基于源引用，不能仅因文档存在而提升

#### Scenario: 可选 pairwise 保持盲评且只是二级信号

- **WHEN** 启用 pairwise 判别检查
- **THEN** judge 只收到匿名的正/负源代码，不含夹具名或期望标签；错误偏好不能修复已失败的维度标签或总分检查
