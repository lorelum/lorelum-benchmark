## Context

#166 的 `llm-provider-gateway-v2` 已冻结并归档，judge rubric 已固定（`db059c1653e74405e6ffab17da4f8d21f32ef5b9a24c816eb93246ac2ae19894`）。本 change 执行 #168 的三条件本地诊断对照，并因任务形态不同于既往 candidate，额外执行 judge 判别力校准，确认 rubric/阈值对该任务仍具有区分度。

## Goals / Non-Goals

**Goals:**

- 对冻结 candidate 执行 baseline / oracle-practice / irrelevant-practice 三条件诊断。
- 每条件 n=5（15 attempts），预算 25 分钟/attempt，模型 `deepseek/deepseek-v4-flash`。
- 先运行 `judge-agent/generic/v1` 真实 LLM 判别力校准，记录 rubric hash 与阈值；再对三条件逐 attempt 产出 judge soft sidecar。
- 按 joint-pass 严格领先规则给出方向性结论。

**Non-Goals:**

- 不修改 candidate 的题面/starter/evaluator/practices/snapshot。
- 不创建正式 record、不升级 suite revision、不关闭/归档任何 candidate change。
- 不把 judge 分数或加权总分当作任务完成判定。

## Decisions

### 执行输入

- 唯一输入：`incubator/practice-injection/llm-provider-gateway-v2/`（冻结）。
- `conditions.yaml` 已声明 `repetitions: 5`、`max_duration_minutes: 25`、model `deepseek/deepseek-v4-pro`；本 change 显式改用 `deepseek/deepseek-v4-flash` 作为 model-tier 配置，不改变 profile_input_hash。

### judge 校准

- 先执行 `judge-agent/generic/v1` 判别力校准（`LORELUM_JUDGE_REAL=1`，DeepSeek key 从 `.env` 加载）。
- 校准使用 `reference` / `equivalent` / `anti-pattern` / `public-starter` 固定夹具，记录 rubric hash、阈值与各夹具分数。
- 校准通过后，用同一 rubric hash 对三条件 attempt 评分；若校准未通过，judge 仅记录 not-run/未通过原因，不参与结论。

### 结果与决策

- 人可读原始结果表：每条件 x/y 的 evaluated、semantic pass、practice observed/not-observed/indeterminate、joint_pass；judge 中位分独立列出。
- `joint_pass = semantic=pass && practice_observation=observed`。
- `oracle_relation: strictly-greater-than-each-control`：oracle joint-pass 严格高于 baseline 与 irrelevant-practice 才记 `directional-screen`，否则 `diagnostic-only`。

## Risks / Trade-offs

- [15 attempts 运行时间很长] → 按 runner 顺序执行，保留 planned denominator；若环境中断，仅记录已完成 attempt，不得补推结论。
- [flash 模型能力可能不足以稳定遵循规范] → 这正是诊断对象；若 oracle 未领先，结论为 diagnostic-only。
- [judge 真实 LLM 校准耗时] → 校准夹具数量固定为 reference/equivalent/anti-pattern/public-starter，重复次数按默认；必要时以 `LORELUM_JUDGE_REPETITIONS=1` 先做阈值验证。

## Migration Plan

1. 已创建 #168 与本 OpenSpec change；从最新 main 建 `codex/llm-provider-gateway-v2-pilot-diagnostic`。
2. 创建 OpenSpec-only 初始 PR；将规划澄清写回 #168。
3. 创建冻结诊断计划（repetitions 5），dry-run 通过。
4. 运行 judge 判别力校准并记录证据。
5. 运行三条件诊断对照（flash），汇总结果与决策。
6. 终检 candidate 未改动、未建 record、未升级 suite。

回滚：删除 pilot change 与 `scratch/profile-diagnostics/` 下新增运行目录即可，不触碰 candidate。

## Planning Confirmation

2026-08-13（需求方确认）：

1. 模型档：仅 `deepseek/deepseek-v4-flash`。
2. judge：额外执行真实 LLM 判别力校准；校准后复用同一 rubric 对三条件软分。
