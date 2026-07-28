## 0. 规划澄清门禁

- [ ] 0.1 确认 #108 未合并时的依赖策略：等待合并、基于其分支或其他可追溯方式；不得
  复制或重建 overlay 机制，并写回 Issue #109、design 与本清单。
- [ ] 0.2 确认 runtime 端口的所有权、分配与释放策略，以及如何防止"发现空闲端口后再
  绑定"的 TOCTOU 竞态。
- [ ] 0.3 确定向 Playwright/Vite 注入 port、base URL 或两者的具体契约，以及所有消费
  者如何验证同一私有 runtime。
- [ ] 0.4 确认失败、超时、端口不可用、服务未就绪时的私有诊断和 fail-closed 语义。
- [ ] 0.5 确认受影响 fixture 的迁移策略：是否创建新的 immutable registry base 与
  `quality-probe/v2` calibration set，而非改写旧 base/set。
- [ ] 0.6 确认并行 integration test 的覆盖对象、串行等价基线和 snapshot 更新策略。

## 1. 隔离端口分配与注入

- [ ] 1.1 在版本化 kernel 目录实现每次调用独占的端口分配器：原子绑定监听套接字并读取
  分配端口，拒绝非法值，同运行时不复用已持有端口，分配失败 fail closed。
- [ ] 1.2 实现私有 base URL/port 注入契约，令 Playwright 使用外部 `baseURL` 并禁用固定
  `webServer`、Vite 绑定到持有端口；消费者不一致或回退固定端口时 fail closed。
- [ ] 1.3 为分配失败、非法值、服务未就绪、超时、重复释放和释放未持有端口写 focused
  tests，断言均 fail closed 且无有效结论。

## 2. 消费者与隔离一致性

- [ ] 2.1 令 calibration driver/evaluator 通过 kernel 私有 staging 消费注入的端口/base
  URL，且不将其写入 agent workspace 或生成物。
- [ ] 2.2 令 materialize、isolate、snapshot 继续使用 #106 的共享 resolver 与身份边界，
  不分叉；验证端口信息不进入普通 snapshot files、Practice payload 或 trace。
- [ ] 2.3 验证 Playwright 与 Vite 对同一合成 fixture 与私有 runtime 消费同一端口/base
  URL。

## 3. 受限迁移与验证

- [ ] 3.1 创建新的 immutable registry base 版本承载端口感知配置；提交版本固定 base 与
  最小 override，不改 #75、#97 的题面、Practice、source pin、质量门槛或结论。
- [ ] 3.2 为两个 #97 candidate 新增 `quality-probe/v2` calibration set，旧 `quality-probe/v1`
  不被改写；重建并复核 snapshot 身份。
- [ ] 3.3 新增并发 integration test：至少两个 candidate/fixture 同时运行，验证无
  `EADDRINUSE`、无跨 invocation 串扰、并行结果与串行基线一致。
- [ ] 3.4 执行 public/private 泄露审计、focused tests、`bun run validate`、OpenSpec strict
  validation 与 `git diff --check`；记录结果及未执行的 Pi、模型、retrieval、盲评与正式
  record。