# 三条件诊断结果（llm-provider-gateway-v3，deepseek-v4-flash，n=3）

- 计划：`incubator/practice-injection-plans/llm-provider-gateway-v3-three-condition-diagnostic-flash.yaml`
- repetitions：3（9 attempts），cyclic-latin-square/v1，schedule_seed `llm-provider-gateway-v3-diagnostic-flash-2026-08-19`。
- 模型：`deepseek/deepseek-v4-flash`；judge：`judge-agent/generic/v2`。
- 路由：`.env` `LORELUM_PI_BASE_URL` = 内部 endpoint `jugaigiawp-internal.lorelum.com/v1`，`PI_OFFLINE=1` + `PI_CODING_AGENT_DIR` catalog 覆盖固定 baseUrl；未走官方 `api.deepseek.com`。
- 输出：`scratch/v3-three-condition-pilot`（interrupted=false，9/9 attempts）。
- candidate 冻结：snapshot `e42a836c`、profile_input_hash `e5c4c971`、source_commit `b9f206e6`；题面/starter/evaluator/practices 未改动。

## 决策口径（2026-08-19 更新）

需求方确认：**judge 评分作为主判据**（看注入 Practice 后评分是否更高），结构探针/`observed` 退化为旁证。judge 补判对已保存的 9 个 attempt workspace 执行（内部 endpoint，`LORELUM_JUDGE_REAL=1`），全部 9 个 attempt 使用同一 rubric（rubric_hash `65c73f5d7b3c3c0c438800a3a77dfbee9576f36c0473ad304fc3be5bf9f8bdea`，judge 依 task.md 动态生成，task.md 冻结故三条件同尺子）。

## judge 评分结果（主判据，n=3）

| 条件 | rep1 | rep2 | rep3 | 均值 |
| --- | --- | --- | --- | --- |
| oracle-practice | 100 | 100 | 100 | 100 |
| irrelevant-practice | 100 | 100 | 100 | 100 |
| baseline | 0 | 100 | indeterminate | — |

- judge state：oracle/irrelevant 各 3/3 `observed`；baseline 2/3 `observed`（0/100）、1/3 `indeterminate`（源码缺失，无法按 rubric 评分）。
- 同一 rubric：`65c73f5d…`（9 attempts 一致），input_hash 按 candidate-diff 逐 attempt 不同。

### 逐 attempt 评分与 criterion

| 条件 | rep | score | criteria 摘要 |
| --- | --- | --- | --- |
| oracle-practice | 1 | 100 | provider-protocol-mapping 20/20、fallback-retry-accounting 20/20、budget-atomicity 20/20、idempotency 15/15、streaming-error-usage 10/10、observability 15/15 |
| oracle-practice | 2 | 100 | 同上（全部满分） |
| oracle-practice | 3 | 100 | 同上（全部满分） |
| irrelevant-practice | 1 | 100 | 同上（全部满分） |
| irrelevant-practice | 2 | 100 | 同上（全部满分） |
| irrelevant-practice | 3 | 100 | 同上（全部满分） |
| baseline | 1 | 0 | 六项全部 0/…（真 stub：无 Nebula adapter、无 fallback/budget/idempotency/streaming/observability） |
| baseline | 2 | 100 | 全部满分（该 attempt 在预算内写出了完整实现） |
| baseline | 3 | indeterminate | 源码缺失（stub），无法按 rubric 评分 |

## 探针/observed 结果（旁证，n=3）

| 条件 | evaluated | 语义通过 | Practice observed | joint_pass |
| --- | --- | --- | --- | --- |
| baseline | 0/3 | — | — | 0/3 |
| oracle-practice | 3/3 | 3/3 | 1/3 | 1/3 |
| irrelevant-practice | 3/3 | 3/3 | 1/3 | 1/3 |

- baseline 3/3 `execution-failed`（Pi timed out @25min 硬超时，空 stdout）。旁证：baseline attempt-2 工作区为完整实现（本地 22/22 pass），说明模型在预算内已实质完成任务、进程被强杀。
- oracle/irrelevant 各 3/3 semantic pass、各 1/3 probe observed。

## 决策

- **judge 评分主判据解读**：
  - oracle-practice 注入后评分 3/3 满分（100），irrelevant-practice 也 3/3 满分（100），baseline 分化（0 / 100 / indeterminate）。
  - judge 评的是**实现质量/功能完成度**，不是"是否遵循注入的 Practice"。真实模型输出本身存在 attempt 间波动：oracle/irrelevant 各 attempt 都写出了完整实现（本地 22/22 通过），baseline 有 attempt 也写出了完整实现（100）。
  - 因此 judge 评分**不能证明 oracle Practice 带来更高评分**——irrelevant 对照同样满分。能证明的是：该任务在 flash 模型下具备充足可达的实现空间，且 judge 对"完成 vs stub"有清晰判别（0 vs 100）。
- **探针旁证**：oracle/irrelevant 各 1/3 observed，无法区分方向。
- 综合结论：`diagnostic-only`。judge 主判据下 oracle 与 irrelevant 无差异（都 100），探针旁证也无差异（都 1/3），不满足任何方向性领先。

## 边界

- 未创建正式 record、未升级 suite revision；candidate 题面/starter/evaluator/practices 未改动。
- judge 补判为对已保存 workspace 的离线评分（模型调用仅限内部 judge endpoint），未重跑 Pi。
- 结果仅作单候选本地诊断，不扩大到产品效果或模型泛化。
