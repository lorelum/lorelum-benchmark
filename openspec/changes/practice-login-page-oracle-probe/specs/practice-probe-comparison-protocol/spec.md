## ADDED Requirements

### Requirement: 预注册四个条件
MUST：候选必须声明 `baseline`、`oracle-practice`、`lorelum-retrieval` 和
`irrelevant-practice` 条件。`baseline` 不注入 Practice；`oracle-practice` 仅经声明的
condition-scoped 私有运行时通道注入相关卡；`irrelevant-practice` 仅通过同一通道注入匹配
对照；`lorelum-retrieval` 必须在执行前标识其检索输出与来源。不具备可用检索实现时，必须标记
为不可用，不得以 Oracle 内容替代。

#### Scenario: 准备 Oracle 比较
- **当** 创建 baseline、Oracle 和无关对照尝试时
- **则** 它们引用相同的任务快照，且仅在声明的 Practice 注入上不同

#### Scenario: 检索不可用
- **当** Lorelum 检索无法返回具有来源信息的 Practice 结果时
- **则** 不得将检索尝试记录为已执行，也不得将 Oracle 输出标记为检索结果

### Requirement: 可比较尝试固定共享输入与预算
MUST：每个比较尝试必须记录候选快照、源码提交、模型及模型版本、系统提示哈希、工具策略、时间
预算、token 预算、干净工作区策略、条件标识及 Practice 卡版本/hash。完整私有输入只能存入受
保护 artifact；公开的或已提交的记录不得包含卡文本。任何共享输入差异或工作区复用，都必须使
该尝试不可比较。

#### Scenario: 尝试使用不同模型版本
- **当** 某次尝试使用与其配对尝试不同的模型版本时
- **则** 两次尝试必须从条件比较中排除，除非创建新的预注册比较集

### Requirement: 按评测层保留原始证据
MUST：每次尝试必须在受保护的不可变 artifact 中保留提示输入、生成 diff、确定性语义检查结果、
Practice 专属质量探针结果、相关性标签、利用率标签、成本、时延、重试次数和执行状态。候选的
已提交私有证据索引必须引用每个 artifact 的 URI 与 SHA-256，并记录 execution snapshot 与
条件；语义与质量结果必须作为独立的原始指标保留；pilot 不得使用加权合成总分。

#### Scenario: 功能检查通过但 Practice 探针失败
- **当** 确定性功能检查通过，而私有 Practice 专属质量探针失败时
- **则** 尝试必须分别报告功能通过和遵循失败，且不得标记为完整的 Practice 成功

### Requirement: 定性标签必须盲评且有边界
MUST：独立评审者必须从隐藏条件标识和顺序的产物中，将相关性标为 `irrelevant`、
`partially-relevant` 或 `clearly-relevant`，并将利用率标为 `ignored`、
`mentioned-not-implemented` 或 `implemented`。LLM 评判不得作为唯一验收 oracle。

#### Scenario: 向定性评审展示产物
- **当** 评审者接收用于评估相关性和利用率的候选输出时
- **则** 输出必须被随机化，且不得披露其来自哪个条件

### Requirement: 决策门控制后续扩展
MUST：仅当 Oracle Practice 在保留的原始指标上相对 baseline 具有已记录优势，且无关对照未显示
等效优势时，候选才可推进至更大的候选池。其余结果必须报告为不确定或诊断性结果，不得作为
精准 Practice 注入有效的证据。

#### Scenario: Oracle 与无关 Practice 均优于 baseline
- **当** Oracle 和无关条件相对 baseline 的改善程度相似时
- **则** 探针必须将额外上下文或指令作为仍存在的替代解释，不得将其作为精准 Practice 注入
  的证据推进
