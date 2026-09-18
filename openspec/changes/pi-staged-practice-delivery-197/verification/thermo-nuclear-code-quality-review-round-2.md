# Thermo-nuclear code-quality review — round 2（复审）

日期：2026-09-17
范围：在 round-1 must-fix 全部修复后的最新 `origin/main...b4038a9` diff，Issue #197 / PR #217。
模式：只读维护性、抽象边界、文件体量和分支复杂度审查；本轮不修改代码。

## 结论

**Approved for this change：未发现阻断性 code-quality finding。**

## 审查依据与结果

- checkpoint event parsing 已抽取到独立的 `checkpoint-marker.ts`，Pi extension 不再导入完整 delivery controller；extension bundle 只包含 marker boundary，避免 runtime adapter 与 orchestration 的层级耦合。
- `staged-practice-delivery.ts` 当前 745 行，低于仓库 1,000 行 decomposition gate；Pi process/stream、checkpoint extension、controller 分别位于清晰边界内。
- 三个正式 timing node 仍由显式分支表达，与 frozen protocol 对齐；没有把时序判断散落到既有 staged runner。
- candidate snapshot、treatment resolver、transcript discovery 继续复用 canonical helpers；没有复制 evaluator/oracle/scoring 路径。
- public trace 通过 allowlisted object shape 生成；private audit、ordered summary 和 runtime card 的写入边界保持分离。
- invalid-plan sentinel、physical path ownership 和 non-destructive setup 是既有控制流的明确 fail-closed 分支，不构成对共享 runner 的随机污染。
- changed files 仍限定在本 change 的 OpenSpec、schema、runner、validation/script 路径；无 node_modules、run workspace、logs、generated diff 或正式 record。

## Non-blocking residual note

round-1 的 runtime policy metadata-only 风险仍保留并明确 defer：正式模型比较之前应由独立 change 将 model version、tool policy、environment 和 max turns 绑定到真实 runtime manifest。为保持 Issue #197 的 delivery-only 单一声明范围，本轮不扩展该契约。

## Verification

- `bun test src/benchmark/runner/pi/v2/staged` — 41 pass。
- `bun test src/benchmark/treatments/pack-practice/v1` — 19 pass。
- `bun run test:contracts:runner` — 135 pass。
- `bun run validate` — pass。
- `openspec validate pi-staged-practice-delivery-197 --type change --strict --json` — pass。
- `git diff --check` — pass。
- 未调用真实 Pi、Lore、网络、模型 API，未创建正式 record。
