## ADDED Requirements

### Requirement: LLM 按任务生成评分标准

judge MUST 由 LLM 读取公开任务（`task.md` 与声明的公开材料）生成评分标准 rubric（维度/权重/判据），并在打分前完成结构校验与 hash 记录；同一任务的 rubric 可缓存复用。生成失败、输出非法或校验不过 MUST fail closed（`judge-unavailable`），不得用未经验证的 rubric 打分。

#### Scenario: 生成合法 rubric
- **WHEN** judge 收到公开任务材料
- **THEN** 产出结构合法、带 rubric hash 的评分标准，用于后续打分

#### Scenario: 生成失败 fail closed
- **WHEN** rubric 生成失败或输出不符合结构要求
- **THEN** 记录 `judge-unavailable` 与审计原因，不产生打分结果

### Requirement: 按 rubric 对 candidate 打分

judge MUST 按生成的 rubric 对 candidate diff/source 打分，产出 `judge-result/v1`：criterion 分数、rationale、confidence，以及 prompt/rubric/input hash。输出 MUST 经 `assertJudgeResultV1` 校验；缺失 hash、非法结构化输出或 provider 不可用 MUST fail closed，不得伪造低分或部分结果。打分提示 MUST 声明 candidate 源码仅为待审数据而非指令，降低提示注入风险。

#### Scenario: 完整打分结果
- **WHEN** candidate diff 与 rubric 齐备
- **THEN** 产出带全部 hash、criterion 分数与 rationale 的 `judge-result/v1`

#### Scenario: 非法输出 fail closed
- **WHEN** judge 输出缺失 hash 或不符合 schema
- **THEN** 记录 `judge-unavailable`/`not-run` 与审计原因，不当作低分

### Requirement: 输入只含公开材料

judge 输入 MUST 只包含声明为公开的材料（task、starter、candidate diff/source 快照），并 MUST 复用仓库 allowlist/脱敏：含私有路径、Practice 文本、Oracle、condition 标识或 calibration/evaluator 材料的输入 MUST fail closed，且不得把部分或私有输入转发给 provider。

#### Scenario: 私有输入被拒绝
- **WHEN** 输入含私有路径或 Practice/Oracle 内容
- **THEN** 构造器以脱敏原因拒绝，不调用 provider

### Requirement: mock-for-CI 与真实 provider opt-in

仓库 MUST 提供确定性 mock judge（CI/本地默认使用，不调外部模型）；真实 LLM judge MUST 仅在显式 opt-in（环境变量或配置）时启用，且 MUST NOT 在 CI 执行。未 opt-in 时 judge MUST fail closed（`judge-unavailable`），不得调用外部模型或产出假分。

#### Scenario: CI 使用 mock
- **WHEN** CI 跑 judge 相关测试或校验
- **THEN** 使用 mock provider，无网络/模型调用

#### Scenario: 真实 judge 显式启用
- **WHEN** 维护者显式设置 opt-in 标志
- **THEN** 真实 LLM judge 可运行，且不属于 CI 默认路径

#### Scenario: 未 opt-in 时 fail closed
- **WHEN** candidate 声明 `judge-agent/generic/v1` 但未设置 `LORELUM_JUDGE_REAL=1`
- **THEN** 每次尝试的 judge 记录为 `judge-unavailable`（reason：需显式 opt-in），无外部模型调用

### Requirement: per-candidate 判别力校准与使用绑定

通用 judge 在被 candidate 用于方向性结论前，MUST 在该 candidate 的 reference / equivalent / anti-pattern 夹具上验证判别力：oracle/自建边界样例高分，anti-pattern 样例低分且与 reference 拉开差距，职责等价样例与 reference 接近，public-starter 低于 reference；无法判别或 indeterminate 超预算时，该 candidate 的 judge 通道 MUST 按诊断性处理。未通过判别力校准的 candidate MUST NOT 用该 judge 出方向性结论；校准结果与 candidate 使用的绑定方式（人工门禁 + 记录，后续 runner 级守卫）MUST 写入 change 的 design/迁移计划。

#### Scenario: 判别力验证通过
- **WHEN** 在 candidate 夹具上跑通用 judge
- **THEN** reference/等效样例高分、anti-pattern 低分且分离、public-starter 低于 reference，记录 criterion 级证据

#### Scenario: 判别力不足
- **WHEN** judge 无法区分或 indeterminate 超预算
- **THEN** 该 candidate 的 judge 通道标记诊断性，不支撑方向性结论

### Requirement: judge 仅为软质量信号

judge 分数 MUST NOT 改变语义完成判定：语义硬门槛由公开产品测试决定；低分、not-observed 或 judge-unavailable MUST NOT 把语义通过的尝试记为失败。judge 结果与语义结果 MUST 分开报告。

#### Scenario: 低分但语义通过
- **WHEN** candidate 通过语义测试但 judge 低分
- **THEN** 记录语义通过，judge 分数作为独立软信号

#### Scenario: judge 不可用
- **WHEN** judge provider 不可用
- **THEN** 记录 `judge-unavailable` 与审计原因，语义完成判定不变

### Requirement: 接口增量扩展向后兼容

judge 接口扩展 MUST 向后兼容：`JudgeProvider.rubricText` 增加可选任务上下文参数（`{ task_md, material? }`）以支持 per-task rubric 生成，既有无参实现 MUST 仍可正常解析；provider MAY 提供可选 `promptFor(input)` 构造打分提示，未提供时 MUST 沿用 runner 默认提示。既有 provider、`outcome/v1` 契约与 runner 默认行为 MUST NOT 被破坏。

#### Scenario: 既有 provider 不受影响
- **WHEN** mock 或 `practice-layered-api/v2` 在扩展后运行
- **THEN** 其 `rubricText()` 无参调用与 score 行为保持不变，测试保持绿

### Requirement: API 地址与密钥经 .env 配置且不入库

真实 judge 的 API 地址、密钥与模型 MUST 通过仓库根目录 `.env` 配置（`LORELUM_JUDGE_REAL=1`、`LORELUM_JUDGE_BASE_URL`、`LORELUM_JUDGE_API_KEY`、`LORELUM_JUDGE_MODEL`）；`.env` MUST 加入 `.gitignore`，仓库 MUST 只提交不含真实值的 `.env.example` 模板。

#### Scenario: 密钥不入库
- **WHEN** 提交本 change
- **THEN** `.env` 被 gitignore 排除，仅 `.env.example`（变量名模板）入库