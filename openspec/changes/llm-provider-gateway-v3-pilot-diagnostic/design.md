## Context

#172/#173 交付的 `llm-provider-gateway-v3` 已合并到 main。其泛化探针通过 14-case 确定性校准与 #168 历史回放（baseline 0/3、oracle 3/3、irrelevant 0/3 observed）。#175 的一次 one-repeat smoke 观察到：baseline 与 irrelevant-practice 均为 not-observed；oracle 的 workspace（Pi 在 25 分钟预算内未完成收尾，runner 记录 execution-failed）直接复核为 semantic pass + practice observed。本 change 承接 #178，执行完整三条件本地诊断对照（n=3），验证泛化探针在真实模型输出上的判别力。

## Goals / Non-Goals

**Goals:**

- 对冻结 candidate 执行 baseline / oracle-practice / irrelevant-practice 三条件诊断，每条件 n=3（9 attempts）。
- 预算 25 分钟/attempt，模型 `deepseek/deepseek-v4-flash`。
- 交付本地 Pi key 映射 runner 修复，使内部 endpoint 认证可运行。
- 按 joint-pass 严格领先规则给出方向性结论。

**Non-Goals:**

- 不修改 candidate 的题面/starter/evaluator/practices/snapshot。
- 不运行真实 judge（`judge-agent/generic/v2` 保持冻结 soft sidecar；judge 硬化由 #174 独立承接），`judge-unavailable` 可接受。
- 不创建正式 record、不升级 suite revision、不关闭/归档任何 candidate change。
- 不把 judge 分数或加权总分当作任务完成判定。

## Decisions

### 执行输入

- 唯一输入：`incubator/practice-injection/llm-provider-gateway-v3/`（冻结，snapshot `e42a836c`、profile_input_hash `e5c4c971`）。
- `conditions.yaml` 当前声明 `repetitions: 5`、`max_duration_minutes: 25`、model `deepseek/deepseek-v4-flash`、judge `judge-agent/generic/v2`；本 pilot 通过 plan `repetitions: 3` 显式覆盖为 9 attempts，不改变 profile_input_hash。

### 本地 Pi 路由前置修复

- 根因：#176/#177 已把本地 Pi base URL 指向 `.env` 的内部 endpoint，并重命名 key 为 `LORELUM_PI_API_KEY`。但 Pi 进程以 `DEEPSEEK_API_KEY` env 认证 deepseek provider；显式 `--api-key` 参数会绕过 catalog baseUrl 覆盖导致 401。
- 修复：在 `profile-diagnostic-runner.ts` 启动时把 `localPiApiKey()`（读取 `LORELUM_PI_API_KEY`，回退 `LORELUM_JUDGE_API_KEY`/`DEEPSEEK_API_KEY`）映射为 `Bun.env.DEEPSEEK_API_KEY`，配合 `PI_CODING_AGENT_DIR` catalog 覆盖。`preflight.ts` 保持无 `--api-key`（已还原 HEAD）。
- 只影响本地 profile diagnostic runner；正式 `pi/v2/execute.ts`、formal environment、sandbox/proxy、record 契约不变。

### judge 边界

- v3 保持 `judge-agent/generic/v2` 为冻结 soft sidecar，本 pilot 不注入真实 judge。
- `LORELUM_JUDGE_REAL=0`，judge 输出 `judge-unavailable`，不参与 `practice_observation` 或 joint-pass 派生。

### 结果与决策

- 人可读原始结果表：每条件 x/y 的 evaluated、semantic pass、practice observed/not-observed/indeterminate、joint_pass。
- `joint_pass = semantic=pass && practice_observation=observed`。
- `oracle_relation: strictly-greater-than-each-control`：oracle joint-pass 严格高于 baseline 与 irrelevant-practice 才记 `directional-screen`，否则 `diagnostic-only`。
- 不根据 condition 标签反向调整探针；探针只按 `private/oracle.yaml` 与 Practice 责任判定源码。

## Risks / Trade-offs

- [9 attempts 运行时间较长] → 按 runner 顺序执行，保留 planned denominator；若环境中断，仅记录已完成 attempt，不得补推结论。
- [flash 模型能力可能不足以稳定遵循规范] → 这正是诊断对象；若 oracle 未领先，结论为 diagnostic-only。
- [oracle 可能再次超时] → 与 #175 相同处理：保留 workspace，直接复核 semantic（公开测试）与探针观察作为附加证据，但 formal 记录仍按 runner 的 evaluated/execution-failed 为准。

## Migration Plan

1. 已创建 #178 与本 OpenSpec change；从最新 main 建 `codex/llm-provider-gateway-v3-pilot`。
2. 创建 OpenSpec-only 初始 PR；将规划澄清写回 #178。
3. 交付 runner key 映射修复与测试，`bun run validate` 通过。
4. 创建冻结诊断计划（repetitions 3），dry-run 通过。
5. 运行三条件诊断对照（flash，judge 关闭），汇总结果与决策。
6. 终检 candidate 未改动、未建 record、未升级 suite。

回滚：删除 pilot change、runner 修复提交与 `scratch/profile-diagnostics/` 下新增运行目录即可，不触碰 candidate。

## Planning Confirmation

2026-08-19（需求方在 #178 规划澄清确认三项推荐口径）：

1. 每条件重复次数：n=3（共 9 attempts），与 v2 pilot 先例一致。
2. oracle 预算：保持 25 分钟与三条件一致，保证对照公平；若 oracle 超时，用公开测试 + 探针复核 workspace 作为附加观察证据，formal 记录仍按 runner 为准。
3. judge 通道：保持关闭，`judge-agent/generic/v2` 为冻结 soft sidecar（judge 硬化由 #174 独立承接），`judge-unavailable` 可接受，方向性结论只依据 semantic 与 practice_observation。
