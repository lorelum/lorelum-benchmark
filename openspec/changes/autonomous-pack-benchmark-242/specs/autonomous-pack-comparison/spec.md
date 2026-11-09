# Spec Delta

## Purpose

定义编码 Agent 在自行决定是否检索时，对安装 Pack 与未安装 Pack 的可复现比较及其证据边界。

## ADDED Requirements

### Requirement: 配对输入和隔离

系统 MUST 在每组配对运行中固定任务、初始代码、提示、模型、工具可用性、预算和可重建环境，唯一预期差异是指定 Pack 的安装状态；系统 MUST 记录可核验的版本与输入身份，并隔离各运行的 Store 与工作区。

#### Scenario: 配对运行
- **WHEN** 执行已声明的安装与未安装条件
- **THEN** 两组使用相同非 treatment 输入，各自从干净隔离状态启动，安装身份及输入 hash 可审计

#### Scenario: 身份或隔离无法核验
- **WHEN** Pack 身份、公共输入一致性或隔离不成立
- **THEN** 运行不得作为有效比较，须记录原因

### Requirement: 自主检索证据

系统 MUST 允许 Agent 自行决定是否查询和读取知识，MUST NOT 替 Agent 查询、选取或注入 Practice；系统 MUST 区分未查询、查询、取回、空结果与失败，且不得将查询行为本身视作质量提升。

#### Scenario: 未查询
- **WHEN** Agent 未调用检索
- **THEN** 运行记录未查询，不因此伪造执行失败或知识使用

#### Scenario: 工具失败
- **WHEN** 检索或取回失败
- **THEN** 保留失败和可用证据，不记为成功取回

### Requirement: 结果和私有边界

系统 MUST 独立报告运行健康、题面功能、代码质量与检索行为，保留计划分母和不可判定状态；私有 oracle、评分和校准材料 MUST NOT 进入 Agent 输入。质量评估 MUST NOT 仅依赖 LLM judge 或将单一实现偏好视为功能正确性。

#### Scenario: 功能通过但质量证据不足
- **WHEN** 功能检查通过但质量评估不可用
- **THEN** 保留功能通过并将质量标为不可判定或不可用

#### Scenario: 历史结果
- **WHEN** 新比较改变任务、环境、评测器或 treatment 的运行含义
- **THEN** 使用新版本并保留历史版本及记录
