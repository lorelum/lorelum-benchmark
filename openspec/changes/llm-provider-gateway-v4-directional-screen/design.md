# Design

## Context

#188 / PR #189 交付并归档了 v4 two-stage diagnostic pilot：四轮真实模型执行（21 attempts）验证了执行链路，修复了 transcript 邻接、oracle 评估污染 snapshot、analyzer 数据声明角色盲区三类缺陷，r4 达到 6/6 evaluated、0 超时。两轮 code review 通过。当前证据下三条件结构画像仍无可见差异，但这正是 directional screen 要以预注册规则回答的问题。需求方确认 5 blocks、flash 档（与 conditions.yaml 既有 `deepseek/deepseek-v4-flash` 声明一致，candidate 零修改）。

## Goals / Non-Goals

**Goals:**

- 在冻结 candidate 上执行 15 attempts（5 blocks × 3 conditions），flash 档，每 stage ≤15 分钟模型预算。
- 按预注册 decision rule 产出四值判读：`directional` / `no-discriminability` / `saturated` / `insufficient-observations`。
- 逐 attempt redacted 报告与 block 级配对比较证据完整可追溯。

**Non-Goals:**

- 不修改 candidate、analyzer、conditions、snapshot、Practice（含 v1 analyzer 冻结承诺）。
- 不做 formal record / suite revision 升级；不进入默认 suite。
- 不做 judge、加权分数、semantic retry、unhealthy 重跑；不为结果调整任何阈值或 fixture。
- 不依据 screen 结果直接外推 Practice effect 或发布级结论。

## Decisions

### 执行完全复用已合并 pilot driver

`staged-pilot-driver.ts --blocks 5` 已具备全部所需能力：identity/preflight 门禁、Latin-square 调度、same-session fail-closed、stage 预算与进程树终止、redacted summary。本 change 不改其执行语义，仅在其输出之上新增判读汇总层。

### 判读规则（预注册，来自 conditions.yaml decision_rule）

1. **计数口径**：structure_pass 按 condition 计数；execution-unhealthy、stage 语义失败、indeterminate 一律不构成 structure_pass，且全部保留在 planned denominator。
2. **strictly-greater-than-each-control**：oracle-practice 的 structure-pass 计数必须严格高于 baseline 与 irrelevant-practice 两者。
3. **majority-of-paired-blocks**：逐 block 配对（同 block 内 oracle vs baseline、oracle vs irrelevant 的 structure_pass 比较，unhealthy/未完成按非 pass 处理），oracle 需在多数 block 上对每个对照占优。
4. **方向性结论 = 2 与 3 同时成立**；仅 2 成立为 `no-discriminability`（计数不稳健）。
5. **饱和**：baseline structure-pass 率 ≥ 0.8 → `saturated/no-discriminability`，立即停止判读。
6. **insufficient-observations 出口（本 change 预注册）**：任一条件的有效（evaluated 且有结构结果）attempt 数 < 3，导致配对判读不可靠 → 结论记 `insufficient-observations`，不追加 block、不重跑。
7. concentration metrics 仅作描述性对照（与 pass 信号一致性检查），不进入判读布尔条件。

### 为什么 5 blocks / flash

- 5 是 majority 规则下允许每条件损失 1 个观测仍可配对判读的最小稳健值（3 为最小成立值）；15 attempts 预计产出 ~10 个有效结构观测（按 r4 完成率）。
- flash 与 conditions.yaml 声明一致（candidate 零修改）；语义不完成风险已由出口 6 显式处理，不隐藏也不补跑。

### Artifact 与 summary 边界

与 pilot 相同：run workspace/transcript/session 置于 `scratch/llm-provider-gateway-v4-directional-screen/<run-id>/`（git ignored）；public summary 仅含 attempt id、condition、session binding、hash、execution health、semantic labels、structure check labels、raw metrics、block 级配对表与四值结论。不含 Practice 全文、credential、endpoint、transcript 内容。

## Risks / Trade-offs

- [flash 语义完成率不足 → 有效观测 < 预期] -> 出口 6 显式记录 insufficient-observations；不追加 block（追加需新的授权与范围扩展）。
- [baseline 饱和] -> 出口 5，预注册停止。
- [结果为 no-discriminability 被过度解读] -> summary 与 spec 均声明 diagnostic-only；后续任何 candidate/task 调整走独立 change。
- [screen 期间再现基础设施缺陷] -> unhealthy 保留 denominator，缺陷按 bug 流程修复需需求方确认是否及如何继续（与 #188 的 r2/r3 先例一致）。

## Migration Plan

1. 初始 PR 仅含 OpenSpec artifacts，引用 #192，strict validation 通过。
2. 同一分支/PR 持续提交：block 级配对判读汇总（纯函数 + focused tests）。
3. preflight 全通过后执行一次 `--blocks 5` 真实模型 screen，产出 redacted summary 与四值结论。
4. 结果回写 verification 与 #192；后续任何动作（candidate 调整、formal 升级）另立 change。

Rollback：合并前撤除仅删除判读代码与 OpenSpec artifacts。

## Open Questions / Planning Gate

无未决问题：block 数（5）、档位（flash）、四值出口与 denominator 口径均已由需求方确认并记录于 #192。
