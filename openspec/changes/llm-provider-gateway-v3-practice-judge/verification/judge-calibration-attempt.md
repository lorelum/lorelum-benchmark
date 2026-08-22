# Practice-aware judge calibration attempt (2026-08-22)

Authorized command boundary:

- Provider: `judge-agent/practice-aware/v1`
- Model: `deepseek-v4-flash`
- Endpoint: configured internal Lorelum endpoint (key not recorded)
- Opt-in: `LORELUM_JUDGE_REAL=1`
- Set: `quality-probe/v3`
- Requested fixtures: `reference,equivalent,anti-pattern,docs-present` plus public starter
- Planned repetitions: 3 per fixture
- Candidate model calls: 0

Command:

```powershell
$env:LORELUM_JUDGE_REAL='1'
$env:LORELUM_CALIBRATION_SET_KEY='quality-probe/v3'
$env:LORELUM_CALIBRATION_FIXTURES='reference,equivalent,anti-pattern,docs-present'
bun run src/benchmark/judge/judge-agent/practice-aware/v1/calibrate.ts `
  incubator/practice-injection/llm-provider-gateway-v3 `
  incubator/practice-injection/llm-provider-gateway-v3/private/practices/llm.provider-gateway.v2.md
```

Result:

- Exactly one judge request was attempted: practice-aware rubric generation from public `task.md` plus the declared oracle Practice text.
- The internal endpoint returned HTTP `429` with a weekly usage-limit response and reported reset in one day.
- No fixture was scored, so no reference/equivalent/control score, rubric hash, or discriminability conclusion is available from this run.
- This is an execution failure, not evidence that the judge lacks discriminability and not a reason to tune the task or probe.
- Required next step: rerun the same authorized calibration after endpoint capacity is available, then record median scores, samples, common rubric hash, thresholds, and checks.