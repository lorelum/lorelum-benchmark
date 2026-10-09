## Context

当前 active runtime 为 Bun `1.4.2`、Node `24.21.0`、Pi `0.85.1`（见 `openspec/specs/ci-runtime-modernization`）。Pi 版本通过以下位置被断言：

- `package.json` 与 `bun.lock` 中的 `@earendil-works/pi-coding-agent`；
- `Dockerfile.formal-pi` 中的 `pi --version` 断言；
- `.github/workflows/validate.yml` 的 `PI_VERSION` 与镜像断言；
- `scripts/check-runtime.ts` 的 `expected` 常量；
- `environments/formal-pi-deepseek-v4-pro/v2`、`environments/local-pi/v3`、`environments/local-wsl-pi/v3` 的 `environment.yaml`（含 `version` 与 `lockfile_sha256`）；
- `docs/FORMAL_SANDBOX.md`、`docs/PI_RUNNER.md`、`environments/README.md` 的文字描述。

`environments/README.md` 明确规定：新版本运行时不得修改已记录的 environment manifest。因此升级通过新增版本化 environment 完成，而不是原地改写。

## Decisions

- Pi 精确版本固定为 `1.1.0`，不使用 range。
- Node 保持 `24.21.0`（LTS），仓库内不改动；本地 workstation 升级为机器操作。
- 新 environment：`formal-pi-deepseek-v4-pro/v3`（替代 `v2` 作为 active formal 路径）、`local-pi/v4` 与 `local-wsl-pi/v4`（替代 `v3` 作为 active 本地路径）。旧版本保留原 runtime identity，作为历史可复现记录，不是兼容 shim。
- 新 environment 的 `lockfile_sha256` 由升级后的 `bun.lock` 计算；不复用旧 hash。
- 历史 incubator candidate 若 `conditions.yaml` 固定 `pi_version: 0.80.10` 或 `0.85.1`，本 change 不迁移它们；后续重跑须显式使用旧 runtime 或另建 candidate/plan migration。
- CLI 兼容性验证范围限定为 runner 实际使用的参数与 JSON 事件路径，不扩展到新功能。
- 不引入新的 feature flag、适配层或参数分支；若 1.1.0 行为与 runner 假设不符，则停止并回到 Plan，而不是在 runner 内加兼容分支。

## Compatibility Evidence

- 来源：npm 包 `@earendil-works/pi-coding-agent@1.1.0`（tarball `dist.integrity` 与 engines `node >=22.19.0`）。
- `docs/cli.md`（1.1.0）确认存在：`--print`、`--mode json`、`--no-session`、`--tools`、`--no-tools`、`--no-extensions`、`--no-context-files`、`--no-skills`、`--no-prompt-templates`、`--append-system-prompt`、`--system-prompt`、`--session-dir`、`--model`、`--version`。
- `docs/environment-variables.md` 与 `docs/settings.md` 确认 `HTTP_PROXY`/`HTTPS_PROXY` 仍被读取。
- `dist` 中 `model-resolver` 默认 DeepSeek 模型仍为 `deepseek-v4-pro`。
- 0.85.1 之前已存在的 `message_update` delta 变更已包含在 baseline 中，不属于本次升级。
- 1.0.0 的 fullscreen 默认值只影响交互模式；runner 使用 `--print`/`--mode json`，不受影响。

## Verification Plan

- `bun install --frozen-lockfile`；`pi --version` 为 `1.1.0`；`node --version` 为 `v24.21.0`。
- `bun run check:runtime`、`bun run validate`、`bun run test:contracts:core`、`bun run test:contracts:runner`。
- 本地 smoke：`pi --print --no-session --no-tools --no-context-files --no-skills --no-extensions --model deepseek/deepseek-v4-pro "Reply with exactly: ok"` 仅在用户授权后执行一次（会访问 DeepSeek），否则只做参数解析/`--help` 级验证。
- 正式镜像：`docker build -f Dockerfile.formal-pi` 并运行镜像内版本断言。
- `bun run test:sandbox` 与 `bun run test:local-sandbox`，验证 proxy、凭据不可见与镜像 digest。
- 不创建正式 record，不运行 `evaluate`，不升级 suite revision。

## Risks

- 1.0.0 主版本 Breaking Changes 可能影响未被文档覆盖的 runner 路径 → smoke 与 runner contract tests 覆盖；失败时不生成 record。
- `bun.lock` 重新解析可能引入其他传递依赖变化 → 仅接受 `bun install` 对 Pi 依赖图的必要变化，并在 PR 中列出 lockfile diff 摘要。
- 旧 environment 的 `lockfile_sha256` 与新 lockfile 不一致 → 新 manifest 独立计算，旧 manifest 不修改。
- 本地 Node 与仓库声明不一致 → 通过 `check:runtime` 报错，不在仓库内兼容旧 Node。

## Non-Goals

- 不改动 Node 声明（已为 `24.21.0`）。
- 不改动 Bun 版本。
- 不迁移历史 candidate、incubator condition 或 record。
- 不引入 Pi 新特性（codemode、MCP、tool_search 等）到 runner。

## Plan Confirmation Record

- 2026-10-09：Plan 已展示；需求方回复“继续”，按推荐默认值执行。Node 本地升级由操作者完成；不执行真实模型调用；正式 record 不创建。
- 同步记录见 Issue #238 评论。

## Formal Image Digest Decision

- formal v3 必须引用已发布的 digest，不得使用 tag 或占位符。
- 通过 `publish-formal-pi-image.yml` 的 `workflow_dispatch` 在本分支构建并发布；digest 为 `sha256:4d0e64ec1927665a52617ad938ff6fb277a398b68cbc2c3671df16c4c5b98c7a`（run 37872526780）。
- 合并后若 `main` 的 Dockerfile/lockfile 输入变化并重新发布，需另建 environment version，不原地替换 digest。
