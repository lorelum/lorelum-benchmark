# 校准记录

不调用模型。public starter 与 anti-pattern 在公开语义通过时必须得到分层质量信号
`not-observed`（组件直接调用 transport 并读取原始 response）；reference 与不同
命名、目录结构的 equivalent fixture 必须得到 `observed`（组件通过边界模块调用，
边界负责 transport 与 401 翻译）。

通过 kernel 运行
`bun run src/benchmark/kernel/kernel.ts calibrate incubator/practice-injection/login-page-auth-flow-v1 --output <已 materialize 的临时 workspace>`
可重放四项矩阵。driver 只接收 kernel 临时实体化的私有合成树。驱动会在每个
fixture 缺少依赖时运行 `bun install --frozen-lockfile`；首次运行前须为其安装
Chromium（在每个 fixture 目录运行 `bunx playwright install chromium`）。驱动要求
四项公开语义均通过，且 starter/anti-pattern 的分层质量信号为 `not-observed`、
reference/equivalent 为 `observed`。