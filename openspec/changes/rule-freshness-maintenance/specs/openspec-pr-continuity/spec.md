## ADDED Requirements

### Requirement: 现行仓库规则可被轻量复核和反馈
仓库 MUST 在根 `AGENTS.md` 显示 `规则最近核对` 的 ISO 日期。该日期表示已对已提交的仓库规则和流程进行实际复核，而非本文件的普通编辑时间；它不会自动使任何规则失效。涉及共享规则或流程的工作在结束时 MUST 在其现有 Issue、PR 或 OpenSpec 记录一个简短结果：无需更新、已更新的文件，或后续 Issue。未发现规则问题的普通工作不需要创建额外记录或日志。

#### Scenario: 规则相关工作确认无需修订
- **WHEN** 一项工作审查或验证了共享规则/流程，但未发现需要改动的现行要求
- **THEN** 该工作的现有 Issue、PR 或 OpenSpec 记录“无需更新”，且不创建独立规则日志

#### Scenario: 复核改变现行规则
- **WHEN** 规则相关工作确认需要修订现行规则或流程
- **THEN** 它更新相应的现行文本、在现有工作记录中列出修改文件或后续 Issue，并在实际复核后更新 `规则最近核对` 日期

## MODIFIED Requirements

### Requirement: 实现前完成规划澄清
MUST：OpenSpec strict validation 通过且初始 PR 创建后，维护者在创建或改变 benchmark 的可观察任务行为、Practice/treatment 或对照、私有语义/质量验收、starter 或不可变源码身份、模型/提示/预算/盲评计划，或结论解释前，必须向需求方确认并记录相关决定。记录必须写回 issue 与 OpenSpec design/tasks。仅实施同一 change 中已经记录且未改变的决定时，维护者必须引用该决定，但不必重新确认不受本次工作影响的选择；其余验证、public/private、生命周期和执行门禁仍然适用。

#### Scenario: 关键实验问题尚未确认
- **当** 未确认的问题会改变题面、oracle、对照、评测、treatment、environment 或结论解释时
- **则** 必须暂停受该问题影响的实现或模型执行并向需求方询问；不得用未记录的假设创建候选 fixture 或执行模型

#### Scenario: 实施已确认的实验决定
- **当** 工作只实现同一 change 已在 issue 和 OpenSpec design/tasks 中确认、且本次未改变的实验决定
- **则** 维护者引用已有决定并继续相关实施与验证，无需重新打开无关的设计问题