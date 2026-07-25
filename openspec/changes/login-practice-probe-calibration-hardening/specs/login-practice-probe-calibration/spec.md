## ADDED Requirements

### Requirement: 分层探针校验实际 feature API 调用

登录页 candidate 的私有分层 probe MUST 验证 `LoginPage` 从指定 feature API 导入的 `login` 绑定被实际调用。仅导入该绑定、以组件本地逻辑实现登录，或直接调用 HTTP/request adapter MUST 判为 Practice probe 失败。该检查不得要求 private evaluator、Oracle 或 Practice 出现在 public 输入中。

#### Scenario: 导入但未调用 login

- **WHEN** calibration fixture 从指定 feature API 导入 `login`，但以本地逻辑完成可观察登录
- **THEN** probe MUST 失败并说明缺少 feature API 调用

#### Scenario: 完整 reference 调用 login

- **WHEN** private reference 在提交路径调用指定 `login` 并将请求、DTO 转换和认证错误留在 feature API
- **THEN** probe MUST 通过

### Requirement: 校准证明组合验收可区分

candidate calibration MUST 以同一公开浏览器语义和私有 probe 验证两个可运行实现：naive public starter MUST 语义通过且 probe 失败；private reference MUST 语义与 probe 均通过。reference 必须包含运行这些检查所需的完整应用和测试配置。

#### Scenario: 运行 naive calibration

- **WHEN** 在 public starter 安装锁定依赖后运行浏览器语义检查和私有 probe
- **THEN** 语义检查 MUST 通过且 probe MUST 失败

#### Scenario: 运行 reference calibration

- **WHEN** 在 private reference 安装锁定依赖后运行同一浏览器语义检查和私有 probe
- **THEN** 两项检查 MUST 通过

### Requirement: 未固定模型身份阻止比较执行

candidate 条件在没有 provider、不可变部署或模型版本及解析策略时 MUST 标记为 pending，而不是将可变模型别名声明为固定执行条件。后续 pilot 只有在独立、快照化的 execution manifest 固定这些输入后才能开始。

#### Scenario: 模型版本不可用

- **WHEN** provider 无法提供可复现的模型或部署版本
- **THEN** candidate MUST 保持不可执行，且不得运行任何比较或创建结果记录

### Requirement: 校准修复重新固定候选输入

修改 candidate private evaluator、reference、calibration 或 execution condition 后，维护者 MUST 重新生成并验证 `private/snapshot.json`。快照 MUST 继续排除 post-run evidence-index 和生成的依赖、构建及测试输出。

#### Scenario: 校准资产已更新

- **WHEN** probe、reference、calibration 或条件清单发生变化
- **THEN** 旧 snapshot 验证 MUST 失败，直到提交重新生成的 snapshot
