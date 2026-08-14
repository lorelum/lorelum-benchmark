# practice-structure-probe-calibration Specification

## Purpose

定义 Practice 候选私有结构质量探针的通用证据标准与模型运行前校准门槛：职责判定 MUST 基于 import graph、调用/数据流、类型契约、模块所有权或可观察行为，MUST NOT 依赖封闭标识符 allowlist；任何保留的命名线索 MUST 被真实输出命名变体正例/反例回归夹具约束。该 capability 适用于后端、前端或混合候选的私有 quality probe。

## ADDED Requirements

### Requirement: 结构职责判定不得依赖标识符名字

私有结构质量探针 MUST 以 TypeScript/项目语言的 import graph、调用关系、数据流、类型契约、模块所有权、HTTP/网络职责位置或可观察行为作为职责判定证据。一个封闭的精确标识符集合 MUST NOT 单独决定 `observed` 或 `not-observed`；函数名、字段名、目录名与文件路径 MAY 作为辅助线索，但 MUST 同时存在结构证据。

#### Scenario: 不同命名但职责等价

- **WHEN** candidate 使用不同函数/类型/文件命名，仍把重试、降级、预算、幂等与计量集中到同一非 transport 边界模块
- **THEN** 探针 MUST 判 `observed`，且 reason 引用调用/数据流证据而非命名相似

#### Scenario: 偶然命名命中但职责散落

- **WHEN** candidate 的 transport、handler 或多个模块偶然使用参考实现中的函数名，但职责实际散落在 server、adapter 或多个实现内
- **THEN** 探针 MUST 判 `not-observed`，且 reason 引用职责散落证据而非名字缺失

#### Scenario: 名字证据不足

- **WHEN** 探针只能通过固定标识符命中得出结论，无法证明模块所有权或调用边界
- **THEN** 探针 MUST 返回 `indeterminate` 或 fail closed，不得输出 `observed`

### Requirement: 真实输出命名变体进入校准矩阵

一个结构质量探针在进入模型比较前，MUST 在校准矩阵中覆盖至少两组真实输出或与其职责等价的私有变体：一组命名与 reference 不同但职责等价，MUST 为 `observed`；一组命名与 reference 重叠但职责散落，MUST 为 `not-observed`。变体 MUST 保持 private，MUST NOT 出现在 agent workspace、prompt、trace 或 summary，MUST 通过 candidate snapshot/calibration identity 固定。

#### Scenario: 假阴性变体被接受

- **WHEN** 校准矩阵运行职责集中但命名不同的变体
- **THEN** 探针 MUST 判 `observed`，并保留职责证据

#### Scenario: 假阳性变体被拒绝

- **WHEN** 校准矩阵运行命名重叠但职责散落的变体
- **THEN** 探针 MUST 判 `not-observed`，并保留职责证据

#### Scenario: 缺少命名变体不得进入模型比较

- **WHEN** 校准矩阵只有 reference/anti-pattern 等旧样例，未覆盖真实输出的命名变体
- **THEN** candidate 不得进入模型比较或升级，探针回归状态 MUST 标记 blocked

### Requirement: 探针回归必须确定性重放

结构质量探针及其校准变体 MUST 支持在无模型调用、无真实网络的情况下确定性重放；任何探针、校准变体、运行时闭包或 snapshot 变化后 MUST 重跑回归。回归 MUST 输出每个 fixture 的预期标签、实际标签与 reason，任何不一致或 `indeterminate` MUST 阻塞 candidate。

#### Scenario: 探针回归通过

- **WHEN** 在本地执行 naming-variant 校准矩阵
- **THEN** reference/equivalence 类 `observed`，anti-pattern/命名碰撞类 `not-observed`，全部原因可解释

#### Scenario: 探针回归失败

- **WHEN** 任一 fixture 分类不一致、`indeterminate` 或缺 reason
- **THEN** candidate 保持 blocked，不得执行模型比较
