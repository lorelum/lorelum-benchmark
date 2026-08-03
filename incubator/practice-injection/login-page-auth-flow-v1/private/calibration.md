# 校准记录

不调用模型。public starter 为真占位（表单未接通、无提交处理），公开语义必须
`fail` 且分层质量信号 `not-observed`；anti-pattern（组件直接调用 transport 并读取
原始 response）公开语义 `pass`、分层 `not-observed`；reference 与不同命名、目录
结构的 equivalent fixture 公开语义 `pass`、分层 `observed`（组件通过边界模块调用，
边界负责 transport 与 401 翻译）。

通过 kernel 运行
`bun run src/benchmark/kernel/kernel.ts calibrate incubator/practice-injection/login-page-auth-flow-v1 --output <已 materialize 的临时 workspace>`
可重放四项矩阵。driver 只接收 kernel 临时实体化的私有合成树。驱动会在每个
fixture 缺少依赖时运行 `bun install --frozen-lockfile`；首次运行前须为其安装
Chromium（在每个 fixture 目录运行 `bunx playwright install chromium`）。测试通过
Playwright `page.route` 拦截 `/api/session` 提供后端响应；产品代码只调用真实
`fetch`，不包含埋点、假延迟或演示凭据。四项矩阵要求：public-starter
`semantic=fail / not-observed`；reference、equivalent `semantic=pass / observed`；
anti-pattern `semantic=pass / not-observed`。全部 fixture 与 public starter 的
`bun run build`（tsc -b）必须通过。
