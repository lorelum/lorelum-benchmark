# llm-provider-gateway-v3-practice-judge Specification

## Purpose

定义重做后 `llm-provider-gateway-v3` candidate 的公开/私有边界、结构缺口设计、Practice-aware judge 校准与判别力验证要求，使"注入 oracle Practice 后评分更高"具备可判别性。

## ADDED Requirements

### Requirement: 公开题面只声明基本行为要求

v3 `public/task.md` MUST 只声明被测 Practice 的基本行为要求（如接入 Nebula、fallback/retry、租户预算、幂等、流式失败记账），细化结构约定 MUST 由 Practice 提供；task.md MUST NOT 预写 Practice 中的分层/边界/集中政策细节。

#### Scenario: task.md 不泄露 Practice 结构约定

- **WHEN** 审计 v3 public 面
- **THEN** task.md 不包含 transport-isolation、boundary-translation、policy-centralization 等 Practice 结构纪律措辞或等价细节

### Requirement: starter 故意留结构缺口

v3 `public/starter` MUST 保留传输 adapter 与 API 文档，MUST 移除预置领域翻译/策略/账本边界；baseline 能过基本功能但拿不到结构分，oracle 按 Practice 补上缺口拿高分。公开测试经 stub 拦截，不依赖产品内埋点。

#### Scenario: baseline 存在可解释缺口

- **WHEN** baseline 条件基于占位 starter 完成 v3 task
- **THEN** 基本功能可过但 Practice-aware judge 结构维度显著低于 oracle，且缺口可由 Practice 弥补

### Requirement: Practice-aware judge 校准与判别力验证

v3 candidate MUST 在模型比较前用真实 judge（显式 opt-in）验证判别力：reference/equivalent 高分、anti-pattern/docs-present 低分且有判别差距；oracle 与 irrelevant 必须有方向差异。judge 分数仍为软信号，不改变 semantic 或 practice_observation。

#### Scenario: 判别力验证通过

- **WHEN** 用 practice-aware judge 对 v3 calibration 夹具打分
- **THEN** reference/equivalent 高分且接近，anti-pattern/docs-present 低分且与 reference 拉开差距，各维度方向正确

#### Scenario: 判别力不足

- **WHEN** oracle 与 irrelevant 无差异或 anti-pattern 未被扣分
- **THEN** 该 candidate 的 judge 通道标记诊断性，不得用于方向性结论

### Requirement: 不产生正式产物

v3 重做、校准与回归 MUST NOT 调用模型、创建正式 record、升级 suite revision 或进入默认 suite。任何后续三条件 pilot 或模型比较 MUST 另立 issue 并在 v3 校准与生命周期门禁通过后执行。

#### Scenario: candidate 交付完成

- **WHEN** v3 calibration、`bun run validate`、OpenSpec strict、泄露审计与 `git diff --check` 全绿
- **THEN** v3 仍保持 candidate 生命周期，未创建正式 record

#### Scenario: 门禁未通过

- **WHEN** 任一验证未通过
- **THEN** v3 不得进入模型比较，修复后重新校准和验证
