# 校准记录（llm-provider-gateway-v1）

## 校准矩阵（kernel calibrate，模型调用前）

| 样例 | semantic | practice_observation | 预期 |
| --- | --- | --- | --- |
| public-starter（占位） | fail | not-observed | fail / not-observed |
| reference | pass | observed | pass / observed |
| equivalent（不同命名/目录，职责等价） | pass | observed | pass / observed |
| type-based（同一职责，type 别名承载统一契约） | pass | observed | pass / observed |
| anti-pattern（硬编码二供 + 复制计费 + 按供应商名分支） | pass | not-observed | pass / not-observed |
| docs-present（文档在场但代码不遵守） | pass | not-observed | pass / not-observed |

6/6 通过。重放：`bun run src/benchmark/kernel/kernel.ts calibrate <candidate> --output <tmp>`（staging fixtures + `private/calibration/run.ts`，语义 = `bun run test`，观测 = `verify-provider-gateway.ts`）。

## 探针职责（verify-provider-gateway.ts，名称无关）

- R1 统一模型客户端契约：interface / class / type 别名中至少两个方法签名（不只认 interface 关键字）。
- R2 网关服务层不直接发起 HTTP 传输、不依赖供应商 SDK、不含供应商直连地址。
- R3 OpenAI 兼容供应商不出现按 deepseek 名称的硬编码分支/独立请求路径：只认 `=== "deepseek"` / `!== "deepseek"` / `case "deepseek"` / fetch 参数等 AST 分支形态；配置或日志中的普通 `deepseek` 字面量不误报。
- R4 费用换算集中（不在服务/适配器实现内）。
- R5 不泄漏原始供应商 usage 字段命名（prompt_tokens/input_tokens 等）。
- R6 供应商选择由配置/注册表驱动，不按供应商名写分支。
- R7 观测（usage/latency/cost）从边界 usage/telemetry 模块统一记录。

语法边界已用固定样例验证：type-based（type 别名承载契约）observed；请求路径文件中含非分支 deepseek 字面量仍 observed。

## 正式评测链路

- `private/evaluator/evaluate.ts`：语义 = `bun run test`（退出码 0 → pass），观测 = 探针；退出码 0/1 按语义 pass/fail，供 runner `classifyEvaluatorResult` 判定 `evaluated`。

## Judge 校准（judge-agent/generic/v1）

未执行：`judge-agent/generic/v1` 的校准需要 `LORELUM_JUDGE_REAL=1`（真实 LLM，显式 opt-in）与 DeepSeek API Key；本 change 不默认调用模型。

重放命令：

```
LORELUM_JUDGE_REAL=1 LORELUM_CALIBRATION_SET_KEY=quality-probe/v2 LORELUM_CALIBRATION_FIXTURES=reference,equivalent,anti-pattern bun run src/benchmark/judge/judge-agent/generic/v1/calibrate.ts <candidate>
```

方向性决策按 joint-pass（semantic=pass 且 practice_observation=observed）；judge 分数为独立软信号，不改变语义完成判定。