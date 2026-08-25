# Authorized structure-fact judge calibration (2026-08-25)

## Authorization and boundary

The user explicitly authorized:

> judge-model-only calibration：仅调用 judge model，每个 fixture 3 次，不调用 candidate model，不运行 formal experiment。

Execution stayed inside that boundary:

- Candidate model calls: **0**.
- Judge provider: `judge-agent/practice-aware/v2`.
- Judge model: `deepseek-v4-flash`.
- Endpoint: configured internal endpoint via local environment; URL and API key are not recorded.
- Independent opt-in: `LORELUM_JUDGE_REAL=1`.
- Separate authorization token required by code: `LORELUM_STRUCTURE_FACT_CALIBRATION_AUTHORIZATION=judge-model-only/3-samples`.
- Calibration set: `quality-probe/v3`.
- Planned samples: **3 per fixture**, six fixtures.
- Formal candidate experiment: not run. Formal record: not created. Suite revision: not upgraded.
- No task, starter, oracle, fixture, threshold, decision metric, or rubric was changed after calibration to force a pass.

Two preflight failures occurred before any model call and were corrected without a model request: the v1 declaration helper rejected the declared v2 provider, and the new v2 declaration helper initially had an incorrect relative import. The completed model run began at 15:34 and ended at 15:54 local time.

## Bound identity

- Fact schema: `practice-aware-structure-facts/v1`
- Fact schema SHA-256: `6dd7bb71ad280ba7ba442b6ce2a079c24df0e1d464c1490f488cc1e31096c3e7`
- Rubric SHA-256: `91d81b39d69e736171190749f883b419ed49b975cde27f7cf6e44183f1d0ce96`
- Practice SHA-256: `e71a2ee13f1acc3efa15a3039ecfded1f52fd9d64df81367dd339628396457a4` (full text intentionally not reproduced)
- Every staged fixture reported the same rubric hash.
- The command emitted valid result JSON and exited 1 because calibration checks failed.

## Aggregate fixture results

| Fixture | Aggregated state | Median observed score | Sample outcomes |
| --- | --- | ---: | --- |
| reference | mixed | 100 | 100, 100, unavailable |
| equivalent | mixed | 100 | 100, 100, unavailable |
| anti-pattern | observed | 60 | 60, 0, 60 |
| docs-present | observed | 60 | 70, 60, 60 |
| baseline-policy-scatter | mixed | 75 | unavailable, 100, 50 |
| public-starter | indeterminate | — | unavailable, unavailable, unavailable |

The median uses observed samples only. Mixed and indeterminate states remain failures for strict calibration checks; unavailable samples are not converted into low scores.

## All three samples per fixture

Labels are shown in this order: contract / adapter / policy / billing / streaming / query-error.

| Fixture | Sample | State | Score | C / A / P / B / S / Q | Fact output |
| --- | ---: | --- | ---: | --- | --- |
| reference | 1 | observed | 100 | full / full / full / full / full / full | 25/25 valid facts |
| reference | 2 | observed | 100 | full / full / full / full / full / full | 25/25 valid facts |
| reference | 3 | judge-unavailable | — | — | transport unavailable (HTTP 524) |
| equivalent | 1 | observed | 100 | full / full / full / full / full / full | 25/25 valid facts |
| equivalent | 2 | observed | 100 | full / full / full / full / full / full | 25/25 valid facts |
| equivalent | 3 | judge-unavailable | — | — | transport unavailable (HTTP 524) |
| anti-pattern | 1 | observed | 60 | full / zero / zero / full / full / full | 25/25 valid facts |
| anti-pattern | 2 | observed | 0 | zero / zero / zero / zero / zero / zero | 25/25 valid facts |
| anti-pattern | 3 | observed | 60 | full / zero / zero / full / full / full | 25/25 valid facts |
| docs-present | 1 | observed | 70 | full / zero / partial / full / full / full | 25/25 valid facts |
| docs-present | 2 | observed | 60 | full / zero / zero / full / full / full | 25/25 valid facts |
| docs-present | 3 | observed | 60 | full / zero / zero / full / full / full | 25/25 valid facts |
| baseline-policy-scatter | 1 | judge-unavailable | — | — | transport unavailable (HTTP 524) |
| baseline-policy-scatter | 2 | observed | 100 | full / full / full / full / full / full | 25/25 valid facts |
| baseline-policy-scatter | 3 | observed | 50 | full / full / zero / zero / zero / full | 25/25 valid facts |
| public-starter | 1 | judge-unavailable | — | — | transport unavailable (HTTP 524) |
| public-starter | 2 | judge-unavailable | — | — | transport unavailable (HTTP 524) |
| public-starter | 3 | judge-unavailable | — | — | transport unavailable (HTTP 524) |

