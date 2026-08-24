# Practice-aware judge calibration attempts (2026-08-24)

## Current anchor-aware v2 outcome

After the completed v1 discriminability failure below, the user explicitly authorized fixing the judge scoring contract before the review rerun. The authorized fixes were limited to the practice-aware scoring contract:

- every Practice-generated rubric dimension carries full/partial/zero scoring anchors;
- the scorer prompt treats the canonical candidate diff as the authoritative source evidence and may not become indeterminate merely because a repository checkout or test run is absent;
- the model reports exhaustive per-anchor satisfied/evidence results and does not return criterion points;
- the provider deterministically derives zero for a satisfied zero anchor, at most half credit for a satisfied partial anchor, proportional credit from full anchors when no zero/partial anchor is satisfied, and full credit only when every full anchor is satisfied with no partial/zero anchor;
- missing, duplicate, undeclared, non-exhaustive anchor output or model-supplied points fails closed after identical-prompt retries.

No task, public starter, oracle, calibration fixture, deterministic probe, decision metric, or threshold was changed to manufacture a passing result.

### Bound execution

- Date: 2026-08-24.
- Command form: the authorized real calibration command below with `LORELUM_JUDGE_REAL=1`, set `quality-probe/v3`, fixtures `reference,equivalent,anti-pattern,docs-present,baseline-policy-scatter`, and the declared Practice path.
- Provider: `judge-agent/practice-aware/v1`.
- Model: `deepseek-v4-flash`.
- Endpoint: configured internal endpoint via `.env` (URL and key not recorded).
- Fixed rubric: `private/calibration/practice-aware-rubric.v2.json`.
- Rubric SHA-256: `91d81b39d69e736171190749f883b419ed49b975cde27f7cf6e44183f1d0ce96`.
- Practice SHA-256: `e71a2ee13f1acc3efa15a3039ecfded1f52fd9d64df81367dd339628396457a4` (Practice full text intentionally not reproduced).
- Every dimension declares one full, one partial, and one zero anchor; all six dimensions total 100 points.

### Attempt history

| Attempt | Scoring contract | Outcome |
| --- | --- | --- |
| v2-a | Model returned criterion points plus anchors. | Execution failed on the first request: configured endpoint HTTP 502; empty output and no scores. |
| v2-b | Model returned criterion points plus anchors; prompt clarified canonical diff as scoreable evidence. | Command completed with valid JSON, but all fixture samples were `indeterminate`; `passed: false`, no observed discriminability evidence. |
| v2-c | Same contract with exhaustive anchor-output wording. | Execution failed closed after identical retries: `contract-normalization` omitted its partial anchor result. No calibration JSON/scores. |
| v2-d | Same contract with exhaustive anchor-output wording. | Execution failed closed after identical retries: `adapter-isolation` supplied points above the satisfied-partial cap. No calibration JSON/scores. |
| v2-e (current) | Model adjudicates anchors only; provider derives points. | Command completed with valid JSON and `passed: false`; discriminability checks failed as recorded below. |

### Current fixture results

| Fixture | State | Median score | Samples | Input SHA-256 | Tree SHA-256 |
| --- | --- | ---: | --- | --- | --- |
| reference | observed | 50 | 50, 50, 80 | `4d6014c5d8f069f8d4cbfd45c14c9343e2490e9b410253ba9f4e4d3fc2f562ed` | `139c8b6573fd484ce8de2e8fba545557d6979808c4366366b1d08664fb5a4709` |
| equivalent | observed | 100 | 70, 100, 100 | `297c3658a86237c029ae8c6285b7d85001722041952b6bc644a0f5bd36d33d04` | `12417be6052c62d46561b125a63edf374799e8025013de9c555168e7528030e9d` |
| anti-pattern | observed | 50 | 50, 50, 50 | `432242f4e93cdd8605e9cdc1a2e380a72231771666f51d51f4d3f2baf708eea9` | `0d7f5e6d8d93b93e1451189ae6d4d2b8f7c483bc191493e40c2ae800d14707cd` |
| docs-present | observed | 55 | 55, 50, 70 | `625c6c06f7edf78403d4250f016df0690ab989c8029a7f957e5e93ffb4609cd8` | `f0327727d28a489b32f130bfb4eaf3a2cfc4ed5aeef7900fa6c1e403f489af29` |
| baseline-policy-scatter | observed | 55 | 50, 80, 55 | `455b4eab1e01fb1101d0df08f1e16ceccfd362e172a28182d8db068585213fd7` | `b298ab9437e19d8648edcead92b8024d7400745dcc9ecb1143d97975da3609e4` |
| public-starter | observed | 0 | 0, 0, 0 | `a278b6281feb2f55a9aab07d081e5b374d635abfb55ba056b672967f97c056d5` | `bb6d31912f8ebe2872b1df89f226a1f79f4d6e2ceac139e67c16c3facc1a9763` |

