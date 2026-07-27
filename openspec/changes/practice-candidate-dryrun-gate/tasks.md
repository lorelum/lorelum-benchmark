## 1. dry-run 门禁实现

- [ ] 1.1 修改 `incubator/practice-injection/login-page-layered-api-v1/private/execution/run-local.ts` 的 `--dry-run` 分支：在输出计划 JSON 前，调用 `copyPublicWorkspace` 复制临时工作区、用 `workspaceFiles` 列举文件、断言清单不含 `private/` 或 `practices/` 路径，验证通过后清理临时工作区并输出含 `workspace_files` 与 `dry_run: true` 的计划 JSON。
- [ ] 1.2 dry-run 发现 private 材料时以退出码 1 失败并在 stderr 报告泄露文件路径，不输出计划 JSON。

## 2. 测试

- [ ] 2.1 在 `incubator/practice-injection/login-page-layered-api-v1/private/execution/run-local.test.ts` 新增测试：dry-run 退出 0、计划 JSON 含 `workspace_files` 与 `dry_run: true`、文件清单不含 `private/` 或 `practices/`。
- [ ] 2.2 新增测试：dry-run 不产生 Pi 调用记录、evaluator 输出或 candidate diff。
- [ ] 2.3 保留并复跑现有 dry-run 测试，确认计划仍含三条件且 `workspace_template` 不含 `private`。

## 3. 验证

- [ ] 3.1 运行 `bun run validate`，确认 suite、task、schema 与 benchmark 代码校验通过。
- [ ] 3.2 对登录页候选回放 `--dry-run`，确认工作区文件清单与 `conditions.yaml` 声明一致且不含 private 材料。
