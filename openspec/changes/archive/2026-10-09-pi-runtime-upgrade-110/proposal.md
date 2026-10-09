## Why

Issue #238 要求将 benchmark 的 Pi 运行时从 `@earendil-works/pi-coding-agent` `0.85.1` 升级到 `1.1.0`。Node 目标 `24.21.0` 已由仓库在 `package.json`、`Dockerfile.formal-pi` 与 `validate.yml` 中声明，因此本 change 只处理 Pi。Pi 环境版本属于 benchmark 的 environment 身份，并且 `ci-runtime-modernization` 的 stable requirement 固定了 `0.85.1`，因此必须通过 OpenSpec 变更而非直接 PR。

跨越 `0.85.1` → `1.1.0` 包含 `1.0.0` 主版本，changelog 中有多条 Breaking Changes。已核对 runner 使用的 CLI 参数（`--print`、`--mode json`、`--no-session`、`--tools`、`--no-extensions`、`--no-context-files`、`--no-skills`、`--append-system-prompt`、`--session-dir`）在 1.1.0 文档中仍然存在，默认模型 `deepseek/deepseek-v4-pro` 仍为 DeepSeek 默认模型。这些是文档与 dist 层面的证据，仍需在实施阶段通过 smoke 验证。

该 requirement 是仓库级 runtime 基线，而非某次实验的结论：它约束开发、CI 与正式 Pi 路径的版本一致性，不规定候选题面、oracle、评测或结论解释，因此脱离 Issue #238 与单次实验后仍成立。

## What Changes

- 将 `@earendil-works/pi-coding-agent` 精确依赖升级到 `1.1.0`，同步 `package.json` 与 `bun.lock`。
- 同步正式镜像 `Dockerfile.formal-pi`、CI 的 `PI_VERSION`、`scripts/check-runtime.ts` 的版本断言与 runner 测试中引用的 active 版本。
- 新增版本化 environment：`environments/formal-pi-deepseek-v4-pro/v3`、`environments/local-pi/v4`、`environments/local-wsl-pi/v4`，固定 Pi `1.1.0` 与新的 lockfile identity。
- 保留 `formal-pi-deepseek-v4-pro/v2`、`local-pi/v3`、`local-wsl-pi/v3` 原有 manifest 与其 runtime identity，不改写。
- 更新 `docs/FORMAL_SANDBOX.md`、`docs/PI_RUNNER.md` 和 `environments/README.md` 中的 active 版本描述。
- 修改 `ci-runtime-modernization` 的 `Exact runtime identity is synchronized` requirement，使 active baseline 为 Pi `1.1.0`。

## Capabilities

### New Capabilities

<!-- 无新增 capability。 -->

### Modified Capabilities

- `ci-runtime-modernization`: 将 exact runtime baseline 的 Pi 版本从 `0.85.1` 更新为 `1.1.0`，并更新 active environment 版本列表。

## Impact

- `package.json`、`bun.lock`、`Dockerfile.formal-pi`、`.github/workflows/validate.yml`、`scripts/check-runtime.ts`。
- 新增 `environments/formal-pi-deepseek-v4-pro/v3/`、`environments/local-pi/v4/`、`environments/local-wsl-pi/v4/`；既有版本目录保持不变。
- `docs/FORMAL_SANDBOX.md`、`docs/PI_RUNNER.md`、`environments/README.md`。
- 不修改 `suites/`、既有正式 record、历史 incubator private conditions、Practice/oracle/evaluator/scoring、模型运行条件，也不执行模型调用。
- Node 运行时无仓库内变更；本地 workstation 从 `v24.14.0` 升级到 `v24.21.0` 属于机器环境操作，不计入本 PR diff。
- 同步 `docs/FORMAL_SMOKE.md` 的 formal 环境引用，并将 `src/benchmark/runner/pi/v2/sandbox-preflight.ts` 与 `local-sandbox-preflight.ts` 指向 active 版本。`local-sandbox-preflight.ts` 在 main 上指向 `local-wsl-pi/v2`（Pi `0.80.10`），属于既有陈旧引用，本 change 一并迁移到 `local-wsl-pi/v4`。
- 同步 `src/benchmark/runner/pi/v2/contract-app.test.ts` 的 dry-run fixture 到 `formal-pi-deepseek-v4-pro/v3` 与 Pi `1.1.0`。
- formal v3 的镜像 digest 通过 `publish-formal-pi-image.yml` 的 `workflow_dispatch` 发布得到，记录于 design 的 Formal Image Digest Decision。
