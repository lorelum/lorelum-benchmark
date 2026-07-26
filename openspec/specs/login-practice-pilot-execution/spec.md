# login-practice-pilot-execution Specification

## Purpose
为登录页 Practice candidate 定义本地三条件对照、私有运行产物边界和方向性结果解释的稳定契约。
## Requirements
### Requirement: 本地小试使用固定的三条件对照

系统 MUST 只执行 `conditions.yaml` 中已声明的 baseline、Oracle Practice、无关 Practice 条件，默认每个条件两次；`lorelum-retrieval` 必须保持 unavailable。每次尝试必须使用新的工作区，以及相同的 public starter、模型标识、任务提示、工具列表和时间预算。

#### Scenario: Oracle Practice 尝试开始
- **WHEN** 执行器创建 Oracle Practice 尝试
- **THEN** 它仅复制 `public/task.md` 与 `public/starter/` 到工作区，并通过运行时追加系统提示提供 Oracle Practice

#### Scenario: 重复次数被覆盖
- **WHEN** 使用者提供 `--repeat N`
- **THEN** 执行器为每个已声明可执行条件运行 N 次，并在本地摘要中保留每次结果

### Requirement: 本地执行结果可查看且不成为正式记录

系统 MUST 在被忽略的 `scratch/` 中保存每次尝试的 Pi 输出、evaluator 输出、候选 diff 和汇总。每次尝试结束后 MUST 独立运行现有浏览器语义检查和私有 AST 分层探针。系统 MUST NOT 创建 `results/records/`、artifact index、外部 storage 对象或盲评材料。

#### Scenario: 评测完成
- **WHEN** Pi 进程退出
- **THEN** 执行器运行私有 evaluator，并在 summary 中记录语义结果、分层结果和双通过结果

#### Scenario: 本机配置不可用
- **WHEN** Pi 命令无法启动或模型调用失败
- **THEN** 执行器把该次尝试记录为失败并继续其他计划尝试，不将其伪装成通过结果

### Requirement: 小试结论保持方向性

系统 MUST 以“语义与分层探针均通过”的原始次数汇总三条件。只有 Oracle 次数严格高于 baseline 和无关 Practice 时，摘要才标记为有信号；其他结果必须标记为无明显信号。结果不得被表述为正式 benchmark、产品结论或普遍模型能力结论。

#### Scenario: Oracle 条件领先
- **WHEN** Oracle 的双通过次数严格高于另外两个条件
- **THEN** 摘要标记为有信号，并建议扩大本地样本

#### Scenario: 结果未形成区分
- **WHEN** Oracle 没有严格高于 baseline 或无关 Practice
- **THEN** 摘要标记为无明显信号
