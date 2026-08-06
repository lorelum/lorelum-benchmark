## ADDED Requirements

### Requirement: 任务须声明被测 Practice 的基本行为要求

Practice-injection candidate 的公开任务 MUST 以自然语言声明被测 Practice 的基本行为要求
（例如分层方向），使 baseline 条件预期可产出该行为；细化约定（响应翻译、原始响应隔离、
命名与目录偏好等）由 Practice 注入提供，MUST NOT 全部隐藏于 Practice。candidate design
MUST 记录预期基线符合水平与 Practice 的增量贡献。

#### Scenario: 基线按要求产出基本行为
- **WHEN** task 声明了分层要求但未注入 Practice
- **THEN** 基线仍可能部分或完全符合，judge 分数如实反映，design 记录了预期基线水平

### Requirement: 低分必须可解释（评分公平性）

任意低于参考的 judge 分数（含 0 分）MUST 能从候选代码追溯到具体缺失的 rubric 维度
（如组件持有 transport、原始 status/body 流入页面状态），并归类为「task 要求但未产出」或
「Practice 专属细化未满足」；MUST NOT 解释为模型识破测试环境。真实性识别为事后被动审计。

#### Scenario: 0 分可解释
- **WHEN** 某条件 judge 0 分
- **THEN** 维护者可从代码定位缺失维度，并区分「task 未要求」与「task 要求但模型未做」
