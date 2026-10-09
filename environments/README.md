# Environments（运行环境）

环境 manifest 固定模型、Agent runtime、Bun 版本、依赖 lockfile、sandbox 策略和相关
服务版本。运行时或依赖发生变化时，必须创建新的环境版本，以保证历史运行仍可复现。

Pi v2 从 `environments/<id>/v<version>/environment.yaml` 解析环境，并要求其中的 Agent
runtime、模型和 sandbox policy 与请求一致。`local-pi/v4` 和 `local-wsl-pi/v4` 是当前本地评测的启动配置；旧的 local manifest 版本保留其原 runtime identity。
`formal-pi-deepseek-v4-pro/v3` 固定 Pi `1.1.0`、依赖 package/lockfile、已发布的 formal 镜像 digest 和 public-only policy；旧的 formal `v1`、`v2` 保留其原 runtime identity。
新版本运行时不得修改已记录的 environment manifest。
