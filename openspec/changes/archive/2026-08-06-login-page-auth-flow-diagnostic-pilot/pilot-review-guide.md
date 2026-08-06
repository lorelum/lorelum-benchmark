# 登录页三条件诊断 pilot 独立审查指南

## 用途与门禁

本 change（#137）为 `login-page-auth-flow-v1` 实施三条件诊断 pilot：冻结执行计划、
干净 workspace、语义 + JudgeAgent 逐次评测、脱敏 summary 与身份绑定、只读诊断
结论。本指南供独立 AI 执行 pass-or-fix 审查；**fix 清零前不执行真实 pilot**。
审查记录写回本文件「审查记录」与 PR 证据链。

本指南是公开 artifact，不包含私有校准分数或私有路径内容；审查者按「审查输入」
读取私有材料并运行只读命令。

## 审查输入（只读）

- `incubator/practice-injection/login-page-auth-flow-v1/private/execution/`
  （`run-local.ts`、`judge.ts`、`plan.ts`、`plan.yaml`、`unified-diff.ts`、
  `run-local.test.ts`）
- `private/conditions.yaml`、`private/candidate.yaml`、`private/snapshot.json`、
  `private/judge/`（rubric 与评分器）、`private/evaluator/`
- 只读运行：
  - `bun test incubator/practice-injection/login-page-auth-flow-v1/private/execution/run-local.test.ts`
  - `bun run incubator/practice-injection/login-page-auth-flow-v1/private/execution/run-local.ts --dry-run`
  - `bun run validate`

## 审查者提示词

你是独立评审员，对 #137 的 pilot 执行器做 pass-or-fix 审查。你**不修改任何文件**，
只做只读检查与只读命令运行，最后输出结构化报告：逐条结论（pass / fix + 证据）、
fix 清单、总体结论。不调用外部模型、不执行 pilot、不创建记录。

## 检查清单

1. **执行计划冻结**：`plan.yaml` 与 `plan.ts` 是否固定 source_commit、profile、
   model、pi_version、budget、repetitions、prompt_template、judge channel/n=3；
   `verifyPlanFrozen` 是否在运行前检测漂移；snapshot 是否以只读方式独立校验。
2. **干净 workspace 与隔离**：每次尝试是否只复制 `public/task.md` +
   `public/starter/`；Practice 是否仅经运行时系统提示注入、绝不写入工作区；
   public/private audit 是否在模型运行前校验工作区无 private/oracle/Practice。
3. **Preflight 门禁**：plan dry-run、runner/evaluator preflight（pi 版本、模型
   可达性）、JudgeAgent preflight（rubric 加载 + hash 校验）是否在模型运行前
   执行；任一失败是否停止且不调用模型。
4. **语义 + JudgeAgent 逐次评测**：语义 evaluator 输出解析是否正确
   （semantic/practice_observation/dual_pass）；judge 是否本地 mock、n=3 中位数、
   输出 `judge-result/v1` sidecar（provenance 完整、维度分数、理由、confidence）；
   judge 只作软信号，不改语义完成。
5. **失败分类与脱敏**：pi/evaluator/judge 失败是否分类记录且不伪装成低质量分；
   judge-unavailable 与 not-observed/indeterminate 是否区分；summary 是否脱敏
   （无 API key / 私有标记）。
6. **scratch 输出与结论口径**：输出是否全部在 ignored `scratch/`，不创建正式
   record/suite revision；结论是否只 signal / no-obvious-signal / uncertain
   （健康样本不足或 judge 不可用 → uncertain），不升级为正式/产品/跨 candidate
   结论。

## 审查记录

### round 1（2026-08-04，独立评审子代理）

- 日期 / 审查者 / 结论：2026-08-04 / 独立评审员（与实现者分离）/ round 1 发现
  2 项阻塞 fix（FIX-1、FIX-2）+ 1 项 minor；修复后复评 **pass，fix 全部清零**。
- 只读命令（round 1 与复评）：`bun test .../private/execution/run-local.test.ts`
  12 → 14 pass；`run-local.ts --dry-run` 输出冻结计划 + 6 次 planned runs +
  prompt_hash；`bun run validate` 通过。

fix 清单与处理：

1. **FIX-1（结论口径，阻塞）**：`outcome()` 原忽略 judge 可用性，judge 全部
   unavailable 时仍可能输出 signal/no-obvious-signal。修复：`outcome()` 统计每个
   required 条件的有效 judge 样本（judge != null 且 state !== "judge-unavailable"），
   任一条件有效样本 < repeat 即返回 uncertain；新增 judge-unavailable → uncertain
   测试。
2. **FIX-2（计划冻结，阻塞）**：`verifyPlanFrozen` 未检测 pi_version /
   prompt_template 漂移，preflight 只验退出码不比对版本，任务提示无交叉校验，
   summary 缺提示 hash。修复：`TASK_PROMPT` 导出并被 `verifyPlanFrozen` 交叉
   校验；漂移对新增 pi_version（取自 conditions.yaml）与 prompt_template；
   preflight 硬性断言 `pi --version` === 冻结版本；dry-run/preflight/summary 均
   记录 `prompt_hash`（sha256(task.md + TASK_PROMPT)）；新增对应测试。
3. **minor**：工作区审计词表加入 `oracle`。

- 全部 fix 清零后，执行器通过 pass-or-fix 门禁，可执行真实 pilot；真实 pilot
  执行前仍须保留 plan dry-run、preflight、validate 等门禁证据到 PR #143。
