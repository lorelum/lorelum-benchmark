# 真实环境验证报告（llm-provider-gateway-v2）

本报告由一次独立验证 pass 在冻结 candidate 上执行；验证对象为
`incubator/practice-injection/llm-provider-gateway-v2/`，不读取实现阶段记忆、
不修改 candidate。若仓库流程要求严格“不同 agent 线程”执行，可在新线程中复跑相同命令。

## 1. Starter 语义基线

- 从 `public/starter/app` 复制到全新临时目录，`bun install --frozen-lockfile` + `bun run test`。
- 结果：0 pass / 22 fail，exit code 1，符合“真占位、公开测试红”的设计。

## 2. 校准矩阵

- `bun run src/benchmark/kernel/kernel.ts calibrate <candidate> --output <tmp>`。
- 结果：`calibration-matrix` `passed`。
- 六类样例均达到声明结果：public-starter fail/not-observed；reference、equivalent、type-based pass/observed；anti-pattern、docs-present pass/not-observed。

## 3. 仓库门禁

- `bun run validate`：`Workspace layout is valid.` / `Snapshots are intact.`。
- `openspec validate llm-provider-gateway-v2 --type change --strict`：valid, 0 issues。
- `git diff --check`：通过。

## 4. 真实性与泄露审计

- public 面文件未发现 `benchmark / oracle / evaluator / calibration / practice / condition / rubric / score / hash` 等 benchmark 术语。
- public 面未出现被测规范文档、私有路径或 evaluator 文件。
- `kernel isolate` 对 public starter 的 `package.json` / `bun.lock` 报 basename 启发式命中（与 private evaluator runtime-closure 同名），非私有内容泄漏；已在 implementer-evidence 中记录。

## 5. 模型与正式产物

- candidate 交付阶段未调用 Pi/agent 模型、未创建正式 record、未升级 suite revision。
- judge rubric 由仓库级 `judge-agent/generic/v1` 生成并固定，见 `verification/judge-rubric.json`（rubric_hash `db059c1653e74405e6ffab17da4f8d21f32ef5b9a24c816eb93246ac2ae19894`）。

## 结论

candidate 的公开/私有边界、语义测试、职责探针、校准矩阵、snapshot 与仓库门禁均通过。剩余严格独立 agent 复核与三条件 pilot 不改变 candidate 冻结内容，可按后续 issue 执行。
