## ADDED Requirements

### Requirement: 候选工作区隔离 Skill 触发编排验证

系统 MUST 在 incubator/skill-trigger-orchestration/ 下承载 mock 阶段验证，不进 suites/。public/ 只含 task.md 与 starter；private/ 含 evaluator、oracle、Practice 卡、conditions 与执行治理。私有材料 MUST NOT 进入 agent 工作区或模型输入。

#### Scenario: 工作区实体化
- **WHEN** 执行器创建一次尝试
- **THEN** 它仅复制 public/task.md 与 public/starter/ 到工作区，不复制 private 下任何文件

#### Scenario: mock Practice 注入
- **WHEN** 条件为 lorelum-retrieval 或 irrelevant-practice
- **THEN** Practice 通过 condition-scoped private runtime 通道注入，其版本与 SHA-256 记录在 trace 中，正文不进 public 工作区

### Requirement: mock 查询返回三字段结构

系统 MUST 让 mock 查询返回结构化结果而非自然语言建议，包含范围约束、命中 Practice（引用与原话）、行为约束（非指令）。行为约束 MUST 是不得/必须式限制，MUST NOT 是具体实现指令。

#### Scenario: 返回行为约束
- **WHEN** lorelum-retrieval 条件触发查询
- **THEN** 返回包含异步副作用不得在组件卸载后继续影响状态式约束，由 agent 自行决定实现方式

#### Scenario: 命中 Practice 可审计
- **THEN** 返回结构包含选中 Practice 的 id 与内容哈希，证明约束来自检索而非模型参数记忆

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

### Requirement: AST 探针稳定检出 baseline 缺陷

evaluator MUST 用静态 AST 探针检出 useEffect 回调未返回 cleanup 函数，MUST NOT 依赖运行时 warning。reference 实现（带 cleanup）MUST 通过探针，naive starter（不带 cleanup）MUST 失败。

#### Scenario: baseline 失败
- **WHEN** 评估 naive starter
- **THEN** AST 探针报告 useEffect 未返回 cleanup，语义可能通过但质量探针失败

#### Scenario: reference 通过
- **WHEN** 评估带 cleanup 的 reference
- **THEN** AST 探针报告 cleanup 存在，质量探针通过

### Requirement: pilot 先确认 baseline 失败模式

candidate 正式用作对照前 MUST 先跑本地 pilot，确认 baseline 下 agent 确实写出不带 cleanup 的 useEffect。若 baseline 失败模式不成立，MUST 暂停并重新选场景，MUST NOT 自行假设。

#### Scenario: baseline 失败模式成立
- **WHEN** baseline pilot 的产出被 AST 探针判为失败
- **THEN** candidate 可进入正式对照

#### Scenario: baseline 失败模式不成立
- **WHEN** baseline pilot 的产出意外通过探针
- **THEN** 暂停，在 issue 中记录并重新评估场景
