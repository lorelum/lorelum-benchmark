# Design

## Context

#244 升级活跃 runtime；`ci-runtime-modernization` 原本硬编码 Bun 1.4.2、Node 24.21.0、Pi 1.1.0 及对应 v3/v4 环境。记录过的环境不得原地改写。本次查询 npm 的 Bun 为 1.4.4，Pi 为 1.5.0；Node 官方 index 的最新稳定 LTS 为 26.13.0。实施前重新确认并将精确版本写入实现与证据。

用户已确认实施计划：Bun 1.4.4、Node LTS 26.13.0、Pi 1.5.0，版本化新环境并保留历史；包含兼容、合同与容器验证。用户授权发布新版 formal Pi 镜像；未授权执行真实模型请求。

## Goals / Non-Goals

目标是经验证的最新稳定工作区、CI、镜像和新环境，并验证旧结果身份。非目标：覆盖旧 manifest、修改旧记录、混入 #242 自主检索实现或默认使用付费模型。

## Decisions

1. `package.json`、`bun.lock`、`scripts/check-runtime.ts` 与 `.github/workflows/` 使用统一精确版本；生成新 lockfile 并验证干净安装。Node 采用最新稳定 LTS 而非 alpha。
2. 保留 `environments/formal-pi-deepseek-v4-pro/v3`、`local-pi/v4`、`local-wsl-pi/v4`；为活跃环境创建后续版本，固定更新后的 runtime、依赖 lockfile hash、sandbox 与镜像 digest。新旧环境引用必须分别可解析；不伪造未经发布的镜像 digest。
3. 更新 `Dockerfile.formal-pi`、构建与 runtime preflight，检查 Pi 1.5 的扩展 API、参数、模型与 JSON trace 兼容性。需要变更 runner 时只做有证据的适配，不改变历史 record 解释。
4. 稳定规格继续约束跨版本一致性、干净安装和历史不可变；精确版本与新环境路径属于本 change，避免将一次升级的版本永久写成普适要求。
5. 更新 `docs/PI_RUNNER.md` 等适用文档及验证说明；旧环境的已发布镜像、清单与记录均保留。公开工作区及 private oracle 的隔离政策不变。

## Risks / Trade-offs

Pi 主次版本可能改变工具 API 和事件形状；必须用真实扩展加载及 trace 检验，不能依靠仅有类型检查。正式镜像 digest 如需外部发布，必须先获对应发布授权；不可把本地 image ID 冒充发布 digest。新运行时使用相同配置也不可自动视为与旧结果可比。

## Verification

运行 frozen install、`bun run check:runtime`、`bun run validate`、相关 contract tests、容器构建和 sandbox smoke。模型实际请求需用户单独授权，不将离线检查视为模型结果。结果和失败需要分别记录。
