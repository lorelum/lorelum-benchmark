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

### Requirement: 异步生命周期质量门稳定检出 baseline 缺陷

evaluator MUST 用静态 AST 结构门检出 useEffect 回调未返回 cleanup 函数，并用运行时测试验证“延迟请求 -> 卸载 -> resolve”后状态 setter 未被调用；MUST NOT 依赖 React warning。reference 实现（带有效 cleanup）MUST 通过两道质量门，naive starter（不带 cleanup）MUST 失败。

#### Scenario: baseline 失败
- **WHEN** 评估 naive starter
- **THEN** AST 探针报告 useEffect 未返回 cleanup，语义可能通过但质量探针失败

#### Scenario: 卸载后状态更新被阻断
- **WHEN** 请求在组件卸载后才 resolve
- **THEN** evaluator 记录到的组件状态 setter 调用数为零

#### Scenario: reference 通过
- **WHEN** 评估带 cleanup 的 reference
- **THEN** AST 结构门与运行时质量门均通过

### Requirement: pilot 先确认 baseline 失败模式

candidate 正式用作对照前 MUST 先跑本地 pilot，确认 baseline 下 agent 确实写出不带 cleanup 的 useEffect。若 baseline 失败模式不成立，MUST 暂停并重新选场景，MUST NOT 自行假设。

#### Scenario: baseline 失败模式成立
- **WHEN** baseline pilot 的产出被 AST 探针判为失败
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

#### Scenario: agent 主动查询
- **WHEN** lorelum-retrieval 条件下 agent 触发查询
- **THEN** query 的 public_refs 对应本次已读取公开输入，query 含有任务锚点，mock 将三字段结构作为工具返回提供给 agent，工作区不出现 private/practices 路径或 Practice 正文

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
