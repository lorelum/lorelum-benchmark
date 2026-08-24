# llm-provider-gateway-v3-practice-judge Specification

## Purpose

定义重做后 `llm-provider-gateway-v3` candidate 的公开/私有边界、结构缺口设计、Practice-aware judge 校准与判别力验证要求，使"注入 oracle Practice 后评分更高"具备可判别性。

## ADDED Requirements

### Requirement: 公开题面只声明基本行为要求

v3 `public/task.md` MUST 只声明被测 Practice 的基本行为要求（如接入 Nebula、fallback/retry、租户预算、幂等、流式失败记账），细化结构约定 MUST 由 Practice 提供；task.md MUST NOT 预写 Practice 中的分层/边界/集中政策细节。

#### Scenario: task.md 不泄露 Practice 结构约定

- **WHEN** 审计 v3 public 面
- **THEN** task.md 不包含 transport-isolation、boundary-translation、policy-centralization 等 Practice 结构纪律措辞或等价细节

### Requirement: starter 与 judge baseline 夹具职责分离

v3 `public/starter` MUST 保留传输 adapter 与 API 文档，MUST 移除预置领域翻译/策略/账本边界。该未完成 scaffold 允许 semantic fail，并只作为 judge indeterminate 诊断样本；判别力校准 MUST 另用 semantic pass 且 Practice 结构未达标的 `baseline-policy-scatter` fixture 作为可评分 baseline。公开测试经 stub 拦截，不依赖产品内嵌点。

#### Scenario: scaffold 缺口被保留

- **WHEN** 审计 v3 public starter
- **THEN** 基本传输材料保留，领域翻译、集中政策与账本边界不预置，公开语义测试对 scaffold 为 fail

#### Scenario: baseline judge 缺口可评分

- **WHEN** 对 `baseline-policy-scatter` fixture 运行 Practice-aware judge
- **THEN** fixture semantic pass 且处于 observed 状态，结构总分低于 reference，缺口可由 Practice 弥补

### Requirement: Practice-aware judge 校准与判别力验证

v3 candidate MUST 在 candidate 模型比较前用真实 judge（显式 opt-in）验证判别力：reference/equivalent 高分且接近，anti-pattern/docs-present/baseline-policy-scatter 低分或有明确差距，public-starter indeterminate 不得被合成低分或计入判别通过。judge 分数仍为软信号，不改变 semantic 或 practice_observation。

#### Scenario: 判别力验证通过

- **WHEN** 用已绑定 hash 的 practice-aware rubric 对 v3 calibration 夹具打分
- **THEN** reference/equivalent 高分且接近，anti-pattern/docs-present 低分且分离，baseline-policy-scatter observed 且低于 reference，所有样本保留 criterion 与 full/partial/zero anchor 级证据与状态

#### Scenario: indeterminate 不伪造低分

- **WHEN** public-starter 或任一关键 fixture 无法被 judge 观测
- **THEN** 保留 indeterminate/null score 与原因，不转换为 0 分通过判别检查

#### Scenario: 判别力不足

- **WHEN** 任一关键判别检查失败或 rubric 缺少 Practice 结构维度
- **THEN** 该 candidate 的 judge 通道标记 diagnostic-only，不得用于方向性结论

### Requirement: 决策规则与正式产物边界

当前 candidate contract 的决策 metric 保持 `joint-pass-count`；practice-aware judge 结果在本次交付中是 exploratory/diagnostic soft signal，MUST NOT 参与该 metric。若后续要把 judge score 作为主判据，MUST 另立 issue 与版本化 decision-rule change。v3 重做与校准 MUST NOT 调用 candidate 模型、创建正式 record、升级 suite revision 或进入默认 suite；显式 opt-in 的真实 judge-model calibration 是允许例外。

#### Scenario: candidate 交付完成

- **WHEN** v3 calibration、`bun run validate`、OpenSpec strict、泄露审计与 `git diff --check` 全绿
- **THEN** v3 仍保持 candidate 生命周期，未创建 formal record，decision rule 仍为 joint-pass-count

#### Scenario: judge 分数不进入决策 metric

- **WHEN** 后续 pilot 使用当前 conditions contract
- **THEN** joint-pass-count 仅由 semantic 与 practice observation 派生，practice-aware judge 作为独立 diagnostic sidecar 报告