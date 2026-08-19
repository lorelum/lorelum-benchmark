# async-operation-authority-practice-candidate Specification

## Purpose

定义 practice-injection 轨道新建 `async-operation-authority-v1` candidate 的要求：复用
skill-trigger 的 `react.project-operation-authority` Practice 卡与
`skill-trigger-source-authority/v2` judge，通过 `oracle-practice` 显式注入通道验证采纳层
「后台协调仅在无前台在途且距最近一次前台操作启动超过 500ms 时生效（含窗口起点语义）」，
并保持所有冻结资产不变、全程 diagnostic-only。

## ADDED Requirements

### Requirement: candidate 采用 injection-calibration/v2 三条件注入协议

`async-operation-authority-v1` MUST 位于
`incubator/practice-injection/async-operation-authority-v1/`，声明
`kernel: { core: v1, profile: injection-calibration/v2, materializer_kind: react-vite }`，
并声明 `baseline / oracle-practice / irrelevant-practice` 三个 declared condition 与
`lorelum-retrieval` 显式 `unavailable`。decision_rule MUST 使用 `joint-pass-count`，
`oracle_relation: strictly-greater-than-each-control`，controls 为 `baseline` 与
`irrelevant-practice`，otherwise 为 `diagnostic-only`。

#### Scenario: 三条件完整声明

- **WHEN** 解析 candidate 的 conditions.yaml
- **THEN** baseline、oracle-practice、irrelevant-practice 均为 declared，lorelum-retrieval
  为 unavailable，decision_rule 为 joint-pass-count 且严格大于每个 control

### Requirement: oracle-practice 通过 practice-card 运行时注入

`oracle-practice` 条件 MUST 通过 `condition-scoped-private-runtime` 注入
`react.project-operation-authority` Practice 卡，投递模板为 `practice-card/v1`，卡文本
MUST NOT 被物化进 agent workspace、MUST NOT 出现在公开 task.md 或 starter。注入内容只包含
已声明的 Practice 卡（后台协调仅在无前台在途且距最近一次前台操作启动超过 500ms 时生效），
不含 evaluator、oracle、scoring 或校准材料。

#### Scenario: 卡文本不进入 workspace

- **WHEN** 审计 agent workspace 与公开 task.md/starter
- **THEN** 不包含 `react.project-operation-authority` 卡正文、窗口阈值或生效条件的任何文本

#### Scenario: 运行时注入可被消费

- **WHEN** 以 oracle-practice 条件运行 candidate
- **THEN** agent 在条件作用域内收到 practice-card 注入并可按约束实现，注入本身不作为
  evaluator/oracle/scoring 材料

### Requirement: 采纳层以 judge v2 语义验收

采纳层成功判定 MUST 以 `skill-trigger-source-authority/v2` judge 对 candidate diff 的
语义验收为准，阈值为 reference_min=90；同时公开语义测试 MUST 通过。两者同时满足才视为
完整采纳。judge v2 与其 rubric MUST 保持冻结，不改签名、不改阈值。

#### Scenario: 完整采纳

- **WHEN** 候选实现包含「启动时无前台在途」且「距最近一次前台操作启动 >500ms」双条件，
  并通过公开语义测试
- **THEN** judge v2 分数 ≥90，判为采纳成功

#### Scenario: 近似实现不达标

- **WHEN** 候选只实现「距最近一次前台操作完成 >500ms」，缺失前台在途判断
- **THEN** judge v2 判不符合（<90），不得视为完整采纳

### Requirement: 公开回归覆盖前台在途场景

公开语义测试 MUST 包含「前台操作后短时间内后台协调不得改变已展示结果」回归（即前台
操作完成后短窗口内运行后台协调，其成功或失败结果都不得改变项目列表、加载或错误状态），
使「前台在途/短窗口」约束成为可观察失败，而不只是私有 judge 扣分。

#### Scenario: 前台在途回归可观察

- **WHEN** 在初始前台加载完成后短窗口内点击运行后台协调
- **THEN** 已展示的前台结果保持不变，协调结果不覆盖视图

### Requirement: 对照组语义与等长无关卡

`irrelevant-practice` MUST 注入一张与 oracle 卡等长（rendered character 相对差 ≤10%）
但内容无关的 Practice 卡，且其在公开题面上不提供任何可用约束。baseline 条件 MUST 无注入
（practice: none）。对照组用于排除「场景本身简单谁都做对」与「随便注入就采纳」。

#### Scenario: 等长无关卡

- **WHEN** 比较 oracle 卡与 irrelevant 卡的 rendered characters
- **THEN** 相对差 ≤10%，且 irrelevant 卡不含窗口阈值、前台在途或结果权威语义

#### Scenario: 对照组预期失败

- **WHEN** 以 baseline 或 irrelevant-practice 条件运行 candidate
- **THEN** 完整采纳判定（judge v2 ≥90 + 公开测试通过）不成立，用于形成区分度证据

### Requirement: 复用且不修改冻结资产

本 change MUST 复用 skill-trigger v4 的 `react.project-operation-authority` 卡、
`skill-trigger-source-authority/v2` judge、`dashboard.spec.ts` 与校准矩阵，但 MUST NOT
修改这些原始冻结资产；`src/benchmark/judge/providers.ts` 中的 judge provider 注册 MUST
保持原签名与 id。新 candidate 的校准 base MUST 复用 react-vite app-shell/v2 base 并
在 sets.yaml 显式声明跨 profile 共享与 digest 绑定。

#### Scenario: 冻结资产不变

- **WHEN** 本 change 完成交付
- **THEN** skill-trigger v4 的卡、judge v2、公开测试、校准矩阵与 snapshot 逐字节不变，
  共享 judge provider 签名不变

### Requirement: candidate 不产生正式产物

`async-operation-authority-v1` 交付、校准与注入验证 MUST NOT 调用模型、创建正式 record、
升级 suite revision 或进入默认 suite。任何后续三条件模型比较或 suite 升级 MUST 另立
issue 并在本 candidate 校准与生命周期门禁通过后执行。

#### Scenario: candidate 生命周期保持

- **WHEN** calibration、`bun run validate`、OpenSpec strict、泄露审计与 `git diff --check`
  全绿
- **THEN** candidate 仍保持 `lifecycle_stage: candidate`，未创建正式 record、未升级 suite

#### Scenario: 门禁未通过

- **WHEN** 任一验证未通过
- **THEN** candidate 不得进入模型比较，修复后重新校准和验证
