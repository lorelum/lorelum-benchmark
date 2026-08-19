# 三条件诊断结果（llm-provider-gateway-v3，deepseek-v4-flash，n=3）

- 计划：`incubator/practice-injection-plans/llm-provider-gateway-v3-three-condition-diagnostic-flash.yaml`
- repetitions：3（9 attempts），cyclic-latin-square/v1，schedule_seed `llm-provider-gateway-v3-diagnostic-flash-2026-08-19`。
- 模型：`deepseek/deepseek-v4-flash`；judge：`judge-agent/generic/v2` 冻结 soft sidecar，`LORELUM_JUDGE_REAL` 关闭。
- 路由：`.env` `LORELUM_PI_BASE_URL` = 内部 endpoint `jugaigiawp-internal.lorelum.com/v1`，`PI_OFFLINE=1` + `PI_CODING_AGENT_DIR` catalog 覆盖固定 baseUrl；未走官方 `api.deepseek.com`。
- 输出：`scratch/v3-three-condition-pilot`（interrupted=false，9/9 attempts）。
- candidate 冻结：snapshot `e42a836c`、profile_input_hash `e5c4c971`、source_commit `b9f206e6`；题面/starter/evaluator/practices 未改动。

## 人可读原始结果表（n=3）

| 条件 | 注入内容 | evaluated | 语义通过 | Practice observed | joint_pass |
| --- | --- | --- | --- | --- | --- |
| baseline | 无 | 0/3 | 0/3（未评测） | 0/3（未评测） | 0/3 |
| oracle-practice | llm.provider-gateway.v2 | 3/3 | 3/3 | 1/3 | 1/3 |
| irrelevant-practice | backend.pagination | 3/3 | 3/3 | 1/3 | 1/3 |

> baseline 三次均为 `execution-failed`（`Pi timed out`，25 分钟预算硬超时，pi.stdout/stderr 为空）。oracle/irrelevant 全部 evaluated（语义 3/3 通过）。

## 逐 attempt

| 条件 | rep | evaluation_status | semantic | practice_observation | joint_pass | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| oracle-practice | 1 | evaluated | pass | observed | true | |
| irrelevant-practice | 1 | evaluated | pass | observed | true | |
| baseline | 1 | execution-failed | — | — | — | Pi timed out（25min） |
| irrelevant-practice | 2 | evaluated | pass | not-observed | false | |
| baseline | 2 | execution-failed | — | — | — | Pi timed out（25min） |
| oracle-practice | 2 | evaluated | pass | not-observed | false | |
| baseline | 3 | execution-failed | — | — | — | Pi timed out（25min） |
| oracle-practice | 3 | evaluated | pass | not-observed | false | |
| irrelevant-practice | 3 | evaluated | pass | not-observed | false | |

执行时长（task.md 生成 → pi 结束）：
- baseline：25.0 / 25.1 / 25.0 分钟（全部命中 `max_duration_minutes: 25` 硬超时）
- oracle-practice：7.7 / 15.9 / 14.1 分钟
- irrelevant-practice：8.9 / 24.6 / 11.5 分钟

## judge soft sidecar（关闭）

- `LORELUM_JUDGE_REAL` 清空，`judge-agent/generic/v2` 全部 `judge-unavailable`（reason: requires LORELUM_JUDGE_REAL=1 or rubric text），indeterminate_rate=0。
- judge 不参与 joint-pass 派生；方向性结论只依据 semantic 与 practice_observation。

## baseline 超时根因与旁证

- 三次 baseline 均命中 25 分钟硬超时、pi.stdout/stderr 为空，与 or/irrelevant 正常收尾不同。
- 关键旁证：baseline attempt-2 的工作区实际包含**完整实现**（`src/providers.ts` 11,270B、`src/server.ts` 11,609B、`src/store.ts` 5,451B），本地重放 `bun test tests/` 22/22 pass、`tsc --noEmit` 干净——说明模型在该 attempt 内已实质完成任务，Pi 进程因达到预算上限被 runner 强杀，未输出最终总结文本。
- baseline attempt-1 仅 4 个 src 文件（openai.ts/server.ts/types.ts + 标记文件），attempt-3 未产出实现（仅 toolprobe 文件）——attempt 间波动大，符合 flash 模型能力噪声。
- 处理口径（与 #175 一致，已写入 #178 规划澄清）：保留 workspace，用公开测试 + 探针复核作为附加观察证据；formal 记录仍按 runner 的 evaluated/execution-failed 为准，不补推结论。

## 决策

- `overall_conclusion_grade = diagnostic-only`。
- 判定：oracle joint_pass 1/3，baseline 0/3（execution-failed），irrelevant-practice 1/3。oracle 与 irrelevant 对照相等，不满足 `strictly-greater-than-each-control` → 记录 `diagnostic-only`，不扩大为方向性结论。
- 观察：oracle 与 irrelevant 均出现 1/3 observed；oracle 未形成严格领先。v3 泛化探针在真实 flash 输出上的 attempt 间判别不稳定，与 v2 先例一致（#168：oracle 1/3 observed、irrelevant 1/3 observed）。

## 边界

- 未创建正式 record、未升级 suite revision；candidate 题面/starter/evaluator/practices 未改动。
- 模型调用仅限本诊断执行；`git diff origin/main...HEAD` 仅含 runner key 映射修复 + OpenSpec change + 诊断 plan，`suites/ treatments/ records/ experiments/` 无 diff。
- 结果仅作单候选本地诊断，不扩大到产品效果或模型泛化。
