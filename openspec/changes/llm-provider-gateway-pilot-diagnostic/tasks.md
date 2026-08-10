## 1. OpenSpec 与规划门禁

- [ ] 1.1 对本 change 运行 strict validation 并创建仅含 OpenSpec artifacts 的初始 PR，关联 #163（base：main，前提 #162 已合并）。
- [ ] 1.2 与需求方确认规划澄清：重复次数、模型、judge opt-in 与 DeepSeek Key 可用性、单次预算；写回 issue #163 与 design.md Planning Confirmation。

## 2. 执行三条件诊断对照 [no write scope：只读运行]

- [ ] 2.1 用本地 Pi diagnostic runner 对 `incubator/practice-injection/llm-provider-gateway-v1` 执行三条件（baseline / oracle-practice / irrelevant-practice）对照，每条件按确认的重复次数与预算；确认 runner 使用冻结 conditions.yaml/snapshot，评估器不向 agent 暴露 condition/评测信息。
- [ ] 2.2 judge（judge-agent/generic/v1）软分：有 key 且 opt-in 时逐条件报告；无 key 记 not-run 并留原因。
- [ ] 2.3 按 PRACTICE_BENCHMARK_GUIDE 模板产出人可读原始结果表（evaluated / semantic / practice_observation / joint_pass / 非健康评测 / indeterminate），证据保存到本 change verification/。

## 3. 决策与终检

- [ ] 3.1 按 strictly-greater-than-each-control 给出决策：oracle 严格高于 baseline 与 irrelevant-practice → 方向性结论；否则 diagnostic-only；不扩大解释。
- [ ] 3.2 终检：candidate public/private 未改动（hash/snapshot intact）；未创建正式 record、未升级 suite revision、未合并/关闭 #162；模型调用仅限诊断执行与 judge opt-in。