All six staged fixtures reported the declared rubric hash.

### Current criterion medians

These sanitized point summaries preserve the deterministic outcome without reproducing private rubric or Practice text:

| Fixture | contract | adapter | policy | billing | streaming | query/error | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| reference | 10 | 10 | 10 | 10 | 5 | 5 | 50 |
| equivalent | 20 | 20 | 20 | 20 | 10 | 10 | 100 |
| anti-pattern | 10 | 10 | 10 | 10 | 5 | 5 | 50 |
| docs-present | 10 | 10 | 10 | 10 | 5 | 10 | 55 |
| baseline-policy-scatter | 10 | 10 | 10 | 10 | 5 | 10 | 55 |
| public-starter | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

### Thresholds and checks

Thresholds: reference/equivalent minimum 80; equivalent tolerance 10; anti-pattern maximum 70 and gap 10; docs-present maximum 70 and gap 10; baseline below reference; repetitions 3.

| Check | Result | Observed |
| --- | --- | --- |
| rubric has Practice structure dimension | pass | true |
| reference high | **fail** | 50 < 80 |
| equivalent high | pass | 100 |
| equivalent close | **fail** | difference 50 > 10 |
| anti-pattern separated | **fail** | 50 <= 70, but reference gap 0 < 10 |
| docs-present separated | **fail** | 55 <= 70, but reference gap -5 < 10 |
| baseline below reference | **fail** | baseline 55 is not below reference 50 |
| common rubric hash | pass | all results matched the declared hash |

### Current conclusion

- Final `passed`: **false**.
- Final classification: **diagnostic-only / calibration failed**.
- The current judge channel must not support a directional Practice-effect claim.
- This is a completed discriminability failure, not an HTTP failure and not evidence that semantic or practice observation changed.
- No further task, starter, oracle, fixture, threshold, decision metric, or rubric adjustment was made after this completed result to force a pass.
- Candidate model calls: 0; all model calls were authorized judge-model calibration calls.
- Formal candidate experiment: not run. Formal record: not created. Suite revision: not upgraded.

The completed fixed-rubric v1 result below is retained as review history and is superseded by v2-e as the latest valid discriminability evidence.

## Completed fixed-rubric v1 outcome

- Execution status: **completed**; the command emitted a valid `judge-agent-practice-aware-calibration/v2` result and exited 1 because a discriminability check failed.
- Calibration result: **diagnostic-only / calibration failed**.
- `passed: false`.
- Blocking failure: `baseline-policy-scatter` was observed at **98**, which is not lower than the reference median **94**.
- The public starter produced `mixed` sample states (observed 0, observed 0, indeterminate); this mixed result is retained diagnostically and is **not counted as a passing low-score baseline check**.
- No task, fixture, oracle, rubric, or threshold was changed after this result to force a pass.

This rerun supersedes the earlier pre-review calibration evidence. It adds the semantic-pass `baseline-policy-scatter` baseline fixture, binds the fixed private rubric, and preserves criterion-level sample evidence. The earlier all-indeterminate public-starter result must not be converted into a synthetic low score or used as baseline-discrimination evidence.

## Command form

```powershell
$env:LORELUM_JUDGE_REAL='1'
$env:LORELUM_CALIBRATION_SET_KEY='quality-probe/v3'
$env:LORELUM_CALIBRATION_FIXTURES='reference,equivalent,anti-pattern,docs-present,baseline-policy-scatter'
bun run src/benchmark/judge/judge-agent/practice-aware/v1/calibrate.ts `
  incubator/practice-injection/llm-provider-gateway-v3 `
  incubator/practice-injection/llm-provider-gateway-v3/private/practices/llm.provider-gateway.v2.md
```

## Execution boundary

- Date: 2026-08-24
- Provider: `judge-agent/practice-aware/v1`
- Model: `deepseek-v4-flash`
- Endpoint: configured internal endpoint via `.env` (URL and key not recorded)
- Opt-in: `LORELUM_JUDGE_REAL=1`
- Calibration set: `quality-probe/v3`
- Repetitions: 3 per fixture
- Candidate model calls: 0
- Formal candidate experiment: not run
- Formal record: not created
- Suite revision: not upgraded

