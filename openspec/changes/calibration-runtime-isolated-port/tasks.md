## 0. 规划澄清门禁

- [x] 0.1 确认 #108 已合并进 `origin/main`（commit `51e2681`），本 change 直接基于最新
  main 实现，不复制或重建 overlay 机制；materializer、isolate、driver、evaluator 与
  snapshot 沿用 #106 共享 resolver 与身份边界，并写回 design 与本清单。
- [x] 0.2 确认端口所有权与分配策略：每个 role 的 private driver 让本地 HTTP server 以
  `port: 0` 原子绑定、将 Vite 挂载为 middleware 并读取实际地址；不在 kernel 与 Vite 之间
  交接监听套接字，因此没有跨进程的 discover-then-bind TOCTOU 竞态；绑定或读取失败 fail closed。
- [x] 0.3 确认注入契约：private driver 从已监听的 Vite 服务构造私有 base URL，并仅向
  Playwright 注入 `PLAYWRIGHT_BASE_URL`；Playwright 禁用固定 `webServer`，缺失该值或回退
  固定端口时 fail closed。
- [x] 0.4 确认失败、超时、Vite 地址读取或关闭失败、服务未就绪时的私有诊断和 fail-closed
  语义：均使 role fail closed 并保留私有诊断，不产生部分有效结论。
- [x] 0.5 确认迁移策略：创建新 immutable registry base 版本（`app-shell/v2`）与
  `quality-probe/v2` calibration set，旧 `app-shell/v1` 与 `quality-probe/v1` 不被改写。
- [x] 0.6 确认并发 integration test 覆盖对象（至少两个 candidate/fixture 并行）、串行
  等价基线和 snapshot 更新策略（新 set 身份，旧 set 不改写）。

## 1. 隔离端口分配与注入

- [x] 1.1 令每个 private calibration driver 使用本地 HTTP server 的 `port: 0` 原子绑定
  端口、将 Vite 挂载为 middleware 并从已监听服务读取地址；绑定或地址读取失败 fail closed。
- [x] 1.2 实现私有 base URL 注入契约：Vite 产生实际地址，Playwright 使用同一外部
  `baseURL` 并禁用固定 `webServer`；消费者缺失该值或回退固定端口时 fail closed。
- [x] 1.3 为原子服务绑定、无效地址、服务未就绪、超时和关闭失败写 focused tests，断言均
  fail closed 且无有效结论。

## 2. 消费者与隔离一致性

- [x] 2.1 令 calibration driver 在 kernel 私有 staging 内从 Vite 消费并向 Playwright
  注入实际 base URL，且不将其写入 agent workspace 或生成物。
- [x] 2.2 令 materialize、isolate、snapshot 继续使用 #106 的共享 resolver 与身份边界，
  不分叉；验证端口信息不进入普通 snapshot files、Practice payload 或 trace。
- [x] 2.3 验证 Playwright 与 Vite 对同一合成 fixture 消费 Vite 已绑定的同一私有
  base URL/port。

## 3. 受限迁移与验证

- [x] 3.1 创建新 immutable registry base 版本（`app-shell/v2`）承载端口感知配置；提交
  版本固定 base 与最小 override，不改 #75、#97 的题面、Practice、source pin、质量门槛或
  结论。
- [x] 3.2 为两个 #97 candidate 新增 `quality-probe/v2` calibration set，旧
  `quality-probe/v1` 不被改写；重建并复核 snapshot 身份。
- [x] 3.3 新增并发 integration test：至少两个 candidate/fixture 同时运行，验证无
  `EADDRINUSE`、无跨 invocation 串扰、并行结果与串行基线一致。
- [x] 3.4 执行 public/private 泄露审计、focused tests、`bun run validate`、OpenSpec strict
  validation 与 `git diff --check`；记录结果及未执行的 Pi、模型、retrieval、盲评与正式
  record。
