# 校准记录（llm-provider-gateway-v3）

## 校准矩阵（kernel calibrate，模型调用前）

| 样例 | 来源 | semantic | practice_observation | 预期 |
| --- | --- | --- | --- | --- |
| public-starter | v3 公开 starter | fail | not-observed | fail / not-observed |
| reference | v2 基线复制 | pass | observed | pass / observed |
| equivalent | v2 基线复制 | pass | observed | pass / observed |
| type-based | v2 基线复制 | pass | observed | pass / observed |
| anti-pattern | v2 基线复制 | pass | not-observed | pass / not-observed |
| docs-present | v2 基线复制 | pass | not-observed | pass / not-observed |
| oracle-naming-variant-a | #168 oracle rep1 提炼 | pass | observed | pass / observed |
| oracle-naming-variant-b | #168 oracle rep3 提炼 | pass | observed | pass / observed |
| different-layout-variant | 职责等价的模块布局变体 | pass | observed | pass / observed |
| irrelevant-naming-collision | #168 irrelevant rep1 提炼 | pass | not-observed | pass / not-observed |
| unused-boundary-modules | 未调用 policy/ledger import 的反例 | pass | not-observed | pass / not-observed |
| baseline-policy-scatter | #168 baseline attempt-2 政策散落反例 | pass | not-observed | pass / not-observed |
| oracle-sync-ledger | #168 oracle attempt-2 同步账本正例 | pass | observed | pass / observed |
| ledger-naming-variant | 账本记录命名变体 | pass | observed | pass / observed |

标签口径：人工源码复核为最终 oracle；#168 的 judge v2 criterion rationale 只作为交叉证据，不参与探针判定。

## Fixture 输入边界

`candidate-v3` 与公开 starter 同步，只保留最小消息类型；私有 `fixture-foundation` 在其上叠加 `contract-types-v3`，仅为既有校准夹具恢复完整编译契约。该 overlay 只存在于 private calibration staging，不进入 public agent workspace，也不改变 candidate 的公开结构缺口。

## 探针职责（verify-provider-gateway-v3.ts）

- 构建 TypeScript import graph，并沿相对 import 从 handler 闭包筛选非 transport 边界候选；仅 import 可达不足以下结论。
- policy 必须同时满足：非 HTTP/非 adapter 模块、包含候选供应商执行循环/降级选择/预占结算/幂等缓存之一，同时存在跨函数共享状态或对 ledger 边界的实际调用，且存在从 handler 请求路径触达其 runtime value 的实际调用/构造/实例方法边。
- ledger 必须同时满足：非 transport 模块、持有 usage record 数组/映射或 JSONL append 数据流、承载聚合/过滤查询，且存在同样的实际 value 执行边。
- transport 以 fetch 调用与供应商 wire 字符串定位；费用换算以 token 单价、乘除与 rounding 的数据流组合定位。
- `import type`、未调用 value import 与纯 transitive reachability 不作为执行边；标识符名字不参与分类；探测失败返回 `indeterminate`，不因名字未命中而直接给 `not-observed`。
- 跨请求状态按真实变量/字段名跟踪 `this.records`、`records.push/filter`、`budget.get/set` 等结构；`appendFileSync` 与 `appendFile` 都作为持久化证据。

重放：`bun run src/benchmark/kernel/kernel.ts calibrate incubator/practice-injection/llm-provider-gateway-v3 --output <empty-temp>`。无模型调用、无真实网络；本地 stub 服务器仅模拟公开语义测试声明的供应商协议。

## Judge 边界（judge-agent/practice-aware/v1）

- candidate 声明独立版本 `judge-agent/practice-aware/v1`，不修改冻结 `judge-agent/generic/v1/v2`。
- rubric 生成输入为 public `task.md` + oracle Practice 文本；baseline / oracle-practice / irrelevant-practice 三条件复用同一 rubric hash。
- Practice 文本先通过公开/私有边界 fail-closed 检查；judge 分数仍是软信号，不改变 semantic 或 practice_observation。
- 离线校准命令要求 internal endpoint、`LORELUM_JUDGE_REAL=1`，并对 reference / equivalent / anti-pattern / docs-present / public-starter 取样打分；不得调用 candidate 模型。
- 2026-08-22 已显式 opt-in 尝试真实校准：第一笔 rubric 生成请求收到 endpoint HTTP 429（weekly usage limit，提示 1 天后重置）。未执行任何 fixture 打分或 candidate 模型调用；该运行是执行失败，不构成判别力证据。endpoint 配额恢复后需重跑并记录分数、samples、rubric hash 与阈值。

后续三条件 pilot 必须另立 issue，且在 v3 judge calibration、泄露审计与生命周期门禁通过后再显式授权。