## Bound identity

- Fixed rubric path: `private/calibration/practice-aware-rubric.v1.json`
- Rubric SHA-256: `d953feb759c814707473858abb2c37f09579b341b25e9a7165e576b979280ad3`
- Practice SHA-256: `e71a2ee13f1acc3efa15a3039ecfded1f52fd9d64df81367dd339628396457a4` (Practice full text is intentionally not reproduced)
- Practice-structure dimension detected: true

### Rubric dimensions and weights

| Dimension | Weight |
| --- | ---: |
| `contract-normalization` | 20 |
| `adapter-isolation` | 20 |
| `policy-centralization` | 20 |
| `single-billing-atomicity` | 20 |
| `streaming-accounting` | 10 |
| `query-and-error-contract` | 10 |

All six staged fixtures reported the same declared rubric hash.

## Fixture results

| Fixture | State | Median / observed score | Samples | Input SHA-256 | Tree SHA-256 |
| --- | --- | ---: | --- | --- | --- |
| reference | observed | 94 | 88, 94, 98 | `71a98e13185e3d96df9d04a14559c57188021f21cc6310d05906f16b898fea1c` | `139c8b6573fd484ce8de2e8fba545557d6929808c4366366b1d08664fb5a4709` |
| equivalent | observed | 98 | 98, 96, 98 | `6d05a985cf7ff0c82754f38c447e75a2bbc24ecd12fa0c3e2fdbdfd899e81f69` | `12417be6052c62d46561b125a63edf3747998025013de9c555168e7528030e9d` |
| anti-pattern | observed | 64 | 62, 64, 68 | `43addc4def7d8e4c3c0bc89c64b03e4265a5f3a60c142a8ca1d47e888790ebbc` | `0d7f5e6d8d93b93e1451189ae6d4d2b8f7c483bc191493e40c2ae800d14707cd` |
| docs-present | observed | 64 | 68, 64, 60 | `5b8833bf648d9a22aacd07f850d38f8e933dd04af721d0ceed213b2df7f6e929` | `f0327727d28a489b32f130bfb4eaf3a2cfc4ed5aeef7900fa6c1e403f489af29` |
| baseline-policy-scatter | observed | 98 | 98, 98, 98 | `8e29221dc2e020355f36225821a914d429a8fa8dcf484d5234424c70a95155cd` | `b298ab9437e19d8648edcead92b8024d7400745dcc9ecb1143d97975da3609e4` |
| public-starter | mixed | 0 | 0, 0, indeterminate | `f78487cacc8811b9cefd253a18a2c5db7e3e112b31ebe856b58c74c0c11ef7a1` | `bb6d31912f8ebe2872b1df89f226a1f79f4d6e2ceac139e67c16c3facc1a9763` |

For `public-starter`, the aggregate is `mixed`: two samples were observed with score 0 and one sample was indeterminate. The aggregate score shown is the median over those two observed samples, not a synthetic conversion of the indeterminate sample. Because the state is mixed and this scaffold is not the declared semantic-pass baseline fixture, it does not satisfy the baseline discrimination check.

## Criterion-level evidence

Scores below are per sample and criterion. Rationales are sanitized judge observations about the fixture source; they do not contain the endpoint URL, API key, `.env`, Practice full text, private evaluator, or oracle verdict.

### reference

| Sample | State | Score | Confidence | Criterion scores |
| --- | --- | ---: | ---: | --- |
| 1 | observed | 88 | 85 | `contract-normalization` 18/20; `adapter-isolation` 18/20; `policy-centralization` 16/20; `single-billing-atomicity` 18/20; `streaming-accounting` 8/10; `query-and-error-contract` 10/10 |
| 2 | observed | 94 | 85 | `contract-normalization` 18/20; `adapter-isolation` 20/20; `policy-centralization` 20/20; `single-billing-atomicity` 18/20; `streaming-accounting` 8/10; `query-and-error-contract` 10/10 |
| 3 | observed | 98 | 90 | `contract-normalization` 18/20; `adapter-isolation` 20/20; `policy-centralization` 20/20; `single-billing-atomicity` 20/20; `streaming-accounting` 10/10; `query-and-error-contract` 10/10 |

Representative sanitized concrete rationales selected from the lowest-scoring criterion of each observed sample (for all-max samples, the lowest ratio tie is used):

