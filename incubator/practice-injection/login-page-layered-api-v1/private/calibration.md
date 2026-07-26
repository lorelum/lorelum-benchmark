# 校准记录

校准不得调用模型。`public/starter/app` 是 naive 实现：它满足公开浏览器语义，但预计无法通过分层探针。
`private/calibration/reference` 是独立可运行的完整 app：它复制同一公开浏览器语义，并将请求、DTO 映射和认证错误翻译置于组件外的 API 边界。

验收要求如下：

1. 在 `public/starter/app` 安装锁定依赖后，运行 `bun run build && bun run test`，证明 naive 实现通过公开语义。
2. 使用 starter 已安装的 TypeScript 解析器运行 `bun run private/evaluator/verify-layering.ts public/starter/app public/starter/app`，证明 naive 实现失败。
3. 使用同一解析器运行 `bun run private/evaluator/verify-layering.ts private/calibration/fixtures/unused-login-import public/starter/app`，证明“导入但不调用 login、提交时本地实现”的绕过失败。
4. 使用同一解析器运行 `bun run private/evaluator/verify-layering.ts private/calibration/fixtures/detached-login-call public/starter/app`，证明“无关路径调用 login、提交时本地实现”的绕过失败。
5. 在 `private/calibration/reference` 安装锁定依赖后，运行 `bun run build && bun run test`，证明 reference 通过同一公开浏览器语义。
6. 使用 starter 已安装的 TypeScript 解析器运行 `bun run private/evaluator/verify-layering.ts private/calibration/reference public/starter/app`，证明 reference 通过。
7. 使用同一解析器运行 `bun run private/evaluator/verify-layering.ts private/calibration/fixtures/equivalent-auth-boundary public/starter/app`，证明不同命名和目录布局、但边界职责等价的实现也能通过。

若第 2 至第 7 项不符合预期，候选必须拒绝，不能进入比较执行。
