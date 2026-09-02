# Verification

## Preflight（2026-09-02，run id `v4-screen-preflight`）

6 项门禁全部通过（candidate-identity snapshot `d82a5f29b42e…` / profile `7699abf7…` / commit `1b36016…`；pi 0.80.10；credential 存在未回显；endpoint 探活；timeout 终止演练；三条件 dry-run zero model calls）。`--blocks 5` dry-run：15 attempts、每条件 5 次、全部 dry-run health。离线门禁：staged tests 23/23、contracts 224/224、validate、OpenSpec strict、`git diff --check` 通过。

## 判读层实现说明

`directional-screen-interpretation.ts`：四值出口（insufficient <3 有效观测 → saturated ≥0.8 → directional（计数严格占优 ∧ 对每个对照过半数 block 严格胜出）→ no-discriminability）。实现中发现并修正两处：raw 计数差与「净配对胜出」数学等价，block-majority 改为「过半数 block 严格胜出」才具约束力；plan 的 block 语义是 repetition 序号（单 candidate 15 次重复），自然区组 = 3 个连续 repetition，driver 分组时映射。focused tests 覆盖四值出口、denominator 完整性、indeterminate/unhealthy 计非 pass、metrics 不进布尔判读、自然区组形状。

## Screen 执行（run id `v4-screen-2026-09-02`，5 blocks / 15 attempts，flash）

15/15 attempt 执行完毕，14 evaluated、1 execution-unhealthy（#08 irrelevant：Stage 1 超时，pi-execution）；session 全部 same-session；无 snapshot/dependency fail-closed。

| block | oracle | baseline | irrelevant |
|---|---|---|---|
| 1 | evaluated，两阶段 pass，locality fail + diff indeterminate | Stage 1 语义 fail | Stage 2 语义 fail（0 变更） |
| 2 | evaluated，两阶段 pass，locality fail（share=0.75） | 两阶段 pass，handler/transport fail | Stage 1 语义 fail |
| 3 | evaluated，两阶段 pass，locality fail + diff indeterminate | Stage 2 语义 fail（0 变更） | **Stage 1 超时（unhealthy）** |
| 4 | evaluated，两阶段 pass，handler/policy/transport/locality fail + diff indeterminate（decls=20, files=8 大扩散） | 两阶段 pass，handler/transport fail | Stage 1 语义 fail |
| 5 | Stage 1 语义 fail | Stage 1 语义 fail | Stage 2 语义 fail（0 变更） |

**判读（预注册四值规则）**：`insufficient-observations` —— irrelevant-practice 有效结构观测仅 2（<3）。触发依据与分组无关；且 structure-pass 计数三条件均为 0（即使观测充足，计数规则下也为 no-discriminability：0 不严格大于 0）。饱和条款未触发（baseline 0/3）。

**描述性观察**：oracle-practice 完成 4 次两阶段（全条件最多），其失败集中于 `provider-extension-locality`（3/4）与 1 次大扩散（decls=20）；baseline 完成 2 次两阶段但 handler/transport 全败；irrelevant 仅 1 次进入结构评估。concentration metrics 仅描述性，未进入判读。

**边界**：diagnostic-only；15/15 保留在 denominator；无 judge、无 retry、无重跑、未追加 block（insufficient-observations 出口禁止追加）；transcript/run workspace 位于 git-ignored scratch。

## 执行后修正

driver 的自然区组映射修正（repetition → 3 连续组）在 screen 完成后落地并补 focused test；判读用已存储的 per-attempt 报告离线重算（零模型调用），redacted summary 已更新。该修正不影响四值结论（shortage 判定与分组无关）。