- **Sample 1 (observed, 88, confidence 85)** — `policy-centralization`: Retry/fallback logic is centralized in policy.ts (runChatAttempts, runStreamAttempts), and budget/idempotency/ledger logic is in ledger.ts, imported by server.ts. However, server.ts still implements streaming orchestration, error mapping, and usage recording directly, and the legacy openai.ts module contains raw fetch logic outside the policy boundary, so not all transport logic is centralized.
- **Sample 2 (observed, 94, confidence 85)** — `streaming-accounting`: Streaming failures after partial content send a terminal SSE error event and record only upstream-reported usage (e.g., anthropic mid-stream error records promptTokens=12, completionTokens=0). However, the error path in server.ts records a ledger entry with partialUsage even when no usage was reported (e.g., pre-stream failure), which could fabricate a zero-usage record; this is a minor deviation from 'only upstream-reported usage'.
- **Sample 3 (observed, 98, confidence 90)** — `contract-normalization`: Interface layer depends on ModelClient contract with normalized Usage; adapters normalize prompt_tokens/input_tokens and completion_tokens/output_tokens into promptTokens/completionTokens (src/adapters.ts normalizeUsage). Errors are typed via ProviderUpstreamError/GatewayError, not raw upstream errors. Minor deduction: server.ts reads raw response status indirectly via domainError mapping, but this is boundary-level, not component-level.

### equivalent

| Sample | State | Score | Confidence | Criterion scores |
| --- | --- | ---: | ---: | --- |
| 1 | observed | 98 | 90 | `contract-normalization` 18/20; `adapter-isolation` 20/20; `policy-centralization` 20/20; `single-billing-atomicity` 20/20; `streaming-accounting` 10/10; `query-and-error-contract` 10/10 |
| 2 | observed | 96 | 90 | `contract-normalization` 18/20; `adapter-isolation` 20/20; `policy-centralization` 20/20; `single-billing-atomicity` 18/20; `streaming-accounting` 10/10; `query-and-error-contract` 10/10 |
| 3 | observed | 98 | 90 | `contract-normalization` 18/20; `adapter-isolation` 20/20; `policy-centralization` 20/20; `single-billing-atomicity` 20/20; `streaming-accounting` 10/10; `query-and-error-contract` 10/10 |

Representative sanitized concrete rationales selected from the lowest-scoring criterion of each observed sample (for all-max samples, the lowest ratio tie is used):

- **Sample 1 (observed, 98, confidence 90)** — `contract-normalization`: Interface layer uses normalized Usage type and adapters normalize usage via normalizeUsage() mapping prompt_tokens/input_tokens and completion_tokens/output_tokens. Errors are typed via ProviderUpstreamError/GatewayError. However, server.ts reads raw response status indirectly through domainError mapping, and the openai.ts legacy module still exposes raw fetch/status handling, though it's not used by the gateway.
- **Sample 2 (observed, 96, confidence 90)** — `contract-normalization`: Interface layer uses normalized Usage/ChatResult types; adapters normalize usage via normalizeUsage() and throw typed ProviderUpstreamError. However, server.ts reads raw response.status via upstreamErrorFromStatus in domain-errors, and the error mapping in server.ts's domainError() branches on ProviderUpstreamError codes, which is acceptable but the raw status handling is centralized in the boundary module.
- **Sample 3 (observed, 98, confidence 90)** — `contract-normalization`: Interface layer uses normalized Usage type and adapters normalize usage via normalizeUsage() mapping prompt_tokens/input_tokens and completion_tokens/output_tokens. Errors are typed via ProviderUpstreamError/GatewayError. However, server.ts reads raw response status indirectly through domainError mapping, and the openai.ts legacy module still exposes raw fetch/status handling, though it's not used by the gateway path.

### anti-pattern

| Sample | State | Score | Confidence | Criterion scores |
| --- | --- | ---: | ---: | --- |
| 1 | observed | 62 | 80 | `contract-normalization` 12/20; `adapter-isolation` 14/20; `policy-centralization` 8/20; `single-billing-atomicity` 12/20; `streaming-accounting` 8/10; `query-and-error-contract` 8/10 |
| 2 | observed | 64 | 80 | `contract-normalization` 12/20; `adapter-isolation` 14/20; `policy-centralization` 8/20; `single-billing-atomicity` 14/20; `streaming-accounting` 8/10; `query-and-error-contract` 8/10 |
| 3 | observed | 68 | 85 | `contract-normalization` 12/20; `adapter-isolation` 14/20; `policy-centralization` 8/20; `single-billing-atomicity` 16/20; `streaming-accounting` 8/10; `query-and-error-contract` 10/10 |

