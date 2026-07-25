## ADDED Requirements

### Requirement: 候选 fixture 具有可评审且隔离的布局
MUST：仓库必须将登录页 Practice 探针作为版本化候选存于
`incubator/practice-injection/`。其 `public/` 子树只能包含 Agent 可见的任务说明和 starter
材料。其 `private/` 子树必须包含候选卡、私有验收草案、Practice 卡、条件清单和快照；
任何私有资产不得复制到 Agent 工作区、任务提示、starter、trace 或公开日志。

#### Scenario: 准备编码代理工作区
- **当** 暂存一个比较尝试时
- **则** 它只能包含候选的 `public/task.md` 和 `public/starter/` 材料，且不得包含任何私有
  Practice 或 evaluator 文件

#### Scenario: 泄露评审在公开材料中发现私有断言
- **当** 任务提示、starter、trace 或公开日志命名私有 Practice 规则或验收断言时
- **则** 必须拒绝该候选，直至移除泄露内容并重新生成其快照

### Requirement: 登录任务不预先规定实验 Practice
MUST：公开任务说明必须描述可观察的登录页行为和运行 starter 所需的实现约束，但不得命名
`react.api.layered-design`、指示组件采用特定 API 分层，或以其他方式陈述由 Oracle
Practice 测试的规则。

#### Scenario: baseline 接收公开任务
- **当** 准备 baseline 条件时
- **则** baseline 除了每个条件共享的公开行为说明外，不接收任何源自 Practice 的规则

### Requirement: Practice 卡已版本化、可区分且保持私有
MUST：候选必须在私有材料中定义一个版本化的 `react.api.layered-design` Oracle Practice 卡和一张
无关对照卡。两张卡必须使用同一交付模板，并记录其渲染长度。无关卡不得规定 Oracle 的
行为，也不得与候选验收检查相关。

#### Scenario: 评审对照卡
- **当** 选择无关对照时
- **则** 评审者能从其元数据确认：其呈现格式和渲染长度与 Oracle 卡可比，且未规定被测试的
  API 层行为

### Requirement: 比较前快照候选资产
MUST：在任何比较尝试前，候选必须具有由仓库快照命令生成的完整 `private/snapshot.json`。后续对
候选源码、公开材料、私有材料、Practice 或 evaluator 草案的任何修改，都必须生成新快照，
并使基于旧候选内容的比较失效。

#### Scenario: 快照后候选内容发生变化
- **当** 修改了候选快照包含的文件时
- **则** 快照验证必须失败，直至生成新的已评审快照
