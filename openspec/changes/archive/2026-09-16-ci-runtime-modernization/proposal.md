## Why

仓库的可重建 runtime 与 CI 仍停留在 Bun `1.3.11`、Node `22.19.0` 和 Pi `0.80.10`，而同一个 pull request commit 会因 `push` 与 `pull_request` 两个事件重复运行完整 workflow。2026 年 9 月 15 日，PR #211 还暴露了 Windows 工作区混合换行导致 snapshot 在 Linux checkout 失败，以及 Pi coordinator black-box 测试的固定 5 秒预算在新 Bun/Windows 上过紧。现在需要在下一次正式实验前把工具链、CI 事件边界和失败诊断统一收住。

## What Changes

- 将主仓库开发/CI/formal Pi 的 exact runtime 更新为 Bun `1.4.2`、Node `24.21.0` LTS 和 `@earendil-works/pi-coding-agent` `0.85.1`。
- 同步 package manifest、lockfile、formal Pi 镜像、new versioned formal/local environment manifests、runner/sandbox 文档与版本断言；保留旧 environment version 和 incubator condition identity。
- 将普通验证 workflow 改为 PR 与 main push 的单一事件模型，加入按 PR/ref 的过期 run 取消；保留测试逻辑但将快速契约、runner integration、formal container 和 realistic repository calibration 拆成合理边界与集中维护、可测试的路径触发 job，并提供稳定聚合 check。
- 为 snapshot v1 的可识别文本文件提供遵循 `.gitattributes` 的 LF canonical digest 路径，保持 snapshot v2 的字节级 Merkle 契约和历史冻结 identity 不变；验证时由存储 snapshot version 选择 digest policy。
- 为 runner/coordinator black-box 测试采用足够的测试 timeout 与 fixture budget，明确这不改变正式运行的 budget contract。

## Capabilities

### New Capabilities

- `ci-runtime-modernization`: 固定可重建 runtime、去重并分层 CI 验证、跨平台 snapshot 稳定性和测试超时隔离。

### Modified Capabilities

<!-- 本 change 不修改已有 benchmark task、evaluator、record 或 snapshot v2 的语义要求。 -->

## Impact

- `package.json`、`bun.lock`、`Dockerfile.formal-pi`、new versioned `environments/` manifests、`docs/PI_RUNNER.md` 和 `docs/FORMAL_SANDBOX.md`；旧 environment version 保持不变。
- `.github/workflows/` 的验证编排及新增 workflow/job 的 required-check 边界。
- `src/benchmark/snapshot.ts`/相关 hash helper 和 `src/benchmark/runner/pi/v2/contract-app.test.ts` 的跨平台与 timeout 测试代码。
- 不修改 `suites/`、既有正式 record、历史 incubator private conditions、Practice/oracle/evaluator/scoring 或模型运行条件。