Representative sanitized concrete rationales selected from the lowest-scoring criterion of each observed sample (for all-max samples, the lowest ratio tie is used):

- **Sample 1 (observed, 62, confidence 80)** — `policy-centralization`: Budget, idempotency, and usage recording are centralized in usage.ts, but retry, fallback, and streaming orchestration logic (including the retry loop, fallback chain, and stream failure handling) are implemented directly in server.ts's handleChat(), not in a separate boundary policy module imported by the handler.
- **Sample 2 (observed, 64, confidence 80)** — `policy-centralization`: Retry, fallback, budget reservation/settlement, and idempotency logic are implemented directly in server.ts's handleChat() rather than in a separate boundary policy module. usage.ts only provides low-level primitives (reserve/settle/appendRecord), not the orchestration policy. server.ts contains the retry loops, fallback chain, and budget checks.
- **Sample 3 (observed, 68, confidence 85)** — `policy-centralization`: Budget, idempotency, and usage recording are centralized in usage.ts, but retry/fallback logic is implemented directly in server.ts's handleChat() loops, not in a separate boundary policy module. server.ts also contains cost calculation and provider chain selection logic.

### docs-present

| Sample | State | Score | Confidence | Criterion scores |
| --- | --- | ---: | ---: | --- |
| 1 | observed | 68 | 85 | `contract-normalization` 12/20; `adapter-isolation` 14/20; `policy-centralization` 8/20; `single-billing-atomicity` 16/20; `streaming-accounting` 8/10; `query-and-error-contract` 10/10 |
| 2 | observed | 64 | 80 | `contract-normalization` 14/20; `adapter-isolation` 12/20; `policy-centralization` 8/20; `single-billing-atomicity` 14/20; `streaming-accounting` 7/10; `query-and-error-contract` 9/10 |
| 3 | observed | 60 | 80 | `contract-normalization` 14/20; `adapter-isolation` 12/20; `policy-centralization` 8/20; `single-billing-atomicity` 12/20; `streaming-accounting` 6/10; `query-and-error-contract` 8/10 |

Representative sanitized concrete rationales selected from the lowest-scoring criterion of each observed sample (for all-max samples, the lowest ratio tie is used):

- **Sample 1 (observed, 68, confidence 85)** — `policy-centralization`: Budget reservation/settlement, idempotency, and usage recording are centralized in usage.ts, but retry/fallback logic is implemented directly in server.ts's handleChat() with nested loops and provider iteration, not in a separate boundary policy module. server.ts also contains cost calculation and provider chain selection logic.
- **Sample 2 (observed, 64, confidence 80)** — `policy-centralization`: Budget reservation/settlement, idempotency, and usage records are centralized in usage.ts, which is good. However, server.ts implements retry loops, fallback chain selection, and streaming error handling directly in the HTTP handler, and the cost calculation is duplicated across openai.ts, anthropic.ts, and nebula.ts rather than centralized in a policy module.
- **Sample 3 (observed, 60, confidence 80)** — `policy-centralization`: Budget reserve/settle, idempotency lookup/remember, and appendRecord are centralized in usage.ts and imported by server.ts. However, server.ts itself implements the retry loop, fallback chain selection, streaming error handling, and cost calculation inline in handleChat(), rather than delegating these to a separate boundary policy module; the retry/fallback logic is not isolated from HTTP handling.

### baseline-policy-scatter

| Sample | State | Score | Confidence | Criterion scores |
| --- | --- | ---: | ---: | --- |
| 1 | observed | 98 | 90 | `contract-normalization` 18/20; `adapter-isolation` 20/20; `policy-centralization` 20/20; `single-billing-atomicity` 20/20; `streaming-accounting` 10/10; `query-and-error-contract` 10/10 |
| 2 | observed | 98 | 90 | `contract-normalization` 18/20; `adapter-isolation` 20/20; `policy-centralization` 20/20; `single-billing-atomicity` 20/20; `streaming-accounting` 10/10; `query-and-error-contract` 10/10 |
| 3 | observed | 98 | 90 | `contract-normalization` 18/20; `adapter-isolation` 20/20; `policy-centralization` 20/20; `single-billing-atomicity` 20/20; `streaming-accounting` 10/10; `query-and-error-contract` 10/10 |

Representative sanitized concrete rationales selected from the lowest-scoring criterion of each observed sample (for all-max samples, the lowest ratio tie is used):

