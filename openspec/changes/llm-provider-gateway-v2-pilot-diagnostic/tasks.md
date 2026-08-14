## 1. OpenSpec 与规划门禁

- [x] 1.1 创建 OpenSpec change 与 proposal/specs/design/tasks，关联 #168。
- [x] 1.2 与需求方确认规划澄清：仅 `deepseek/deepseek-v4-flash`；n=3；v1 judge 校准失败后迁移 `judge-agent/generic/v2`；写回 #168 与 design.md Planning Confirmation。
- [x] 1.3 运行 `openspec validate llm-provider-gateway-v2-pilot-diagnostic --type change --strict`。
- [x] 1.4 提交仅含 OpenSpec artifacts 的变更并创建初始 PR（引用 #168，PR #169）。

## 2. 诊断计划与 judge 校准

- [x] 2.1 创建冻结诊断计划 `incubator/practice-injection-plans/llm-provider-gateway-v2-three-condition-diagnostic-flash.yaml`（repetitions: 3，9 attempts，model-tier flash），dry-run 通过。
- [x] 2.2 运行 v1 judge 判别力校准并记录失败证据；经 #170/#171 完成 v2 夹具校准与 candidate conditions 迁移。
- [x] 2.3 使用 `judge-agent/generic/v2` 对 9 个 attempt 评分并保存逐 attempt sidecar；同一 run-level rubric hash 在全部 attempt 中一致。

## 3. 三条件诊断执行

- [x] 3.1 以本地 Pi diagnostic runner 执行 baseline / oracle-practice / irrelevant-practice，每条件 3 次、预算 25 分钟/attempt，模型 `deepseek/deepseek-v4-flash`。
- [x] 3.2 保存每 attempt 的 evaluator 输出、judge sidecar 与 observation_reason。
- [x] 3.3 产出人可读原始结果表（evaluated / semantic / practice_observation / joint_pass / judge 逐 attempt 与每条件中位）。

## 4. 决策与终检

- [x] 4.1 按 `strictly-greater-than-each-control` 判定 `directional-screen` 或 `diagnostic-only`。
- [x] 4.2 将结果与决策写入 `verification/diagnostic-results-flash.md`。
- [x] 4.3 终检：candidate 题面/starter/evaluator/practices 未改动；未创建正式 record、未升级 suite revision；模型调用仅限诊断执行与 judge 校准。
