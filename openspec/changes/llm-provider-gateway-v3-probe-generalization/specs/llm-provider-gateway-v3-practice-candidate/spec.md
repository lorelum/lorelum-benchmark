# llm-provider-gateway-v3-practice-candidate Specification

## Purpose

定义 `llm-provider-gateway-v3` candidate 的要求：以 v2 的公开行为题面与跨请求执行政策为输入，创建独立 revision，替换名称敏感的私有结构探针与校准矩阵，强制采用 `practice-structure-probe-calibration` 的命名无关证据标准，并保持 v1/v2 与历史结果不变。

## ADDED Requirements

### Requirement: v3 是独立 revision 且不修改 v2

`llm-provider-gateway-v3` MUST 位于 `incubator/practice-injection/llm-provider-gateway-v3/`，拥有独立 candidate id、source/snapshot/profile 身份与 `lifecycle_stage: candidate`。实现 MUST NOT 修改 `llm-provider-gateway-v1/v2` 的 public/private 材料、snapshot、pilot 结果、suite、treatment 或 record。

#### Scenario: v2 保持冻结

- **WHEN** v3 创建、校准或验证
- **THEN** v2 的文件、snapshot 与已记录诊断结果保持逐字节不变

#### Scenario: 独立身份

- **WHEN** v3 生成 snapshot
- **THEN** snapshot 与 profile input identity 区别于 v1/v2，默认 active suite 不包含 v3

### Requirement: v3 复用 v2 的公开行为题面

v3 的 `public/task.md`、`public/starter`、公开语义测试与 `docs/gateway-api.md` MUST 与 v2 的公开行为契约语义一致：相同 REST/SSE 接口、四种供应商协议、fallback/retry 单次计费、租户预算原子性、幂等、流式失败记账、JSONL/usage 聚合与统一领域错误。公开面 MUST NOT 出现 benchmark、评分、rubric、hash、condition、evaluator 或探针实现痕迹。

#### Scenario: 语义门槛可对照

- **WHEN** 对 v3 执行公开语义测试
- **THEN** 断言与 v2 公开行为等价，且本地 stub、固定价目表与 rounding 规则保持不变

#### Scenario: 无私有泄露

- **WHEN** 审计 v3 public 面
- **THEN** 不包含 private probe、naming-variant、oracle、calibration 或评分配置内容

### Requirement: v3 结构探针采用通用泛化规范

v3 private probe MUST 满足 `practice-structure-probe-calibration`：以 TypeScript import graph、调用/数据流、类型契约与模块所有权判定 handler/policy/registry/adapter/ledger 职责，MUST NOT 用固定标识符集合单独判通过；任何命名线索 MUST 有结构证据和真实输出变体回归兜底。

#### Scenario: 职责集中但命名不同

- **WHEN** 候选将 retry/fallback/budget/idempotency/metering 集中到一个非 transport 边界模块，但未使用 reference 名称
- **THEN** probe MUST 判 `observed`

#### Scenario: 命名碰撞但职责散落

- **WHEN** 候选偶然使用 `reserveBudget`、`settleBudget`、`retryAttempts` 等名称，但职责散落在 handler/transport 内
- **THEN** probe MUST 判 `not-observed`

### Requirement: v3 calibration 必须包含真实命名变体

v3 calibration matrix MUST 在 `private/calibration/sets/quality-probe/v3/` 中包含 reference、equivalent、type-based、docs-present 与 anti-pattern 基线，并 MUST 增加至少四类从 #168 真实输出提炼的变体：职责集中但命名不同、职责集中但不同模块布局、命名碰撞但职责散落、结构正确但账本记录命名不同。全部样例 MUST 保持 private，MUST 通过 kernel calibration 与 snapshot identity 固定。

#### Scenario: 变体分类正确

- **WHEN** kernel 运行 quality-probe/v3 校准矩阵
- **THEN** 职责等价变体 semantic pass + `observed`；命名碰撞/反模式变体 semantic pass + `not-observed`；public-starter semantic fail + `not-observed`

#### Scenario: 任一命名变体失败

- **WHEN** 任一命名变体实际标签与预期不一致
- **THEN** v3 不得进入模型比较，任务 MUST 记录 blocked 与失败 reason

### Requirement: judge 仅作软评分且不掩盖结构证据

v3 candidate MUST 声明 `judge-agent/generic/v2` 作为软评分 sidecar，judge 的 criterion rationale MUST 引用职责/调用/数据证据，MUST NOT 仅凭命名证明或否定结构达标；judge 分数 MUST NOT 改变 semantic 或 `practice_observation` 结论，MUST NOT 作为唯一 oracle。joint-pass MUST 仍派生为 semantic=pass 且 structure probe=observed。

#### Scenario: probe 与 judge 独立

- **WHEN** judge 给出低分或高分
- **THEN** semantic 与 practice_observation 不被改写，probe evidence 与 judge criterion evidence 分别保留

#### Scenario: judge 判别力校准

- **WHEN** v3 在模型运行前执行 judge calibration
- **THEN** 校准包含 naming-variant 正例与 anti-pattern 反例，未通过时 judge 通道保持 diagnostic 状态

### Requirement: v3 不产生正式产物

v3 candidate 交付、校准与回归 MUST NOT 调用模型、创建正式 record、升级 suite revision 或进入默认 suite。任何后续三条件 pilot 或模型比较 MUST 另立 issue 并在 v3 校准与生命周期门禁通过后执行。

#### Scenario: candidate 交付完成

- **WHEN** v3 calibration、`bun run validate`、OpenSpec strict、泄露审计与 `git diff --check` 全绿
- **THEN** v3 仍保持 candidate 生命周期，未创建正式 record

#### Scenario: 门禁未通过

- **WHEN** 任一验证未通过
- **THEN** v3 不得进入模型比较，修复后重新校准和验证
