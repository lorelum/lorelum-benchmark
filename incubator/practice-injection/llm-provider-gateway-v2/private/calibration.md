# 校准记录（llm-provider-gateway-v2）

## 校准矩阵（kernel calibrate，模型调用前）

| 样例 | semantic | practice_observation | 预期 |
| --- | --- | --- | --- |
| public-starter（占位） | fail | not-observed | fail / not-observed |
| reference | pass | observed | pass / observed |
| equivalent（不同目录/命名，职责等价） | pass | observed | pass / observed |
| type-based（type 别名承载统一契约） | pass | observed | pass / observed |
| anti-pattern（服务层分支 + 各家计费/传输散落） | pass | not-observed | pass / not-observed |
| docs-present（文档在场但代码不遵守） | pass | not-observed | pass / not-observed |

6/6 通过。重放：`bun run src/benchmark/kernel/kernel.ts calibrate <candidate> --output <tmp>`（staging fixtures + `private/calibration/run.ts`，语义 = `bun run test`，观测 = `verify-provider-gateway-v2.ts`）。

## 探针职责（verify-provider-gateway-v2.ts）

- 统一模型客户端契约：interface / class / type 别名中至少两个方法签名。
- 网关服务文件不直接 fetch、不依赖 SDK、不含供应商直连地址。
- 线协议 HTTP 与 Nebula 专用鉴权出现在适配器文件内；适配器独立存在。
- 费用换算不在服务/适配器内散落；政策与账本模块承载 fallback/retry/租户预算/幂等/计量。
- 服务文件不泄漏原始 usage 字段命名或线协议事件标记，不按供应商名分支。
- 边界账本模块统一记录 usage/latency/cost/tenant/trace。

语法边界由固定样例验证：equivalent 与 type-based 均 observed；anti-pattern 与 docs-present 均 not-observed。

## 正式评测链路

- `private/evaluator/evaluate.ts`：语义 = `bun run test`（退出码 0 → pass），观测 = `verify-provider-gateway-v2.ts`；输出独立 semantic/practice_observation。

## Judge 校准（judge-agent/generic/v1）

未执行：`judge-agent/generic/v1` 需要 `LORELUM_JUDGE_REAL=1` 与 DeepSeek API Key；本 change 不默认调用模型。候选校准时生成并固定 rubric hash，后续三条件与模型档复用同一 rubric。

方向性决策按 joint-pass（semantic=pass 且 practice_observation=observed）；judge 分数为独立软信号，不改变语义完成判定。
