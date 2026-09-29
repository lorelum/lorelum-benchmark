## Why

`llm-provider-gateway-v4` 的 one-block/multi-block diagnostic pilot（#188 / PR #189，已归档）验证了执行链路并修复了全部已知基础设施缺陷：r4 执行健康 6/6、0 超时、same-session 全通过、structure analyzer 数据声明角色盲区已修复且离线校准 8/8。按预注册路径（#185 设计的 saturation 与 directional 处理），下一步是对冻结 candidate 执行授权的多 block directional screen，判读 oracle-practice 是否对两个对照呈现方向性结构优势。需求方已确认：5 blocks、deepseek/deepseek-v4-flash。

## What Changes

- 在冻结的 v4 candidate 上执行一次 5-block 三条件 directional screen：15 attempts（每条件 5 次），复用已合并的 pilot driver（`--blocks 5`）、`cyclic-latin-square/v1` 调度与既有 `schedule_seed`。
- 真实模型调用前 preflight 全通过（复用 6 项门禁 + 离线测试门禁），zero-candidate-call dry-run 计划验证。
- 判读严格按 conditions.yaml 预注册 decision rule：`strictly-greater-than-each-control` + `majority-of-paired-blocks` + 0.8 饱和条款；另预注册 `insufficient-observations` 出口（有效观测不足以配对判读时，不追加 block、结论记 diagnostic-only）。
- 新增 block 级配对判读汇总（screen change 范围内的增量代码，不改 benchmark 契约语义）。
- 产出逐 attempt redacted 报告 + 中文判读 summary；transcript/run workspace 留在 git-ignored scratch。
- 不修改 candidate 题面/oracle/Practice/evaluator/conditions/snapshot；不使用 judge、不加权分数、不 semantic retry、不重跑 unhealthy attempt；不创建 formal record、不升级 suite revision。

## Capabilities

### New Capabilities

- `llm-provider-gateway-v4-directional-screen`: 定义对冻结 v4 candidate 执行 5-block 三条件 directional screen 的要求——preflight 前置、预注册判读规则（strictly-greater、paired-block majority、饱和、insufficient-observations 出口）、denominator 完整性、redaction 边界与 diagnostic-only 结论上限。

### Modified Capabilities

无。`llm-provider-gateway-v4-model-pilot` stable spec 已覆盖执行链路；本 change 只落地其上的判读层。

## Impact

- 只读复用：`incubator/practice-injection/llm-provider-gateway-v4/` 全部冻结（含已承诺冻结的 `two-stage-structure/v1` analyzer）；`src/benchmark/runner/pi/v2/staged/` 仅新增 screen 判读汇总，不改既有 fail-closed 语义。
- 依赖：#192 的模型调用授权（仅 preflight 全通过后执行一次）；`.env` 内部网关 credential；`pi` 0.80.10；flash 档模型成本 ≈ r1–r4 单 attempt 水平 × 15。
- 产出：redacted summary 与判读结论（directional / no-discriminability / saturated / insufficient-observations 四者之一），不进入 `results/records`。
- 失败回滚：合并前撤除仅删除新增判读代码与 OpenSpec artifacts，无冻结对象被触碰。
