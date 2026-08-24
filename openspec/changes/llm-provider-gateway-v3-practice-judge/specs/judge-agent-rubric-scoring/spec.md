# judge-agent-rubric-scoring Specification

## MODIFIED Requirements

### Requirement: 输入只含公开材料

默认 JudgeAgent 输入 MUST 只包含声明为公开的材料（task、starter、candidate diff/source 快照），并 MUST 复用仓库 allowlist/脱敏：含私有路径、Practice 文本、Oracle、condition 标识或 calibration/evaluator 材料的输入 MUST fail closed，且不得把部分或私有输入转发给 provider。

唯一例外是 `judge-agent/practice-aware/v1` 的 rubric 生成输入：该 provider MAY 读取 candidate `private/conditions.yaml` 声明的 `oracle-practice` Practice 文本，但该文本 MUST 仅用于为同一 diagnostic 的所有条件生成或绑定同一 Practice-aware rubric，MUST NOT 使用 irrelevant Practice、baseline payload、private evaluator、oracle verdict、scoring secret 或任意未声明路径。Practice 声明路径与 SHA-256、固定 rubric 路径与 SHA-256 MUST 在读取前绑定并验证；undeclared、路径替换或 hash mismatch MUST fail closed。candidate scoring 输入仍 MUST 只包含公开 task/candidate source 与已绑定 rubric。

#### Scenario: 私有输入被拒绝

- **WHEN** 输入含私有路径或未声明的 Practice/Oracle 内容
- **THEN** 构造器以脱敏原因拒绝，不调用 provider

#### Scenario: 声明的 oracle Practice 用于同尺子

- **WHEN** practice-aware provider 为声明该 provider 的 candidate 生成 rubric
- **THEN** 仅接受 conditions.yaml 中 oracle-practice 声明的路径与 SHA-256，并为所有条件绑定同一 rubric hash

#### Scenario: 声明或 hash 不匹配

- **WHEN** Practice 或固定 rubric 的路径、SHA-256 与 candidate 声明不一致
- **THEN** judge 记录 unavailable/失败关闭原因，不生成分数