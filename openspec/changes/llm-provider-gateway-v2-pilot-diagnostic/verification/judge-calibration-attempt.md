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

## 结论

judge 判别力校准未通过；按 OpenSpec 要求，三条件诊断的 judge soft sidecar 记 `not-run`/`judge-unavailable`，方向性结论只依据 `semantic` 与 `practice_observation`。若后续需要 judge 软分，应在独立 change 中调整 rubric 生成约束或校准阈值，不得修改冻结 candidate。
