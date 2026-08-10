# Findings 审阅与处理（llm-provider-gateway-v1）

审阅时点：2026-08-10；处理提交：`6d86e4b`（F1-F4）+ `ci-fix`（行尾/snapshot/CI）。

## F1（must-fix）— 已修复

- 问题：`private/evaluator/evaluate.ts` 退出码恒为 1（`semantic === 0` 字符串与数字比较恒 false），runner `classifyEvaluatorResult` 会把所有评测判为 `evaluator-exit-nonzero`。
- 修复：`process.exit(semanticPass ? 0 : 1)`（`semanticPass` 为数值退出码判断）。
- 验证：reference fixture → `{"semantic":"pass","practice_observation":"observed"}` + exit 0；占位 → semantic fail + exit 1。

## F2（needs-discussion）— 已修复

- 问题：探针 R1 只认 `interface` 关键字（≥2 方法），可能误伤 class / type 等价实现（假阴性）。
- 修复：R1 接受 interface / class / type 别名中 ≥2 个方法签名。
- 验证：新增正式校准夹具 `type-based`（契约用 `type ModelClient`），校准矩阵 5/5 → 6/6，type-based = pass/observed。

## F3（needs-discussion）— 已修复

- 问题：探针 R3 对请求路径文件中任意 `"deepseek"` 字符串字面量误报。
- 修复：R3 收窄为 AST 分支形态（`=== "deepseek"` / `!== "deepseek"` / `case "deepseek"` / fetch 参数）；配置或日志中的普通 `deepseek` 字面量不误报。
- 验证：reference + 请求路径文件（providers.ts）中加非分支 `"deepseek"` 字面量 → 语义 10/10 + probe observed。

## F4（defer）— 已处理

- 问题：design.md 语义硬门槛 7 条 vs oracle.yaml 断言 6 条口径不一致。
- 处理：design.md 注明第 7 条保护约束（config/key 不入库、不硬编码密钥、只允许改声明范围、依赖清单不变）由 `execution/tool-policy.yaml`、`git-history.yaml` 与 snapshot 生命周期承担，不属于 semantic_oracle 可观察行为断言；pilot/升级如需硬门禁，在 runner/snapshot 层追加审计。

## CI 修复（行尾与测试可靠性）

- 根因 1：`.gitattributes` 强制 `eol=lf`，但 `run.ts` / `sets.yaml` / `evaluate.ts` 在本地为 CRLF，snapshot 记录 CRLF 内容哈希，CI checkout（LF）重算不匹配 → validate 失败（CI 日志确认 3 个文件 Snapshot mismatch）。
  - 修复：三个文件归一为 LF + 重新生成 snapshot；本地重跑 `bun run validate` 全绿。
- 根因 2：`process-tree.test.ts` 的 unknown-pid 测试在 Windows 上超时（`Bun.spawn("taskkill")` 对未知 pid 约 3.8s，超过 bun test 默认 5s）。
  - 修复（test-only，不改 runner 行为）：该测试显式超时 15s；本地重跑 `bun run test:contracts` 171/0 全绿。

## 门禁

- 校准矩阵 6/6（kernel calibrate）。
- `bun run validate`（layout + snapshots intact）、`bun run test:contracts`（171 pass）全绿。
- CI workspace（ubuntu/windows）两步均本地重放通过；formal-container、realistic-repository 不受本 change 影响。