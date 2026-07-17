# Pi Runner 契约

Pi 是用于执行 benchmark 任务的自动化 runner。本仓库不假定某一种 Pi 命令行接口，
而是由 adapter 接收一个版本化 JSON 请求；请求中包含 Pi 集成所选定的确切命令和参数：

```sh
bun run pi -- path/to/pi-run-request.json --dry-run
bun run pi -- path/to/pi-run-request.json
```

`src/benchmark/runner/pi/v1/types.ts` 定义请求结构。它要求提供 suite/task 版本和
snapshot、treatment、环境、scorer、Agent/模型、随机种子、预算、工具策略 hash、输入
hash 和 artifact 位置。请求中的命令刻意保持显式，以免 adapter 擅自拼装 Pi flags。
`--dry-run` 会校验请求并输出命令而不执行。请从
`docs/examples/pi-run-request.example.json` 开始，替换所有占位符，并在执行 Pi 前将
不可变的正式 manifest 保存到声明的 artifact 位置。

正式运行应将完整不可变 manifest 和所有大体积输出存入 artifact storage，然后在
`results/records/` 提交运行记录索引和 artifact 校验和。这样无需将大 trace 或私有
oracle 内容放入 Git，也能独立审计一次运行。
