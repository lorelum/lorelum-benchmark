# Environments（运行环境）

环境 manifest 固定模型、Agent runtime、Bun 版本、依赖 lockfile、sandbox 策略和相关
服务版本。运行时或依赖发生变化时，必须创建新的环境版本，以保证历史运行仍可复现。

Pi v2 从 `environments/<id>/v<version>/environment.yaml` 解析环境，并要求其中的 Agent
runtime、模型和 sandbox policy 与请求一致。`local-pi/v1` 是本地评测的启动配置；
`formal-pi-deepseek-v4-pro/v1` 固定 Pi `0.80.10`、依赖 package/lockfile 和 public-only policy。
新版本运行时不得修改已记录的 environment manifest。
