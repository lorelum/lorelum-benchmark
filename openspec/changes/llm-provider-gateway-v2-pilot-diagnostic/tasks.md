## 1. OpenSpec 与规划门禁

- [x] 1.1 创建 OpenSpec change 与 proposal/specs/design/tasks，关联 #168。
- [x] 1.2 与需求方确认规划澄清：仅 `deepseek/deepseek-v4-flash`；额外执行 judge 判别力校准；写回 #168 与 design.md Planning Confirmation。
- [ ] 1.3 运行 `openspec validate llm-provider-gateway-v2-pilot-diagnostic --type change --strict`。
- [ ] 1.4 提交仅含 OpenSpec artifacts 的变更并创建初始 PR（引用 #168）。

## 2. 诊断计划与 judge 校准

- [ ] 2.1 创建冻结诊断计划 `incubator/practice-injection-plans/llm-provider-gateway-v2-three-condition-diagnostic-flash.yaml`（repetitions: 3，9 attempts，model-tier flash），dry-run 通过。
- [ ] 2.2 运行 judge 判别力校准（`judge-agent/generic/v1`，`LORELUM_JUDGE_REAL=1`），记录 rubric hash 与 reference/equivalent/anti-pattern/public-starter 分数与阈值。
- [ ] 2.3 若校准通过，复用同一 rubric hash 作为三条件 judge soft sidecar；否则记录 not-run 原因。

## 3. 三条件诊断执行

- [ ] 3.1 以本地 Pi diagnostic runner 执行 baseline / oracle-practice / irrelevant-practice，每条件 3 次、预算 25 分钟/attempt，模型 `deepseek/deepseek-v4-flash`。
- [ ] 3.2 保存每 attempt 的 evaluator 输出、judge sidecar 与 observation_reason。
- [ ] 3.3 产出人可读原始结果表（evaluated / semantic / practice_observation / joint_pass / judge 中位）。

## 4. 决策与终检

- [ ] 4.1 按 `strictly-greater-than-each-control` 判定 `directional-screen` 或 `diagnostic-only`。
- [ ] 4.2 将结果与决策写入 `verification/diagnostic-results-flash.md`。
- [ ] 4.3 终检：candidate 题面/starter/evaluator/practices 未改动；未创建正式 record、未升级 suite revision；模型调用仅限诊断执行与 judge 校准。