- **Sample 1 (observed, 98, confidence 90)** — `contract-normalization`: Interface layer uses normalized Usage type and DomainError; adapters translate wire-specific fields (prompt_tokens/input_tokens) into unified usage. However, streamOpenAI/streamNebula yield raw SSE payloads with choices/delta structures that the server re-serializes, and streamNebula reads event.delta.text directly, so some raw wire shapes leak into the interface layer.
- **Sample 2 (observed, 98, confidence 90)** — `contract-normalization`: Interface layer uses normalized Usage type and DomainError; adapters translate wire-specific fields (prompt_tokens/input_tokens) into normalized usage. However, streamOpenAI/streamNebula yield raw SSE payloads with choices/delta structures that the server re-serializes, and the server directly constructs SSE events with provider-specific shapes rather than a fully normalized stream contract.
- **Sample 3 (observed, 98, confidence 90)** — `contract-normalization`: Interface layer uses normalized Usage type and DomainError; adapters translate wire-specific fields (prompt_tokens/input_tokens) into unified usage. However, streamOpenAI/streamNebula yield raw SSE payloads with choices/delta structures that the server re-serializes, so some raw wire shapes leak into the interface layer.

### public-starter

| Sample | State | Score | Confidence | Criterion scores |
| --- | --- | ---: | ---: | --- |
| 1 | observed | 0 | 95 | `contract-normalization` 0/20; `adapter-isolation` 0/20; `policy-centralization` 0/20; `single-billing-atomicity` 0/20; `streaming-accounting` 0/10; `query-and-error-contract` 0/10 |
| 2 | observed | 0 | 95 | `contract-normalization` 0/20; `adapter-isolation` 0/20; `policy-centralization` 0/20; `single-billing-atomicity` 0/20; `streaming-accounting` 0/10; `query-and-error-contract` 0/10 |
| 3 | indeterminate | 0 | 90 | none (indeterminate) |

Representative sanitized concrete rationales selected from the lowest-scoring criterion of each observed sample (for all-max samples, the lowest ratio tie is used):

- **Sample 1 (observed, 0, confidence 95)** — `contract-normalization`: The server.ts directly calls chatWithOpenAI and returns raw content without any usage normalization, cost calculation, or typed domain errors. The response only contains content, not the required usage/cost/provider fields, and errors are raw upstream status codes with message leakage.
- **Sample 2 (observed, 0, confidence 95)** — `contract-normalization`: The server.ts directly calls chatWithOpenAI and returns raw content without any usage normalization, cost calculation, or typed error mapping. The openai.ts adapter returns only {content} and throws raw Error with status, with no normalized usage structure or domain error types.
- **Sample 3 (indeterminate, 0, confidence 90)** — The candidate source is only a partial diff: it contains the original stub implementation, tests, and a minimal server/openai adapter, but lacks the actual implementation of the gateway (multi-provider adapters, policy module, budget ledger, idempotency, streaming accounting, usage query endpoint). The provided src/server.ts and src/openai.ts do not implement any of the required features, so the real solution code is missing and cannot be scored.

## Thresholds and checks

Thresholds: reference/equivalent minimum 80; equivalent tolerance 10; anti-pattern maximum 70 and gap 10; docs-present maximum 70 and gap 10; repetitions 3.

| Check | Threshold | Result | Observed |
| --- | --- | --- | --- |
| rubric has Practice structure dimension | at least one structural dimension | pass | true |
| reference high | observed and score >= 80 | pass | 94 |
| equivalent high | observed and score >= 80 | pass | 98 |
| equivalent close | abs(reference - equivalent) <= 10 | pass | difference 4 |
| anti-pattern separated | observed, score <= 70, reference gap >= 10 | pass | 64; gap 30 |
| docs-present separated | observed, score <= 70, reference gap >= 10 | pass | 64; gap 30 |
| baseline-policy-scatter below reference | observed and score < reference | **fail** | 98; reference 94 |
| common rubric hash | all fixture hashes match declared rubric hash | pass | d953feb759c814707473858abb2c37f09579b341b25e9a7165e576b979280ad3 |

## Conclusion

- Final `passed`: **false**.
- Final classification: **diagnostic-only / calibration failed**.
- The judge channel must not be used for a directional Practice-effect claim in its current form.
- The failure is a discriminability result, not an HTTP/execution failure and not evidence that the semantic or practice observation changed.
- Candidate model calls: 0.
- No formal record and no suite revision were produced.
