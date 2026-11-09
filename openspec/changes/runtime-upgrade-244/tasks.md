# Tasks

## 1. Runtime 与环境

- [x] 1.1 核查并固定最新稳定 Bun、Node LTS 和 Pi，更新 `package.json`、`bun.lock`、`scripts/check-runtime.ts` 与 CI。
- [ ] 1.2 创建新版 formal/local environment，保留旧 manifest 与记录；固定依赖 hash、sandbox 和可核验的镜像身份。
- [ ] 1.3 更新 `Dockerfile.formal-pi` 和构建流程；仅用实际发布的 digest 标识正式镜像，不擅自发布。

## 2. 兼容与验证

- [ ] 2.1 核查并适配 Pi runner、extension、模型 catalog 与 JSON trace 的真实版本变化，保持 public/private 和环境隔离。
- [ ] 2.2 验证 frozen install、`bun run check:runtime`、`bun run validate`、相关 contract tests 与容器 smoke；记录平台差异与失败。
- [x] 2.3 无模型调用地验证 Pi 扩展实际加载及事件接口；真实模型调用需单独授权。

## 3. 文档与生命周期

- [ ] 3.1 更新 runtime、环境和 runner 文档，写明新旧版本、验证命令与重建方法。
- [ ] 3.2 审计历史环境和记录保持原样，记录镜像 digest 的发布与获取证据；重新执行 strict validation。
