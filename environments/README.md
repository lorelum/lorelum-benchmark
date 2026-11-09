# Environments（运行环境）

环境 manifest 固定模型、Agent runtime、Bun 版本、依赖 lockfile、sandbox 策略和相关
服务版本。运行时或依赖发生变化时，必须创建新的环境版本，以保证历史运行仍可复现。

Pi v2 从 `environments/<id>/v<version>/environment.yaml` 解析环境，并要求其中的 Agent
runtime、模型和 sandbox policy 与请求一致。`local-pi/v5` 和 `local-wsl-pi/v5` 固定 Bun
`1.4.4`、Node `26.13.0`、Pi `1.5.0`；旧的 local manifest 保留原有 runtime identity。
`formal-pi-deepseek-v4-pro/v4` 固定同一运行时和经发布的镜像 digest；历史 `v3` 保留
Pi `1.1.0`、原 lockfile 和镜像身份。正式运行仍需满足模型快照、隔离和授权门禁。
新版本运行时不得修改已记录的 environment manifest。
