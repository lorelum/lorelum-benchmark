## Why

Issue #109 的两个 `injection-calibration/v1` incubator candidate 在并行执行
Playwright calibration 时同时绑定固定 `127.0.0.1:4173`，其中一个进程因端口占用失败；
串行执行时两者均通过。当前 private calibration 的浏览器服务端口不是并发隔离的运行
输入，跨 candidate 并行会引入与被测行为无关的失败。

## What Changes

- 为 kernel 驱动的 private calibration runtime 提供每次调用独占的本地端口或等价私有
  base URL：private driver 以 `port: 0` 原子启动本地 HTTP 服务、将 Vite 挂载为 middleware，
  读取实际地址后注入到 Playwright，消除共享固定端口的跨 candidate 争用。
- 令并行 calibration 与串行执行得到相同的语义和质量 probe 结论；端口分配失败、无效
  配置或消费者不一致时 fail closed 并保留私有诊断。
- 保持端口信息在私有 calibration runtime 内：不得进入 agent workspace、public prompt、
  普通 snapshot files、Practice payload、trace 或正式 record。
- 受影响的 registry base 与 calibration set 使用新版本表示配置变化；旧 set、旧 base
  与其可复现身份不被改写，snapshot 复核通过。

## Capabilities

### New Capabilities

- `calibration-runtime-isolated-port`: 为 kernel-backed private calibration runtime
  定义每次调用独占、可审计的端口/base URL 分配与注入契约，使并行校准与串行基线等价。

### Modified Capabilities

- 无。

## Impact

- `src/benchmark/kernel/` 的 core calibrate 路径与 calibration runtime 端口分配。
- `incubator/calibration-bases/` 中受影响 base 的版本化配置与两个 #97 incubator
  candidate 的 calibration set 版本。
- 相关 focused tests、并发 integration test、`bun run validate`、OpenSpec strict
  validation 与 public/private 泄露审计；不修改 #75、#97 的题面、Practice、source pin、
  质量门槛或既有结论，不运行 Pi、模型、retrieval、盲评或正式 record。
