## MODIFIED Requirements

### Requirement: Issue 先于后续 OpenSpec change
MUST：仓库在创建 benchmark OpenSpec change 前必须确认已有可追溯的 GitHub issue；若没有，必须先创建一张只收敛单一问题、边界、依赖、验收口径与验证要求的 issue。proposal 与 PR 正文必须引用该 issue 编号。

#### Scenario: 尚无对应 issue
- **当** 维护者准备创建 benchmark OpenSpec change，且未找到对应 issue 时
- **则** 必须先创建 issue，随后才可创建 OpenSpec artifacts 或实现分支

### Requirement: 实现前完成规划澄清
MUST：OpenSpec strict validation 通过且初始 PR 创建后，在开始任何非 OpenSpec 实施前，维护者必须进入平台提供的 Plan mode；平台不支持时，必须提供清晰标记的等效规划阶段。维护者必须向需求方展示当前 change 的改动范围、预期效果、验证方式和非目标，并获得明确确认。规划与确认必须记录当前 change 实际适用、且会改变题面、oracle、对照、评测、treatment、environment 或结论解释的决定。若实施需要实质改变已确认的范围、预期效果或适用性，必须重新规划并确认。

未由当前 change 或 experiment 明确声明的领域方法条件不是实施门禁，也不要求维护者填写不适用说明。规划回答必须写回 issue 与 OpenSpec design/tasks，再开始实施。

#### Scenario: 关键的当前 change 决定尚未确认
- **当** 未确认的问题会改变当前 change 的题面、oracle、对照、评测、treatment、environment 或结论解释
- **则** 必须暂停该部分实现并向需求方询问，且不得创建相关候选 fixture 或执行模型

#### Scenario: change 未声明 Practice-effectiveness 研究
- **当** 当前 change 未声明测量 Practice 是否带来效果差异
- **则** 维护者不得将相关 Practice 或等长无关对照作为该 change 的实施门禁，也不得要求其说明不适用理由

## ADDED Requirements

### Requirement: Stable spec 只承载脱离当前 change 后仍成立的契约
MUST：当 change 准备新增或修改 `openspec/specs/` 中的 stable capability 时，维护者必须在 Plan 和 PR 中说明每条新增或修改 requirement 为什么脱离当前 Issue、candidate、任务、模型、profile、目录、版本与一次实验结论后仍然成立。无法作出该说明的决定必须保留在当前 change 的 design/tasks 或具体 fixture contract 中，不得作为 stable spec delta 归档。

#### Scenario: 一次性 candidate 实现决定
- **当** requirement 依赖某次 candidate 的固定 profile、技术栈、目录、版本或实验交接
- **则** 维护者必须将该决定留在该 candidate/change 的范围内，不得将其提升为未来默认 stable capability

#### Scenario: 可复用领域契约
- **当** requirement 在替换当前 change 的 Issue、candidate、任务、模型、profile、目录、版本和一次实验结论后仍然成立
- **则** 维护者可以在说明其长期适用范围后将其作为 stable spec delta 归档
