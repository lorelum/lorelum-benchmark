# Design

## Context

`llm-provider-gateway-v4-two-stage-structure`（#185 / PR #186）交付了独立的 v4 candidate、`two-stage-injection-calibration/v1` profile、staged fail-closed runner、deterministic structure evaluator 和 offline calibration矩阵，全部 offline 通过，模型调用为 0。#168/#171 的 v2 pilot 证明真实 Pi 执行会暴露 offline 校验覆盖不到的链路风险（session resume、超时终止、进程树清理、依赖漂移）。#188 授权一次 one-block diagnostic pilot 来验证 v4 生产链路。

## Goals / Non-Goals

**Goals:**

- 用真实 Pi（`deepseek/deepseek-v4-flash`）执行一个 block：3 attempts × { baseline, oracle-practice, irrelevant-practice }，每个 attempt Stage 1 + Stage 2。
- 验证 Stage 1 → same-workspace / same-Pi-session → Stage 2 链路、15+15 分钟模型预算与 timeout 终止、snapshot immutability、dependency immutability。
- 产出 deterministic structure observation 的逐项 label 与 raw concentration metrics 的描述性对比。
- 全部 preflight 门禁通过后才执行模型调用；所有验证证据可离线复现。

**Non-Goals:**

- 不修改 v4 candidate、staged runner fail-closed 语义、evaluator、conditions、snapshot identity 或 offline calibration 结论。
- 不使用 LLM judge、不加权 structure score、不做 semantic retry、不为更好结果重跑。
- 不创建 formal record、不升级 suite revision、不进入默认 suite。
- 不执行多 block directional screen，不下 Practice effect / directional / 发布级结论。

## Decisions

### 复用 staged runner，不改其语义

`runStagedDiagnosticAttempt` 已实现 prompt/condition binding、Stage 1 leakage 扫描、snapshot 创建与验证、dependency immutability、fail-closed session resume 和 redacted trace。pilot driver 只负责组装 options 并提供 production `StagedPiAdapter` 与 `StagedSemanticAdapter`，不改动该函数及其报告 schema。

### Production Pi adapter

Adapter 以子进程运行本地 `pi`（版本钉在 conditions.yaml 的 `pi_version: 0.80.10`）。Stage 1 以新 session 启动（`--session-dir` 指向 attempt artifact 区，与 workspace 分离的 sibling 根目录）；Stage 2 通过 `--session <stage-1 session id>` 恢复同一 session，session id 不一致即 fail-closed。多 block 扩展（`--blocks N`，3 的倍数）复用同一 `cyclic-latin-square/v1` 口径。每个 stage 以 profile 声明的 `max_duration_minutes`（15）为上限，超时用进程树终止（Windows `taskkill /T /F`，POSIX 递归 SIGTERM），终止即该 stage 失败并按 staged runner 规则记 execution unhealthy。模型与 endpoint 通过 `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` 环境变量传入，绝不写入仓库或 summary。transcript 写入 session dir（scratch），不进入 agent workspace。

### Semantic adapter

`StagedSemanticAdapter.evaluate` 调用 candidate 声明的 semantic oracle 命令（`private/evaluator/evaluate.ts <stage> <workspace>/app`），offline 执行时间不计入 stage 模型预算。

### 调度与身份

使用既有 `staged-profile-diagnostic-plan/v1` 与 `cyclic-latin-square/v1`、固定 `schedule_seed`，`repetitions: 3`、单 candidate，恰好构成一个 block 的 3 attempts。pilot driver 在执行前校验 candidate `private/snapshot.json` 与 `candidate.yaml` 声明的 `snapshot_id` / `source_commit` / `profile_input_hash` 一致，且 offline calibration `results.json` 为 qualified。

### Preflight 门禁（真实模型调用的前置条件）

1. candidate snapshot / profile identity 校验（如上）。
2. Pi adapter 配置：`pi --version` 匹配 0.80.10；`DEEPSEEK_API_KEY` 存在、非空、不回显；endpoint 可配置且不提交。
3. timeout / cancellation / cleanup：以短超时演练一次进程树终止。
4. Stage 1 leakage audit：dry-run 复用 staged runner 的 workspace 组装路径，Stage 2 prompt 与 private marker 命中数必须为 0。
5. dry-run 三条件计划：`parseStagedDiagnosticPlan` + `buildStagedSchedule` 产出一个 block 的 3 attempts，dry-run 报告 3 条 `dry-run` 且 zero model calls。
6. focused tests、`bun run test:contracts`、`bun run validate`、OpenSpec strict、protected-path audit、credential/endpoint audit、`git diff --check` 全部通过。

### Artifact 与 summary 边界

run workspace、session dir、snapshot、stage-1 副本和 transcript 全部放在 `scratch/llm-provider-gateway-v4-model-pilot/<run-id>/`（git ignored）。public summary 是一个 redacted JSON/Markdown，仅含 run/attempt id、condition、session binding state、必要 hash（profile input hash、practice sha256、tree hash）、execution health、stage semantic labels、九项 structure check labels、raw concentration metrics。不含 transcript 内容、Practice 全文、credential、endpoint。

### Denominator 与结果解释

3 个 attempt 全部进入 planned denominator；execution unhealthy、indeterminate 如实记录原因，不重跑。summary 明确声明：one-block smoke 不构成 directional-screen 结论、Practice effect 或正式 benchmark 结论。oracle-practice 与对照的对比仅为 descriptive。

## Risks / Trade-offs

- [Pi session resume 在真实 CLI 上不可用或行为不符] -> fail-closed：resume 失败记 execution unhealthy，不降级、不重试；这本身就是 pilot 要验证的链路。
- [15 分钟超时触发不彻底留下孤儿进程] -> 进程树终止演练进 preflight；终止后记录 unhealthy。
- [transcript 或 workspace 被误提交] -> 全部置于 git ignored scratch；PR 只含代码与测试；summary redaction 由测试固定。
- [单 block 样本被过度解读] -> summary 与 OpenSpec 均预注册 descriptive-only 边界；多 block 需另行授权。

## Migration Plan

1. 本 change 初始 PR 仅含 OpenSpec artifacts 与流程约束，引用 #188。
2. 实现在同一分支/PR 持续提交：Pi adapter、pilot driver、preflight、tests。
3. preflight 全通过后执行一个 block，产出 redacted summary 与 artifact 位置记录（不提交 payload）。
4. 多 block directional screen 另立 issue/OpenSpec change。

Rollback：合并前撤除即删除新增 adapter/driver 代码与 OpenSpec artifacts；review 期间经 #188 追加授权的 bug 类修复（analyzer 增量规则、registry-map-extension fixture、candidate snapshot 重生成）在 proposal「授权例外」口径内，r1–r3 修复前观测原样保留于 verification。

## Open Questions / Planning Gate

无未决问题；#188 与授权消息已固定全部边界（预算、session 语义、no-judge、denominator、redaction、diagnostic-only）。执行模型调用前 preflight 结果回写本 change verification。
