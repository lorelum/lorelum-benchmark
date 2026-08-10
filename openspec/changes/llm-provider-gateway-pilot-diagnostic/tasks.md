## 1. OpenSpec 与规划门禁

- [x] 1.1 对本 change 运行 strict validation 并创建仅含 OpenSpec artifacts 的初始 PR（#164），关联 #163（base：main，#162 已合并）。
- [x] 1.2 与需求方确认规划澄清：每条件 3 次（runner 要求 repetitions 可被 3 整除，故 2 → 3）、模型 deepseek/deepseek-v4-pro + flash model-tier rerun、judge 执行（LORELUM_JUDGE_REAL=1）；写回 issue #163 与 design.md Planning Confirmation。

## 2. 执行三条件诊断对照 [runner 适配 + 只读运行]

- [x] 2.0 runner 适配：`profile-diagnostic-runner.ts` 接受 `node-ts` materializer；`runAttempt` 对 node-ts 跳过前端 web server；`materializeGitHistory` 最后 commit 支持 `--allow-empty`；runner 测试 38 pass。
- [x] 2.1 创建冻结诊断计划 `incubator/practice-injection-plans/llm-provider-gateway-v1-three-condition-diagnostic.yaml`（repetitions: 3，9 attempts）；dry-run 通过。
- [x] 2.2 执行三条件诊断对照（每条件 3 次）：
  - v4-pro：`scratch/profile-diagnostics/llm-provider-gateway-v1-diagnostic-2026-08-10-r2`（R1 因 git-history 空提交失败，runner 修复后 R2 完整；oracle 1/3 joint）。
  - flash model-tier rerun：`scratch/profile-diagnostics/llm-provider-gateway-v1-diagnostic-flash-2026-08-10`（9/9 evaluated，oracle 3/3 joint）。
- [x] 2.3 judge（judge-agent/generic/v1，LORELUM_JUDGE_REAL=1）逐条件软分：v4-pro 中位 baseline 70 / oracle 62 / irrelevant 67；flash 中位 baseline 86 / oracle 100 / irrelevant 92。
- [x] 2.4 人可读原始结果表 + 决策已写入 `verification/diagnostic-results.md`（v4-pro）与 `verification/diagnostic-results-flash.md`（flash）。

## 3. 决策与终检

- [x] 3.1 决策：
  - v4-pro：oracle joint_pass 1/3 > baseline 0/3 且 > irrelevant 0/3，但 baseline 健康不足（1/3）→ `diagnostic-or-uncertain` → `diagnostic-only`。
  - flash：oracle joint_pass 3/3 > baseline 1/3 且 > irrelevant 1/3，9/9 健康，judge 中位 oracle 100 最高 → `conclusion_grade: directional-screen`、`overall_conclusion_grade: reproducible-direction`（单候选方向性信号，不扩大解释）。
- [x] 3.2 终检：题面/starter/evaluator/practices 未改动（仅 runner 适配、model-tier 配置 conditions.yaml+snapshot、plan 属 pilot change 范围）；未创建正式 record、未升级 suite revision、未合并/关闭 #162；模型调用仅限诊断执行与 judge opt-in。