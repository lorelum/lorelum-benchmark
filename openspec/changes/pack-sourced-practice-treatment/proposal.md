## Why

Issue #199（https://github.com/lorelum/lorelum-benchmark/issues/199）需要把 P1 异步报表
时机实验使用的 Practice 从已发布 Pack 中一次性解析并固定下来。当前 benchmark 有
condition-scoped Practice card 的运行时约定，但没有 Pack repository ref、release、Practice
ID、正文 hash 和适用性依据的可复现 treatment contract；如果把 query/get 放进每次运行，
Pack 更新、语义检索重排或宿主状态就会污染 timing 结论。

在 2026-09-16 开始本 change 前，已检查两个上游仓库的最新主线状态：

- `lorelum/lorelum` 最新主线提交为 `7640e75819e50bc883a550e3543288dbb8eb8dee`
  （`docs(packs): sync official Pack catalog (#171)`）；官方目录已将
  `agentic-coding` 更新为 `0.4.0`。
- `lorelum/lorelum-packs` 最新主线提交为
  `df89b8d432a01c53361a0e23df6896a772942b09`，Registry 已发布
  `agentic-coding-v0.4.0`。
- issue 指定优先考察的 `agentic-coding.implementation.replan-on-material-drift` 在
  `agentic-coding-v0.3.0`、`v0.3.1` 和 `v0.4.0` 的文件 SHA-256 均为
  `eaec0e27c85f5df6553eccf5cbcb521d2975aecfb0a3ffd0b7d754c89afa2909`；因此新 release
  没有改变本题候选正文，但不能因此使用未固定的 `latest`。
- Lorelum 当前 `lore get` 合同返回 `contentDigest` 以及按 source 分开的
  `packName`、`sourcePath`、`packRoot`；`packRoot` 是可变的 current view，不能从 Store
  内部路径推导。该变化要求 treatment 保存 Pack provenance 和正文 hash，而不是保存一个
  可漂移的本地路径。

因此本 change 暂定固定 issue 已提名的 `agentic-coding@0.3.0`，而不是随最新 release
滚动；若规划澄清决定采用 `0.4.0`，必须改写当前 OpenSpec 的固定 ref、commit、hash 和
相关验收证据后才能实现。

## What Changes

- 增加 Pack-sourced `practice-card` treatment contract，固定 `lorelum-packs` 的
  `agentic-coding-v0.3.0` tag、解析出的 Practice ID、来源路径、Lore `contentDigest`、
  canonical body SHA-256 和一次性自然语言 query provenance。
- 增加只在 benchmark private runtime 可读的固定 Practice body/reference；不把 Practice
  正文、Pack 全量内容、private evaluator、oracle 或 scoring material 放入 public task、
  starter、Agent workspace 或公共 trace。
- 增加 deterministic resolver/validator 与 mock/fixture：验证固定 ref、version、Practice
  ID、正文 hash、`applies_when` 与 `scope_changed` 任务脚本的适用性映射，并拒绝在运行中
  再 query、重排或替换内容。
- 为 #197 staged runner 提供最小、不可变的 delivery metadata/审计 sidecar contract；
  本 change 不修改 #197 的三阶段投放实现。
- 保持 baseline 与任何未声明 treatment condition 没有 Practice 可见输入；三个 timing
  delivery node 使用同一 Practice 内容，只改变 node。

## Non-Goals

- 不实现三阶段 staged runner（#197）、异步报表 candidate（#196）、deterministic
  evaluator（#202）、JudgeAgent（#200）或九次探索（#201）。
- 不评估 natural-language query 排名、Pack coverage、Practice desc 命中率、自动触发、
  Trigger Orchestrator、文件信号或跨宿主适配。
- 不发布或修改 `lorelum-packs`，不生成新 Practice，不把 `agentic-coding@0.4.0` 的新增
  Practices 混入本题 treatment。
- 不调用模型、不创建正式 record、不升级 suite revision。

## Capabilities

### New Capabilities

- `pack-sourced-practice-treatment`: 定义 Pack provenance、固定 Practice 内容、适用性
  证据、condition-scoped delivery boundary 和供 staged runner 消费的审计 contract。

### Modified Capabilities

- `treatment-contract`: 仅在当前 change 的范围内扩展 retrieval/Pack Practice 的 manifest
  与 validation；不改写既有 baseline/skill treatment 的历史语义。

## Impact

- 预计修改 `schemas/`、`treatments/`、`src/benchmark/` 的 treatment resolver/contract
  代码，并新增 candidate/private fixture 与验证测试；不修改 `suites/`、#196 starter、
  #197 runner 或正式 records。
- 需要在现有 `treatment.schema.json` 中明确 Pack-sourced kind/字段，或以独立版本化 schema
  保持历史 treatment 可解析；不能用 `additionalProperties` 绕过固定 provenance 验证。
- 初始 PR 只包含本 OpenSpec artifacts 和必要流程约束；严格验证和初始 PR 完成后，必须先
  完成规划澄清并把答案写回 Issue #199 与 `design.md`/`tasks.md`，再开始任何非 OpenSpec
  实现。