Of 18 planned judge samples:

- 12 returned all 25 declared facts and were observed.
- 6 failed transport availability with HTTP 524 and are retained as `judge-unavailable`.
- 0 ended in malformed-schema failure; every completed extraction was exhaustive and schema-valid.
- Optional blinded pairwise was **not run**: the primary label/state calibration did not pass, and pairwise cannot repair it. The boolean `pairwise_discriminability: true` in the raw aggregate is vacuous and must not be read as a pairwise pass.

Among the 72 observed dimension-label slots, 59 matched expectation and 13 did not. Because six samples were unavailable and several observed samples disagreed, `all_dimension_labels_match` is false.

## Corrected sample-level dimension confusion matrix

The matrix below counts every observed sample individually and omits unavailable samples. It was recomputed offline from the retained fact-derived labels after correcting the aggregation implementation; this recompute made no model call. Rows are expected labels; columns are predicted labels.

| Dimension | Expected | Predicted full | Predicted partial | Predicted zero |
| --- | --- | ---: | ---: | ---: |
| contract-normalization | full | 11 | 0 | 1 |
| contract-normalization | partial | 0 | 0 | 0 |
| contract-normalization | zero | 0 | 0 | 0 |
| adapter-isolation | full | 6 | 0 | 0 |
| adapter-isolation | partial | 0 | 0 | 0 |
| adapter-isolation | zero | 0 | 0 | 6 |
| policy-centralization | full | 4 | 0 | 0 |
| policy-centralization | partial | 1 | 0 | 1 |
| policy-centralization | zero | 0 | 1 | 5 |
| single-billing-atomicity | full | 9 | 0 | 1 |
| single-billing-atomicity | partial | 1 | 0 | 1 |
| single-billing-atomicity | zero | 0 | 0 | 0 |
| streaming-accounting | full | 9 | 0 | 1 |
| streaming-accounting | partial | 1 | 0 | 1 |
| streaming-accounting | zero | 0 | 0 | 0 |
| query-and-error-contract | full | 11 | 0 | 1 |
| query-and-error-contract | partial | 0 | 0 | 0 |
| query-and-error-contract | zero | 0 | 0 | 0 |

Key confusion findings:

- Reference/equivalent were fully correct in all four completed samples.
- `adapter-isolation` was correct in all 12 completed samples.
- The `partial` label was never predicted. `baseline-policy-scatter` flipped between full and zero, exposing extraction instability for scattered-but-present boundaries.
- `anti-pattern` had one all-zero sample; its other two samples matched.
- `docs-present` had one policy-partial sample; its other two samples matched.
- `public-starter` had no completed extraction because all three requests hit HTTP 524, so its expected all-zero row remains unverified.

## Threshold checks

Thresholds: reference/equivalent minimum 80; equivalent tolerance 10; anti-pattern maximum 70 and gap 10; docs-present maximum 70 and gap 10; baseline below reference; repetitions 3.

| Check | Result | Raw value |
| --- | --- | --- |
| `reference_high` | **fail** | false |
| `equivalent_high` | **fail** | false |
| `equivalent_close` | **fail** | false |
| `anti_pattern_separated` | **fail** | false |
| `docs_present_separated` | **fail** | false |
| `baseline_below_reference` | **fail** | false |
| `all_dimension_labels_match` | **fail** | false |
| `all_rubric_hashes_match` | pass | true |
| `pairwise_discriminability` | **not run** | true (vacuous; no pairwise input) |

Final `passed`: **false**.

## Conclusion

Classification remains **diagnostic-only / calibration failed**.

This result does **not** establish that structure-fact extraction repairs judge discriminability. It shows two distinct blockers:

1. Six judge transport samples were unavailable with HTTP 524, including all three public-starter samples.
2. Completed fact extraction was schema-valid but unstable on partial structures: baseline-policy-scatter never produced the expected policy/billing/streaming partial labels, and one anti-pattern sample collapsed to all zero.

The dimension confusion matrix is no longer masked by total-score aggregation. However, strict label correctness, state consistency, and total-separation checks all fail. Task 7.8 global judge-spec promotion is therefore not satisfied. No threshold, fixture, task, starter, oracle, or rubric was adjusted.
