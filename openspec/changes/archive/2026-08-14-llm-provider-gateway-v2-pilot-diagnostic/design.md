## Context

#166 的 `llm-provider-gateway-v2` 已冻结并归档。本 change 执行 #168 的三条件本地诊断对照，并执行 judge 判别力校准。初始 `judge-agent/generic/v1` 校准失败；#170/#171 交付 `judge-agent/generic/v2` 并把该 candidate 的 soft judge 迁移到 v2 后，本 pilot 使用 v2 完成 sidecar。

## Goals / Non-Goals

**Goals:**

- 对冻结 candidate 执行 baseline / oracle-practice / irrelevant-practice 三条件诊断。
- 每条件 n=3（9 attempts），预算 25 分钟/attempt，模型 `deepseek/deepseek-v4-flash`。
- 先保留 `judge-agent/generic/v1` 真实 LLM 判别力校准失败证据；经 #170/#171 迁移到 `judge-agent/generic/v2` 后，对三条件逐 attempt 产出 judge soft sidecar。
- 按 joint-pass 严格领先规则给出方向性结论。

**Non-Goals:**

- 不修改 candidate 的题面/starter/evaluator/practices/snapshot。
- 不创建正式 record、不升级 suite revision、不关闭/归档任何 candidate change。
- 不把 judge 分数或加权总分当作任务完成判定。

## Decisions

### 执行输入

- 唯一输入：`incubator/practice-injection/llm-provider-gateway-v2/`（冻结）。
- `conditions.yaml` 当前声明 `repetitions: 5`、`max_duration_minutes: 25`、model `deepseek/deepseek-v4-flash`、judge `judge-agent/generic/v2`；本 pilot 通过 plan `repetitions: 3` 显式覆盖为 9 attempts，不改变 profile_input_hash。

### judge 校准

- 先执行 `judge-agent/generic/v1` 判别力校准（`LORELUM_JUDGE_REAL=1`，DeepSeek key 从 `.env` 加载）。第一次单次校准得到 reference 66 / equivalent 80 / anti-pattern 72，方向错误；第二次因 confidence 非整数 fail-closed，未通过。
- #170/#171 新增 `judge-agent/generic/v2`，其在 `llm-provider-gateway-v2` 夹具上的校准通过（reference 90 / equivalent 88 / anti-pattern 76，rubric hash `286c29bd298ebfbb507f58e54222f38a796dcfdf3296e8b140dbe108f5524804`）。
- 本 pilot 将 candidate 的 conditions judge 迁移到 v2，并对 9 个 attempt 逐条评分。实际三条件运行未注入固定 rubric 文本，v2 生成 run-level rubric hash `86d3587477fac56305921c20cd79da92fe3b0313fd71135ecb3f1fe684fe600b`，并在全部 9 个 attempt 中保持一致；该差异作为诊断限制记录，judge 仍仅作 soft sidecar。

### 结果与决策

- 人可读原始结果表：每条件 x/y 的 evaluated、semantic pass、practice observed/not-observed/indeterminate、joint_pass；judge 中位分独立列出。
- `joint_pass = semantic=pass && practice_observation=observed`。
- `oracle_relation: strictly-greater-than-each-control`：oracle joint-pass 严格高于 baseline 与 irrelevant-practice 才记 `directional-screen`，否则 `diagnostic-only`。

## Risks / Trade-offs

- [9 attempts 运行时间较长] → 按 runner 顺序执行，保留 planned denominator；若环境中断，仅记录已完成 attempt，不得补推结论。
- [flash 模型能力可能不足以稳定遵循规范] → 这正是诊断对象；若 oracle 未领先，结论为 diagnostic-only。
- [judge 真实 LLM 校准耗时] → 校准夹具数量固定为 reference/equivalent/anti-pattern/public-starter，重复次数按默认；必要时以 `LORELUM_JUDGE_REPETITIONS=1` 先做阈值验证。

## Migration Plan

1. 已创建 #168 与本 OpenSpec change；从最新 main 建 `codex/llm-provider-gateway-v2-pilot-diagnostic`。
2. 创建 OpenSpec-only 初始 PR；将规划澄清写回 #168。
3. 创建冻结诊断计划（repetitions 3），dry-run 通过。
4. 运行 v1 judge 判别力校准并记录失败证据；经 #170/#171 完成 v2 校准与迁移。
5. 运行三条件诊断对照（flash，judge-agent/generic/v2），汇总结果与决策。
6. 终检 candidate 未改动、未建 record、未升级 suite。

回滚：删除 pilot change 与 `scratch/profile-diagnostics/` 下新增运行目录即可，不触碰 candidate。

## Planning Confirmation

2026-08-13（需求方确认，第三次更新）：

1. 模型档：仅 `deepseek/deepseek-v4-flash`。
2. judge：v1 真实 LLM 判别力校准未通过；共享 judge 优化转独立 issue #170，随后 #171 合并 `judge-agent/generic/v2` 并迁移该 candidate；本 pilot 使用 v2 observed soft sidecar，方向性结论仍只依据 semantic 与 practice_observation。
3. 重复次数：n=3（9 attempts，runner 要求三条件计划 repetitions 能被 3 整除）。
