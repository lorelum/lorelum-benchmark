# Tasks

## 契约与 OpenSpec

- [x] 1.0 初始 PR：OpenSpec artifacts（proposal / design / specs / tasks）引用 #192，通过 `openspec validate llm-provider-gateway-v4-directional-screen --type change --strict`（write scope: `openspec/changes/llm-provider-gateway-v4-directional-screen/`）

## 判读汇总层

- [x] 2.0 实现 block 级配对判读纯函数：per-condition structure-pass 计数、per-block 配对比较（oracle vs 两对照，unhealthy 计非 pass）、四值结论（strictly-greater + paired majority / saturated≥0.8 / insufficient<3 有效观测）、concentration metrics 描述性附注（write scope: `src/benchmark/runner/pi/v2/staged/`）
- [x] 2.1 focused tests：四值出口各至少一例、denominator 完整性、metrics 不进布尔判读（write scope: 同上 `*.test.ts`）

## Preflight 与验证

- [x] 3.0 运行 focused tests、`bun run test:contracts`、`bun run validate`、OpenSpec strict、protected-path audit、credential/endpoint audit、`git diff --check`，并在 verification 记录；preflight（复用 driver 6 项门禁）+ `--blocks 5` dry-run（15 attempts、每条件 5 次、zero model calls）通过

## 授权执行（#192，仅 preflight 全通过后）

- [x] 4.0 执行一次 `--blocks 5` 真实模型 screen（15 attempts，flash 档，no judge / no retry / no rerun），产出 redacted summary、per-block 配对表与四值结论，回写 verification 与 #192
- [x] 4.1 中文判读 summary（含各条件逐 attempt 结果、配对表、结论与其依据、diagnostic-only 声明与下一步建议）
