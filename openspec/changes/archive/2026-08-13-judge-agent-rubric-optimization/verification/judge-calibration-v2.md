# judge 判别力校准证据（#170）

## 优化内容

- rubric guideline 增加 `policy-centralization` / `transport-accounting` / `provider-protocol-mapping` / `budget-atomicity` 维度。
- `scoreCandidate` 对 confidence 与 points 做有限数值归一。
- `rubric` 对 dimension `max_points` 做有限数值归一。
- 支持 `LORELUM_JUDGE_RUBRIC_TEXT` 固定 rubric 复用。

## 校准结果（`llm-provider-gateway-v2`，真实 LLM opt-in，repetitions=3）

- rubric_hash：`286c29bd298ebfbb507f58e54222f38a796dcfdf3296e8b140dbe108f5524804`
- 阈值：`reference_min=50`、`anti_pattern_max=80`、`anti_pattern_gap=10`、`equivalent_tolerance=10`
- reference：90（samples 90/89/90）
- equivalent：88（samples 78/88/91）
- anti-pattern：76（samples 76/83/69）
- checks：全部通过

## 结论

优化后通用 judge 对 `llm-provider-gateway-v2` 形成正确方向判别：reference 高分、equivalent 接近、anti-pattern 显著低于 reference（gap 14）、public-starter 不高于 reference。可复用同一 rubric hash 对三条件 soft score；该 rubric/hash 与阈值写入 pilot 使用说明。

## 既有前端 candidate 回归

`profile-update-command-boundary-v2`（`judge-agent/generic/v1`，未修改，真实 LLM opt-in，repetitions=1）：

- rubric_hash：`fac29724d66a7ee09a17ae0192bd59afade51f41964e8432e9ab94cca6867241`
- reference：67
- equivalent：75
- anti-pattern：20
- checks：全部通过

证明 v1 未修改、既有前端 candidate 的判别力未回归。
