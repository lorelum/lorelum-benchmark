# Thermo-nuclear code-quality review — round 3

日期：2026-09-17
范围：在 round-3 `ai-code-review` 无 must-fix 的结论之后，对 `origin/main...f3f8709`（Issue #197 / PR #217）做维护性、抽象边界、分支复杂度与文件体量审查。本轮增量重点是本地实验配置通道：`7598156`、`3df0adf`、`f3f8709`。
模式：只读审查；本轮不修改代码。

## 结论

**Approved for this change：未发现阻断性 code-quality finding。** 有一处建议性的本地配置聚合，可在下一次触碰该文件时顺手处理，不构成本 PR 的阻断项。

## 逐项审查

### 文件体量与分解门禁

- 改动文件均未跨越 1,000 行门禁：`staged-practice-delivery.ts` 745 行、`staged-practice-delivery.test.ts` 481 行、`staged-practice-delivery-cli.ts` 118 行、`local-pi-model-catalog.ts` 约 135 行。
- 仓库内唯一超过 1,000 行的 Pi runner 文件 `profile-diagnostic-runner.ts`（1023 行）本 PR 未触碰，不构成该规则下的 finding。
- 本 PR 新增的 runner 逻辑继续按 checkpoint marker、Pi stream adapter、orchestration controller、CLI 分层，没有把时序判断塞进既有 staged pilot 路径。

### 分支与状态复杂度

- `runStagedPracticeDeliveryAttempt` 的三个 timing node 仍由显式分支表达；分支数量没有增长，`delivery_status` / `status` / `session_binding` 的状态迁移与 spec 的 fail-closed 语义一一对应，没有新增隐式 fallback。
- `3df0adf` 的 `return await` 修复消除了一个真实的异步时序竞态（catalog cleanup 早于 Pi 启动）；这是删复杂度而不是加复杂度。
- CLI 中 `dryRun ? undefined : ...` 的三处重复是既有的 dry-run 分支形态，不引入新的 spaghetti 增长。

### 抽象与 canonical 层复用

- 本地模型路由复用 `local-pi-model-catalog.ts`，没有在 adapter 里另写一套 provider 解析。
- checkpoint 事件解析复用 `checkpoint-marker.ts`，Pi extension 与 delivery controller 共享同一 marker 边界。
- candidate snapshot、treatment resolver、transcript discovery 继续复用 canonical helpers，没有复制 evaluator/oracle/scoring 路径。

### 边界与类型清晰度

- `localPiShellPath()` 返回 `string | undefined`，未配置即保持原有 Pi 回退行为；配置了但不可用则显式抛错，不静默降级。这是「不靠隐式 fallback 掩盖不变量」的写法。
- 临时 `PI_CODING_AGENT_DIR` 与用户 `~/.pi` 隔离，`settings.json` 只承载显式 shell 配置。

## 非阻断建议

- `local-pi-model-catalog.ts` 现在同时负责模型 catalog、自定义 provider、隔离 home 与 shell 设置。若后续继续扩展本机配置，建议把该文件提升为「本地 Pi home 覆盖」并在内部拆分 catalog/provider/settings 三个单一职责函数；当前规模下拆分收益不足，本轮不阻断。

## 残留风险（沿用既有 defer，不在本 change 扩大）

- runtime policy metadata-only：`model version`、`tool policy`、`environment`、`max_turns` 仍只作为 plan 绑定记录，正式模型比较前需由独立 change 落到真实 runtime manifest。
- 本地 smoke 在宿主执行，弱于正式容器隔离；本轮只作为诊断证据，未写 record。正式比较前必须走容器路径。

## Verification

- `bun test src/benchmark/runner/pi/v2/staged` — 41 pass / 0 fail。
- `bun test src/benchmark/runner/pi/v2/local-pi-model-catalog.test.ts src/benchmark/runner/pi/v2/staged/staged-practice-delivery.test.ts` — 31 pass / 0 fail。
- `bun test src/benchmark/treatments/pack-practice/v1` — 19 pass / 0 fail。
- `bun run test:contracts:runner` — 138 pass / 0 fail。
- `bun run validate` — Workspace layout is valid；Snapshots are intact。
- `bun run validate:openspec` — strict validation pass。
- `git diff --check` — pass。
- 真实 Pi smoke（`task_start`）已完成，作为行为证据而非代码质量证据。
