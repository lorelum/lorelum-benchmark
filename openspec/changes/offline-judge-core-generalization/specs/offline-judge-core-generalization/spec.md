## ADDED Requirements

### Requirement: Offline local Judge execution is explicit and reproducible

离线 Judge 原型 MUST 只使用一个不超过 3B 参数的本地模型 artifact，并 MUST 通过显式命令启用。该命令 MUST 固定并记录 model artifact hash、量化、tokenizer、chat template、runtime identity、上下文预算、temperature、seed、prompt hash 和 core hash；模型权重 MUST NOT 入库。运行 MUST 使用本地 runtime 或 loopback 服务，MUST NOT 下载权重、调用远端模型或访问外部 API；配置或 artifact 缺失时 MUST fail closed。

#### Scenario: Explicit local run records complete identity

- **WHEN** 维护者在模型 artifact 和本地 runtime 已准备好的机器上显式运行原型
- **THEN** run provenance 包含完整模型、runtime、prompt、core、scenario 和配置 identity，并且不依赖外部网络

#### Scenario: Missing artifact fails closed

- **WHEN** 本地模型 artifact、runtime 或必要配置缺失
- **THEN** 原型记录 unavailable/not-run 原因并退出，不下载模型、不静默切到远端、不产出低分

#### Scenario: Remote configuration is rejected

- **WHEN** 配置指向非 loopback 模型端点或包含远端 provider 凭据
- **THEN** 原型拒绝运行并记录离线边界失败

### Requirement: Core logic is scenario-independent

Judge core MUST 只消费归一化 scenario profile、evidence projection、固定 rubric 和 pair cases，MUST NOT 包含任务名、目录名、源码语言、Practice 名称或场景特有字段分支。Scenario adapter MAY 做确定性 evidence 投影、字段映射和 public/private 检查，但 MUST NOT 内嵌场景专用评分启发式或绕过 core 产生语义 verdict。加入新场景时，core、system prompt 主体、输出协议、decision mapping 和 aggregation MUST 保持 zero-diff。

#### Scenario: Two development scenarios share one core

- **WHEN** Gateway v3 和 Source-authority 两个开发场景运行同一 core
- **THEN** 两者只通过各自 scenario profile、adapter、rubric 和 labels 提供差异，core 与 prompt 主体 hash 相同

#### Scenario: Holdout adds only scenario material

- **WHEN** 已冻结的 Compaction holdout 被加入
- **THEN** diff 只包含允许的 scenario profile、adapter、rubric 和 labels；core、system prompt 主体、输出协议和 aggregation 不变

#### Scenario: Scenario-specific branch appears in core

- **WHEN** 为了让某个场景通过而需要在 core 或 prompt 主体加入该场景名称、字段名或专用规则
- **THEN** 通用性断言失败，必须记录失败或另立新版本并重新校准

### Requirement: Bounded model judgements and deterministic abstain

本地模型 MUST 只回答受约束的 evidence relation（`supports | contradicts | insufficient`）和 pairwise preference（`A | B | tie | insufficient`）。结构性字段、evidence citation、聚合和 abstain MUST 由确定性代码处理。未知 verdict、缺失字段、未知 evidence id、冲突判断或非法 confidence MUST fail closed 或 abstain；模型输出非法 MUST NOT 被解释为低分。Model-provided confidence MUST be diagnostic only and MUST NOT alter the verdict or aggregation.

#### Scenario: Valid model judgement

- **WHEN** 模型返回 schema 合法的 relation 或 pairwise verdict，并引用允许的 evidence ids
- **THEN** core 记录原始 verdict、解析后 verdict、evidence references、confidence 和 provenance

#### Scenario: Invalid output abstains

- **WHEN** 模型返回未知 verdict、缺字段、未知 evidence id 或与明确证据冲突的判断
- **THEN** core 以 `insufficient`、`indeterminate` 或 `judge-unavailable` 记录，不产生确定低分

#### Scenario: Insufficient evidence abstains

- **WHEN** evidence projection、rubric 匹配或模型判断明确为 insufficient
- **THEN** 该 case abstain，并保留触发 abstain 的证据和原因

### Requirement: Evidence and provenance are bounded and auditable

每次 run MUST 记录 core hash、system prompt hash、scenario profile version、adapter version、rubric hash、labels hash、input hash、evidence hashes、model/runtime identity、threshold identity、命令身份和逐 decision provenance。模型输入 MUST 只包含 adapter 白名单投影；私有路径、oracle、condition、labels、Practice payload、calibration material 或未脱敏本地路径 MUST NOT 进入模型输入。证据引用 MUST 指向本次投影中存在的稳定 evidence id。

#### Scenario: Complete provenance is recorded

- **WHEN** 一个 case 完成判决
- **THEN** 可以从 report 追溯到 core、prompt、模型、scenario、rubric、evidence、input、threshold 和 decision 的来源

#### Scenario: Private material is rejected

