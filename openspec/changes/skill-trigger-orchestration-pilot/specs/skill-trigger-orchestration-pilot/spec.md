## ADDED Requirements

### Requirement: 候选工作区隔离 Skill 触发编排验证

系统 MUST 在 incubator/skill-trigger-orchestration/ 下承载 mock 阶段验证，不进 suites/。public/ 只含 task.md 与 starter；private/ 含 evaluator、oracle、Practice 卡、conditions 与执行治理。私有材料 MUST NOT 进入 agent 工作区或模型输入。

#### Scenario: 工作区实体化
- **WHEN** 执行器创建一次尝试
- **THEN** 它仅复制 public/task.md 与 public/starter/ 到工作区，不复制 private 下任何文件

#### Scenario: mock Practice 工具返回
- **WHEN** 条件为 lorelum-retrieval 或 irrelevant-practice
- **THEN** agent 必须先发现并加载 Lorelum，再调用 mock-retrieval-tool-call；三字段结果作为该工具返回进入模型上下文，其 Practice id/version/SHA-256 记录在 trace 中，Practice 正文与 private 路径不进 public 工作区或模型输入

### Requirement: mock 查询返回三字段结构

系统 MUST 让 mock 查询返回结构化结果而非自然语言建议，包含范围约束、命中 Practice 的可审计引用（仅 id/version/SHA-256，不含原文）、行为约束（非指令）。行为约束 MUST 是不得/必须式限制，MUST NOT 是具体实现指令。Practice 卡原文 MUST NOT 进入 mock 返回结构、prompt 或模型输入；agent 仅凭行为约束文本自行决定实现方式。

#### Scenario: 返回行为约束而非原文
- **WHEN** lorelum-retrieval 条件触发查询
- **THEN** 返回包含异步副作用不得在组件卸载后继续影响状态式约束，由 agent 自行决定实现方式；返回结构不含 Practice 卡原文

#### Scenario: 命中 Practice 可审计但不泄露原文
- **THEN** 返回结构仅包含选中 Practice 的 id/version/SHA-256，证明约束来自检索而非模型参数记忆；Practice 正文保留在 private/，不进模型输入

### Requirement: 三条件对照不设天花板

系统 MUST 只执行 baseline、lorelum-retrieval、irrelevant-practice 三条件，MUST NOT 设 oracle-practice 天花板。lorelum-retrieval 是否达标由 evaluator 独立判定。

#### Scenario: 无天花板
- **THEN** conditions 中不包含 oracle-practice 或任何写死正确约束的条件

#### Scenario: 盲从判定
- **WHEN** lorelum-retrieval 过 evaluator 且 irrelevant-practice 也过
- **THEN** 结果标记为盲从可疑，不记为听懂约束

#### Scenario: 听懂约束
- **WHEN** lorelum-retrieval 过 evaluator 且 irrelevant-practice 不过
- **THEN** 结果记为 agent 真正听懂约束

### Requirement: 异步操作归属质量门稳定检出 baseline 缺陷

evaluator MUST 用静态 AST 结构门拒绝没有结果归属保护或只有伪保护的实现，并用运行时测试验证被后续操作 supersede 的旧请求不得调用状态 setter；MUST NOT 依赖 React warning。运行时门 MUST 覆盖跨范围切换与同范围手动重载，且每类均覆盖旧请求 resolve 与 reject。reference 与等价实现 MUST 通过，naive starter 和只保护单一路径的 anti-pattern MUST 失败。

#### Scenario: baseline 失败
- **WHEN** 评估 naive starter
- **THEN** AST 探针报告缺少异步操作归属保护，语义可能通过但质量探针失败

#### Scenario: 卸载后状态更新被阻断
- **WHEN** 旧请求在被新的范围切换或同范围重载取代后才 resolve 或 reject
- **THEN** evaluator 记录到的组件状态 setter 调用数为零

#### Scenario: reference 通过
- **WHEN** 评估带有效操作归属保护的 reference 或等价实现
- **THEN** AST 结构门与四个运行时质量门均通过

### Requirement: pilot 先确认 baseline 失败模式

candidate 正式用作对照前 MUST 先跑本地 pilot，确认 baseline 下 agent 不能稳定通过异步操作归属质量门。若 baseline 失败模式不成立，MUST 暂停并重新选场景，MUST NOT 自行假设。

#### Scenario: baseline 失败模式成立
- **WHEN** baseline pilot 的产出被操作归属质量门判为失败
- **THEN** candidate 可进入正式对照

#### Scenario: baseline 失败模式不成立
- **WHEN** baseline pilot 的产出意外通过探针
- **THEN** 暂停，在 issue 中记录并重新评估场景


### Requirement: 新建 skill-trigger-orchestration/v1 profile

系统 MUST 在 `src/benchmark/kernel/profiles/skill-trigger-orchestration/v1/` 定义新 profile，MUST NOT 复用 injection-calibration/v1 或 treatment-comparison/v1。新 profile MUST 在 `profiles/index.ts` 注册导出。

