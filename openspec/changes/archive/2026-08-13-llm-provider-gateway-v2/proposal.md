## Why

`llm-provider-gateway-v1`（#161/#162）已归档，但 #163/#164 的三条件诊断显示其判别力不足：语义通过率在条件间无差异，区分几乎全部依赖静态探针与 judge；baseline/无关对照会自然产生“被观察到的良好结构”，oracle 在 v4-pro 档也只有 1/3 joint-pass，且 n=3 的 CI 退化为 `[0,1]`。需求方已在 #166 确认采用方向 A，为 v2 把复杂度放到跨请求执行政策（fallback、retry 单次计费、租户预算、幂等、流式失败记账、并发原子性）上，使被测 Practice 的可观测收益从“代码结构规整”前移到“行为正确性”，从而获得更强的条件间区分度。

## What Changes

- 新建 `incubator/practice-injection/llm-provider-gateway-v2/`，作为独立 candidate revision；不修改已冻结的 v1、现有 candidate、suite、treatment 或历史结果。
- 公开面：真实工单口吻 `public/task.md`、占位 `public/starter/`（Bun/TypeScript REST + `docs/gateway-api.md` + 本地确定性 stub 测试），公开任务声明可观察行为：OpenAI 兼容供应商仅改配置可切换、Anthropic 与伪兼容陷阱供应商 Nebula 的线协议映射、SSE、fallback/retry/租户预算/幂等/流式失败记账、用量与费用聚合、统一领域错误。
- 私有面：`candidate.yaml` / `conditions.yaml` / `oracle.yaml`、Practice 卡 `llm.provider-gateway.v2`（`project-convention/v1` 条件注入）与等长无关对照 `backend.pagination`、职责探针 `verify-provider-gateway-v2.ts`、evaluator、execution 约束（tool-policy/git-history）、calibration sets 与 overlays、snapshot。
- 评分：语义硬门槛 → `evaluator-result/v2`；职责探针产出 `practice_observation`；`judge-agent/generic/v1`（#153）软评分 sidecar，逐条件报告，不改变语义完成判定。
- 校准：复用 `incubator/calibration-bases/injection-calibration/v2/node-ts/app-shell/v1/`，新增 fallback/retry/租户预算/双计费/流式漏账/伪兼容分支等 anti-pattern 夹具；任何模型调用前完成并验证。
- 执行口径：本地三条件 pilot 按 25 分钟/attempt、每条件 n=5 另行立项；本 change 不调用模型、不创建正式 record、不升级 suite revision。

## Capabilities

### New Capabilities

- `llm-provider-gateway-v2-practice-candidate`: 定义多供应商 LLM 网关 v2 candidate 的要求——在 v1 的统一契约/适配器/注册表/集中记账底座上，增加跨请求执行政策（fallback、retry 单次计费、跨供应商租户预算、幂等、流式失败记账、并发原子性）和伪兼容陷阱供应商 Nebula，并定义对应的语义硬门槛、职责探针、校准矩阵与生命周期约束。

### Modified Capabilities

无。现有 stable specs（`practice-injection-candidate-v2`、`practice-benchmark-boundaries`、`practice-observation-diagnostics`、`judge-agent-rubric-scoring`）继续约束本 change；本 change 只新增一个 candidate 能力，不改变这些规范的要求。

## Impact

- Candidate：`incubator/practice-injection/llm-provider-gateway-v2/`（public/private、snapshot、conditions/oracle/evaluator、practices、calibration）。
- 校准基座：只读复用 `incubator/calibration-bases/injection-calibration/v2/node-ts/app-shell/v1/`；如需新增 base/overlay 契约变化，按规则另行版本化并明确回滚边界。
- 依赖：#153 通用 judge（只声明消费）；`project-convention/v1` 条件注入通道；v1 的 node-ts materializer 与 profile 能力。
- 默认不改写：`src/benchmark/`、runner、schema、suite、现有 treatments、执行计划与 scratch/record 结果。
- 不进入默认 suite，不创建正式 record。
