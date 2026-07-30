## Why

Issue #75 需要一个可复测的本地对照，快速观察精确注入的 Practice 是否改善登录页的 API 分层。candidate 已完成公开语义与私有探针校准；缺少的是能在三种条件下重复执行、保留本地输出并汇总自动验收的轻量路径。

本 change 只支持方向性观察，不把结果升级为 benchmark 或产品结论。

## What Changes

- 为 `login-page-layered-api-v1` 提供 candidate 私有的本地执行器：条件一致性、干净工作区、Practice 运行时注入和自动汇总。
- 将小试固定为 baseline、Oracle Practice、无关 Practice 各两次。`lorelum-retrieval` 继续处于 unavailable 状态，不执行真实检索。
- 每次尝试分别运行语义检查与 AST 分层探针；结果、diff 和 Pi 输出仅保存在被忽略的 `scratch/`，不引入盲评、外部存储或正式记录。
- 将小试保留在 `incubator/`：不改写 #73/#77 的历史事实，不晋升 suite revision，不变更活跃 runner/treatment/schema，也不创建正式 Pi record。

## Capabilities

### New Capabilities

- `login-practice-pilot-execution`: 为已校准登录页 candidate 定义本地执行、条件隔离和自动结果汇总契约。

### Modified Capabilities

无。`login-practice-probe-fixture` 已归档；本 change 只为其 candidate 新增本地小试执行契约，不改写既有 stable spec。

## Impact

- 关联 issue：#75。前置证据：#73、#77。
- candidate 输入：`incubator/practice-injection/login-page-layered-api-v1/`。执行器核验 conditions、Practice hash 与候选 snapshot，并在每次尝试创建新的公开工作区。
- 改动仅限 candidate 私有执行治理与本地结果汇总；不扩展共享 runner、storage 或 schema，私有材料不得进入工作区。
- 本 change 不影响 `suites/`、`results/records/`、活跃 Pi runner、treatment、environment 或正式实验计划。
