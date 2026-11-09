# Environments（运行环境）

环境 manifest 固定模型、Agent runtime、Bun 版本、依赖 lockfile、sandbox 策略和相关
服务版本。运行时或依赖发生变化时，必须创建新的环境版本，以保证历史运行仍可复现。

Pi v2 从 `environments/<id>/v<version>/environment.yaml` 解析环境，并要求其中的 Agent
runtime、模型和 sandbox policy 与请求一致。`local-pi/v5` 和 `local-wsl-pi/v5` 固定 Bun
`1.4.4`、Node `26.13.0`、Pi `1.5.0`；旧的 local manifest 保留原有 runtime identity。
`formal-pi-deepseek-v4-pro/v4` 固定同一运行时和经发布的镜像 digest；历史 `v3` 保留
Pi `1.1.0`、原 lockfile 和镜像身份。正式运行仍需满足模型快照、隔离和授权门禁。
新版本运行时不得修改已记录的 environment manifest。

## 重建和检查当前运行时

在安装 Bun `1.4.4`、Node `26.13.0` 后，于仓库根目录执行：

```sh
bun install --frozen-lockfile
bun run check:runtime
bun run validate
```

本地容器按 `Dockerfile.formal-pi` 构建为 `lorelum-formal-pi:local`，然后设置
`LORELUM_LOCAL_EXPERIMENT=1` 执行 `bun run test:local-sandbox`；该检查不替代正式环境的
代理与网络隔离验收。正式镜像凭 digest 拉取及正式 sandbox 前置条件见
[`docs/FORMAL_SANDBOX.md`](../docs/FORMAL_SANDBOX.md)。