- **WHEN** adapter 或模型输入包含私有路径、labels、oracle、condition 或 calibration material
- **THEN** 调用在任何模型请求前 fail closed，并以脱敏原因记录

#### Scenario: Evidence citation is invalid

- **WHEN** 模型引用不存在的 evidence id
- **THEN** 该判断被判为非法并 abstain，不得保存为有效 verdict

### Requirement: Calibration uses fixed labels and observable uncertainty

开发校准 MUST 使用预先固定的私有 labels，并分别记录 pairwise accuracy、等价对稳定性、A/B 顺序交换一致性、abstain、evidence reference validity、schema validity 和 high-confidence errors。Decision mapping、abstain 规则和 aggregation 由 core 固定，scenario profile MUST NOT 覆盖；calibration MUST NOT 使用隐藏加权总分或根据结果反向调 labels。

#### Scenario: Development calibration is reported

- **WHEN** Gateway v3 和 Source-authority 运行开发校准
- **THEN** 每个场景分别输出原始指标、通过/不通过/不确定状态和失败样例，而不是只输出合并分数

#### Scenario: Equivalent pair is unstable

- **WHEN** 等价 pair 在不同顺序或重复运行中被稳定判为一方优于另一方
- **THEN** 报告标记等价稳定性失败，并保留原始 verdicts

#### Scenario: Evidence is insufficient for calibration

- **WHEN** 样本数、label 质量或 evidence 可靠性不足
- **THEN** 状态为 `indeterminate` 或 `holdout-not-ready`，不得以少量结果宣布通过

### Requirement: Holdout is predeclared, frozen, and not used for tuning

Compaction 摘要 MUST 作为预先声明的 holdout。运行前 MUST 固定 core、system prompt 主体、输出协议、模型 artifact、runtime、temperature、seed、schema、decision mapping、aggregation 和 success thresholds；加入 holdout 时只允许新增 scenario profile、evidence adapter、rubric 和 labels。Holdout labels MUST NOT 用于调 prompt、改 core、选阈值或重跑择优。任何 core/prompt/schema/threshold 改动都会产生新版本，原通用性断言 MUST 记为失败或未完成。

#### Scenario: Frozen holdout runs once

- **WHEN** holdout 身份和 thresholds 已冻结
- **THEN** 维护者显式运行 holdout，并在报告中记录冻结 hash、实际 hash、原始输出和最终解释

#### Scenario: Core or prompt changes after freeze

- **WHEN** holdout 运行前后 core 或 prompt 主体 hash 不同
- **THEN** 该 holdout 结果不能用于通用性通过结论，必须记录原因并按新版本重新声明

#### Scenario: Holdout material is insufficient

- **WHEN** 无法形成可辩护的最小 fixture 或 labels
- **THEN** 标记 `holdout-not-ready`，不得替换为更简单或已经用于调参的场景

### Requirement: Generalization report preserves raw evidence and limits claims

Change MUST 产出可审阅的 generalization report，包含 dev 与 holdout 的原始指标、每场景通过/失败/不确定状态、失败与 abstain 样例、允许的 adapter diff、core/prompt zero-diff 证据、冻结与运行命令 identity，以及未解决问题。Report MUST NOT 用隐藏加权总分掩盖失败，也 MUST NOT 将已验证场景范围外推为全领域评分能力。

#### Scenario: Report supports review

- **WHEN** 维护者审阅 generalization report
- **THEN** 可以区分模型能力、adapter 适配、标签质量、evidence 可靠性和阈值失败，并复核原始结果

#### Scenario: Claim exceeds tested scope

- **WHEN** 报告把 holdout 通过表述为所有任务、所有证据形态或所有模型的通用 judge 能力
- **THEN** 该 claim 被拒绝，结论必须限制在已冻结场景和模型 identity

### Requirement: Prototype preserves benchmark semantics and integration boundaries

原型 MUST 只读适配固定任务 rubric，并 MUST 保持本地 Judge 为软信号/诊断设施；它 MUST NOT 改变语义硬门槛、P1/Pi runner、正式 record、suite/candidate、公共 schema、provider registry 或 `judge-result/v1`。普通 CI MUST 只验证确定性投影、schema、abstain、provenance、报告和 zero-diff 检查，MUST NOT 下载、加载或调用真实本地模型。未来进入 #209、公共 provider 或 runner 的集成 MUST 另立 change。

#### Scenario: Semantic result remains independent

- **WHEN** 一个 attempt 通过公开产品语义测试但本地 Judge abstain 或给低质量信号
- **THEN** 语义结果保持通过，Judge 结果只作为独立诊断记录

#### Scenario: CI does not load a model

- **WHEN** 普通 CI 运行 benchmark contract tests
- **THEN** 只使用 deterministic fixtures/mocks，不下载权重、不启动本地模型、不调用网络

#### Scenario: Future integration needs a new change

- **WHEN** 原型结论通过后需要接入 #209、公共 provider、schema 或 runner
- **THEN** 另立 OpenSpec change，并说明旧 judge 版本和历史 record 的解释保持稳定
