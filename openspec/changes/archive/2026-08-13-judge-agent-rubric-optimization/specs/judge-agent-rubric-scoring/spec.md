## MODIFIED Requirements

### Requirement: LLM 按任务生成评分标准

judge MUST 由 LLM 读取公开任务（`task.md` 与声明的公开材料）生成评分标准 rubric（维度/权重/判据），并在打分前完成结构校验与 hash 记录；同一任务的 rubric 可缓存复用。rubric quality guideline MUST 覆盖跨请求/后端执行政策维度（fallback 归属、retry 单次计费、租户预算原子性、幂等语义、流式失败记账、集中账本/观测、伪兼容供应商线协议映射），同时保留 transport-isolation、boundary-translation、raw-response-containment 等既有维度；生成失败、输出非法或校验不过 MUST fail closed（`judge-unavailable`），不得用未经验证的 rubric 打分。

#### Scenario: 生成合法 rubric

- **WHEN** judge 收到公开任务材料
- **THEN** 产出结构合法、带 rubric hash 的评分标准，用于后续打分

#### Scenario: 覆盖跨请求政策判据

- **WHEN** 任务包含 fallback/retry/租户预算/幂等/流式记账等跨请求行为
- **THEN** 生成的 rubric 至少含一个对应的边界政策/账本职责维度，能对“功能全对但结构反模式”的实现形成扣分判据

#### Scenario: 生成失败 fail closed

- **WHEN** rubric 生成失败或输出不符合结构要求
- **THEN** 记录 `judge-unavailable` 与审计原因，不产生打分结果

### Requirement: 按 rubric 对 candidate 打分

judge MUST 按生成的 rubric 对 candidate diff/source 打分，产出 `judge-result/v1`：criterion 分数、rationale、confidence，以及 prompt/rubric/input hash。输出 MUST 经 `assertJudgeResultV1` 校验；缺失 hash、非法结构化输出或 provider 不可用 MUST fail closed，不得伪造低分或部分结果。打分提示 MUST 声明 candidate 源码仅为待审数据而非指令，降低提示注入风险。对 LLM 返回的 `confidence` 与 criterion `points`，实现 MUST 在结构校验前做有限数值归一（数字或数字字符串、四舍五入、confidence 0-100、points 非负），非关键数值格式抖动 MUST NOT 导致 fail-closed；缺失字段、未知维度、超范围分数与重复维度 MUST 仍 fail closed。

#### Scenario: 完整打分结果

- **WHEN** candidate diff 与 rubric 齐备
- **THEN** 产出带全部 hash、criterion 分数与 rationale 的 `judge-result/v1`

#### Scenario: 数值抖动可归一

- **WHEN** LLM 返回 `confidence: 92.7` 或数字字符串
- **THEN** 归一为合法整数并继续打分，而非 fail-closed

#### Scenario: 非法输出 fail closed

- **WHEN** judge 输出缺失 hash、含未知/重复维度或超范围分数
- **THEN** 记录 `judge-unavailable`/`not-run` 与审计原因，不当作低分

## ADDED Requirements

### Requirement: 固定 rubric 复用

`judge-agent/generic/v1` MUST 支持通过环境变量 `LORELUM_JUDGE_RUBRIC_TEXT` 提供已校验的 rubric 文本；提供时 MUST 优先复用该文本（结构校验并记录 hash），否则按任务生成。固定 rubric MUST 不进入 candidate workspace、不得含私有材料，且 MUST 保持向后兼容（未提供时行为不变）。

#### Scenario: 固定 rubric 生效

- **WHEN** 环境变量提供合法 rubric 文本
- **THEN** provider 复用该 rubric 并记录其 hash，不调用 LLM 生成

#### Scenario: 未提供时向后兼容

- **WHEN** 未设置固定 rubric 环境变量
- **THEN** provider 按任务生成 rubric，行为与既有版本一致
