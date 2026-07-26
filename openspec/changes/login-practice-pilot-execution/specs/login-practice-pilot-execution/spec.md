## ADDED Requirements

### Requirement: 小试执行必须经过负责人确认

系统 MUST 在任何 candidate fixture、执行治理或模型调用实现前，先取得负责人对可观察行为、Practice 行为、baseline 区分度、相关与无关对照、私有验收、candidate/source snapshot、模型/提示/预算与盲评边界的明确确认。确认内容必须写回 Issue #75 以及本 change 的 `design.md` 和 `tasks.md`；任一会改变实验解释的未决问题必须阻断实现和执行。

#### Scenario: 确认信息完整
- **WHEN** 初始 OpenSpec PR 已创建且负责人提供了全部规划确认
- **THEN** 维护者将确认内容写回 Issue #75、`design.md` 和 `tasks.md`，才可以开始经确认的实现工作

#### Scenario: 存在未决执行输入
- **WHEN** 模型版本、artifact storage、盲评边界或停止条件尚未确认
- **THEN** 系统不得执行模型调用、创建 candidate 执行配置或生成任何 run record

### Requirement: 有效尝试必须保持已声明条件隔离

系统 MUST 仅执行 `conditions.yaml` 中已声明的 baseline、Oracle Practice、无关 Practice 条件，每个条件恰好两次；`lorelum-retrieval` 必须保持 unavailable 且不得执行。每次有效尝试必须使用新工作区、同一批准的 candidate/source snapshot、公共输入 hash、模型/提示/预算与工具策略；唯一预期差异是经 condition-scoped private runtime 注入的 Practice。

#### Scenario: Oracle Practice 尝试开始
- **WHEN** 已批准的 Oracle Practice 尝试创建工作区
- **THEN** 工作区只包含 `public/task.md` 与 `public/starter/`，且 Oracle Practice 仅经私有运行时通道提供

#### Scenario: 检索条件缺少可复现输入
- **WHEN** `lorelum-retrieval` 仍缺少来源、输出 hash 或可复现版本
- **THEN** 系统将其标记为 unavailable，而不是以空输入或临时检索结果运行

### Requirement: 私有材料与公共运行环境必须隔离

系统 MUST 不得将 Practice 正文、oracle、evaluator、snapshot、盲评映射或其他 private 内容复制进 agent workspace、公开 task prompt、starter、public trace 或公开日志。公开运行记录只可包含 Practice 版本和 hash；私有 evaluator 仅可在 agent 结束后运行。

#### Scenario: 尝试结束后进行私有评测
- **WHEN** agent 完成候选代码并退出工作区
- **THEN** 执行方才可使用 private evaluator 和 oracle 运行语义与分层探针

#### Scenario: 发现私有内容泄露
- **WHEN** 审计发现 private 内容位于工作区、公开 trace 或公开日志
- **THEN** 该尝试必须无效，执行必须停止并完成泄露审计，结果不得进入条件比较

### Requirement: 有效尝试必须具有受保护且可核验的证据

系统 MUST 在执行前确认受保护 artifact storage 的 URI、写入身份、版本化和不可变保留。每次尝试必须保存提示输入、执行输出/trace、候选 diff、语义与分层探针结果、环境信息、成本、时延、重试和有效性状态，并为每项 artifact 保存 URI 与 SHA-256。仓库只能在 `private/evidence-index/` 登记允许的 URI、hash、execution snapshot、condition 与盲评映射的受限位置。

#### Scenario: artifact storage 已核验
- **WHEN** 一次尝试即将开始且 storage 已确认可写、版本化并启用不可变保留
- **THEN** 系统允许创建该尝试，并在结束后核验每项 artifact 的 URI 和 SHA-256

#### Scenario: artifact 核验失败
- **WHEN** 任一必要 artifact 缺少不可变保留、URI 或 SHA-256
- **THEN** 该尝试必须无效且不计入比较，不得以本地文件或仓库提交替代

### Requirement: 诊断性评测与报告必须保持维度独立

系统 MUST 对每个有效尝试独立记录公开浏览器语义检查和私有 AST 分层探针，并对随机化、脱敏材料完成隐藏 condition 的相关性/利用率盲评。决策只使用“语义与分层探针均通过”的原始次数：只有 Oracle 次数严格高于 baseline 与无关 Practice 时，结果才可支持通过新的 change 探索后续工作；其他结果只能报告为诊断性或不确定。

#### Scenario: Oracle 条件严格领先
- **WHEN** 六次有效尝试均有完整证据，且 Oracle 的双通过次数严格高于 baseline 与无关 Practice
- **THEN** 报告可提出由负责人决定是否新建 change 探索扩展，但不得将本小试表述为正式 benchmark 结论

#### Scenario: 任一条件未形成可解释优势
- **WHEN** Oracle 未严格高于 baseline 或无关 Practice，或者盲评无法有效完成
- **THEN** 报告必须标注诊断性或不确定，不得使用加权总分、盲评印象或 candidate 校准替代失败的证据

### Requirement: 小试不得改变正式 benchmark 生命周期

系统 MUST 不得因完成或部分完成此小试而创建正式 Pi record、修改 `suites/`、晋升 task revision、修改活跃 runner/treatment/environment/schema，或改写 #73/#77 的归档事实。后续自动化、检索接入、suite 晋升或正式 record 必须通过独立的 OpenSpec change。

#### Scenario: 小试产生候选证据
- **WHEN** 小试完成且 evidence index 已核验
- **THEN** 结果仍保持 candidate/pilot 证据状态，不写入 `results/records/` 或活动 suite
