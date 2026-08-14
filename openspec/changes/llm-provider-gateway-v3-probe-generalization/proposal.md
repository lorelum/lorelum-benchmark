## Why

#168 的三条件诊断暴露了 `llm-provider-gateway-v2` 的结构探针虽然声明“名称无关”，实现仍用封闭标识符集合判断职责：oracle rep1/rep3 被假阴性判为 `not-observed`，irrelevant rep1 因偶然命中 `reserveBudget/settleBudget/retryAttempts` 被假阳性判为 `observed`，最终 oracle 与 irrelevant 的 joint-pass 都停在 1/3。与此同时 judge-agent/generic/v2 的 `policy-centralization` 给出 oracle 20/20/20、baseline 20/14/15、irrelevant 14/7/20，说明信号主要被探针丢弃。v2 已有诊断结果，应按生命周期创建 v3，并把“禁止依赖标识符名字、真实命名变体必须纳入校准”固化成本仓库可验证的执行规范。

## What Changes

- 新增通用 capability `practice-structure-probe-calibration`：结构质量探针 MUST 以 import graph、实际 value 调用边、调用/数据流、类型契约、模块所有权或可观察行为分类职责；封闭标识符 allowlist MUST NOT 单独构成通过/拒绝依据，`import type` 与未调用 import MUST NOT 单独构成执行边。若实现保留命名线索，MUST 同步提供覆盖真实输出的正例/反例回归夹具。
- 新建 `incubator/practice-injection/llm-provider-gateway-v3/` 作为独立 candidate revision：复用 v2 的公开行为题面与语义契约，替换 private structure probe、evaluator、calibration matrix 与 snapshot，并把 #168 暴露的假阴/假阳实现整理成私有命名变体与 decoy-import 回归夹具。
- v1/v2、其 snapshot、已有 pilot 结果、shared evaluator helper、suite、treatment 与 record 均不修改。
- generic judge 的 evidence rationale 与命名变体校准硬化不在本 change 内实现，保持 `judge-agent/generic/v2` 文件与契约不变，已由独立 #174 承接。
- 本 change 不调用模型、不创建正式 record、不升级 suite revision；v3 仅进入 `incubator/`。

## Capabilities

### New Capabilities

- `practice-structure-probe-calibration`: 定义结构质量探针的通用证据标准与校准门槛，要求名称无关、真实输出命名变体回归、确定性重放和失败阻塞。
- `llm-provider-gateway-v3-practice-candidate`: 定义 v3 gateway candidate 的公开/私有边界、泛化探针、命名变体校准矩阵、snapshot 与生命周期，隔离“题面变化”与“探针变化”。

## Impact

- 新增 `incubator/practice-injection/llm-provider-gateway-v3/`：public task/starter/tests/docs、private manifests/practices/evaluator/probe、`quality-probe/v3` calibration overlays 与 snapshot。
- 私有校准矩阵新增 naming-variant true-positive/true-negative/false-positive/false-negative 类夹具，以及 handler 导入但未调用 policy/ledger 的 decoy-import 反例；所有夹具保持 `private/`，不得进入 agent workspace。
- 若 v3 的探针需要新的 TypeScript AST/import-graph 能力，MUST 使用 candidate-local private evaluator；不修改 `src/benchmark/` 中已冻结的 helper 版本。
- 不影响 `llm-provider-gateway-v2` 的 diagnostic 结论与 snapshot；不创建 record、不进入默认 suite。
