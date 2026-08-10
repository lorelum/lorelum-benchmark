## Context

`llm-provider-gateway-v1`（#161/#162）已完成 candidate 交付并通过校准与门禁，需求方初步认可并希望看效果。本 change 按仓库诊断执行惯例（登录页 #137、扩样 #91/#125），对该 candidate 执行本地三条件对照，验证 Practice 判别力。

## Goals / Non-Goals

**Goals:**

- 用本地 Pi diagnostic runner 跑 `llm-provider-gateway-v1` 三条件（baseline / oracle-practice / irrelevant-practice）诊断对照，每条件重复次数按 conditions.yaml（默认 2）。
- 产出人可读原始结果表（evaluated / semantic / practice_observation / joint_pass），judge 软分（opt-in）作为辅助。
- 按 `strictly-greater-than-each-control` 判断 oracle 是否有方向性增量，否则 diagnostic-only。
- 记录模型、提示、预算、重复次数与盲评边界（评估器不向 agent 暴露 condition/评测信息）。

**Non-Goals:**

- 不改写 candidate（题面/夹具/evaluator 冻结）；不创建正式 record、不升级 suite revision。
- 不合并/关闭 #162（candidate 交付 PR 保持开放至归档）；不扩大结论到产品效果或模型泛化。

## Decisions

### 执行对象与输入（已确认）

- 使用冻结的 `incubator/practice-injection/llm-provider-gateway-v1/`（public/private、conditions.yaml、snapshot）作为唯一输入；不修改任何文件。
- 本地 Pi diagnostic runner 按 `private/conditions.yaml` 的三条件与 shared_execution 执行；每条件重复次数 `repetitions: 2`（可在规划澄清调整）。

### 结果表达（已确认）

- 按 `docs/PRACTICE_BENCHMARK_GUIDE.md` 模板呈现：每条件 x/y（evaluated、semantic 通过、Practice 已观察、Practice 未观察、Practice 不确定、joint_pass）。
- `joint_pass` 仅派生为 semantic=pass 且 practice_observation=observed；不引入加权总分。
- 非健康评测（`evaluation_status != evaluated`）单独计数，不补推语义/观测结论。

### judge 软分（需规划澄清确认）

- `judge-agent/generic/v1` 需 `LORELUM_JUDGE_REAL=1` 显式 opt-in + DeepSeek API Key；有 key 时作为 soft sidecar 逐条件报告，无 key 时记 not-run 并留原因。

### 决策口径（已确认）

- `oracle_relation: strictly-greater-than-each-control`：oracle 的 joint-pass 严格高于 baseline 与 irrelevant-practice 才支持方向性结论；否则 diagnostic-only。

## Migration Plan

1. 已创建 issue #163 与本 OpenSpec change；下一步从最新 main（#162 合并后）建 `codex/llm-provider-gateway-pilot-diagnostic` 分支并创建 OpenSpec-only 初始 PR。
2. 规划澄清：确认重复次数、模型、judge opt-in、预算、DeepSeek Key 可用性；写回 issue #163 与 design。
3. 实现：以本地 Pi diagnostic runner 执行三条件对照（持续提交到同一 PR）。
4. 汇总结果表 + 决策（oracle 严格领先 → 方向性结论；否则 diagnostic-only）；独立核对结果呈现。
5. 终检：candidate 未改动；未建 record、未升级 suite、未合并 #162。

### Runner 适配（node-ts candidate）

- `profile-diagnostic-runner.ts` 原仅接受 `react-vite` materializer 并为每个 attempt 启动前端 web server（`bun run dev -- --port`）。本 pilot 的后端 candidate 使用 `node-ts` materializer，且其 evaluator 为 `bun run test`（自起 stub，无需外置 web server）。
- 适配：`verifyCandidateDeclaration` 接受 `react-vite|node-ts`；`runAttempt` 对 `node-ts` 跳过 web server（无 PLAYWRIGHT_BASE_URL）。runner 测试同步更新（38 pass）。

## Open Questions

待规划澄清确认：重复次数（默认 2）、模型（deepseek/deepseek-v4-pro 或环境可用）、judge opt-in 与 DeepSeek Key 可用性、单次预算。

## Planning Confirmation

2026-08-10（需求方确认，写入 design.md；issue #163 已记录）：
1. 重复次数：每条件 3 次（plan repetitions: 3，共 9 attempts；runner 要求 repetitions 可被 3 整除，故采用 3 而非 2）。
2. judge：执行（LORELUM_JUDGE_REAL=1 显式 opt-in，judge-agent/generic/v1 逐条件软分）。
3. 模型：先 deepseek/deepseek-v4-pro；2026-08-10 需求方确认追加 model-tier rerun（deepseek-v4-flash，conditions.yaml model 改为 flash + snapshot/plan 更新，config commit `6133a07`）。