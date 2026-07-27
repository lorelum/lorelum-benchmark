## ADDED Requirements

### Requirement: 实跑前探活模型端点可达性
MUST：Practice 候选本地执行器在进入 runAttempt 循环前，必须执行一次模型可达性探活：用极小
prompt 调用 Pi `--print`，验证 Pi 可启动、模型端点可达且 API key 有效。探活失败时必须以退出码
1 退出，不进入 runAttempt 循环、不创建摘要、不写 record。探活不消耗任务 `max_duration_minutes`
预算，使用独立的 30 秒超时。

#### Scenario: 探活成功后进入实跑
- **当** 探活调用在 30 秒内成功返回时
- **则** 执行器必须进入 runAttempt 循环，正常执行三条件对照

#### Scenario: 探活失败时不进入实跑
- **当** 探活调用失败（key 缺失、端点不可达、超时或模型 ID 无效）时
- **则** 执行器必须以退出码 1 退出，在 stderr 报告失败类别，不复制任务工作区、不进入
  runAttempt 循环、不创建 summary.json

### Requirement: 探活不泄露凭据且不读取 private 材料
MUST：探活调用不得把 API key 明文写入 stdout、stderr、日志或摘要。探活失败信息只报告失败
类别（key 缺失 / 端点不可达 / 超时 / 模型 ID 无效），可附不含 key 的原始 stderr 摘要。探活
不得读取候选 `private/` 材料。

#### Scenario: 探活失败信息不含 key
- **当** 探活因 key 缺失或无效而失败时
- **则** stderr 报告必须只说明 key 类别问题，不得回显 key 值，且不得读取或引用 private 材料

### Requirement: 探活在 dry-run 时不执行
MUST：`--dry-run` 不得触发模型可达性探活。dry-run 不消耗任何预算，探活属于实跑前置，仅在
非 dry-run 的实跑入口执行。

#### Scenario: dry-run 不触发探活
- **当** 维护者执行 `--dry-run` 时
- **则** 执行器不得调用 Pi `--print` 探活，只输出计划 JSON