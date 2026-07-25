# login-practice-probe-fixture Specification

## Purpose
TBD - created by archiving change practice-login-page-oracle-probe. Update Purpose after archive.
## Requirements
### Requirement: 候选 fixture 具有可评审且隔离的布局
MUST：仓库必须将登录页 Practice 探针作为版本化候选存于
`incubator/practice-injection/`。其 `public/` 子树只能包含 Agent 可见的任务说明和 starter
材料。其 `private/` 子树必须包含候选卡、私有验收草案、Practice 卡、条件清单、私有证据索引
和快照。所有私有资产不得复制到 Agent 工作区、公开任务提示、starter、公开 trace 或公开日志。
只有已声明为 treatment 的 Practice 卡可经 condition-scoped 私有运行时通道提供给对应模型输入；
evaluator、oracle 断言和评分材料不得进入任何模型输入。

#### Scenario: 准备编码代理工作区
- **当** 暂存一个比较尝试时
- **则** 它只能包含候选的 `public/task.md` 和 `public/starter/` 材料，且不得包含任何私有
  Practice 或 evaluator 文件；若条件声明 Practice 注入，卡只能在工作区外的私有运行时通道
  中提供，并由版本和 hash 识别

#### Scenario: 泄露评审在公开材料中发现私有断言
- **当** 公开任务提示、starter、公开 trace 或公开日志命名私有 Practice 规则或验收断言时
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

### Requirement: Pilot 证据索引不重写候选输入
MUST：候选必须在 `private/evidence-index/` 提交每个已完成 pilot 的证据索引。索引必须记录
execution snapshot、条件、受保护 artifact 的不可变 URI 与 SHA-256、以及盲评映射的受限位置；
不得包含原始 prompt、trace、日志或 diff。快照实现必须将该索引视为 post-run audit metadata，
使新增索引不改变已执行比较所引用的 candidate input snapshot。

#### Scenario: 记录完成的比较
- **当** baseline、Oracle 或无关条件完成时
- **则** 评审者能通过已提交索引解析该次执行的输入快照和全部原始证据，而不需要访问被忽略的
  本地 `artifacts/` 目录

