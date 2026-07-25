# 校准记录

校准不得调用模型。`public/starter/app` 是 naive 实现：它满足公开浏览器语义，但预计无法通过分层探针。
`private/calibration/reference` 是最小 reference：它保留同一公开行为语义，并将请求、DTO 映射和认证错误翻译置于指定 feature API。

验收要求如下：

1. 在 starter 安装依赖后，运行 `bun run build && bun run test`，证明 naive 实现通过公开语义；已通过 2 个 Chromium 测试。
2. 运行 `bun run private/evaluator/verify-layering.ts public/starter/app`，证明 naive 实现失败。
3. 使用 starter 已安装的 TypeScript 解析器运行 `bun run private/evaluator/verify-layering.ts private/calibration/reference public/starter/app`，证明 reference 通过。

若第 2 或第 3 项不符合预期，候选必须拒绝，不能进入比较执行。
