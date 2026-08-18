## 1. OpenSpec 与规划门禁

- [ ] 1.1 创建 OpenSpec change 与 proposal/specs/design/tasks，关联 #178。
- [ ] 1.2 与需求方确认规划澄清：仅 `deepseek/deepseek-v4-flash`；n=3；judge 保持关闭；预算 25min；写回 #178 与 design.md Planning Confirmation。
- [ ] 1.3 运行 `openspec validate llm-provider-gateway-v3-pilot-diagnostic --type change --strict`。
- [ ] 1.4 提交仅含 OpenSpec artifacts 的变更并创建初始 PR（引用 #178）。

## 2. 本地 Pi key 映射 runner 前置

- [ ] 2.1 实现 `localPiApiKey()`（读取 `LORELUM_PI_API_KEY`，回退 `LORELUM_JUDGE_API_KEY`/`DEEPSEEK_API_KEY`）并映射为 `Bun.env.DEEPSEEK_API_KEY`；不引入显式 `--api-key`。
- [ ] 2.2 添加单元测试覆盖优先级与 trim；`bun test src/benchmark/runner/pi/v2/` 通过。
- [ ] 2.3 验证本地 preflight 命中内部 endpoint 返回 ok；正式 runner/契约不变。

## 3. 诊断计划与 dry-run

- [ ] 3.1 创建冻结诊断计划 `incubator/practice-injection-plans/llm-provider-gateway-v3-three-condition-diagnostic-flash.yaml`（repetitions: 3，9 attempts，model-tier flash，snapshot `e42a836c`），dry-run 通过。

## 4. 三条件诊断执行

- [ ] 4.1 以本地 Pi diagnostic runner 执行 baseline / oracle-practice / irrelevant-practice，每条件 3 次、预算 25 分钟/attempt，模型 `deepseek/deepseek-v4-flash`。
- [ ] 4.2 保存每 attempt 的 evaluator 输出与 observation_reason；judge 关闭（judge-unavailable）。
- [ ] 4.3 产出人可读原始结果表（evaluated / semantic / practice_observation / joint_pass）。

## 5. 决策与终检

- [ ] 5.1 按 `strictly-greater-than-each-control` 判定 `directional-screen` 或 `diagnostic-only`。
- [ ] 5.2 将结果与决策写入 `verification/diagnostic-results-flash.md`。
- [ ] 5.3 终检：candidate 题面/starter/evaluator/practices 未改动；未创建正式 record、未升级 suite revision；模型调用仅限诊断执行；v1/v2/suites/treatments/records/experiments 无 diff。
