# judge-agent-rubric-scoring Specification

## ADDED Requirements

### Requirement: criterion rationale 必须基于证据而非命名

judge 的每个 criterion 分数与 rationale MUST 引用可验证的职责、调用、数据流或行为证据：例如哪个模块持有 transport、哪个模块调用政策/账本函数、哪些适配器只做 wire translation、账本记录由哪个边界模块统一写入。一个函数名、字段名、目录名或文件路径 MUST NOT 单独证明或否定结构达标；名称相似但证据相反时 MUST 按证据给分。judge 判别力校准 MUST 包含命名变体正例与命名碰撞反例，不能仅靠 reference 固定名称形成区分。

#### Scenario: 职责集中但命名不同

- **WHEN** candidate 将执行政策集中到非 transport 边界模块，但函数命名与 reference 不同
- **THEN** judge rationale 引用调用边界/账本写入证据，且不得因命名不匹配直接扣满结构维度

#### Scenario: 命名相似但职责散落

- **WHEN** candidate 使用与 reference 相同的函数名，但职责散落在 handler/transport/适配器中
- **THEN** judge rationale 引用职责散落证据，且不得因命名命中直接给满结构维度

#### Scenario: 无证据 rationale

- **WHEN** judge 的 criterion rationale 只有函数名/文件路径，没有职责或调用证据
- **THEN** 该结果 MUST 标记为不可用于方向性结论，并保留原 raw result
