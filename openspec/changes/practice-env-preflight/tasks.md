## 1. 探活实现

- [ ] 1.1 在 `incubator/practice-injection/login-page-layered-api-v1/private/execution/run-local.ts` 实跑入口（`pi --version` 之后、runAttempt 循环之前）增加 `preflightModel` 函数：用极小 prompt 调用 Pi `--print`，30 秒独立超时，失败则以退出码 1 退出并在 stderr 报告失败类别，不进入 runAttempt 循环。
- [ ] 1.2 探活调用不得把 API key 明文写入 stdout/stderr/日志/摘要；失败信息只报告类别，可附不含 key 的原始 stderr 摘要。
- [ ] 1.3 确认 `--dry-run` 分支不触发探活。

## 2. 测试

- [ ] 2.1 在 `run-local.test.ts` 新增测试：用 fake Pi 模拟探活失败，断言执行器以退出码 1 退出、不进入 runAttempt 循环、不创建 summary.json。
- [ ] 2.2 新增测试：用 fake Pi 模拟探活成功，断言执行器进入 runAttempt 循环并产出摘要。
- [ ] 2.3 新增测试：探活失败信息不含 key 值。

## 3. 验证

- [ ] 3.1 运行 `bun run validate`，确认 suite、task、schema 与 benchmark 代码校验通过。
- [ ] 3.2 对登录页候选回放实跑入口，确认探活在 runAttempt 循环前执行且不影响已有结果。