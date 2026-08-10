# 校准记录（llm-provider-gateway-v1）

## 校准矩阵（kernel calibrate，模型调用前）

| 样例 | semantic | practice_observation | 预期 |
| --- | --- | --- | --- |
| public-starter（占位） | fail | not-observed | fail / not-observed |
| reference | pass | observed | pass / observed |
| equivalent（不同命名/目录，职责等价） | pass | observed | pass / observed |
| anti-pattern（硬编码二供 + 复制计费 + 按供应商名分支） | pass | not-observed | pass / not-observed |
| docs-present（文档在场但代码不遵守） | pass | not-observed | pass / not-observed |

5/5 通过。重放：`bun run src/benchmark/kernel/kernel.ts calibrate <candidate> --output <tmp>`（staging fixtures + `private/calibration/run.ts`，语义 = `bun run test`，观测 = `verify-provider-gateway.ts`）。

## 探针职责（verify-provider-gateway.ts，名称无关）

- 统一模型客户端契约（至少两个方法的接口声明）
- 网关服务层不直接发起 HTTP 传输、不依赖供应商 SDK、不含供应商直连地址
- OpenAI 兼容供应商（deepseek）不出现硬编码分支/路径（复用同一适配器，只靠配置区分）
- 费用换算集中（不在服务/适配器实现内）
- 不泄漏原始供应商 usage 字段命名（prompt_tokens/input_tokens 等）
- 供应商选择由配置/注册表驱动，不按供应商名写分支
- 观测（usage/latency/cost）从边界 usage/telemetry 模块统一记录

## Judge 校准（judge-agent/generic/v1）

未执行：`judge-agent/generic/v1` 的校准需要 `LORELUM_JUDGE_REAL=1`（真实 LLM，显式 opt-in）与 DeepSeek API Key；本 change 不默认调用模型。

重放命令：

```
LORELUM_JUDGE_REAL=1 LORELUM_CALIBRATION_SET_KEY=quality-probe/v2 LORELUM_CALIBRATION_FIXTURES=reference,equivalent,anti-pattern bun run src/benchmark/judge/judge-agent/generic/v1/calibrate.ts <candidate>
```

方向性决策按 joint-pass（semantic=pass 且 practice_observation=observed）；judge 分数为独立软信号，不改变语义完成判定。