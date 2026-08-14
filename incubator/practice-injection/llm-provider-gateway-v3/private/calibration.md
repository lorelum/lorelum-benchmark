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
| ledger-naming-variant | 账本记录命名变体 | pass | observed | pass / observed |

标签口径：人工源码复核为最终 oracle；#168 的 judge v2 criterion rationale 只作为交叉证据，不参与探针判定。

## 探针职责（verify-provider-gateway-v3.ts）

- 构建 TypeScript import graph，并沿相对 import 从 handler 闭包可达地分析非 transport 边界模块。
- policy 必须同时满足：非 HTTP/非 adapter 模块、持有跨请求状态或预算/幂等记账状态、包含候选供应商执行循环/降级选择/预占结算/幂等缓存之一，且被 handler 可达调用。
- ledger 必须同时满足：非 transport 模块、持有 usage record 数组/映射或 JSONL append 数据流、承载聚合/过滤查询，且被 policy 或 handler 可达调用。
- transport 以 fetch 调用与供应商 wire 字符串定位；费用换算以 token 单价、乘除与 rounding 的数据流组合定位。
- 标识符名字不参与分类；探测失败返回 `indeterminate`，不因名字未命中而直接给 `not-observed`。

重放：`bun run src/benchmark/kernel/kernel.ts calibrate incubator/practice-injection/llm-provider-gateway-v3 --output <empty-temp>`。无模型调用、无真实网络；本地 stub 服务器仅模拟公开语义测试声明的供应商协议。

## Judge（judge-agent/generic/v2）

真实 judge 校准未执行：candidate 交付阶段的规范要求无模型调用。后续三条件 pilot 必须另立 issue，且在 v3 calibration、泄露审计与生命周期门禁通过后再显式授权。
