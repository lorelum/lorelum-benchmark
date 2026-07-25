## Why

登录页 Practice candidate 在 #73 中完成并归档后，审查发现其私有静态探针可把“导入但未调用 `login`”的组件判定为遵循 Practice，reference 也未经过同一公开浏览器语义校准。若将其作为 #75 pilot 的输入，结果不能证明“语义与分层探针均通过”这一预注册指标。当前 candidate 没有运行 record，必须在任何比较执行前修复并重新固定快照。

## What Changes

- 强化 candidate 私有 AST 分层探针，使其验证组件使用指定 feature API，而非只验证导入文本；为已知绕过路径增加负向校准。
- 将 private reference 扩展为可运行的完整登录页，实现同一公开语义，并在 calibration 中分别记录 naive/reference 的语义与探针结果。
- 将 candidate 条件中的模型身份改为显式未就绪，直到 #75 的独立执行 manifest 能固定 provider、部署/模型版本和解析策略；禁止把可变别名作为可复现输入。
- 重新生成 candidate snapshot，并验证 public/private 隔离、快照和 workspace 校验。

## Capabilities

### New Capabilities

- `login-practice-probe-calibration`: 登录页 candidate 的抗绕过分层探针、完整参考实现和校准结果契约。

### Modified Capabilities

无。此修复分支从尚未包含 #73 的当前 `main` 创建；它只定义依赖 #73 candidate 的新增校准契约，不改写 #73 已归档的 stable spec。

## Impact

依赖 #73 合并后的 `incubator/practice-injection/login-page-layered-api-v1/` candidate。预计修改其 private evaluator、calibration/reference、calibration 文档、conditions 与 snapshot；不修改 public 题面、正式 suite、shared evaluator helper、runner、schema、treatment、environment 或 record。不会执行模型调用、盲评或 pilot。
