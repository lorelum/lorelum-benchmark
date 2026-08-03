## Context

现有 `incubator/practice-injection/login-page-layered-api-v1` 来自早期探针，已有
历史运行结果，不能直接改写。Issue #135 需要一个更接近真实开发派活的登录页
candidate，用于验证仓库级 JudgeAgent（#133）与 Practice refinement。前置依赖
（仓库级硬/软门槛契约 #132、JudgeAgent 能力 #133、runner WebServer 生命周期 #134）
均已合并到 main。

该 candidate 的关键差异：题面要求 Agent 自己查看项目中实际存在的 API 说明和代码，
而不是给出固定测试夹具路径或 benchmark 语言；API 说明位置由 starter/repository
实际内容决定；私有 evaluator 只验证题面声明的可观察功能，分层/UI/UX/表单质量交给
质量评分（仓库级软信号契约）。

## Goals / Non-Goals

**Goals:**

- 在 `incubator/practice-injection/` 新建独立登录页 candidate（不改写
  `login-page-layered-api-v1` 或历史结果），并创建新的 private snapshot。
- 题面简短自然：查看现有登录 API，接通登录页，处理表单/UI/UX 和分层，改完跑现有
  测试；不硬编码不存在的路径，不暴露私有验收结构。
- starter 提供真实可见的 API contract、现有测试入口；API 说明位置由实际内容决定。
- 私有 evaluator 只验证题面声明的可观察功能；分层/UI/UX/表单质量走质量评分。
- 保持 public/private 隔离，不暴露 Oracle、Practice 或私有 evaluator。
- 通过 candidate calibration、public/private audit、snapshot 校验、`bun run validate`
  与 evaluator 测试。

**Non-Goals:**

- 不修改 `login-page-layered-api-v1` 或历史结果；不实现仓库级 JudgeAgent。
- 不执行正式 benchmark 或跨 candidate 比较；不进入默认 suite；不创建正式 record。
- 不把 reference 布局作为硬门槛；不规定 reference 文件路径、helper 名称或布局。
- 不创建新的 Practice 卡（沿用现有或后续独立 change）。

## Decisions

### 新建独立 candidate 而非新版本

`login-page-layered-api-v1` 已有历史运行结果，禁止原地改写。新 candidate 使用新
slug（如 `<slug>-v1`）放在 `incubator/practice-injection/`，拥有独立的 public/
private、candidate.yaml、conditions.yaml、oracle.yaml、evaluator、calibration 与
snapshot.json。

### 题面不硬编码 API 路径

题面只描述产品目标与可观察行为（查看现有登录 API、接通登录页、处理表单/UI/UX 与
分层、改完跑现有测试），不写具体文件路径或测试夹具位置。API 说明位置由 starter 内
实际存在的 contract 决定；starter 必须真实包含该 API contract 与可运行的测试入口。

### 私有 evaluator 边界

私有 evaluator 只对题面声明的可观察行为做语义硬门槛（如登录成功/失败反馈、防重复
提交等），输出沿用仓库级诊断结果契约（`semantic`/`practice_observation`）。分层、
UI/UX、表单质量属于质量软信号，交给 JudgeAgent（#133 的 `judge-result/v1` sidecar）
或独立质量评分，不进入语义硬门槛。

### 保持 public/private 隔离

public 只含 task.md 与 starter；Oracle、Practice 文本、私有 evaluator、calibration
一律 private，经 #132/#133 确立的运行时通道注入，不进入 agent workspace。

## Risks / Trade-offs

- [题面过宽导致可观察行为不稳定] → evaluator 只验证题面声明的稳定可观察功能；
  无法稳定定义时停留在 candidate 评审，不进入 pilot。
- [API contract 与 starter 不一致] → starter 内置真实 contract 与测试入口，calibration
  覆盖 reference/等价/anti-pattern。
- [质量信号与语义混淆] → 沿用 #132/#133 契约：语义为唯一任务完成信号，质量只报告。
- [snapshot 与源码漂移] → snapshot 生成与校验纳入验证流程。

## Migration Plan

1. 创建本 OpenSpec-only PR（仅 artifacts），引用 #135，通过 strict validation。
2. 规划澄清：确认 API contract 是否作为 public starter contract 固定；确认
   UI/UX 哪些维度交给 JudgeAgent、哪些必须确定性验收。
3. 实现 candidate（public/private、starter、evaluator、calibration、snapshot）与
   验证，持续提交到同一 PR。
4. 运行 candidate calibration、public/private audit、snapshot 校验、
   `bun run validate` 与 evaluator 测试，保留证据。
5. 不执行正式 benchmark、不创建 record；评审通过后再由独立 calibration/pilot
   issue 承接。

回滚：删除新 candidate 目录即可；不触碰 `login-page-layered-api-v1` 与历史记录。

## Open Questions

- 登录 API 是否作为 public starter contract 固定（独立 contract 文件 + hash），
  还是仅以 starter 源码中的实际 API 说明为准？
- UI/UX 哪些维度必须确定性验收（如按钮禁用/防重复提交），哪些交给 JudgeAgent
  软评分（如分层、可访问性、视觉布局）？
- 新 candidate 的 Practice 卡是沿用现有 `react.api.layered-design`，还是后续独立
  change 新增？