#### Scenario: lorelum-retrieval 为 declared 实验组
- **WHEN** 解析 conditions
- **THEN** lorelum-retrieval 的 status 为 declared，channel 为 mock-retrieval-tool-call，而非 unavailable

#### Scenario: 不复用 injection-calibration
- **THEN** profile 的 condition 集合与 channel 类型不包含 injection-calibration/v1 的 condition-scoped-private-runtime 显式注入语义

### Requirement: mock-retrieval-tool-call 通道

系统 MUST 提供 `mock-retrieval-tool-call` 通道：agent 可调用 `skills_list`、`skills_load` 与加载后才可用的 `lorelum_query`。runner MUST NOT 预先注入 Lorelum 或查询结果；Practice 正文 MUST NOT 进入 public 工作区；trace 只记录 redacted 信息。

`skills_list` MUST 以通用方式说明其用于发现与已读公开任务或源码中的未解析项目政策引用相关的可选指导能力。该工具说明 MUST NOT 提到本题的政策编号、行为答案、Lorelum 或任何具体实现，且 MUST NOT 要求 agent 调用工具。目录发现调用 MUST 关联已读公开输入与任务锚点。

#### Scenario: agent 主动查询
- **WHEN** lorelum-retrieval 条件下 agent 触发查询
- **THEN** 目录发现与 query 的 public_refs 对应本次已读取公开输入，调用文本含有任务锚点，mock 将三字段结构作为工具返回提供给 agent，工作区不出现 private/practices 路径或 Practice 正文

#### Scenario: trace redacted
- **THEN** trace 记录公开输入、发现、加载、查询与返回事件，均不含 Practice 正文

### Requirement: trace 记录三层事件

系统 MUST 在 trace 中记录真实事件：public_input_read、skill_discovered、skill_loaded、practice_query_issued、practice_query_resolved。每层 MUST 包含足够审计的 redacted 元信息，MUST NOT 包含 Practice 正文或私有路径。缺少任一真实事件链不得计为处理组成功。

#### Scenario: 真实事件链齐全
- **WHEN** lorelum-retrieval 条件完成一次尝试
- **THEN** trace 包含公开输入、发现、加载、查询与返回事件，可据此判定过程链是否成立

#### Scenario: 过程链缺失
- **WHEN** trace 缺少任一层事件但结果通过
- **THEN** 不记为听懂约束

### Requirement: revision 冻结与运行有效性

系统 MUST 将发生 extension telemetry 异常的 `async-cleanup-v1` pilot 保留为无效历史证据，且 MUST NOT 修改该 revision。后续修复必须创建 `async-cleanup-v2`。每次 v2 attempt MUST 在效果判定前通过运行有效性门：extension error 为零，trace 与 audit 一致，且 stdout、stderr、summary、trace 与 agent workspace 均不含 private 路径或 Practice 原文。

#### Scenario: end event 不含 args
- **WHEN** Pi 发出不含 args 的 `tool_execution_end` read event
- **THEN** extension 仅用该 event 的 toolCallId 结算先前 start event，且不抛出异常、不干扰 agent

#### Scenario: 无效 attempt 不作能力归因
- **WHEN** extension error、trace/audit 不一致或私有材料泄露发生
- **THEN** attempt 标记为 invalid，并从效果统计与模型/Pi 能力结论中排除

### Requirement: v2 以政策缺口驱动异步操作归属修复

`async-cleanup-v2` 的公开任务 MUST 描述项目范围切换与同范围手动重载中的结果错位，并包含一个不解释行为语义的项目政策编号。公开材料 MUST 说明该编号约束发布行为、但其定义不在公开代码中；不得提及 Lorelum、Skill、Practice、目录、查询、cleanup、AbortController 或固定实现。private 质量门 MUST 分别验证跨范围和同范围重载时，旧操作的成功与失败都不会调用状态 setter。

#### Scenario: 公开故障但实现开放
- **WHEN** agent 阅读 v2 task 与运行公开测试
- **THEN** 它能观察到需要修复的结果错位与未解析政策引用，但不会收到工具调用或具体实现指令

#### Scenario: 双异步终态质量门
- **WHEN** 跨范围或同范围的旧操作在被新操作取代后 resolve 或 reject
- **THEN** 四种情形下组件状态 setter 调用数均为零

### Requirement: 发现门先于完整质量 pilot

系统 MUST 在完整三条件质量 pilot 前执行 lorelum-retrieval 的三次轻量触发校准。每次校准均须有带已读公开锚点的 `skills_list -> skills_load -> lorelum_query` 真实事件链；任一次缺失时，runner MUST 报告发现门未通过并停止，MUST NOT 执行完整九次质量 pilot。该校准不得创建正式 record 或升级 suite。

#### Scenario: 发现门通过
- **WHEN** 三次触发校准均具备完整真实事件链
- **THEN** runner 允许执行 baseline、lorelum-retrieval、irrelevant-practice 各三次的质量 pilot

#### Scenario: 发现门未通过
- **WHEN** 任一触发校准未发生完整真实事件链
- **THEN** runner 仅输出 redacted 发现门诊断并停止，不对 Lorelum 效果或模型质量行为作正向归因
