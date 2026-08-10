## 1. OpenSpec 与规划门禁

- [x] 1.1 对本 change 运行 strict validation 并创建仅含 OpenSpec artifacts 的初始 PR（#164），关联 #163（base：main，#162 已合并）。
- [x] 1.2 与需求方确认规划澄清：每条件 3 次（runner 要求 repetitions 可被 3 整除，故 2 → 3）、模型 deepseek/deepseek-v4-pro、judge 执行（LORELUM_JUDGE_REAL=1）；写回 issue #163 与 design.md Planning Confirmation。

## 2. 执行三条件诊断对照 [runner 适配 + 只读运行]

- [x] 2.0 runner 适配：`profile-diagnostic-runner.ts` 接受 `node-ts` materializer；`runAttempt` 对 node-ts 跳过前端 web server（evaluator 为 `bun run test`，自起 stub）；runner 测试 38 pass。
- [x] 2.1 创建冻结诊断计划 `incubator/practice-injection-plans/llm-provider-gateway-v1-three-condition-diagnostic.yaml`（repetitions: 3，9 attempts）；dry-run 通过（plan 身份/条件声明校验）。
- [ ] 2.2 用 profile-diagnostic-runner 执行三条件（baseline / oracle-practice / irrelevant-practice）诊断对照（每条件 3 次），输出到 scratch；确认 runner 使用冻结 conditions.yaml/snapshot，评估器不向 agent 暴露 condition/评测信息。
- [ ] 2.3 judge（judge-agent/generic/v1，LORELUM_JUDGE_REAL=1）逐条件软分；judge 校准（reference/equiv/anti-pattern 判别力）按 `private/calibration.md` 重放命令执行或记 not-run+原因。
- [ ] 2.4 按 PRACTICE_BENCHMARK_GUIDE 模板产出人可读原始结果表（evaluated / semantic / practice_observation / joint_pass / 非健康评测 / indeterminate），证据保存到本 change verification/。

## 3. 决策与终检

- [ ] 3.1 按 strictly-greater-than-each-control 给出决策：oracle 严格高于 baseline 与 irrelevant-practice → 方向性结论；否则 diagnostic-only；不扩大解释。
- [ ] 3.2 终检：candidate public/private 未改动（hash/snapshot intact）；未创建正式 record、未升级 suite revision、未合并/关闭 #162；模型调用仅限诊断执行与 judge opt-in。