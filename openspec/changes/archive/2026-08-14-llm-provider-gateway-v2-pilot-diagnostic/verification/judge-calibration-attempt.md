# judge 判别力校准尝试记录（#168）

## 结果

按需求方确认执行真实 LLM judge 判别力校准（`LORELUM_JUDGE_REAL=1`，`judge-agent/generic/v1`）。

### 第一次（`LORELUM_JUDGE_REPETITIONS=1`）

- rubric_hash：`8cbf7260ddc0f62ad2ecb0497fa3caaeb45412f111e9b9055d7abee376b455f0`
- reference：observed 66
- equivalent：observed 80
- anti-pattern：observed 72
- checks：
  - `reference_high`：true
  - `equivalent_close`：false（80 - 66 = 14 > tolerance 10）
  - `anti_pattern_separated`：false（72 > max 70，gap -6）
  - `public_starter_below_reference`：true
  - `all_rubric_hashes_match`：true
- `passed`：false

### 第二次（默认 repetitions=3）

- 运行中 reusable `judge-agent/generic/v1` 因 LLM 返回非整数 confidence 报错：
  `Invalid judge score output: confidence must be an integer 0-100`
- 校准未完成，`passed` 未产出。

## 结论与后续处置

`judge-agent/generic/v1` 判别力校准未通过。该失败被拆到独立 issue #170；#170/#171 新增 `judge-agent/generic/v2`，完成 v2 夹具校准并把 `llm-provider-gateway-v2` 的 soft judge 迁移到 v2。最终三条件诊断使用 v2 observed sidecar，而不是 v1 的 `not-run`；完整 v2 结果见 `diagnostic-results-flash.md`。

- v1 校准失败证据必须保留：reference 66 / equivalent 80 / anti-pattern 72，方向错误；第二次因 confidence 非整数 fail-closed。
- v2 夹具校准证据见 #170 的 `judge-calibration-v2.md`（reference 90 / equivalent 88 / anti-pattern 76，全部 checks 通过）。
- 本 pilot 的方向性结论仍只依据 `semantic` 与 `practice_observation`，judge v2 仅作 soft sidecar。
