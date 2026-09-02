# Tasks

## 契约与 OpenSpec

- [ ] 1.0 初始 PR：OpenSpec artifacts（proposal / design / specs / tasks）引用 #188，通过 `openspec validate llm-provider-gateway-v4-one-block-model-pilot --type change --strict`（write scope: `openspec/changes/llm-provider-gateway-v4-one-block-model-pilot/`）

## Pi adapter 与 pilot driver

- [x] 2.0 实现 production `StagedPiAdapter`：本地 `pi` 子进程 start/resume、session dir 在 scratch artifact 区、每 stage 15 分钟预算与进程树终止（write scope: `src/benchmark/runner/pi/v2/staged/`）
- [x] 2.1 实现 semantic adapter：调用 candidate 声明的 `private/evaluator/evaluate.ts` oracle 命令，offline 时间不计入模型预算（write scope: 同上）
- [x] 2.2 实现 one-block pilot driver CLI：加载 v4 candidate 身份（snapshot_id / source_commit / profile_input_hash / offline calibration qualified）、构建 `staged-profile-diagnostic-plan/v1` 单 block 计划、组装 attempt options、汇总 redacted summary（write scope: 同上）
- [x] 2.3 focused tests：adapter 超时终止、session id mismatch fail-closed、summary redaction、dry-run zero model calls（write scope: 同上 `*.test.ts`）

## Preflight 与验证

- [x] 3.0 preflight 模式：candidate snapshot / profile identity 校验、`pi --version` 匹配、credential 存在性（不回显）、timeout/cancellation 演练、Stage 1 leakage audit、三条件 dry-run 计划（write scope: 同上）
- [x] 3.1 运行 focused tests、`bun run test:contracts`、`bun run validate`、OpenSpec strict、protected-path audit、credential/endpoint audit、`git diff --check`，并在 verification 记录结果

## 授权执行（#188，仅 preflight 全通过后）

- [x] 4.0 执行一个 block：3 attempts × { baseline, oracle-practice, irrelevant-practice }，每 stage ≤15 分钟模型执行，no judge、no retry
- [x] 4.1 产出 redacted 中文 diagnostic summary（逐 attempt condition / health / session binding / semantic labels、九项 structure check labels、raw concentration metrics、descriptive 对比、indeterminate 与 unhealthy 原因、diagnostic-only 声明）与 artifact 位置；不提交 run workspace、transcript 或 formal record

## 诊断扩展（#188 授权的 r2：解决有效观测不足）

- [x] 5.0 诊断 r1 两个无效观测根因：irrelevant-practice 为真实 Stage 1 语义失败（titan 记账字段错误）；baseline 为模型将预算耗在全盘探索后超时（write scope: verification.md）
- [x] 5.1 修复 runner 隔离缺陷：attempt artifacts 与 workspace 分离到不同 sibling 根目录，agent 的 `..` 不再直接暴露 transcript（write scope: `src/benchmark/runner/pi/v2/staged/`）
- [x] 5.2 driver 支持 `--blocks N` 多 diagnostic block，按 3 的倍数扩展 Latin-square（write scope: 同上）
- [x] 5.3 跑 focused tests / contracts / validate / strict / diff 检查并执行 r2（2 blocks，6 attempts，不重跑 r1）
- [x] 5.4 诊断 r2 的 stage-1-snapshot-mismatch 根因：semantic oracle 的 `bun test` 在 snapshot 后向 app 追加 `usage.jsonl` 运行时账本；修复为 semantic adapter 在一次性副本上评估（write scope: `src/benchmark/runner/pi/v2/staged/staged-pilot-pi-adapter.ts`）
- [x] 5.5 执行 r3（2 blocks，6 attempts，验证修复后的执行健康；r1/r2 结果保留不重跑）
- [x] 5.6 汇总 r1+r2+r3 全部 attempt 的 redacted diagnostic summary

## 前置问题修复与 r4（#188 授权「两个前置问题还是得解决」）

- [x] 6.0 修复 Stage 1 超时：收紧 driver 级 stage instruction（禁止 app/ 外探索与依赖改写）
- [x] 6.1 修复 analyzer 角色推断盲区（client-table / network-usage 规则）+ registry-map-extension 校准 fixture + snapshot 重新生成（bug 类修复，经需求方确认不另立 issue；#190 已关闭）
- [x] 6.2 r4 执行（2 blocks）：6/6 evaluated、0 超时、4 个完整结构观测；结果记录于 verification.md
