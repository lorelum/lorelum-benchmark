## Why

Issue #75 是已校准登录页 Practice candidate 的最小人工小试唯一追踪事项。candidate 已完成私有探针与公开语义校准，但还没有获授权的执行路径、受保护 artifact storage、盲评安排和停止条件；现在直接运行将不能支持可解释的比较结论。

本 change 先把确认、隔离和证据链要求设为执行门禁。它不将 candidate 校准报告为 Practice 有效性的证据，也不创建正式 benchmark record。

## What Changes

- 为 `login-page-layered-api-v1` 的非正式人工小试定义可审计的执行门禁：负责人确认、条件一致性、工作区隔离、受保护 artifacts 和盲评。
- 将小试固定为 baseline、Oracle Practice、无关 Practice 各两次。`lorelum-retrieval` 继续处于 unavailable 状态，不执行真实检索。
- 要求每次尝试分别保留语义检查与 AST 分层探针结果，并且只对两者都通过的原始次数应用预注册决策规则；不引入加权总分或正式结论。
- 将小试保留在 `incubator/`：不改写 #73/#77 的历史事实，不晋升 suite revision，不变更活跃 runner/treatment/schema，也不创建正式 Pi record。

## Capabilities

### New Capabilities

- `login-practice-pilot-execution`: 为已校准登录页 candidate 定义执行授权、条件隔离、证据保留、盲评与诊断性报告契约。

### Modified Capabilities

无。`login-practice-probe-fixture` 已归档；本 change 只为其 candidate 新增 pilot 执行契约，不改写既有 stable spec。

## Impact

- 关联 issue：#75。前置证据：#73、#77。
- candidate 输入：`incubator/practice-injection/login-page-layered-api-v1/`。每次尝试前都必须重新核验其公开输入、私有 Practice、oracle、evaluator、conditions 和 snapshot。
- 负责人确认后，可能新增或修改 candidate 私有执行治理和 evidence index。任何 runner、storage 或 schema 变更都必须在 design/tasks 中声明边界、版本与验证方式；私有材料不得进入工作区。
- 本 change 不影响 `suites/`、`results/records/`、活跃 Pi runner、treatment、environment 或正式实验计划。
