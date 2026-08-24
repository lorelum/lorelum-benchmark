# Practice-aware judge calibration (2026-08-24)

## Command form

```powershell
$env:LORELUM_JUDGE_REAL='1'
$env:LORELUM_CALIBRATION_SET_KEY='quality-probe/v3'
$env:LORELUM_CALIBRATION_FIXTURES='reference,equivalent,anti-pattern,docs-present'
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

Two earlier execution attempts did not produce calibration scores. The first stopped before scoring because the calibration script addressed a nonexistent staged-set property; it was corrected to read the staged manifest. The second reached scoring but failed closed when a response omitted the required numeric confidence; practice-aware v1 was corrected to retry the identical prompt for that malformed-output contract error without defaulting or repairing a score. Neither attempt was recorded as a discriminability failure. The final run below completed successfully.

## Identity

- Rubric SHA-256: `50c2a7f8cca20888124753035d4459ab2624f6c0ee8ceb29d6c4bea29058ef49`
- Practice SHA-256: `e71a2ee13f1acc3efa15a3039ecfded1f52fd9d64df81367dd339628396457a4`

## Results

| Fixture | State | Median score | Samples | Input SHA-256 | Tree SHA-256 |
| --- | --- | ---: | --- | --- | --- |
| reference | observed | 93 | 93, 84, 93 | `23126d488b37010c9688ecbe94a222bd2279361c18592be5efc4ab075b2d03c6` | `139c8b6573fd484ce8de2e8fba545557d6929808c4366366b1d08664fb5a4709` |
| equivalent | observed | 90 | 93, 90, 88 | `50546b09d892ab84dd7035bf0d0e5db90e5374452762905f0a3ba8594402d6e3` | `12417be6052c62d46561b125a63edf3747998025013de9c555168e7528030e9d` |
| anti-pattern | observed | 62 | 60, 73, 62 | `0dbd404cf8f78ef2b5f15e928cdb2a8b3fc5db8b4362d5e641b9ca63f77fd9c7` | `0d7f5e6d8d93b93e1451189ae6d4d2b8f7c483bc191493e40c2ae800d14707cd` |
| docs-present | observed | 67 | 67, 62, 67 | `bd6e2dbf7ff4640a602987e6ae5ac81eb5cd42d99a0872626b06cee9f8459860` | `f0327727d28a489b32f130bfb4eaf3a2cfc4ed5aeef7900fa6c1e403f489af29` |
| public-starter | indeterminate | 0 | none | `9c75cf201082c2515a0344b5f4579708a0c72c0f0c868e528e76420f2b74c4df` | `bb6d31912f8ebe2872b1df89f226a1f79f4d6e2ceac139e67c16c3facc1a9763` |

All observed fixtures reported the same rubric hash. The public starter was judged indeterminate because the scaffold does not implement the required gateway behavior, so it is below the reference score.

## Thresholds and checks

| Check | Threshold | Result |
| --- | --- | --- |
| reference high | observed and score >= 80 | pass (93) |
| equivalent high | observed and score >= 80 | pass (90) |
| equivalent close | abs(reference - equivalent) <= 10 | pass (3) |
| anti-pattern separated | observed, score <= 70, reference - score >= 10 | pass (62; gap 31) |
| docs-present separated | observed, score <= 70, reference - score >= 10 | pass (67; gap 26) |
| public starter below reference | score < reference | pass (0 / indeterminate vs 93) |
| common rubric hash | all fixture hashes match generated rubric | pass |

## Conclusion

- `passed: true`
- Practice-aware judge calibration is successful as a soft-signal discriminability check.
- This does not change semantic or practice observation outcomes.
- No formal record and no suite revision were produced.