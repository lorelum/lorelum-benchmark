## 0. 流程门禁

- [x] 0.1 创建并回读 Issue #76，收敛 candidate 校准完整性与可复现条件缺口。 [写入范围：GitHub Issue #76]
- [ ] 0.2 严格验证本 change，并在 `codex/login-practice-probe-calibration-hardening` 从最新 main 创建只含 OpenSpec artifacts 的初始 PR；在 #73 合并前不得实施候选代码修复。 [写入范围：`openspec/changes/login-practice-probe-calibration-hardening/`、GitHub PR]

## 1. 私有 Probe 与校准

- [ ] 1.1 #73 合并后重新确认 candidate snapshot 和 public/private 边界；为“导入但未调用 login、本地实现登录”的绕过创建 private 负向 calibration fixture。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/`]
- [ ] 1.2 更新私有 AST probe，使其要求 `LoginPage` 实际调用指定 feature API 的 login 绑定，并拒绝直接 request adapter/HTTP 绕过；运行 focused probe 校准。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/evaluator/`]
- [ ] 1.3 将 private reference 扩展为完整可运行 app，使用同一浏览器语义测试，并记录 naive/reference 的预期组合结果。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/calibration/`、`private/calibration.md`]

## 2. 执行条件与快照

- [ ] 2.1 将未固定的模型条件显式标记为 pending，要求 #75 在独立 execution manifest 中固定 provider、部署/模型版本、解析策略与时间戳后才可执行。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/conditions.yaml`]
- [ ] 2.2 重新生成 candidate snapshot，审计其不包含 generated output、evidence-index 或 private 内容泄露到 public。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/snapshot.json`]

## 3. 验证与交接

- [ ] 3.1 运行 naive/reference 的安装、构建、Playwright 语义检查与私有 probe；记录命令和结果，不调用模型。 [写入范围：`private/calibration.md`]
- [ ] 3.2 运行 focused snapshot/probe tests、`bun run validate` 和 strict OpenSpec validation；在 PR 中保留验证证据与未执行原因。 [写入范围：仅在验证失败时修改相应源码]
