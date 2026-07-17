# Pi Runner 契约

Pi 是用于执行 benchmark 任务的自动化 runner。默认 adapter 为 `pi/v2`：它接收版本化
JSON 请求，但不接受用户提供的工作目录。adapter 会核对 suite、task card、正式 snapshot、
treatment manifest 和 environment manifest，随后在 `.run-workspaces/<run-id>/` 创建全新的
工作区。

工作区只包含 `public/task.md` 和 `public/starter/`；`private/`、evaluator、oracle 与
snapshot 永远不会复制给 Pi。请求中的 Pi 命令和参数仍保持显式，但命令必须与 environment
manifest 中固定的 agent runtime command 一致。adapter 约束命令的工作目录；正式环境还
必须由 environment manifest 指定的 sandbox 阻止 Pi 逃逸到宿主文件系统。

```sh
bun run pi -- docs/examples/pi-run-request-v2.example.json --dry-run
bun run pi -- path/to/pi-run-request-v2.json
```

`--dry-run` 会验证全部契约并输出将要使用的隔离工作区，不创建目录也不执行 Pi。正式运行
会在 `artifacts/runs/<run-id>/<manifest_name>` 写入 `pi-run-artifact/v2` manifest，记录经过
核验的输入、实际工作区、公开文件 hash、命令、状态和退出码。大体积 trace、输出与 diff
应从该目录上传到 artifact storage；仓库只提交其索引和校验和。

`pi/v1` 保留为历史兼容入口：`bun run pi:v1 -- <request> [--dry-run]`。新运行不得使用它。
