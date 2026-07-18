# 正式 Pi Sandbox 部署

正式 runner 使用 Linux Docker。runner 服务进程必须设置 `LORELUM_SANDBOX_ENFORCED=1`；workflow 不会设置这个值，避免未部署隔离的 runner 伪造通过。

## 网络

创建 Docker internal network `lorelum-formal-egress`，Pi 容器只能加入该网络。部署一个 proxy 容器：它同时连接 internal network 和独立上游网络，但 Pi 永远不连接上游网络。proxy 的配置必须只允许 `CONNECT api.deepseek.com:443`，拒绝所有其他目的地、HTTP 方法和管理端口；proxy image 也必须使用 digest。

`environments/formal-pi-deepseek-v4-pro/v1/environment.yaml` 中的 `proxy_url`、network 名称和 endpoint 是 runner 的验收契约。变更 proxy 地址、镜像或策略时，必须在尚无 record 前更新该 environment；已有 record 后创建新的 environment version。

## 镜像与验收

`Publish formal Pi container image` 将 Dockerfile 以仅含 `package.json` 与 `bun.lock` 的 build context 构建，并在 job summary 输出 digest。把该 digest 写入 formal environment 后，在 runner 上执行：

```sh
docker pull ghcr.io/lorelum/lorelum-benchmark/formal-pi@sha256:<digest>
export LORELUM_SANDBOX_ENFORCED=1
bun run test:sandbox
```

该检查必须验证：镜像的 Bun `1.3.11`、Node `22.19.0` 和 Pi `0.80.10`；private 与 checkout 未挂载；G1 skill 只读；AWS/GitHub 凭据不可见；`example.com` 不可达；`api.deepseek.com` 只能经 proxy 到达。通过后才允许触发 workflow 的 `dry-run`。
